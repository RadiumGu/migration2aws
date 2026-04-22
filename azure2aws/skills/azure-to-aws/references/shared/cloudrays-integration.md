# CloudRays MCP Wrapper Integration Guide

> Reference for Phase 1 (Discover). Describes how the agent interacts with the CloudRays MCP wrapper tools.
> CloudRays = [awslabs/resource-discovery-for-azure](https://github.com/awslabs/resource-discovery-for-azure)

---

## 1. Tool Overview

The CloudRays MCP wrapper exposes 5 tools:

| Tool | Purpose | Blocking? |
|------|---------|-----------|
| `cloudrays_preflight` | Check pwsh, az cli, auth, RBAC permissions | Yes (fast, <10s) |
| `cloudrays_scan` | Start async full-environment scan | No (returns immediately) |
| `cloudrays_status` | Poll scan progress | Yes (fast) |
| `cloudrays_read` | Read scan results by category | Yes (may be slow for `raw_*`) |
| `cloudrays_list_scans` | List historical scans | Yes (fast) |

---

## 2. Discover Phase — Complete Invocation Flow

### Step 1: Preflight Check

```
Tool: cloudrays_preflight
Input: {}
```

**Expected output:**
```json
{
  "ready": true,
  "checks": {
    "pwsh": { "available": true, "version": "7.4.x" },
    "az_cli": { "available": true, "version": "2.x.x" },
    "az_auth": { "authenticated": true, "subscription": "xxx", "tenant": "xxx" },
    "permissions": {
      "reader": true,
      "billing_reader": true,
      "monitoring_reader": true,
      "cost_management_reader": true
    }
  },
  "issues": []
}
```

**If `ready: false`**: Stop. Report each item in `issues[]` with remediation steps. Do not proceed to scan.

**If permissions partially missing**: Warn user which data will be unavailable (e.g., missing `billing_reader` → no Consumption data). Let user decide to proceed or fix permissions first.

### Step 2: Start Scan

```
Tool: cloudrays_scan
Input: {
  "report_name": "<customer_name>",       // Required
  "subscription_id": "<sub_id>",           // Optional
  "resource_group": "<rg_name>",           // Optional
  "concurrency_limit": 4,                  // Optional, default 4
  "skip_consumption": false                // Optional, default false
}
```

**Expected output:**
```json
{
  "scan_id": "uuid",
  "status": "running",
  "started_at": "2026-04-21T14:30:00Z",
  "estimated_duration_minutes": 15,
  "message": "Scan started. Use cloudrays_status to track progress."
}
```

**After receiving scan_id**: Agent may proceed with Clarify phase in parallel (asking Q1-Q10) while scan runs. This reduces total wall-clock time.

### Step 3: Poll Progress

```
Tool: cloudrays_status
Input: { "scan_id": "<uuid>" }
```

**Poll strategy**: Check every 60 seconds. After Clarify completes (or 10 minutes), check more frequently (every 30 seconds).

**Terminal states**: `completed`, `failed`, `partial`

- `completed`: All collectors finished. Proceed to Step 4.
- `partial`: Some collectors timed out. Proceed with available data; note gaps in inventory metadata.
- `failed`: Scan aborted. Check `error` field. Fall back to Azure MCP only path.

### Step 4: Read Results by Category

Read categories in this order to build the resource inventory efficiently:

```
Tool: cloudrays_read
Input: { "scan_id": "<uuid>", "category": "summary" }
```

Then read each service category:

| Order | Category | Purpose |
|-------|----------|---------|
| 1 | `summary` | Total resources, service type counts, total monthly cost |
| 2 | `compute` | VMs, VMSS, App Service, Functions, AKS |
| 3 | `database` | SQL Database, Cosmos DB, MySQL, PostgreSQL, Redis |
| 4 | `storage` | Storage Accounts, Blob, Files, Disks |
| 5 | `networking` | VNet, LB, App Gateway, Front Door, DNS |
| 6 | `security_identity` | Entra ID, Key Vault, Defender |
| 7 | `integration` | Service Bus, Event Grid, Event Hub, Logic Apps, APIM |
| 8 | `analytics` | Synapse, Data Factory, Databricks, HDInsight |
| 9 | `ai_ml` | Cognitive Services, Machine Learning, OpenAI Service |
| 10 | `cost_summary` | Top 20 services by monthly cost |
| 11 | `unmapped_services` | Services CloudRays couldn't auto-classify |

**Do NOT read `raw_inventory`, `raw_consumption`, or `raw_metrics`** unless a specific category result is insufficient. Raw reads may exceed 50KB and consume excessive context.

### Step 5: Azure MCP Supplementation

After processing CloudRays results, identify resources that need deeper investigation:

| Trigger | Azure MCP Query |
|---------|----------------|
| Unmapped PaaS service | Query resource type + SKU + configuration |
| AKS cluster found | Query node pool details, RBAC config, network plugin |
| App Service found | Query runtime stack, slot configuration, custom domains |
| Functions found | Query trigger bindings, runtime version |
| Cosmos DB found | Query consistency model, partition key, throughput mode |
| Dependency unclear | Query VNet peering, NSG rules, Private Endpoints |

### Step 6: Merge and Analyze

Combine CloudRays structured data + Azure MCP supplementation into:
- `azure-resource-inventory.json` (see `output-schema.md`)
- `azure-resource-clusters.json` (see `output-schema.md`)

Mark each resource's data source: `"source": "cloudrays"`, `"source": "azure-mcp"`, or `"source": "merged"`.

---

## 3. Degraded Mode: Azure MCP Only

If CloudRays is unavailable (preflight fails, pwsh not installed, etc.):

1. Use Azure MCP to list all resources in scope (`az resource list` equivalent)
2. Query each resource type for configuration details
3. **Limitations to note in reports**:
   - No historical metrics (CPU, memory, IOPS) → right-sizing not possible
   - No consumption data → Azure cost baseline must be user-provided
   - Discovery may take longer (sequential queries vs batch scan)
4. Set `metadata.source = "azure-mcp"` and `metadata.has_metrics = false`, `metadata.has_consumption = false`

---

## 4. Session Recovery

If the Kiro session disconnects mid-scan:

1. On reconnection, call `cloudrays_list_scans`
2. Find the scan matching the current migration session
3. Check status via `cloudrays_status`
4. If `completed` or `partial`: read results normally
5. If `running`: resume polling
6. If `failed`: decide whether to retry or degrade

---

## 5. Error Handling Quick Reference

| Error | Agent Action |
|-------|-------------|
| `auth_expired` | Ask user to run `az login`; retry preflight |
| `subscription_not_found` | Call `cloudrays_preflight` to list available subscriptions; let user pick |
| `permission_denied` | Show missing role(s) with `az role assignment create` command |
| `timeout` (scan) | If `partial` data available, proceed; otherwise retry with `skip_consumption: true` |
| `script_error` | Show last 50 lines from error log; suggest filing GitHub issue |
| Wrapper not installed | Fall back to Azure MCP only path; note in report |
