import { promises as fs } from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 50 * 1024;

const CATEGORY_TYPE_PREFIXES = {
  compute: [
    'Microsoft.Compute/virtualMachines',
    'Microsoft.Compute/virtualMachineScaleSets',
    'Microsoft.Compute/availabilitySets',
    'Microsoft.Web/sites',
    'Microsoft.Web/serverFarms',
    'Microsoft.Web/staticSites',
    'Microsoft.ContainerService/managedClusters',
    'Microsoft.ContainerInstance/containerGroups',
    'Microsoft.App/containerApps',
    'Microsoft.Batch/batchAccounts',
    'Microsoft.HPCWorkbench',
  ],
  storage: [
    'Microsoft.Storage/storageAccounts',
    'Microsoft.Compute/disks',
    'Microsoft.Compute/snapshots',
    'Microsoft.Compute/images',
    'Microsoft.NetApp/netAppAccounts',
    'Microsoft.StoragePool',
    'Microsoft.DataBox',
    'Microsoft.StorageSync',
  ],
  database: [
    'Microsoft.Sql/servers',
    'Microsoft.Sql/managedInstances',
    'Microsoft.DocumentDB/databaseAccounts',
    'Microsoft.DBforMySQL',
    'Microsoft.DBforPostgreSQL',
    'Microsoft.DBforMariaDB',
    'Microsoft.Cache/Redis',
    'Microsoft.DataMigration',
  ],
  networking: [
    'Microsoft.Network/virtualNetworks',
    'Microsoft.Network/networkSecurityGroups',
    'Microsoft.Network/loadBalancers',
    'Microsoft.Network/applicationGateways',
    'Microsoft.Network/frontDoors',
    'Microsoft.Network/publicIPAddresses',
    'Microsoft.Network/dnsZones',
    'Microsoft.Network/privateDnsZones',
    'Microsoft.Network/virtualNetworkGateways',
    'Microsoft.Network/expressRouteCircuits',
    'Microsoft.Network/networkInterfaces',
    'Microsoft.Network/privateEndpoints',
    'Microsoft.Cdn/profiles',
  ],
  analytics: [
    'Microsoft.Synapse/workspaces',
    'Microsoft.DataFactory/factories',
    'Microsoft.Databricks/workspaces',
    'Microsoft.HDInsight/clusters',
    'Microsoft.StreamAnalytics/streamingjobs',
    'Microsoft.Kusto/clusters',
    'Microsoft.PowerBIDedicated',
    'Microsoft.Purview/accounts',
  ],
  security_identity: [
    'Microsoft.KeyVault/vaults',
    'Microsoft.ManagedIdentity/userAssignedIdentities',
    'Microsoft.AAD',
    'Microsoft.AzureActiveDirectory',
    'Microsoft.Security',
    'Microsoft.Authorization',
    'Microsoft.GuardDuty',
    'Microsoft.OperationalInsights/workspaces',
  ],
  integration: [
    'Microsoft.ServiceBus/namespaces',
    'Microsoft.EventGrid',
    'Microsoft.EventHub/namespaces',
    'Microsoft.Logic/workflows',
    'Microsoft.ApiManagement/service',
    'Microsoft.Relay',
    'Microsoft.NotificationHubs',
  ],
  ai_ml: [
    'Microsoft.CognitiveServices/accounts',
    'Microsoft.MachineLearningServices/workspaces',
    'Microsoft.Bot',
    'Microsoft.Search/searchServices',
    'Microsoft.OpenAI',
  ],
};

const CATEGORY_NAME_HINTS = {
  security_identity: ['entra', 'azuread', 'activedirectory', 'defender', 'sentinel'],
  ai_ml: ['openai', 'cognitive', 'machinelearning', 'bot', 'search'],
  analytics: ['synapse', 'databricks', 'datafactory', 'hdinsight', 'powerbi', 'kusto', 'stream'],
};

function extractType(resource) {
  return (resource.type || resource.Type || resource.resourceType || '').toString();
}

function extractName(resource) {
  return (resource.name || resource.Name || resource.resourceName || '').toString();
}

function extractId(resource) {
  return (resource.id || resource.Id || resource.resource_id || resource.resourceId || '').toString();
}

function extractResourceGroup(resource) {
  if (resource.resourceGroup || resource.resource_group) {
    return resource.resourceGroup || resource.resource_group;
  }
  const id = extractId(resource);
  const m = id.match(/\/resourceGroups\/([^/]+)/i);
  return m ? m[1] : null;
}

function extractLocation(resource) {
  return (resource.location || resource.Location || resource.region || '').toString();
}

