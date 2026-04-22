import { promises as fs } from 'node:fs';
import path from 'node:path';
import { listScans } from '../lib/state-manager.js';

async function countResourcesInOutput(outputDir) {
  if (!outputDir) return null;
  try {
    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile() || !e.name.toLowerCase().endsWith('.json')) continue;
      if (!e.name.toLowerCase().includes('inventory')) continue;
      try {
        const raw = await fs.readFile(path.join(outputDir, e.name), 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.length;
        if (Array.isArray(parsed.resources)) return parsed.resources.length;
        if (Array.isArray(parsed.Resources)) return parsed.Resources.length;
        if (Array.isArray(parsed.value)) return parsed.value.length;
      } catch { /* noop */ }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return null;
}

export async function listAllScans() {
  const scans = await listScans();
  const summarized = [];
  for (const s of scans) {
    const resourceCount = await countResourcesInOutput(s.output_dir);
    summarized.push({
      scan_id: s.scan_id,
      report_name: s.config ? s.config.report_name : null,
      status: s.status,
      started_at: s.started_at || null,
      completed_at: s.completed_at || null,
      subscription_id: s.config ? s.config.subscription_id : null,
      resource_group: s.config ? s.config.resource_group : null,
      output_dir: s.output_dir || null,
      resource_count: resourceCount,
      error: s.error || null,
    });
  }
  return { scans: summarized };
}

export function register(server, z) {
  server.registerTool(
    'cloudrays_list_scans',
    {
      title: 'CloudRays List Scans',
      description: 'List all CloudRays scans recorded under CLOUDRAYS_WORK_DIR (supports session recovery).',
      inputSchema: {},
    },
    async () => {
      const result = await listAllScans();
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );
}
