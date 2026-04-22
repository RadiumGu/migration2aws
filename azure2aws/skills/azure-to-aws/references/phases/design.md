# Phase 3: Design AWS Architecture

Map Azure resources to AWS services using two-pass mapping (fast-path + rubric), apply License and Identity strategies, right-size using Metrics data, and validate via awsknowledge.

**Execute ALL steps in order.**

## Step 0: Validate Inputs

1. Read `clarified.json` from `$MIGRATION_DIR`. If missing: **STOP**. Output: "Phase 2 (Clarify) not completed. Run Phase 2 first."
   - If invalid JSON: **STOP**. Output: "clarified.json is corrupted (invalid JSON). Re-run Phase 2."
2. Read `azure-resource-clusters.json`. If missing: **STOP**. Output: "Missing azure-resource-clusters.json. Re-run Phase 1."
   - If invalid JSON: **STOP**. Output: "azure-resource-clusters.json is corrupted (invalid JSON). Re-run Phase 1."
   - If `clusters` array empty: **STOP**. Output: "No clusters found. Re-run Phase 1."
3. Read `azure-resource-inventory.json`. If missing: **STOP**. Output: "Missing azure-resource-inventory.json. Re-run Phase 1."
   - If invalid JSON: **STOP**. Output: "azure-resource-inventory.json is corrupted (invalid JSON). Re-run Phase 1."
   - If `resources` array empty: **STOP**. Output: "No resources found. Re-run Phase 1."
   - This file provides per-resource `config` (SKU, license_type, metrics) needed for eliminators, Q9 License application, and right-sizing.

## Step 1: Determine Target AWS Region

Use this priority:

1. If user explicitly states target region: use it.
2. Else, map Azure region → AWS region by latency proximity:

   | Azure Region | AWS Region |
   |--------------|-----------|
   | `eastasia`, `southeastasia` | `ap-northeast-1` or `ap-southeast-1` |
   | `japaneast`, `japanwest` | `ap-northeast-1` |
   | `australiaeast`, `australiasoutheast` | `ap-southeast-2` |
   | `westeurope`, `northeurope` | `eu-west-1` or `eu-central-1` |
   | `eastus`, `eastus2` | `us-east-1` |
   | `westus`, `westus2`, `westus3` | `us-west-2` |
   | `centralus`, `northcentralus`, `southcentralus` | `us-east-1` or `us-west-2` |
   | `uksouth`, `ukwest` | `eu-west-2` |
   | `canadacentral`, `canadaeast` | `ca-central-1` |
   | `brazilsouth` | `sa-east-1` |
   | `chinaeast`, `chinaeast2` | `cn-north-1` |
   | `chinanorth`, `chinanorth2` | `cn-northwest-1` |
   | Other | `us-east-1` (default) |

3. If Q8 compliance is `strict`: confirm target region satisfies data-residency requirements before proceeding.

Record `target_region` in scratch state and final `aws-design.json`.

## Step 2: Order Clusters

Sort clusters by `creation_order_depth` ascending (foundational network first, then compute, then data, etc.).

## Step 3: Apply License Strategy (Q9)

Before mapping starts, pre-process every resource with `config.license_type ∈ {"windows", "sql_server"}`:

Read `q9_license_strategy` from `clarified.json`:

| Q9 value | SQL Server resource action | Windows VM resource action |
|----------|---------------------------|---------------------------|
| `open-source` | Mark `target_family = "aurora-postgresql"` (default) or `aurora-mysql` depending on app compatibility. Flag `requires_schema_conversion = true`. | Mark `target_family = "linux-native"`. Flag `requires_code_porting = true` if .NET Framework detected. |
| `byol` | Mark `target_family = "rds-custom-sqlserver"` or `"ec2-dedicated-host-sqlserver"`. Requires SA/subscription verification. | Mark `target_family = "ec2-byol-windows"` on Dedicated Host. |
| `license-included` | Mark `target_family = "rds-sqlserver-li"`. | Mark `target_family = "ec2-windows-li"`. |
| `to-be-evaluated` | Produce **two** design entries per resource: open-source track AND license-included track. Both feed Phase 4 for cost comparison. |

See `references/shared/license-guidance.md` Section 2 (SQL Server) and Section 3 (Windows Server) for the detailed decision matrix.

## Step 4: Apply Identity Strategy (Q10)

Scan inventory for Entra ID / identity artifacts: `Microsoft.ManagedIdentity/*`, Entra ID group/user references, service principals, SAML federation configs.

If **any** are found, add a `special_mappings` entry in `aws-design.json`:

Read `q10_identity_strategy` from `clarified.json`:

| Q10 value | AWS plan | Workstream weeks |
|-----------|---------|-----------------|
| `identity-center` | Replace Entra ID with IAM Identity Center as primary IdP. Use SCIM for provisioning from Azure AD during cutover window. Migrate SAML apps per-app. | 4-6 |
| `entra-federation` | Keep Entra ID as primary IdP. Configure SAML federation to IAM Identity Center. Retain for Microsoft 365 interop. | 2-3 |
| `hybrid` | IAM Identity Center for AWS-native workloads; Entra ID for M365 + Dynamics. Per-workload IdP selection. | 6-8 |
| `to-be-evaluated` | Placeholder assumption: 2-week identity assessment workstream scheduled before main wave migration. Details deferred. | 2 (assessment) |