function extractSku(resource) {
  if (typeof resource.sku === 'string') return resource.sku;
  if (resource.sku && typeof resource.sku === 'object') {
    return resource.sku.name || resource.sku.tier || JSON.stringify(resource.sku);
  }
  if (resource.vmSize || resource.VMSize) return resource.vmSize || resource.VMSize;
  return null;
}

function extractCost(resource) {
  const keys = ['monthly_cost_usd', 'monthlyCost', 'MonthlyCost', 'cost', 'PreTaxCost', 'Cost'];
  for (const k of keys) {
    if (typeof resource[k] === 'number') return resource[k];
    if (typeof resource[k] === 'string' && !Number.isNaN(parseFloat(resource[k]))) {
      return parseFloat(resource[k]);
    }
  }
  return 0;
}

function matchesCategory(resource, category) {
  const type = extractType(resource).toLowerCase();
  const name = extractName(resource).toLowerCase();
  const prefixes = CATEGORY_TYPE_PREFIXES[category] || [];
  for (const prefix of prefixes) {
    if (type.startsWith(prefix.toLowerCase())) return true;
  }
  const hints = CATEGORY_NAME_HINTS[category] || [];
  for (const hint of hints) {
    if (name.includes(hint) || type.includes(hint)) return true;
  }
  return false;
}

function isMapped(resource) {
  const type = extractType(resource);
  for (const prefixes of Object.values(CATEGORY_TYPE_PREFIXES)) {
    for (const p of prefixes) {
      if (type.toLowerCase().startsWith(p.toLowerCase())) return true;
    }
  }
  return false;
}

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function findReportFiles(outputDir) {
  const files = { inventory: null, consumption: null, metrics: null };
  try {
    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      const lower = e.name.toLowerCase();
      const full = path.join(outputDir, e.name);
      if (lower.endsWith('.json')) {
        if (lower.includes('consumption')) files.consumption = full;
        else if (lower.includes('metric')) files.metrics = full;
        else if (lower.includes('inventory') || !files.inventory) files.inventory = full;
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return files;
}

function normalizeResources(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.resources)) return data.resources;
  if (Array.isArray(data.Resources)) return data.Resources;
  if (Array.isArray(data.value)) return data.value;
  const out = [];
  for (const v of Object.values(data)) {
    if (Array.isArray(v)) out.push(...v);
  }
  return out;
}

function normalizeConsumption(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.consumption)) return data.consumption;
  if (Array.isArray(data.value)) return data.value;
  return [];
}

function buildResourceSummary(resource) {
  return {
    id: extractId(resource),
    name: extractName(resource),
    type: extractType(resource),
    resource_group: extractResourceGroup(resource),
    location: extractLocation(resource),
    sku: extractSku(resource),
    monthly_cost_usd: extractCost(resource),
    tags: resource.tags || resource.Tags || null,
  };
}

function sortResources(list, sortBy) {
  const s = sortBy || 'cost';
  if (s === 'cost') {
    list.sort((a, b) => (b.monthly_cost_usd || 0) - (a.monthly_cost_usd || 0));
  } else if (s === 'name') {
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } else if (s === 'count') {
    // already grouped elsewhere
  }
  return list;
}

function clampToBudget(obj) {
  let json = JSON.stringify(obj);
  if (json.length <= MAX_BYTES) return obj;
  if (Array.isArray(obj.resources)) {
    const truncatedNote = {
      ...obj,
      resources: obj.resources.slice(0, Math.max(5, Math.floor(obj.resources.length / 2))),
      truncated: true,
      truncation_reason: `payload exceeded ${MAX_BYTES} bytes; showing top entries`,
    };
    while (JSON.stringify(truncatedNote).length > MAX_BYTES && truncatedNote.resources.length > 1) {
      truncatedNote.resources = truncatedNote.resources.slice(0, truncatedNote.resources.length - 1);
    }
    return truncatedNote;
  }
  return { truncated: true, note: 'payload too large', sample: JSON.stringify(obj).slice(0, MAX_BYTES) };
}

