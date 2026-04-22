import { spawn } from 'node:child_process';

const REQUIRED_ROLES = ['Reader', 'Billing Reader', 'Monitoring Reader', 'Cost Management Reader'];

function runCommand(cmd, args, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      resolve({ ok: false, stdout: '', stderr: String(err.message || err), code: -1 });
      return;
    }
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* noop */ }
      resolve({ ok: false, stdout, stderr: stderr + `\ntimeout after ${timeoutMs}ms`, code: -1 });
    }, timeoutMs);
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: stderr + String(err.message || err), code: -1 });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout, stderr, code });
    });
  });
}

function parsePwshVersion(stdout) {
  const m = stdout.match(/PowerShell\s+(\d+\.\d+\.\d+)/i) || stdout.match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}

function parseAzVersion(stdout) {
  try {
    const j = JSON.parse(stdout);
    return j['azure-cli'] || null;
  } catch {
    const m = stdout.match(/azure-cli\s+(\d+\.\d+\.\d+)/);
    return m ? m[1] : null;
  }
}

async function checkPwsh() {
  const r = await runCommand('pwsh', ['--version']);
  if (!r.ok) return { available: false, version: null, error: r.stderr.trim() || 'pwsh not found' };
  return { available: true, version: parsePwshVersion(r.stdout) };
}

async function checkAzCli() {
  const r = await runCommand('az', ['version', '--output', 'json']);
  if (!r.ok) return { available: false, version: null, error: r.stderr.trim() || 'az not found' };
  const version = parseAzVersion(r.stdout);
  const warnings = [];
  if (version) {
    const [major, minor] = version.split('.').map(Number);
    if (major < 2 || (major === 2 && minor < 37)) {
      warnings.push('az cli < 2.37: @me parameter not supported; will use az ad signed-in-user fallback');
    }
  }
  return { available: true, version, warnings: warnings.length ? warnings : undefined };
}

async function checkAzAuth() {
  const r = await runCommand('az', ['account', 'show', '--output', 'json']);
  if (!r.ok) {
    return {
      authenticated: false,
      subscription: null,
      tenant: null,
      error: 'az account show failed — run `az login`',
    };
  }
  try {
    const j = JSON.parse(r.stdout);
    return {
      authenticated: true,
      subscription: j.id || null,
      subscription_name: j.name || null,
      tenant: j.tenantId || null,
      user: j.user ? j.user.name : null,
    };
  } catch (err) {
    return { authenticated: false, subscription: null, tenant: null, error: `parse error: ${err.message}` };
  }
}

async function checkPermissions(subscriptionId) {
  const result = {
    reader: false,
    billing_reader: false,
    monitoring_reader: false,
    cost_management_reader: false,
    error: null,
  };
  if (!subscriptionId) {
    result.error = 'no subscription available for RBAC check';
    return result;
  }
  const scope = `/subscriptions/${subscriptionId}`;

  // Determine assignee: @me requires az cli >= 2.37, fall back to explicit objectId
  let assignee = '@me';
  const azVersionCheck = await runCommand('az', ['version', '--output', 'json'], { timeoutMs: 10000 });
  if (azVersionCheck.ok) {
    const ver = parseAzVersion(azVersionCheck.stdout);
    if (ver) {
      const [major, minor] = ver.split('.').map(Number);
      if (major < 2 || (major === 2 && minor < 37)) {
        const userResult = await runCommand('az', ['ad', 'signed-in-user', 'show', '--query', 'id', '-o', 'tsv'], { timeoutMs: 15000 });
        if (userResult.ok && userResult.stdout.trim()) {
          assignee = userResult.stdout.trim();
        }
      }
    }
  }

  const r = await runCommand('az', [
    'role',
    'assignment',
    'list',
    '--assignee',
    assignee,
    '--scope',
    scope,
    '--output',
    'json',
  ], { timeoutMs: 20000 });
  if (!r.ok) {
    result.error = (r.stderr || '').trim().slice(0, 500) || 'role assignment lookup failed';
    return result;
  }
  let assignments = [];
  try {
    assignments = JSON.parse(r.stdout);
  } catch {
    result.error = 'failed to parse az role assignment list output';
    return result;
  }
  const roleNames = new Set(
    assignments
      .map((a) => (a.roleDefinitionName || a.roleDefinition || '').toString().toLowerCase())
      .filter(Boolean),
  );
  // Only Owner implies all permissions. Contributor does NOT imply Billing Reader
  // or Cost Management Reader — those require explicit assignment.
  const owner = roleNames.has('owner');
  const has = (name) => owner || roleNames.has(name.toLowerCase());
  result.reader = has('Reader');
  result.billing_reader = has('Billing Reader');
  result.monitoring_reader = has('Monitoring Reader');
  result.cost_management_reader = has('Cost Management Reader');
  return result;
}

export async function preflight() {
  const issues = [];
  const pwsh = await checkPwsh();
  if (!pwsh.available) issues.push({ code: 'pwsh_missing', message: 'PowerShell 7+ (pwsh) not found in PATH' });

  const azCli = await checkAzCli();
  if (!azCli.available) issues.push({ code: 'az_cli_missing', message: 'Azure CLI (az) not found in PATH' });

  let azAuth = { authenticated: false, subscription: null, tenant: null };
  if (azCli.available) {
    azAuth = await checkAzAuth();
    if (!azAuth.authenticated) {
      issues.push({ code: 'auth_expired', message: 'Azure CLI not authenticated. Run `az login`.' });
    }
  }

  let permissions = {
    reader: false,
    billing_reader: false,
    monitoring_reader: false,
    cost_management_reader: false,
  };
  if (azAuth.authenticated) {
    permissions = await checkPermissions(azAuth.subscription);
    for (const role of REQUIRED_ROLES) {
      const key = role.toLowerCase().replace(/\s+/g, '_');
      if (!permissions[key]) {
        issues.push({
          code: 'permission_denied',
          message: `Missing RBAC role: ${role}`,
          required_role: role,
        });
      }
    }
  }

  const ready = issues.length === 0;
  return {
    ready,
    checks: {
      pwsh,
      az_cli: azCli,
      az_auth: azAuth,
      permissions,
    },
    issues,
  };
}

export function register(server, z) {
  server.registerTool(
    'cloudrays_preflight',
    {
      title: 'CloudRays Preflight Check',
      description:
        'Check CloudRays prerequisites: pwsh, az CLI, Azure authentication, and required RBAC roles (Reader, Billing Reader, Monitoring Reader, Cost Management Reader).',
      inputSchema: {},
    },
    async () => {
      const result = await preflight();
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );
}