Record in `aws-design.json.identity_plan`:

```json
{
  "strategy": "<q10 value>",
  "summary": "<one-sentence plan>",
  "workstream_weeks": <number>
}
```

See `references/design-refs/security-identity.md` for the detailed Entra ID migration paths.

## Step 5: Two-Pass Mapping per Cluster

For each cluster (in order from Step 2), process every PRIMARY resource and every SECONDARY resource:

### Pass 1: Fast-Path Lookup

1. Extract Azure `type` (e.g., `Microsoft.Compute/virtualMachines`).
2. Look up in `design-refs/fast-path.md` → Direct Mappings table.
3. If found (Low complexity, 1:1 match): assign AWS service with `confidence = "deterministic"`. Proceed to Step 6 per resource.
4. If not found: proceed to Pass 2.

### Pass 2: Rubric-Based Selection

For resources not covered by fast-path (Medium/High complexity):

1. Determine service category via `design-refs/index.md`:
   - `Microsoft.Compute/*`, `Microsoft.Web/sites`, `Microsoft.ContainerService/*`, `Microsoft.Batch/*` → `compute.md`
   - `Microsoft.Sql/*`, `Microsoft.DocumentDB/*`, `Microsoft.DBforMySQL/*`, `Microsoft.DBforPostgreSQL/*`, `Microsoft.Cache/*` → `database.md`
   - `Microsoft.Storage/*`, `Microsoft.NetApp/*` → `storage.md`
   - `Microsoft.Network/*`, `Microsoft.Cdn/*` → `networking.md`
   - `Microsoft.KeyVault/*`, Entra ID, `Microsoft.Security/*` → `security-identity.md`
   - `Microsoft.ServiceBus/*`, `Microsoft.EventGrid/*`, `Microsoft.EventHub/*`, `Microsoft.Logic/*`, `Microsoft.ApiManagement/*` → `integration.md`
   - `Microsoft.Synapse/*`, `Microsoft.HDInsight/*`, `Microsoft.Databricks/*`, `Microsoft.StreamAnalytics/*`, `Microsoft.Kusto/*` → `analytics.md`
   - `Microsoft.CognitiveServices/*`, `Microsoft.MachineLearningServices/*`, `Microsoft.BotService/*` → `ai-ml.md`
   - `Microsoft.DevOps/*`, `Microsoft.OperationalInsights/*`, `Microsoft.Insights/*`, `Microsoft.Resources/deployments` → `devops.md`

   **Catch-all for unknown types**: If type not found in `index.md`:
   - Try resource name pattern (e.g., "sql" → database, "vm" → compute)
   - If still no match: add to `warnings[]` with "Unknown Azure resource type: [type]. Skipped — file an issue to add support." Continue with remaining resources.

2. Load rubric from corresponding `design-refs/*.md` file.
3. Evaluate 6 criteria (1-sentence each):
   - **Eliminators**: Feature incompatibility (hard blocker)
   - **Operational Model**: Managed vs self-hosted fit
   - **User Preference**: From `clarified.json` (Q2 primary concern, Q3 team experience, Q5 database, Q9 license, Q10 identity)
   - **Feature Parity**: Azure feature → AWS feature availability
   - **Cluster Context**: Affinity with other resources in this cluster
   - **Simplicity**: Prefer fewer services / less config

4. Select best-fit AWS service. Confidence = `"inferred"`.

## Step 6: Right-Sizing

For each compute and database resource, apply right-sizing using `metrics.utilization_tier` from inventory:

| utilization_tier | Action | AWS sizing rule |
|------------------|--------|-----------------|
| `idle` | Flag for elimination or reservation in batch jobs | Suggest eliminating; if kept, smallest supported instance (t4g.nano / Aurora Serverless min ACU) |
| `low` | Downsize | Pick AWS instance 1 tier smaller than peer-mapped (e.g., D4s_v5 → m6i.large instead of m6i.xlarge) |
| `medium` | Peer | Map Azure SKU to equivalent AWS instance (Standard_D4s_v5 → m6i.xlarge) |
| `high` | Peer or upsize | Peer unless sustained p95 > 85% → upsize one tier |
| `null` (no metrics) | Peer | Default peer sizing; add to assumptions list |

Record in `aws-design.json.clusters[].resources[].right_sizing`:

```json
{
  "utilization_tier": "medium",
  "action": "peer",
  "original_size_if_changed": null,
  "rationale": "CPU p95 67.8% — peer-size 4 vCPU"
}
```

## Step 7: Handle Secondary Resources

For each SECONDARY resource:

1. Use `design-refs/index.md` for category.
2. Apply fast-path (most secondaries have deterministic mappings — NSG → Security Group, Managed Disk → EBS, etc.).
3. If rubric needed: apply the 6-criteria approach.