export async function aggregate({ outputDir, category, topN = 20, sortBy = 'cost' }) {
  const files = await findReportFiles(outputDir);
  const inventoryRaw = files.inventory ? await readJson(files.inventory) : null;
  const consumptionRaw = files.consumption ? await readJson(files.consumption) : null;
  const metricsRaw = files.metrics ? await readJson(files.metrics) : null;

  const resources = normalizeResources(inventoryRaw);
  const consumption = normalizeConsumption(consumptionRaw);

  switch (category) {
    case 'summary':
      return clampToBudget(buildSummary(resources, consumption));
    case 'compute':
    case 'storage':
    case 'database':
    case 'networking':
    case 'analytics':
    case 'security_identity':
    case 'integration':
    case 'ai_ml':
      return clampToBudget(buildCategorySlice(resources, category, topN, sortBy));
    case 'cost_summary':
      return clampToBudget(buildCostSummary(resources, consumption, topN));
    case 'unmapped_services':
      return clampToBudget(buildUnmapped(resources, topN));
    case 'raw_inventory':
      return clampToBudget({ category: 'raw_inventory', count: resources.length, resources: resources.slice(0, topN) });
    case 'raw_consumption':
      return clampToBudget({ category: 'raw_consumption', count: consumption.length, items: consumption.slice(0, topN) });
    case 'raw_metrics':
      return clampToBudget({
        category: 'raw_metrics',
        has_data: !!metricsRaw,
        sample: metricsRaw ? JSON.stringify(metricsRaw).slice(0, 4096) : null,
      });
    default:
      throw new Error(`unknown category: ${category}`);
  }
}

function buildSummary(resources, consumption) {
  const typeCounts = new Map();
  const locationCounts = new Map();
  let totalCost = 0;
  for (const r of resources) {
    const t = extractType(r) || 'unknown';
    typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
    const loc = extractLocation(r) || 'unknown';
    locationCounts.set(loc, (locationCounts.get(loc) || 0) + 1);
    totalCost += extractCost(r);
  }
  if (consumption.length && totalCost === 0) {
    for (const c of consumption) totalCost += extractCost(c);
  }
  const categoryCounts = {};
  for (const cat of Object.keys(CATEGORY_TYPE_PREFIXES)) {
    categoryCounts[cat] = resources.filter((r) => matchesCategory(r, cat)).length;
  }
  return {
    category: 'summary',
    total_resources: resources.length,
    distinct_types: typeCounts.size,
    distinct_locations: locationCounts.size,
    total_monthly_cost_usd: Number(totalCost.toFixed(2)),
    by_category: categoryCounts,
    top_types: [...typeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([type, count]) => ({ type, count })),
    top_locations: [...locationCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([location, count]) => ({ location, count })),
  };
}

function buildCategorySlice(resources, category, topN, sortBy) {
  const filtered = resources.filter((r) => matchesCategory(r, category));
  const summaries = filtered.map(buildResourceSummary);
  sortResources(summaries, sortBy);
  const totalCost = summaries.reduce((a, b) => a + (b.monthly_cost_usd || 0), 0);
  const typeCounts = new Map();
  for (const r of summaries) typeCounts.set(r.type, (typeCounts.get(r.type) || 0) + 1);
  return {
    category,
    count: summaries.length,
    total_monthly_cost_usd: Number(totalCost.toFixed(2)),
    by_type: [...typeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count })),
    resources: summaries.slice(0, topN),
  };
}

function buildCostSummary(resources, consumption, topN) {
  const svcMap = new Map();
  const push = (key, cost) => {
    if (!key) return;
    svcMap.set(key, (svcMap.get(key) || 0) + (cost || 0));
  };
  for (const r of resources) {
    push(extractType(r) || 'unknown', extractCost(r));
  }
  for (const c of consumption) {
    const key = c.serviceName || c.ServiceName || c.meterCategory || c.MeterCategory || extractType(c) || 'unknown';
    push(key, extractCost(c));
  }
  const sorted = [...svcMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([service, cost]) => ({ service, monthly_cost_usd: Number(cost.toFixed(2)) }));
  const total = [...svcMap.values()].reduce((a, b) => a + b, 0);
  return {
    category: 'cost_summary',
    total_monthly_cost_usd: Number(total.toFixed(2)),
    top_services: sorted,
  };
}

function buildUnmapped(resources, topN) {
  const unmapped = resources.filter((r) => !isMapped(r));
  const counts = new Map();
  for (const r of unmapped) {
    const t = extractType(r) || 'unknown';
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  const byType = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([type, count]) => ({ type, count }));
  return {
    category: 'unmapped_services',
    count: unmapped.length,
    by_type: byType,
    samples: unmapped.slice(0, Math.min(5, topN)).map(buildResourceSummary),
  };
}

export const SUPPORTED_CATEGORIES = [
  'summary',
  'compute',
  'storage',
  'database',
  'networking',
  'analytics',
  'security_identity',
  'integration',
  'ai_ml',
  'cost_summary',
  'unmapped_services',
  'raw_inventory',
  'raw_consumption',
  'raw_metrics',
];
