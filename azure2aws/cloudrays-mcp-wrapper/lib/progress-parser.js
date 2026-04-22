import { promises as fs } from 'node:fs';

const KNOWN_COLLECTORS = [
  'Subscriptions',
  'ResourceGroups',
  'VirtualMachines',
  'VirtualMachineScaleSets',
  'ManagedDisks',
  'StorageAccounts',
  'VirtualNetworks',
  'NetworkSecurityGroups',
  'LoadBalancers',
  'ApplicationGateways',
  'PublicIPAddresses',
  'PrivateEndpoints',
  'KeyVaults',
  'SQLDatabases',
  'CosmosDB',
  'MySQL',
  'PostgreSQL',
  'Redis',
  'AKS',
  'AppService',
  'Functions',
  'ServiceBus',
  'EventHub',
  'EventGrid',
  'LogicApps',
  'APIManagement',
  'Synapse',
  'DataFactory',
  'Databricks',
  'Consumption',
  'Metrics',
];

const TOTAL_COLLECTORS_DEFAULT = 28;

const COLLECTOR_LINE_PATTERNS = [
  /Collecting\s+([A-Za-z][A-Za-z0-9]+)/i,
  /Running\s+collector[:\s]+([A-Za-z][A-Za-z0-9]+)/i,
  /\[Collector\]\s*([A-Za-z][A-Za-z0-9]+)/i,
  /Starting\s+([A-Za-z][A-Za-z0-9]+)\s+collector/i,
  /Processing\s+([A-Za-z][A-Za-z0-9]+)/i,
];

const PERCENT_PATTERN = /(\d{1,3})\s*%/;
const COMPLETED_PATTERN = /(\d+)\s*\/\s*(\d+)\s+collectors?/i;
const ERROR_PATTERN = /\b(ERROR|FATAL|Exception)\b[:\s-]*(.*)/;
const DONE_PATTERN = /(report generated|scan completed|inventory complete|export complete|finished successfully)/i;

export async function readLogTail(logPath, maxBytes = 64 * 1024) {
  try {
    const stat = await fs.stat(logPath);
    const start = Math.max(0, stat.size - maxBytes);
    const fh = await fs.open(logPath, 'r');
    try {
      const len = stat.size - start;
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, start);
      return buf.toString('utf8');
    } finally {
      await fh.close();
    }
  } catch (err) {
    if (err.code === 'ENOENT') return '';
    throw err;
  }
}

export function parseProgress(logText, totalCollectors = TOTAL_COLLECTORS_DEFAULT) {
  const lines = logText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let currentCollector = null;
  let collectorsCompleted = 0;
  let percent = null;
  let done = false;
  const errors = [];
  const seenCollectors = new Set();

  for (const line of lines) {
    for (const pattern of COLLECTOR_LINE_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const name = match[1];
        if (KNOWN_COLLECTORS.some((c) => c.toLowerCase() === name.toLowerCase()) || name.length > 2) {
          currentCollector = name;
          seenCollectors.add(name.toLowerCase());
        }
        break;
      }
    }

    const completedMatch = line.match(COMPLETED_PATTERN);
    if (completedMatch) {
      collectorsCompleted = parseInt(completedMatch[1], 10);
      const total = parseInt(completedMatch[2], 10);
      if (total > 0) totalCollectors = total;
    }

    const percentMatch = line.match(PERCENT_PATTERN);
    if (percentMatch) {
      const p = parseInt(percentMatch[1], 10);
      if (!Number.isNaN(p) && p >= 0 && p <= 100) percent = p;
    }

    const errMatch = line.match(ERROR_PATTERN);
    if (errMatch) {
      errors.push(errMatch[0].trim().slice(0, 500));
    }

    if (DONE_PATTERN.test(line)) done = true;
  }

  if (collectorsCompleted === 0 && seenCollectors.size > 0) {
    collectorsCompleted = Math.max(0, seenCollectors.size - 1);
  }
  if (percent === null && totalCollectors > 0) {
    percent = Math.min(100, Math.round((collectorsCompleted / totalCollectors) * 100));
  }

  return {
    current_collector: currentCollector,
    collectors_completed: collectorsCompleted,
    collectors_total: totalCollectors,
    percent,
    done,
    errors: errors.slice(-10),
  };
}

export function tailLines(text, n = 50) {
  const lines = text.split(/\r?\n/);
  return lines.slice(-n).join('\n');
}