**Common secondary mappings**:
- Subnet → VPC Subnet
- NSG → Security Group (inbound rules) + optional NACL (stateless controls)
- Route Table → VPC Route Table
- Managed Disk → EBS volume
- Private Endpoint → VPC PrivateLink endpoint
- NIC → ENI (typically implicit)
- Public IP → Elastic IP or ALB/NLB public endpoint (typically implicit)
- Managed Identity → IAM Role (with trust policy for EC2/EKS/Lambda as appropriate)

## Step 8: Validate AWS Architecture (awsknowledge)

If `awsknowledge` MCP available, for each unique AWS service in the design:

1. **Regional availability**: Is the service available in `target_region`? Use `aws___get_regional_availability`.
   - If unavailable: add warning, suggest fallback region.
2. **Feature parity**: Do required features exist? Compare Azure features (from inventory `config`) against AWS service capabilities.
   - If feature missing: add warning, suggest alternative service or design adaptation.
3. **Service constraints**: Check best practices and known gotchas via `aws___search_documentation` for critical services.

**If awsknowledge unavailable**:

- Set `validation_status.status = "skipped"` in `aws-design.json`.
- **Display prominent warning to user**: "⚠️ Architecture validation skipped (awsknowledge MCP unavailable). Regional availability, feature parity, and service constraints were NOT verified. Manually verify before proceeding."
- Add same warning to `aws-design-report.md` header.
- Continue with design (validation is informational, not blocking).

**If validation succeeds**: Set `validation_status.status = "completed"`, list validated services in report.

## Step 9: Write Design Output

**File 1: `aws-design.json`**

Schema: see `references/shared/output-schema.md` → `aws-design.json` section.

Required top-level fields:
- `validation_status` (object)
- `target_region` (string)
- `license_strategy_applied` (from Q9)
- `identity_plan` (object with `strategy`, `summary`, `workstream_weeks`)
- `clusters[]` — each with `cluster_id`, `azure_region`, `aws_region`, `resources[]`
- `special_mappings[]` — identity plan, devops pipeline rewrite, data model redesign entries
- `warnings[]`
- `timestamp`

Each resource must carry:
- `azure_resource_id`, `azure_type`, `azure_config`
- `aws_service`, `aws_config`
- `right_sizing` object
- `confidence` (`deterministic` | `inferred`)
- `rationale`
- `rubric_applied[]` (6 one-sentence entries)

**File 2: `aws-design-report.md`**

Markdown format, sections:

```
# AWS Architecture Design Report

[If validation skipped: ⚠️ banner here]

## Overview
Mapped X Azure resources to Y AWS services across Z clusters.
Target region: [aws_region] (from Azure [azure_region])
License strategy: [q9]
Identity strategy: [q10]

## Special Mappings
### Identity
[Entra ID plan summary; workstream weeks]

### License
[Per-Q9 strategy summary; affected resources]

### Azure Front Door (if present)
Split into: CloudFront + Global Accelerator + AWS WAF
[per-feature mapping]

### Cosmos DB (if present)
Target: DynamoDB
⚠️ Data model redesign required — full schema rework.

### Azure DevOps (if present)
Split into: CodePipeline + CodeBuild + CodeDeploy (+ optional CodeArtifact)

## Cluster: <cluster_id>
### <category>
- <azure_type> <name> → <aws_service> (<aws_config summary>)
  Confidence: deterministic|inferred
  Right-sizing: <action> (<rationale>)
  Rationale: <one sentence>

[repeat per resource, per cluster]

## Warnings
- <warning messages>

## Unmapped Services (require follow-up)
- <resource_id>: <reason>
```

## Step 10: Update Phase Status

Update `.phase-status.json`:

```json
{
  "phase": "design",
  "status": "completed",
  "timestamp": "2026-04-21T14:30:00Z",
  "version": "1.0.0"
}
```

Output to user: "✅ AWS Architecture designed. Target region: [aws_region]. License strategy: [q9]. Identity plan: [q10 summary]. Proceeding to Phase 4: Estimate Costs."

## Azure-Specific Design Considerations

| Azure Service | AWS Handling | Notes |
|---------------|-------------|-------|
| **Azure Front Door** | Split into CloudFront + Global Accelerator + WAF | One-to-many split; map each feature (CDN, failover, WAF rules) to the corresponding AWS service |
| **Azure DevOps** | Split into CodePipeline + CodeBuild + CodeDeploy (+ CodeArtifact for packages) | Consider GitHub Actions as alternative if user strongly prefers unified tooling |
| **Cosmos DB** | DynamoDB | Multi-model → KV/document only; **full data model redesign required**; add to `special_mappings` with `risk_level: "high"` |
| **Entra ID** | IAM Identity Center (per Q10) | See Step 4 + `security-identity.md` |
| **Azure Monitor** | CloudWatch (+ optional Grafana / OpenSearch) | KQL queries require rewrite to CloudWatch Insights |
| **ARM / Bicep** | CloudFormation / CDK | Not auto-convertible; add to `warnings[]` that IaC rewrite is a Phase 5 workstream |
| **Azure Policy** | AWS Config + SCP | SCPs for org-level; Config Rules for resource-level |
