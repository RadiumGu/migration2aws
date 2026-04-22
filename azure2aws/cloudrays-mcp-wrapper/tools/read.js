import { readState } from '../lib/state-manager.js';
import { aggregate, SUPPORTED_CATEGORIES } from '../lib/aggregator.js';

export async function readResult({ scanId, category, topN = 20, sortBy }) {
  const state = await readState(scanId);
  if (!state) throw new Error(`scan_id not found: ${scanId}`);
  if (!state.output_dir) throw new Error(`scan ${scanId} has no output_dir`);
  if (!SUPPORTED_CATEGORIES.includes(category)) {
    throw new Error(`unknown category '${category}'. supported: ${SUPPORTED_CATEGORIES.join(', ')}`);
  }
  const payload = await aggregate({
    outputDir: state.output_dir,
    category,
    topN,
    sortBy,
  });
  return {
    scan_id: scanId,
    category,
    sort_by: sortBy || 'cost',
    top_n: topN,
    data: payload,
  };
}

export function register(server, z) {
  server.registerTool(
    'cloudrays_read',
    {
      title: 'CloudRays Result Reader',
      description:
        'Read CloudRays scan output aggregated by category. Categories: summary, compute, storage, database, networking, analytics, security_identity, integration, ai_ml, cost_summary, unmapped_services, raw_inventory, raw_consumption, raw_metrics.',
      inputSchema: {
        scan_id: z.string().describe('UUID returned from cloudrays_scan'),
        category: z.enum(SUPPORTED_CATEGORIES).describe('Aggregation category'),
        top_n: z.number().int().min(1).max(500).optional().default(20).describe('Max entries to return'),
        sort_by: z.enum(['cost', 'count', 'name']).optional().describe('Sort order (default: cost)'),
      },
    },
    async (input) => {
      const result = await readResult({
        scanId: input.scan_id,
        category: input.category,
        topN: input.top_n ?? 20,
        sortBy: input.sort_by,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );
}
