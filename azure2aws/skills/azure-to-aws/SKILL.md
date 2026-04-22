---
name: azure-to-aws
description: "Migrate workloads from Microsoft Azure to AWS. Triggers on: migrate from Azure, Azure to AWS, move off Azure, Azure migration assessment, migrate AKS to EKS, migrate Azure SQL to RDS, Azure AD to IAM Identity Center, Entra ID migration. Runs a 5-phase process: discover Azure resources via CloudRays full-environment scan and Azure MCP real-time queries, clarify migration requirements (including license and identity strategy), design AWS architecture, estimate costs with Azure TCO comparison, and plan execution."
---

# Azure-to-AWS Migration Skill

## Philosophy

- **Re-platform by default**: Select the AWS managed service that most closely matches the Azure workload (e.g., AKS → EKS, Azure SQL → RDS/Aurora, Functions → Lambda).
- **License-aware**: Proactively flag Microsoft licensing constraints (Listed Provider restrictions post-2022) and recommend open-source replacements (e.g., SQL Server → Aurora PostgreSQL) where it materially lowers TCO.
- **Multi-source discovery**: Combine three input channels — CloudRays JSON exports (snapshot + 31-day metrics + consumption), Azure MCP real-time queries (PaaS depth + dependencies), and optional ARM/Bicep templates. Tools collaborate; they are not primary/backup.
- **Dev sizing unless specified**: Default to development-tier capacity. Upgrade only on explicit user direction or when Metrics data indicates sustained high utilization.
- **Identity-first**: Azure AD/Entra ID is entangled with most Azure services. Treat identity migration as a first-class concern, not an afterthought.

## Prerequisites

### Azure Authentication

Both CloudRays and Azure MCP Server share the same credential chain — the user authenticates once.

| Scenario | Auth method | Notes |
|----------|-------------|-------|
| Local development | `az login` | Interactive browser login; both tools auto-discover the token |
| Azure Cloud Shell | Automatic | No additional action required |
| CI/CD or headless | Service Principal | Set `AZURE_TENANT_ID` + `AZURE_CLIENT_ID` + `AZURE_CLIENT_SECRET` |
| China / Gov cloud | `az login` + cloud override | Set `AZURE_CLOUD=AzureChinaCloud` (or `AzureUSGovernment`) |

### Required Azure RBAC Roles

Assign to the signed-in user or Service Principal at Subscription scope:

| Role | Purpose | Required by |
|------|---------|-------------|
| `Reader` | Read resource configuration | CloudRays + Azure MCP |
| `Billing Reader` | Access billing data | CloudRays |
| `Monitoring Reader` | Read Azure Monitor metrics | CloudRays |
| `Cost Management Reader` | Read cost management data | CloudRays |

> Azure MCP only needs `Reader` (live queries, no billing/metrics collection).
> CloudRays needs all four for a complete report. With `skip_consumption=true`, only `Reader` + `Monitoring Reader` are required.

### User-Provided Information

| Item | Required? | Notes |
|------|-----------|-------|
| Azure Tenant ID | Optional | Only for multi-tenant scenarios; `az login` auto-resolves single tenant |
| Azure Subscription ID | Optional | Narrows scan scope; omit to scan all accessible subscriptions |
| Resource Group | Optional | Further narrows scope; full-scan + filter recommended over single-RG |
| Customer / Project name | **Required** | Used as CloudRays `-ReportName` and in output filenames |

### Runtime Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| PowerShell (`pwsh`) | 7.0+ | Runs CloudRays scripts |
| Azure CLI (`az`) | 2.x | Auth + CloudRays data collection |
| Node.js | 18+ | CloudRays MCP wrapper + Kiro CLI |
| `npx` or `uvx` | bundled | Azure MCP Server launcher |

> The `cloudrays_preflight` tool automatically checks all dependencies and permissions, returning structured results. Users do not need to verify manually.

**Fallback**: If none of CloudRays, Azure MCP, or ARM/Bicep templates are usable, stop immediately and ask the user to provide at least one input source.

## State Management

Migration state lives in `.migration/[MMDD-HHMM]/` (created by Phase 1, persists across invocations):

```
.migration/
├── .gitignore                         # Auto-created; protects state from git
└── 0421-1430/                         # MMDD-HHMM timestamp
    ├── .phase-status.json             # Current phase tracking
    ├── azure-resource-inventory.json  # Phase 1 output
    ├── azure-resource-clusters.json   # Phase 1 output
    ├── clarified.json                 # Phase 2 output
    ├── aws-design.json                # Phase 3 output
    ├── aws-design-report.md           # Phase 3 output
    ├── estimation.json                # Phase 4 output
    ├── estimation-report.md           # Phase 4 output
    ├── execution.json                 # Phase 5 output
    └── execution-timeline.md          # Phase 5 output
```

