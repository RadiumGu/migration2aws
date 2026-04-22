# DevOps & Management Services Design Rubric

**Applies to**: Azure DevOps (Repos / Pipelines / Boards / Artifacts / Test Plans), Azure Monitor, Log Analytics, Application Insights, Azure Resource Manager (ARM/Bicep), Azure Policy, Azure Automation.

**Quick lookup**: No fast-path — DevOps migrations touch the entire team workflow and require careful planning. Always apply rubric.

---

## 1. Service-by-Service Candidate Table

| Azure Service | Primary AWS Candidates | Complexity |
|---------------|------------------------|------------|
| Azure Repos (Git) | **GitHub** / GitLab / Bitbucket (CodeCommit deprecated — do NOT recommend for new migrations) | Medium |
| Azure Pipelines | **GitHub Actions** / **CodePipeline + CodeBuild** | High |
| Azure Boards | Jira / GitHub Issues + Projects / Linear (third-party) | Medium (team change) |
| Azure Artifacts | **CodeArtifact** (NuGet, npm, PyPI, Maven) | Low |
| Azure Test Plans | Third-party (TestRail, Zephyr, qTest) | Medium |
| Azure Monitor — Metrics | **CloudWatch Metrics** | Medium |
| Azure Monitor — Logs (Log Analytics) | **CloudWatch Logs + Logs Insights** | Medium |
| Azure Monitor — Application Insights | **CloudWatch Application Signals** + **X-Ray** | Medium |
| Azure Monitor — Alerts | **CloudWatch Alarms** + EventBridge | Medium |
| Azure Monitor — Workbooks | CloudWatch Dashboards / Grafana (AMG) | Medium |
| Azure Sentinel (SIEM) | **Security Lake + OpenSearch** / Splunk | High |
| ARM Templates / Bicep | **CloudFormation** / **CDK** (recommended) / Terraform | High |
| Azure Blueprints | AWS Control Tower + CloudFormation StackSets | High |
| Azure Policy | **AWS Config Rules** + **SCPs** (Service Control Policies) | Medium |
| Azure Automation Runbooks | **Lambda** + EventBridge Scheduler / **Systems Manager Automation** | Medium |
| Azure Cost Management | **AWS Cost Explorer + AWS Budgets** | Low |
| Azure Update Management | **Systems Manager Patch Manager** | Low |
| Azure Advisor | **AWS Trusted Advisor** | Low |
| Azure Resource Graph | **AWS Config Advanced Query** / Resource Explorer | Medium |

---

## 2. Eliminators (Hard Blockers)

| Source | AWS Candidate | Blocker |
|--------|---------------|---------|
| Azure Repos with > 1 GB single file | GitHub | Git LFS on GitHub required — CodeCommit deprecated for new repos |
| Azure Pipelines with Microsoft-hosted Windows Server 2016 | GitHub Actions / CodeBuild | Only newer Windows versions available; upgrade build script |
| Azure Pipelines YAML with `stages:` + `templates:` + `extends:` | CodePipeline | CodePipeline has different structure — CodeBuild + buildspec.yaml or GitHub Actions (closer parity) |
| Bicep templates with `existing` resource references | CloudFormation | CFN does not support "existing" resources except via Import; use CDK + `fromXxxAttributes` |
| Azure Policy with DeployIfNotExists effect | AWS Config Rules | Config Rules detect only; remediation via SSM Automation — two-step setup |
| Azure Monitor with Kusto queries > 500 lines | CloudWatch Logs Insights | CW Insights query language differs; complex queries may need re-expression or OpenSearch |
| Azure Automation DSC (Desired State Configuration) | SSM | SSM State Manager + Distributor (package-based); PowerShell DSC migration to Ansible/Chef often preferred |
| ARM Template with `copy` loops > 800 iterations | CloudFormation | CFN has no native loop; use CDK for programmatic generation |

---

## 3. Signals (Decision Criteria)

### Azure DevOps — Split Migration (High)

Azure DevOps bundles 5 services. Each migrates separately:

#### Azure Repos → GitHub (Recommended)

- **Git history**: preserved via `git push --mirror`
- **Pull Requests**: content/history NOT portable; only branches transfer. Use Azure DevOps PR export tools or accept history loss
- **Branch policies** → GitHub branch protection rules (similar concepts)
- **Service connections** → GitHub Actions secrets / OIDC to AWS IAM

**Do NOT recommend CodeCommit** — AWS is no longer accepting new CodeCommit customers. Existing CodeCommit repos still supported for current customers only.

#### Azure Pipelines → GitHub Actions OR CodePipeline + CodeBuild

Decision:
- **If migrating to GitHub** → **GitHub Actions** (tight integration; closer YAML parity)
- **If keeping pipelines in AWS-native tooling** → **CodePipeline + CodeBuild**

