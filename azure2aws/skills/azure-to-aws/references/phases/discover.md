# Phase 1: Discover Azure Resources

Multi-source Azure environment discovery via **CloudRays full scan** (primary) + **Azure MCP real-time queries** (supplementation).

**Execute ALL steps in order. Do not skip or deviate.**

Full invocation details for each CloudRays tool are in `references/shared/cloudrays-integration.md`. This file is the top-level orchestration contract.

## Step 0: Initialize Migration State

1. Create `.migration/[MMDD-HHMM]/` directory (e.g., `.migration/0421-1430/`) using current timestamp (MMDD = month/day, HHMM = hour/minute).
2. Create `.migration/.gitignore` (if not already present) with exact content:

   ```
   # Auto-generated migration state (temporary, should not be committed)
   *
   !.gitignore
   ```

3. Write `.phase-status.json` with exact schema:

   ```json
   {
     "phase": "discover",
     "status": "in-progress",
     "timestamp": "2026-04-21T14:30:00Z",
     "version": "1.0.0"
   }
   ```

4. Confirm both `.migration/.gitignore` and `.migration/[MMDD-HHMM]/.phase-status.json` exist before proceeding to Step 1.

## Step 1: CloudRays Preflight Check

1. Invoke `cloudrays_preflight` tool (no arguments required).
2. Inspect the response:
   - **`ready: true` and all permissions true** → Proceed to Step 2.
   - **`ready: false` due to missing dependency** (pwsh / az cli / Node.js) → **STOP**. Output the exact remediation command from `issues[]`.
   - **`ready: false` due to auth failure** → **STOP**. Output: "Azure authentication failed. Run `az login` (or set `AZURE_TENANT_ID` + `AZURE_CLIENT_ID` + `AZURE_CLIENT_SECRET` for headless)."
   - **`ready: true` but some permissions false** → Warn user which data will be missing and ask whether to proceed with a degraded scan or fix permissions first.
   - **CloudRays wrapper not installed / tool not reachable** → Proceed to Step 8 (degraded mode, Azure MCP only).
3. Record the preflight outcome in scratch state (for reports in Step 7).

## Step 2: Collect Scan Parameters

1. Ask the user for the required `report_name` (customer or project identifier).
2. Ask (optional) for `subscription_id` — if not provided, CloudRays scans all accessible subscriptions for the authenticated principal.
3. Ask (optional) for `resource_group` — generally **do not** narrow here; full-scan + post-filter is preferred over single-RG scans to avoid missing cross-RG dependencies.
4. Default `concurrency_limit = 4`, `skip_consumption = false`. Only raise `skip_consumption = true` if the user explicitly does not have `Billing Reader` / `Cost Management Reader` roles.

## Step 3: Launch Asynchronous CloudRays Scan

1. Invoke `cloudrays_scan` with parameters from Step 2.
2. Record returned `scan_id` in scratch state.
3. **Parallelization decision**: If the user has agreed to Mode A/B for Clarify, branch Clarify execution now (in parallel with the running scan). Otherwise, wait for scan completion.
4. Set polling schedule:
   - Minutes 0-10: poll `cloudrays_status` every 60s
   - Minutes 10+: poll every 30s
   - Hard timeout: 30 minutes (if still running, proceed with `partial`)

## Step 4: Poll Scan Progress

1. Call `cloudrays_status` at each poll interval with `scan_id`.
2. Handle terminal states:
   - `completed` → Proceed to Step 5.
   - `partial` → Proceed to Step 5 with note that some collectors timed out. Mark inventory `metadata.source_notes = "partial_cloudrays_scan"`.
   - `failed` → Inspect `error` field. If `auth_expired`, prompt user to re-run `az login` and retry `cloudrays_scan` once. Otherwise proceed to Step 8 (degraded mode) and mark scan as failed.
3. For `running` status, display progress (current collector, % complete) to user every 2 polls.

## Step 5: Read CloudRays Results (Category-Filtered)

Read categories in this order. Each call: `cloudrays_read(scan_id, category, top_n=20)`.