**.phase-status.json schema:**

```json
{
  "phase": "discover|clarify|design|estimate|execute",
  "status": "in-progress|completed",
  "timestamp": "2026-04-21T14:30:00Z",
  "version": "1.0.0"
}
```

If `.phase-status.json` exists:

- If `status` is `completed`: advance to next phase (discover→clarify, clarify→design, etc.)
- If `status` is `in-progress`: resume from that phase

## Phase Routing

1. **On skill invocation**: Check for `.migration/*/` directory
   - If none exist: Initialize Phase 1 (Discover), set status to `in-progress`
   - If multiple exist: **STOP**. Output: "Multiple migration sessions detected in `.migration/`:" then for each directory, display its name and the contents of its `.phase-status.json` (phase + status). Output: "Pick one to continue: [list with phase info]"
   - If exists: Load `.phase-status.json` and validate:
     - **If empty file (0 bytes)**: STOP. Output: "State file is empty. Delete `.migration/[MMDD-HHMM]/.phase-status.json` and restart."
     - **If invalid JSON**: STOP. Output: "State file corrupted (invalid JSON). Delete `.migration/[MMDD-HHMM]/.phase-status.json` and restart Phase [X]."
     - **If missing required fields** (`phase`, `status`, `timestamp`, `version`): STOP. Output: "State file incomplete (missing [field]). Delete and restart."
     - **If version != "1.0.0"**: STOP. Output: "Incompatible state file version: [version]. This skill requires version 1.0.0."
     - **If unrecognized phase value**: STOP. Output: "Unrecognized phase: [value]. Valid values: discover, clarify, design, estimate, execute."
     - **If status not in {in-progress, completed}**: STOP. Output: "Unrecognized status: [value]. Valid values: in-progress, completed."
     - **If valid**: Determine next action:
       - If phase status is `in-progress`: Resume that phase
       - If phase status is `completed`: Advance to next phase

2. **Phase transition mapping** (when phase is `completed`):
   - discover (completed) → Route to clarify
   - clarify (completed) → Route to design
   - design (completed) → Route to estimate
   - estimate (completed) → Route to execute
   - execute (completed) → Migration complete; offer summary and cleanup options

3. **Phase gate checks**: If prior phase incomplete, do not advance (e.g., cannot enter estimate without completed design)

## Phase Summary Table

| Phase | Inputs | Outputs | Reference |
|-------|--------|---------|-----------|
| **Discover** | CloudRays full scan (primary) + Azure MCP real-time supplementation. Degraded paths: Azure MCP only, or ARM/Bicep templates. See note below. | `azure-resource-inventory.json`, `azure-resource-clusters.json`, `.phase-status.json` updated | `references/phases/discover.md` |
| **Clarify** | `azure-resource-inventory.json`, `azure-resource-clusters.json` | `clarified.json`, `.phase-status.json` updated | `references/phases/clarify.md` |
| **Design** | inventory + clusters + `clarified.json` | `aws-design.json`, `aws-design-report.md`, `.phase-status.json` updated | `references/phases/design.md` |
| **Estimate** | `aws-design.json`, `clarified.json`, optional CloudRays `*_Consumption.json` | `estimation.json`, `estimation-report.md`, `.phase-status.json` updated | `references/phases/estimate.md` |
| **Execute** | `aws-design.json`, `estimation.json` | `execution.json`, `execution-timeline.md`, `.phase-status.json` updated | `references/phases/execute.md` |

**Discover tool-collaboration model**: CloudRays MCP wrapper and Azure MCP Server are complementary, not primary/backup. CloudRays provides the breadth (full inventory + 31-day metrics + monthly cost baseline) in a single asynchronous scan. Azure MCP provides depth on demand (specific SKU details, runtime stacks, node pool configs, VNet/NSG relationships). The agent runs CloudRays first, then uses Azure MCP to drill into unmapped PaaS services and fill the dependency graph. See `references/shared/cloudrays-integration.md` for the full invocation flow.

### Reference Files

