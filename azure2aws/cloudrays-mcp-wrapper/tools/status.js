import { promises as fs } from 'node:fs';
import { readState, updateState } from '../lib/state-manager.js';
import { readLogTail, parseProgress, tailLines } from '../lib/progress-parser.js';

function processAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

async function hasOutput(outputDir) {
  try {
    const entries = await fs.readdir(outputDir);
    return entries.some((n) => n.toLowerCase().endsWith('.json') || n.toLowerCase().endsWith('.xlsx'));
  } catch {
    return false;
  }
}

export async function getStatus(scanId) {
  const state = await readState(scanId);
  if (!state) {
    throw new Error(`scan_id not found: ${scanId}`);
  }

  const logText = state.log_path ? await readLogTail(state.log_path) : '';
  const progress = parseProgress(logText);
  const alive = processAlive(state.pid);
  const now = Date.now();
  const startedMs = Date.parse(state.started_at);
  const elapsedSeconds = Number.isNaN(startedMs) ? null : Math.floor((now - startedMs) / 1000);

  const HARD_TIMEOUT_SECONDS = 30 * 60; // 30 minutes

  let status = state.status;
  let error = state.error || null;
  let completedAt = state.completed_at || null;

  if (status === 'running') {
    // Check hard timeout: kill process if exceeded
    if (alive && elapsedSeconds !== null && elapsedSeconds > HARD_TIMEOUT_SECONDS) {
      try { process.kill(state.pid, 'SIGTERM'); } catch { /* noop */ }
      // Give it 5s to exit gracefully, then SIGKILL
      setTimeout(() => {
        try { process.kill(state.pid, 'SIGKILL'); } catch { /* noop */ }
      }, 5000);
      status = 'failed';
      error = { code: 'hard_timeout', message: `Scan exceeded ${HARD_TIMEOUT_SECONDS / 60} minute hard timeout. Process killed.` };
      completedAt = new Date().toISOString();
    } else if (progress.done && !alive) {
      status = progress.errors.length > 0 ? 'partial' : 'completed';
      completedAt = new Date().toISOString();
    } else if (!alive) {
      const producedOutput = await hasOutput(state.output_dir);
      if (producedOutput) {
        status = progress.errors.length > 0 ? 'partial' : 'completed';
      } else {
        status = 'failed';
        error = error || {
          code: 'script_error',
          message: 'pwsh process exited without producing output',
          tail: tailLines(logText, 50),
        };
      }
      completedAt = new Date().toISOString();
    }
  }

  if (status !== state.status || completedAt !== state.completed_at) {
    await updateState(scanId, { status, completed_at: completedAt, error });
  }

  return {
    scan_id: scanId,
    status,
    started_at: state.started_at,
    completed_at: completedAt,
    elapsed_seconds: elapsedSeconds,
    progress: {
      current_collector: progress.current_collector,
      collectors_completed: progress.collectors_completed,
      collectors_total: progress.collectors_total,
      percent: progress.percent,
    },
    output_dir: state.output_dir,
    error,
  };
}

export function register(server, z) {
  server.registerTool(
    'cloudrays_status',
    {
      title: 'CloudRays Scan Status',
      description: 'Query progress for an in-flight CloudRays scan by scan_id.',
      inputSchema: {
        scan_id: z.string().describe('UUID returned from cloudrays_scan'),
      },
    },
    async (input) => {
      const result = await getStatus(input.scan_id);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );
}
