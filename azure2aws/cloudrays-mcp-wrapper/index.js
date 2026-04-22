#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { register as registerPreflight } from './tools/preflight.js';
import { register as registerScan } from './tools/scan.js';
import { register as registerStatus } from './tools/status.js';
import { register as registerRead } from './tools/read.js';
import { register as registerListScans } from './tools/list-scans.js';

async function main() {
  const server = new McpServer({
    name: 'cloudrays-mcp-wrapper',
    version: '0.1.0',
  });

  registerPreflight(server, z);
  registerScan(server, z);
  registerStatus(server, z);
  registerRead(server, z);
  registerListScans(server, z);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('[cloudrays-mcp-wrapper] fatal:', err);
  process.exit(1);
});