| Path | Purpose |
|------|---------|
| `references/phases/discover.md` | Phase 1 detailed workflow |
| `references/phases/clarify.md` | Phase 2 detailed workflow |
| `references/phases/design.md` | Phase 3 detailed workflow |
| `references/phases/estimate.md` | Phase 4 detailed workflow |
| `references/phases/execute.md` | Phase 5 detailed workflow |
| `references/shared/clarify-questions.md` | Q1–Q10 question definitions |
| `references/shared/service-mapping.md` | Azure → AWS service mapping table |
| `references/shared/output-schema.md` | JSON schemas for all phase outputs |
| `references/shared/complexity-ratings.md` | Migration complexity rating criteria |
| `references/shared/license-guidance.md` | Microsoft licensing constraints & recommendations |
| `references/shared/cloudrays-integration.md` | CloudRays invocation flow & Azure MCP collaboration |
| `references/shared/pricing-fallback.json` | Static AWS pricing fallback (Top 20 services) |
| `references/design-refs/index.md` | Design rubric index |
| `references/design-refs/fast-path.md` | Fast-path 1:1 service mappings |
| `references/design-refs/compute.md` | Compute service selection rubric |
| `references/design-refs/database.md` | Database service selection rubric |
| `references/design-refs/storage.md` | Storage service selection rubric |
| `references/design-refs/networking.md` | Networking service selection rubric |
| `references/design-refs/security-identity.md` | Security & identity service selection rubric |
| `references/design-refs/analytics.md` | Analytics service selection rubric |
| `references/design-refs/ai-ml.md` | AI/ML service selection rubric |
| `references/design-refs/integration.md` | Integration service selection rubric |
| `references/design-refs/devops.md` | DevOps service selection rubric |

## MCP Servers

**cloudrays** (Discover phase — primary Azure scanner):

1. Call `cloudrays_preflight` to verify pwsh, az cli, authentication, and RBAC roles.
2. Call `cloudrays_scan` to start an asynchronous full-environment scan. Proceed to Clarify in parallel if latency budget is tight.
3. Poll `cloudrays_status` until complete (or `partial`).
4. Call `cloudrays_read` with `category` filters (`summary`, `compute`, `storage`, `database`, etc.) to read structured results. Prefer category-filtered reads over `raw_*` to keep results under 50KB.
5. If scan fails or CloudRays is unavailable, degrade to Azure MCP only and mark inventory `metadata.source = "azure-mcp"` with a data-limitation note in reports.

**azure-mcp** (Discover + Design phases — targeted Azure queries):

1. After CloudRays completes, list Azure resources flagged by the agent as "needs-depth" (unmapped PaaS, complex SKUs, ambiguous dependencies).
2. Query specific resource configurations: App Service runtime stacks, AKS node pool SKUs, Cosmos DB consistency settings, Functions trigger bindings, etc.
3. Query network-topology artifacts (VNet peerings, NSG rule sets, Private Endpoints) to complete the dependency graph.
4. During Design, re-check resource details when a mapping decision hinges on a specific Azure feature flag.

**awspricing** (Estimate phase — AWS pricing):

1. Call `get_pricing_service_codes()` to detect availability.
2. If success: use live AWS pricing.
3. If timeout/error after 3 attempts: fall back to `references/shared/pricing-fallback.json`. Set `pricing_source.status = "fallback"` in estimation.json.

**awsknowledge** (Design phase — AWS architecture validation):

1. Regional availability checks (service available in target region?).
2. Feature parity checks (do required features exist in the AWS service?).
3. Service constraints and best practices.
4. **Fallback**: if unavailable, set `validation_status: "skipped"` in aws-design.json with a note in the design report.
5. **Important**: Validation is informational; design proceeds either way (not blocking).

**aws-documentation** (Design phase — optional, service-selection research):

1. Search AWS official documentation for feature parity between Azure service X and candidate AWS services.
2. Non-blocking; if unavailable, rely on `references/design-refs/` rubrics and awsknowledge.

**aws-diagram** (Design + Execute phases — optional, architecture diagrams):

1. Generate current Azure architecture diagram from inventory.
2. Generate target AWS architecture diagram from `aws-design.json`.
3. Non-blocking; reports proceed in text-only form if unavailable.

**cost-analysis** (Estimate phase — optional, existing-AWS environments):

1. Pull AWS Cost Explorer data when the customer already has an AWS footprint (useful for accurate discount modeling).
2. Non-blocking; skipped for greenfield AWS targets.

## Error Handling