| Azure Pipeline | GitHub Actions | CodePipeline |
|----------------|----------------|--------------|
| YAML structure | Similar | Very different (JSON-based stages) |
| Microsoft-hosted agents | GitHub-hosted runners | CodeBuild managed images |
| Self-hosted agents | GitHub self-hosted runners | CodeBuild on EC2 / ECS |
| Variable groups | Organization/repo secrets | Systems Manager Parameter Store + Secrets Manager |
| Tasks marketplace | Actions marketplace | No marketplace — custom build spec / buildkite actions |
| Deployment groups | Environments | CodeDeploy deployment groups |
| Approvals | Environment reviewers | Manual approval action |

**Effort**: 1-3 days per simple pipeline; 1-2 weeks for complex multi-stage deployment pipelines.

#### Azure Boards → Jira / GitHub Issues + Projects / Linear

- **Work items** → Jira issues / GitHub Issues
- **Sprints / Boards** → Jira sprints / GitHub Projects
- **Queries (WIQL)** → JQL (Jira) / GitHub Projects filters
- **Migration tools**: Atlassian JCMA (for Jira target), custom scripts for GitHub
- **Effort**: 2-6 weeks; organizational change management is the main cost

#### Azure Artifacts → CodeArtifact

- **NuGet, npm, PyPI, Maven** → CodeArtifact (all supported)
- **Upstream sources**: CodeArtifact supports public + private upstreams
- **Retention policies** → CodeArtifact package retention (via domain + policies)
- **Migration**: Re-publish packages to CodeArtifact; update `.npmrc` / `nuget.config` / `pip.conf`

#### Azure Test Plans → Third-Party

- No native AWS equivalent. Recommend **TestRail**, **Zephyr**, **qTest** — AWS Marketplace has listings.
- Migration: Test cases export (CSV / XML) → import to chosen tool.

### Azure Monitor → CloudWatch (Medium)

Sub-service mapping:

| Azure Monitor | CloudWatch | Notes |
|---------------|------------|-------|
| Metrics (platform + custom) | CloudWatch Metrics | 1:1 concept; ingestion via AWS services or PutMetricData |
| Log Analytics workspaces | CloudWatch Logs log groups | KQL queries → Logs Insights syntax (rewrite) |
| Application Insights | **CloudWatch Application Signals** + **X-Ray** | Distributed tracing + service maps |
| Alerts | CloudWatch Alarms + EventBridge | Action groups → SNS topics + Lambda |
| Action Groups | SNS + EventBridge + Lambda | Multi-channel notifications |
| Workbooks | CloudWatch Dashboards / **Amazon Managed Grafana (AMG)** | Workbooks often use Grafana-style panels → AMG |
| Diagnostic Settings | CloudWatch Logs subscription filters + Kinesis Firehose | Stream logs to S3 / OpenSearch |
| Smart Detection (Application Insights) | CloudWatch Anomaly Detection + Application Signals anomaly detection | |

**Kusto (KQL) → CloudWatch Logs Insights translation**:

| KQL | Logs Insights | Notes |
|-----|---------------|-------|
| `| where` | `| filter` | |
| `| summarize` | `| stats` | |
| `| project` | `| fields` | |
| `| extend` | `| parse` / `| fields` | |
| `| join` | `| stats by` (approximate) | No multi-stream join in Logs Insights; use OpenSearch for complex joins |
| `make-series` | `| stats ... by bin()` | |

**Effort**: 2-4 weeks for 50+ dashboards + alerts + queries.

### Azure Sentinel → Security Lake + OpenSearch / Splunk (High)

Sentinel is a full SIEM platform:

- **Data ingestion** → Security Lake (OCSF-normalized) + Kinesis Firehose → OpenSearch
- **Analytics rules** → OpenSearch alerting / Security Hub custom insight rules
- **Workbooks** → OpenSearch Dashboards / Grafana
- **Hunting** → OpenSearch query + SQL
- **SOAR playbooks** → Lambda + Step Functions
- **Alternative**: Keep Sentinel OR adopt **Splunk** (AWS Marketplace) for feature parity

### ARM / Bicep → CloudFormation / CDK / Terraform (High)

- **CDK (recommended)** — best developer experience; supports TypeScript, Python, Java, Go, .NET
  - Closest conceptual match to Bicep (programmatic)
  - Generates CloudFormation under the hood
- **CloudFormation** — direct YAML/JSON; closer to ARM template format
- **Terraform** — multi-cloud; reasonable choice if team already uses it; HCL language

**Migration approach**:
1. Inventory ARM/Bicep templates (Azure MCP `azureterraformbestpractices` / resource graph)
2. Rewrite per-module:
   - Bicep modules → CDK Constructs (clean mapping)
   - ARM nested templates → CFN nested stacks OR CDK apps