| Order | Category | Required? | Purpose |
|-------|----------|-----------|---------|
| 1 | `summary` | Yes | Resource count, service types, total monthly cost |
| 2 | `compute` | Yes | VM, VMSS, App Service, Functions, AKS, Container Apps, Batch |
| 3 | `database` | Yes | Azure SQL, Cosmos DB, MySQL, PostgreSQL, Redis, MariaDB |
| 4 | `storage` | Yes | Storage Accounts, Blob, Files, Managed Disks, NetApp Files |
| 5 | `networking` | Yes | VNet, Subnet, NSG, LB, App Gateway, Front Door, DNS, VPN GW, ExpressRoute |
| 6 | `security_identity` | Yes | Entra ID, Key Vault, Defender, WAF policies |
| 7 | `integration` | Yes | Service Bus, Event Grid, Event Hub, Logic Apps, API Management, Relay |
| 8 | `analytics` | Yes | Synapse, Data Factory, Databricks, HDInsight, Stream Analytics, Data Explorer |
| 9 | `ai_ml` | Yes | Cognitive Services, ML Workspace, OpenAI Service, Bot Service, Search |
| 10 | `cost_summary` | Yes | Top 20 services by monthly cost (drives `monthly_cost_usd` per resource) |
| 11 | `unmapped_services` | Yes | Azure PaaS services CloudRays did not auto-classify — flagged for Step 6 |

**Never call `raw_inventory`, `raw_consumption`, or `raw_metrics` unless a category result is insufficient.** Raw reads can exceed 50KB and consume excessive context.

## Step 6: Mark Resources Needing Azure MCP Deep-Dive

Iterate over the categorized CloudRays output and set `needs_depth_query = true` on resources matching any of these triggers:

| Trigger | Reason |
|---------|--------|
| Resource appears in `unmapped_services` | CloudRays could not classify — needs configuration detail |
| Type is `Microsoft.ContainerService/managedClusters` (AKS) | Needs node pool SKUs, network plugin, add-ons |
| Type is `Microsoft.Web/sites` (App Service / Functions) | Needs runtime stack, slot config, custom domains, app settings |
| Type is `Microsoft.Web/sites/slots` | Deployment slot configuration |
| Type is `Microsoft.DocumentDB/databaseAccounts` (Cosmos DB) | Needs API type, consistency level, throughput mode, partition key |
| Type is `Microsoft.Sql/servers/databases` | Needs DTU/vCore, storage tier, geo-replication, License type |
| Type is `Microsoft.Network/frontDoors` or `Microsoft.Cdn/profiles` | Needs routing rules, backend pools, WAF policies |
| Type is `Microsoft.DataFactory/factories` | Needs linked services + pipeline inventory |
| Type is `Microsoft.Synapse/workspaces` | Needs SQL pool / Spark pool SKUs, linked storage |
| Any dependencies empty but resource type usually has edges (VM, AKS, App Service) | Dependency graph incomplete |
| `license_type` field missing on compute resources (Windows / SQL Server hint) | Required for Phase 3 Step 3 (Q9 application) |

## Step 7: Azure MCP Supplementation

For each flagged resource, call the appropriate Azure MCP tool. Default routing:

| Resource Type | Azure MCP Tool | Target Attributes |
|---------------|----------------|-------------------|
| VM / VMSS | `compute` | SKU details, OS disk type, license type, availability set |
| AKS | `aks` | Node pool SKUs, Kubernetes version, network plugin, RBAC config |
| App Service / Functions | `appservice` / `functionapp` | Runtime stack, deployment slots, custom domains, VNet integration |
| Cosmos DB | `cosmos` | API type (SQL/Mongo/Cassandra/Gremlin/Table), consistency, throughput |
| Azure SQL | `sql` | vCore/DTU, storage, geo-replication, License, elastic pool |
| Storage Account | `storage` | Access tier, replication, hierarchical namespace, firewall |
| Service Bus / Event Hub | `servicebus` / `eventhubs` | Tier, partitions, topics/queues, capacity units |
| Event Grid | `eventgrid` | Topics, subscriptions, filters |
| Postgres / MySQL | `postgres` / `mysql` | Version, SKU, HA mode, backup retention |
| Redis | `redis` | Tier, cluster mode, persistence |
| Key Vault | `keyvault` | Access policy model (RBAC vs access policies), soft-delete |
| Application Insights / Monitor | `applicationinsights` / `monitor` | Workspace links, log queries |
| Container Apps | `containerapps` | Environment, ingress, scaling rules |
| ACR | `acr` | SKU, replication regions |

**Also query for dependency-graph completion**:
- For each VNet: list peerings and connected subnets
- For each subnet: list attached NSGs and resources (compute, storage endpoints, etc.)
- For each Private Endpoint: list target resource
- For each VM: list attached disks, NICs, public IPs, availability set