| Condition | Action |
|-----------|--------|
| No input source available (no CloudRays, no Azure MCP, no ARM/Bicep) | Stop. Output: "No Azure data source detected. Please run CloudRays, configure Azure MCP, or provide ARM/Bicep templates and try again." |
| `cloudrays_preflight` reports missing dependency or permission | Stop. Output the exact missing item with remediation command (e.g., "Missing role: Billing Reader. Run: `az role assignment create --role 'Billing Reader' ...`"). |
| `cloudrays_scan` fails mid-scan (auth expired, rate limit) | If `partial` results available, continue with degraded inventory and note limitation. Otherwise fall back to Azure MCP only. |
| `.phase-status.json` missing phase gate | Stop. Output: "Cannot enter Phase X: Phase Y-1 not completed. Start from Phase Y or resume Phase Y-1." |
| awspricing unavailable after 3 attempts | Display warning about ±15-25% accuracy. Use `pricing-fallback.json`. Add `pricing_source: fallback` to estimation.json. |
| User does not answer all Q1-Q10 | Offer Mode C (defaults) or Mode D (free text). Phase 2 completes either way. |
| `aws-design.json` missing required clusters | Stop Phase 4. Output: "Re-run Phase 3 to generate missing cluster designs." |
| Azure MCP unauthenticated mid-phase | Prompt user to re-run `az login`; resume current phase on success. |

## Defaults

- **IaC output**: None (v1.0 produces design, cost estimates, and execution plans — no IaC code generation).
- **Target region**: `us-east-1` by default. If Azure sources cluster in `eastasia`/`japaneast`/`australiaeast`, suggest `ap-northeast-1`/`ap-southeast-2`. If in `westeurope`/`northeurope`, suggest `eu-west-1`/`eu-central-1`.
- **Sizing**: Development tier (Aurora Serverless v2 0.5 ACU, 0.5 vCPU Fargate), unless CloudRays Metrics data or Q4 indicates otherwise.
- **License strategy**: Q9 default is "migrate to open-source alternative" (Aurora PostgreSQL replaces SQL Server, Amazon Linux replaces Windows where feasible).
- **Identity strategy**: Q10 default is "to-be-evaluated" (prompts a dedicated identity workstream in the execution plan).
- **Migration mode**: Full infrastructure path (no AI-only subset path in v1.0).
- **Cost currency**: USD.
- **Timeline assumption**: 12-14 weeks total (Azure migrations typically longer than GCP due to licensing and identity complexity).

## Workflow Execution

When invoked, the agent **MUST follow this exact sequence**:

1. **Load phase status**: Read `.phase-status.json` from `.migration/*/`.
   - If missing: Initialize for Phase 1 (Discover)
   - If exists: Determine current phase based on phase field and status value

2. **Determine phase to execute**:
   - If status is `in-progress`: Resume that phase (read corresponding reference file)
   - If status is `completed`: Advance to next phase (read next reference file)
   - Phase mapping for advancement:
     - discover (completed) → Execute clarify (read `references/phases/clarify.md`)
     - clarify (completed) → Execute design (read `references/phases/design.md`)
     - design (completed) → Execute estimate (read `references/phases/estimate.md`)
     - estimate (completed) → Execute execute (read `references/phases/execute.md`)
     - execute (completed) → Migration complete

3. **Read phase reference**: Load the full reference file for the target phase.

4. **Execute ALL steps in order**: Follow every numbered step in the reference file. **Do not skip, optimize, or deviate.**

5. **Validate outputs**: Confirm all required output files exist with correct schema before proceeding.

6. **Update phase status**: Each phase reference file specifies the final `.phase-status.json` update (records the phase that just completed).

7. **Display summary**: Show user what was accomplished, highlight next phase, or confirm migration completion.

**Critical constraint**: Agent must strictly adhere to the reference file's workflow. If unable to complete a step, stop and report the exact step that failed.

User can invoke the skill again to resume from last completed phase.

## Scope Notes

**v1.0 includes:**

- Multi-source discovery: CloudRays full scan + Azure MCP real-time supplementation + ARM/Bicep parsing
- 10-question requirement clarification (8 shared with GCP2AWS + Q9 license strategy + Q10 Entra ID strategy)
- Service-category rubric-based design with Azure-specific considerations (License check, Entra ID workstream)
- Utilization-driven right-sizing using CloudRays Metrics data
- AWS cost estimation with Azure TCO baseline comparison (leveraging CloudRays Consumption data)
- Execution timeline, risk matrix, and Azure teardown checklist

**Deferred to v1.1+:**

- Application code scanning (Azure SDK dependency detection)
- IaC code generation (CDK/Terraform/CloudFormation)
- Direct Azure Billing API integration
- AI-only fast-track path in Clarify/Design
- Automated Azure Migrate / App Service Migration Assistant integration