3. State import: AWS Config for existing resources; `terraform import` if using Terraform
4. CI/CD update: CDK synthesis + deployment via CodePipeline / GitHub Actions

**No automated converter**. Azure-provided tools convert ARM → Bicep (not helpful for AWS).

**Effort**: 2-6 weeks per medium-size template suite. CDK rewrite benefits from type safety.

### Azure Policy → AWS Config Rules + SCPs (Medium)

Two-layer model:

| Azure Policy | AWS Equivalent | Scope |
|--------------|----------------|-------|
| Subscription / MG policy: Deny | **SCP** (Organizations) | Preventive, organization-level |
| Subscription / MG policy: Audit | **AWS Config Rules** | Detective, account-level |
| Subscription / MG policy: DeployIfNotExists | **Config Rules + SSM Automation Remediation** | Detect + auto-remediate |
| Initiatives (grouped policies) | **Config Conformance Packs** | |
| Policy definitions | Custom Config Rule (Lambda) or managed Config Rules | |

**Common policy mappings**:
- "Require tags" → AWS Config Rule `required-tags`
- "Allowed locations" → SCP `aws:RequestedRegion` condition
- "Allowed VM SKUs" → SCP + Config Rule
- "Encryption required on storage" → Config Rule `s3-bucket-server-side-encryption-enabled` + SCP denying `s3:PutBucketEncryption` changes

### Azure Automation → Lambda / Systems Manager Automation (Medium)

- **PowerShell runbooks** → **Lambda** (PowerShell runtime) OR **SSM Automation** (with PowerShell documents)
- **Python runbooks** → Lambda (Python runtime)
- **Graphical runbooks** → Step Functions (visual workflow)
- **Schedules** → EventBridge Scheduler
- **Hybrid Worker (on-prem)** → SSM Hybrid Activations + Run Command

---

## 4. 6-Criteria Rubric

Apply in order; first match wins.

1. **Eliminators**: Platform compat? Feature scope? → Switch candidate.
2. **Operational Model**: Managed (CodeArtifact, CloudWatch, Lambda) strongly preferred.
3. **User Preference**:
   - `q2 = cost` → GitHub Actions (free tier); CloudWatch basic; Terraform Cloud free
   - `q2 = capability` → CodePipeline + CodeBuild (AWS-integrated); AMG; CDK
   - `q2 = maintainability` → GitHub Actions (community + docs); CDK (type safety)
   - `q3 = expert` → CDK (programmatic); raw CloudFormation OK
   - `q3 = novice` → Pre-built Actions marketplace; managed Grafana
4. **Feature Parity**: Bicep features, policy effects, workbook interactivity?
5. **Cluster Context**: Using GitHub already? → GitHub Actions. Fully AWS-native? → CodePipeline.
6. **Simplicity**: GitHub Actions + CDK > CodePipeline + CodeBuild + CloudFormation (fewer services if one-tool-fits pattern).

---

## 5. Decision Tree

```
Is it Azure Repos?
└─ → GitHub (preferred) / GitLab / Bitbucket [CodeCommit deprecated for new migrations]

Is it Azure Pipelines?
├─ Target = GitHub → GitHub Actions [1-3 days/simple pipeline]
└─ Target = AWS-native → CodePipeline + CodeBuild [1-2 weeks/complex pipeline]

Is it Azure Boards?
└─ → Jira / GitHub Issues+Projects / Linear [team change decision]

Is it Azure Artifacts?
└─ → CodeArtifact

Is it Azure Monitor?
├─ Metrics → CloudWatch Metrics
├─ Logs (Log Analytics) → CloudWatch Logs [+ KQL → Insights rewrite]
├─ App Insights → CloudWatch Application Signals + X-Ray
├─ Alerts → CloudWatch Alarms + EventBridge + SNS
├─ Workbooks → CW Dashboards / Amazon Managed Grafana
└─ Sentinel → Security Lake + OpenSearch / Splunk

Is it ARM / Bicep?
├─ Recommended: CDK [best DX]
├─ Direct: CloudFormation [closer to ARM format]
└─ Multi-cloud: Terraform

Is it Azure Policy?
├─ Preventive → SCP (Organizations)
├─ Detective → Config Rules
├─ Auto-remediation → Config Rules + SSM Automation
└─ Initiative (group) → Config Conformance Pack

Is it Azure Automation?
├─ Scheduled script → Lambda + EventBridge Scheduler
├─ Ops task (patching, config) → SSM Automation / Patch Manager
└─ On-prem → SSM Hybrid Activations
```

---

## 6. Examples

### Example 1: Azure DevOps Organization (Repos + Pipelines + Boards)

