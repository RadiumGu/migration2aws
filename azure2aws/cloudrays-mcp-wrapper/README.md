# CloudRays MCP Wrapper

MCP server that wraps [awslabs/resource-discovery-for-azure](https://github.com/awslabs/resource-discovery-for-azure)
(CloudRays) PowerShell scripts behind five MCP tools, so Kiro agents can discover Azure environments
asynchronously during the `azure-to-aws` skill's Discover phase.

## Tools

| Tool | Purpose |
|------|---------|
| `cloudrays_preflight` | Check `pwsh`, `az` CLI, Azure authentication, and required RBAC roles |
| `cloudrays_scan` | Start an async CloudRays scan (spawn detached `pwsh`) |
| `cloudrays_status` | Poll scan progress from `state.json` + log tail |
| `cloudrays_read` | Read scan output aggregated by category (summary, compute, storage, …) |
| `cloudrays_list_scans` | List all historical scans (session recovery) |

## Requirements

- Node.js >= 18
- PowerShell 7+ (`pwsh`) on PATH
- Azure CLI (`az`) on PATH, authenticated (`az login`)
- Azure RBAC roles on target subscription: `Reader`, `Billing Reader`, `Monitoring Reader`,
  `Cost Management Reader` (the last three optional if `skip_consumption: true`)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLOUDRAYS_REPO` | `https://github.com/awslabs/resource-discovery-for-azure.git` | Git URL to clone on first scan |
| `CLOUDRAYS_WORK_DIR` | `$TMPDIR/cloudrays` | Working directory (state, logs, output) |

## Install and run

```bash
cd cloudrays-mcp-wrapper
npm install
node index.js
```

The server speaks MCP over stdio — launch it from an MCP-aware client (e.g. Kiro CLI) rather than
running directly.

## Typical flow

```text
cloudrays_preflight()                         → { ready: true, ... }
cloudrays_scan({ report_name: "AcmeCorp" })   → { scan_id, status: "running", ... }
cloudrays_status({ scan_id })                 → { status: "running"|"completed"|..., progress }
cloudrays_read({ scan_id, category: "summary" })
cloudrays_read({ scan_id, category: "compute", top_n: 20, sort_by: "cost" })
cloudrays_list_scans()                        → { scans: [...] }
```

## Categories supported by `cloudrays_read`

`summary`, `compute`, `storage`, `database`, `networking`, `analytics`, `security_identity`,
`integration`, `ai_ml`, `cost_summary`, `unmapped_services`, `raw_inventory`, `raw_consumption`,
`raw_metrics`.

Payloads are capped at 50 KB; oversized results are truncated with a `truncated: true` marker.

## State layout

```
$CLOUDRAYS_WORK_DIR/
├── repo/                         # cloned CloudRays source
└── <scan_id>/
    ├── state.json                # persisted scan metadata
    ├── scan.log                  # pwsh stdout
    ├── scan.err.log              # pwsh stderr
    └── InventoryReports/         # CloudRays JSON output
```

## Security

The wrapper does not store Azure credentials — it relies on the local `az` CLI session. CloudRays
scripts use read-only Azure APIs. All output stays under `$CLOUDRAYS_WORK_DIR`; clean up when done.
