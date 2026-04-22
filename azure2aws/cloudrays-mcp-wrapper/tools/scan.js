import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { writeState, scanDir, ensureScanDir, getWorkDir } from '../lib/state-manager.js';

const DEFAULT_REPO_URL = 'https://github.com/awslabs/resource-discovery-for-azure.git';

function repoDir() {
  return path.join(getWorkDir(), 'repo');
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function runGit(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git ${args.join(' ')} exited ${code}: ${stderr}`));
    });
  });
}

async function ensureRepo() {
  const url = process.env.CLOUDRAYS_REPO || DEFAULT_REPO_URL;
  const dir = repoDir();
  const exists = await pathExists(path.join(dir, '.git'));
  if (!exists) {
    await fs.mkdir(path.dirname(dir), { recursive: true });
    await runGit(['clone', '--depth', '1', url, dir]);
  }
  return dir;
}

async function locateEntryScript(repoPath) {
  const candidates = [
    'ResourceInventory.ps1',
    'src/ResourceInventory.ps1',
    'Inventory/ResourceInventory.ps1',
    'Scripts/ResourceInventory.ps1',
  ];
  for (const c of candidates) {
    const p = path.join(repoPath, c);
    if (await pathExists(p)) return p;
  }
  try {
    const entries = await fs.readdir(repoPath, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && /ResourceInventory\.ps1$/i.test(e.name)) {
        return path.join(repoPath, e.name);
      }
    }
  } catch { /* noop */ }
  return path.join(repoPath, 'ResourceInventory.ps1');
}

function buildScriptArgs({ scriptPath, reportName, subscriptionId, resourceGroup, concurrencyLimit, skipConsumption, outputDir }) {
  const args = ['-NoProfile', '-NonInteractive', '-File', scriptPath];
  args.push('-ReportName', reportName);
  if (subscriptionId) args.push('-SubscriptionID', subscriptionId);
  if (resourceGroup) args.push('-ResourceGroup', resourceGroup);
  if (concurrencyLimit) args.push('-ConcurrencyLimit', String(concurrencyLimit));
  if (skipConsumption) args.push('-SkipPolicy', '-SkipAdvisory', '-SkipConsumption');
  args.push('-ReportDir', outputDir);
  return args;
}

export async function startScan({
  reportName,
  subscriptionId,
  resourceGroup,
  concurrencyLimit = 4,
  skipConsumption = false,
}) {
  if (!reportName || typeof reportName !== 'string') {
    throw new Error('report_name is required');
  }
  const scanId = crypto.randomUUID();
  const dir = await ensureScanDir(scanId);
  const outputDir = path.join(dir, 'InventoryReports');
  await fs.mkdir(outputDir, { recursive: true });
  const logPath = path.join(dir, 'scan.log');
  const errPath = path.join(dir, 'scan.err.log');

  let repoPath = null;
  let scriptPath = null;
  let spawnError = null;
  try {
    repoPath = await ensureRepo();
    scriptPath = await locateEntryScript(repoPath);
  } catch (err) {
    spawnError = err;
  }

  const startedAt = new Date().toISOString();
  const config = {
    report_name: reportName,
    subscription_id: subscriptionId || null,
    resource_group: resourceGroup || null,
    concurrency_limit: concurrencyLimit,
    skip_consumption: skipConsumption,
  };

  if (spawnError) {
    await writeState(scanId, {
      status: 'failed',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      config,
      output_dir: outputDir,
      log_path: logPath,
      error: { code: 'repo_unavailable', message: String(spawnError.message || spawnError) },
    });
    return {
      scan_id: scanId,
      status: 'failed',
      started_at: startedAt,
      estimated_duration_minutes: 0,
      message: `CloudRays repo unavailable: ${spawnError.message}`,
    };
  }

  const args = buildScriptArgs({
    scriptPath,
    reportName,
    subscriptionId,
    resourceGroup,
    concurrencyLimit,
    skipConsumption,
    outputDir,
  });

  const out = await fs.open(logPath, 'w');
  const err = await fs.open(errPath, 'w');
  let pid = null;
  try {
    const child = spawn('pwsh', args, {
      cwd: repoPath,
      detached: true,
      stdio: ['ignore', out.fd, err.fd],
      env: { ...process.env },
    });
    pid = child.pid || null;
    child.unref();
  } catch (spawnErr) {
    await out.close();
    await err.close();
    await writeState(scanId, {
      status: 'failed',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      config,
      output_dir: outputDir,
      log_path: logPath,
      error: { code: 'spawn_failed', message: String(spawnErr.message || spawnErr) },
    });
    return {
      scan_id: scanId,
      status: 'failed',
      started_at: startedAt,
      estimated_duration_minutes: 0,
      message: `Failed to spawn pwsh: ${spawnErr.message}`,
    };
  }
  await out.close();
  await err.close();

  await writeState(scanId, {
    status: 'running',
    started_at: startedAt,
    config,
    output_dir: outputDir,
    log_path: logPath,
    err_path: errPath,
    pid,
    script_path: scriptPath,
    args,
  });

  return {
    scan_id: scanId,
    status: 'running',
    started_at: startedAt,
    estimated_duration_minutes: 15,
    message: '扫描已启动，可通过 cloudrays_status 查询进度',
  };
}

export function register(server, z) {
  server.registerTool(
    'cloudrays_scan',
    {
      title: 'CloudRays Async Scan',
      description:
        'Start an async CloudRays scan of an Azure environment. Returns immediately with scan_id; use cloudrays_status to poll progress.',
      inputSchema: {
        report_name: z.string().describe('Customer/project name used for report file naming'),
        subscription_id: z.string().optional().describe('Azure subscription ID to scan (omit to scan all accessible)'),
        resource_group: z.string().optional().describe('Limit scan to a single resource group'),
        concurrency_limit: z.number().int().min(1).max(16).optional().default(4).describe('Parallel collector count'),
        skip_consumption: z.boolean().optional().default(false).describe('Skip cost and consumption data collection'),
      },
    },
    async (input) => {
      const result = await startScan({
        reportName: input.report_name,
        subscriptionId: input.subscription_id,
        resourceGroup: input.resource_group,
        concurrencyLimit: input.concurrency_limit ?? 4,
        skipConsumption: input.skip_consumption ?? false,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );
}