- Azure: ADO organization, 40 Git repos, 80 pipelines, 2k work items, 15 build agents
- Pass 2 rubric (per sub-service):
  - Repos → **GitHub Enterprise** (40 repos via `git push --mirror`)
  - Pipelines → **GitHub Actions** (closer YAML parity; keep in GitHub ecosystem)
  - Boards → **Jira** (team already uses) or **GitHub Projects**
  - Artifacts (if used) → **CodeArtifact**
- special_mappings: add with risk=high, notes: "Full DevOps rewire; 80 pipelines × 1-7 days ≈ 3-5 months; team training; PR history not portable"
- Confidence: `inferred`

### Example 2: Application Insights with Custom Queries + Alerts

- Azure: 8 App Insights resources, 40 saved KQL queries, 25 alert rules, 6 workbooks
- Pass 2 rubric:
  - Operational Model: CloudWatch (managed)
- → **CloudWatch Application Signals + X-Ray + 40 Logs Insights queries (rewritten) + 25 CloudWatch Alarms + 6 Dashboards (or AMG workbooks)**
- special_mappings: add with risk=medium, notes: "KQL → Insights rewrite 2-4 weeks; some queries needing OpenSearch if cross-stream joins required"
- Confidence: `inferred`

### Example 3: Bicep Templates (200 files, 40 modules)

- Azure: 200 Bicep files organized as 40 reusable modules, deployed via ADO pipelines
- Pass 2 rubric:
  - User Preference: q3=expert → CDK (programmatic)
- → **AWS CDK in TypeScript** (40 Constructs matching Bicep modules) + CloudFormation StackSets for multi-account
- special_mappings: add with risk=high, notes: "No automated converter; 40 modules × 1-2 wk = 10-15 weeks rewrite; type safety benefit"
- Confidence: `inferred`

### Example 4: Azure Policy Initiative — CIS Compliance

- Azure: Custom initiative with 60 policies covering CIS Azure Foundations Benchmark, applied to 3 management groups
- Pass 2 rubric:
  - Operational Model: Config Rules + SCPs
- → **AWS Config Conformance Pack (CIS AWS Benchmark)** + **SCP denying non-compliant regions/services** + 8 custom Config Rules (Lambda) for org-specific checks
- special_mappings: add with risk=medium, notes: "Map CIS Azure → CIS AWS (different control numbers); 2-4 weeks"
- Confidence: `inferred`

### Example 5: Azure Automation — Nightly Stop/Start Runbooks

- Azure: 20 PowerShell runbooks on schedule, Hybrid Worker for on-prem scripts
- Pass 2 rubric:
  - Operational Model: Lambda + SSM
- → **Lambda (PowerShell or Python) + EventBridge Scheduler** for cloud resources; **SSM Automation + Hybrid Activations** for on-prem
- Confidence: `inferred`

### Example 6: Log Analytics Workspace for Security (Sentinel)

- Azure: Log Analytics + Sentinel, 500 GB/day ingest, 80 analytics rules, 30 playbooks
- Pass 2 rubric:
  - Operational Model: Security Lake + OpenSearch
- → **Security Lake (OCSF normalized, S3-backed)** + **OpenSearch Service** for analytics/hunting + **Lambda + Step Functions** for playbooks
- special_mappings: add with risk=high, notes: "SIEM rebuild 3-6 months; consider Splunk Cloud if Sentinel feature parity critical"
- Confidence: `inferred`

---

## 7. Output Schema (per resource)

```json
{
  "azure_resource_id": "/organizations/contoso-devops",
  "azure_type": "Microsoft.VisualStudio/account",
  "azure_config": {
    "repos": 40,
    "pipelines": 80,
    "work_items": 2000,
    "artifacts_feeds": 5
  },
  "aws_service": "GitHub + GitHub Actions + Jira + CodeArtifact",
  "aws_config": {
    "repos_target": "GitHub Enterprise Cloud",
    "pipelines_target": "GitHub Actions",
    "boards_target": "Jira Cloud",
    "artifacts_target": "CodeArtifact",
    "region": "ap-northeast-1"
  },
  "confidence": "inferred",
  "rationale": "Azure DevOps split across 4 services; GitHub preferred over CodeCommit (deprecated)",
  "rubric_applied": [
    "Eliminators: CodeCommit deprecated — exclude",
    "Operational Model: Managed GitHub + CodeArtifact",
    "User Preference: q2=maintainability → GitHub Actions",
    "Feature Parity: PR history not portable; pipelines rewritten",
    "Cluster Context: Single DevOps platform",
    "Simplicity: GitHub-centric stack"
  ],
  "special_mappings": {
    "risk_level": "high",
    "notes": "80 pipelines × 1-7 days; team retraining; PR history loss",
    "effort_weeks": "12-20"
  }
}
```