**Merge rule**: When a field appears in both CloudRays and Azure MCP, prefer Azure MCP values (more current). Set `source: "merged"` on any resource where both tools contributed data.

## Step 8: Degraded Mode — Azure MCP Only (only if Step 1-4 failed)

If CloudRays is unavailable or scan failed irrecoverably:

1. Use `subscription_list` → `group_list` → `group_resource_list` to enumerate all resources in scope.
2. Run per-type Azure MCP queries (Step 7 table) for each resource found.
3. Set `metadata.source = "azure-mcp"`, `has_metrics = false`, `has_consumption = false`.
4. In the final report, add prominent warning: "⚠️ Degraded discovery: no CloudRays snapshot. Right-sizing recommendations unavailable (no historical metrics). Azure cost baseline must be provided manually in Phase 4."
5. Proceed to Step 9.

## Step 9: Classify Resources (8 Categories)

Classify every resource into one of these 8 categories (drives Phase 3 design-ref routing). Use `type` prefix matching:

| Category | Azure Type Prefix Examples |
|----------|---------------------------|
| `compute` | `Microsoft.Compute/*`, `Microsoft.Web/sites`, `Microsoft.ContainerService/*`, `Microsoft.ContainerInstance/*`, `Microsoft.App/*` (Container Apps), `Microsoft.Batch/*` |
| `storage` | `Microsoft.Storage/*`, `Microsoft.NetApp/*`, `Microsoft.Compute/disks`, `Microsoft.Compute/snapshots` |
| `database` | `Microsoft.Sql/*`, `Microsoft.DocumentDB/*`, `Microsoft.DBforMySQL/*`, `Microsoft.DBforPostgreSQL/*`, `Microsoft.Cache/*` (Redis), `Microsoft.DataFactory/*` |
| `networking` | `Microsoft.Network/*`, `Microsoft.Cdn/*` |
| `security_identity` | `Microsoft.KeyVault/*`, `Microsoft.Authorization/*`, Entra ID (AAD), `Microsoft.Security/*` |
| `integration` | `Microsoft.ServiceBus/*`, `Microsoft.EventGrid/*`, `Microsoft.EventHub/*`, `Microsoft.Logic/*`, `Microsoft.ApiManagement/*`, `Microsoft.Relay/*` |
| `analytics` | `Microsoft.Synapse/*`, `Microsoft.HDInsight/*`, `Microsoft.Databricks/*`, `Microsoft.StreamAnalytics/*`, `Microsoft.Kusto/*` |
| `ai_ml` | `Microsoft.CognitiveServices/*`, `Microsoft.MachineLearningServices/*`, `Microsoft.BotService/*`, `Microsoft.Search/*` |
| `devops` | `Microsoft.DevOps/*`, `Microsoft.VSOnline/*`, `Microsoft.OperationalInsights/*`, `Microsoft.Insights/*`, `Microsoft.Resources/deployments` (ARM) |

Any resource not matching goes into `other` with `needs_depth_query = true`.

## Step 10: Classify as PRIMARY vs SECONDARY

**PRIMARY**: user-facing workload or independently managed service.
- Compute: VM, VMSS, AKS, App Service, Functions, Container Apps, Batch
- Data: Azure SQL, Cosmos DB, Storage Account, Redis
- Network ingress: App Gateway, Front Door, VPN Gateway
- Foundational network: VNet (always primary — creation_order_depth = 0)

**SECONDARY** (with `secondary_role`):
- `network_path`: Subnet, NSG, Route Table, NAT Gateway → cluster with parent VNet
- `access_control`: Role assignments, managed identities → cluster with target resource
- `identity`: Service principals not tied to specific resource
- `configuration`: App settings, Key Vault references
- `encryption`: Disk encryption sets, customer-managed keys
- `orchestration`: ARM deployment artifacts

## Step 11: Compute Utilization Tier

For each compute/database resource with metrics data:

```
utilization_tier =
  "idle"   if cpu_avg < 5  and memory_avg_pct < 10
  "low"    if cpu_avg < 20 or  memory_avg_pct < 30
  "medium" if cpu_avg < 60 and memory_avg_pct < 70
  "high"   otherwise
```

Store on `resource.metrics.utilization_tier`. If no metrics data: set to `null` (Phase 3 will use peer sizing).

## Step 12: Compute Dependencies and Depth

1. For every resource, compile `dependencies[]` list from:
   - CloudRays inferred dependencies
   - Azure MCP queried relationships (VNet peerings, Private Endpoint targets, subnet memberships)
   - Config references (disk → VM, NIC → VM, Private DNS zone → VNet link)
2. Compute topological depth:
   - Depth 0: resources with no dependencies (VNet, DNS Zone, standalone Storage Account)
   - Depth N: max(dependencies' depth) + 1
3. If a cycle is detected, break with depth = max(any-member's non-cycle-depth) + 1 and log a warning.

## Step 13: Cluster Resources

Group resources into clusters by the following priority rules (earlier rules take precedence):

1. **Network affinity**: all resources sharing the same VNet + subnet pair → one cluster (unless compute resources have strong data-tier affinity overriding this).
2. **Data-tier affinity**: App Service + its backing database → same cluster; always co-migrate.
3. **Service family affinity**: AKS + ACR + attached Key Vault + NSG → same cluster.
4. **Region affinity**: never cluster across Azure regions.
5. **Orphan rule**: if a resource has no affinity match, it forms a single-resource cluster.

Cluster metadata:
- `cluster_id`: `<category>_<type-hint>_<region>_<seq>` (e.g., `compute_aks_eastasia_001`)
- `creation_order_depth`: min depth of contained primary resources
- `must_migrate_together`: true for data-tier / AKS clusters; false for independent compute

## Step 14: Write Output Files

**File 1: `azure-resource-inventory.json`**

Schema per `references/shared/output-schema.md` → `azure-resource-inventory.json` section.

Required: `metadata`, `resources[]`. Every resource must have `resource_id`, `type`, `name`, `classification`, `cluster_id`, `config`, `dependencies`, `depth`, `source`.

**File 2: `azure-resource-clusters.json`**

Schema per `references/shared/output-schema.md` → `azure-resource-clusters.json` section.

Required: `clusters[]`. Every cluster must have `cluster_id`, `azure_region`, `creation_order_depth`, `primary_resources`, `secondary_resources`, `must_migrate_together`, `dependencies`, `edges`.

## Step 15: Update Phase Status

Update `.phase-status.json`:

```json
{
  "phase": "discover",
  "status": "completed",
  "timestamp": "2026-04-21T14:30:00Z",
  "version": "1.0.0"
}
```

Output to user: "✅ Discover phase complete. Found X resources across Y clusters in Z Azure regions. Source: [cloudrays|azure-mcp|merged]. [If degraded: note limitations.] Proceeding to Phase 2: Clarify."

## Output Files ONLY

Discover phase produces **exactly 2 files** in `.migration/[MMDD-HHMM]/`:

1. `azure-resource-inventory.json` (REQUIRED)
2. `azure-resource-clusters.json` (REQUIRED)

Plus `.phase-status.json` updated.

**No other files should be created**:

- ❌ README.md
- ❌ discovery-summary.md
- ❌ discovery-log.md
- ❌ Any documentation or report files

All user communication via output messages only.

## Error Handling

| Condition | Action |
|-----------|--------|
| Missing `.migration/` directory | Create it (Step 0) |
| Missing `.migration/.gitignore` | Create it automatically (Step 0) |
| `cloudrays_preflight` returns `ready: false` (unrecoverable) | Proceed to Step 8 (degraded mode) if Azure MCP reachable; else STOP |
| `cloudrays_scan` fails mid-run | If `partial`, continue; else degrade to Step 8 |
| No source reachable (CloudRays + Azure MCP both fail) | **STOP**. Output: "No Azure data source reachable. Verify `az login` and MCP configuration, then re-run." |
| Output file validation fails (missing required fields) | **STOP** and report schema error; do not advance phase |
| Resource with unknown `type` prefix (not in Step 9 table) | Classify as `other`, set `needs_depth_query = true`, add to warnings |

## Differences from GCP2AWS Discover

- **Input channels**: CloudRays + Azure MCP (vs GCP static Terraform only)
- **Utilization data available**: CloudRays Metrics enables right-sizing in Phase 3
- **Cost baseline captured at discovery**: CloudRays Consumption feeds Phase 4 TCO directly
- **Async scan model**: discovery can proceed in parallel with Clarify Mode A/B
- **Category count**: 8 (Azure has more service families than GCP)
- **PaaS deep queries**: Azure MCP can resolve PaaS configuration details that would otherwise need manual inspection
