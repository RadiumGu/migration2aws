# Phase 5: Execution Plan

Produce migration timeline (7 phases over 12-14 weeks), risk matrix (4 categories), rollback procedures, Landing Zone setup, and Azure teardown checklist.

**Execute ALL steps in order.**

## Step 0: Validate Inputs

**0a. Validate `aws-design.json`:**

1. If file missing: **STOP**. Output: "Missing aws-design.json. Complete Phase 3 (Design) first."
2. If invalid JSON: **STOP**. Output: "aws-design.json is corrupted (invalid JSON). Re-run Phase 3."
3. If `clusters` array missing or empty: **STOP**.
4. Each cluster must have non-empty `resources` array.
5. Each resource must have `aws_service` and `aws_config`.
6. `identity_plan` must be present (for scheduling the identity workstream).

**0b. Validate `estimation.json`:**

1. If file missing: **STOP**. Output: "Missing estimation.json. Complete Phase 4 (Estimate) first."
2. If invalid JSON: **STOP**.
3. `monthly_costs.balanced.total` must be present and > 0.
4. `one_time_costs` must be present.

If all validations pass, proceed to Step 1.

## Step 1: Determine Timeline Length

Base timeline = 12 weeks. Apply modifiers:

| Condition | Modifier |
|-----------|---------|
| Q10 identity strategy = `hybrid` or `to-be-evaluated` | +2 weeks (identity workstream longer) |
| Cosmos DB present in design | +1-2 weeks (data model redesign) |
| Synapse / Power BI / Data Factory present | +2 weeks (analytics pipeline rewrite) |
| Azure DevOps migration in scope | +1 week (CI/CD rewrite) |
| Total resource count > 200 | +2 weeks |
| Data volume > 10TB (storage resources) | +1 week (DataSync / Snow logistics) |
| Q3 team_experience = `novice` | +1-2 weeks (slower ramp) |
| Q1 timeline = `0-3 months` | Override: compress to 10 weeks, flag risk as "high" in Step 3 |
| Q8 compliance = `strict` | +2 weeks (residency + audit artifacts) |

Cap at 20 weeks. Record `timeline_weeks` in scratch state.

## Step 2: Build Execution Timeline (7 Phases)

### Week 1-2: Planning & Setup (Landing Zone)

Activities:
- Finalize AWS account structure (multi-account strategy: `production`, `staging`, `shared-services`, `security`, `logging`)
- Deploy AWS Control Tower Landing Zone (if not already) — creates Organizations, SCPs, centralized logging
- Configure centralized IAM Identity Center instance (empty; SCIM wiring happens in identity workstream)
- Set up baseline networking: VPCs in `target_region` matching Azure VNet CIDRs (re-IP only if overlap detected)
- Establish Direct Connect or Site-to-Site VPN from on-prem / Azure for migration data path
- Configure Transit Gateway if multi-VPC architecture
- Baseline CloudWatch Log Groups + Security Hub + GuardDuty enablement
- AWS Account → Azure subscription mapping documented

### Week 3-4: Team Enablement

Activities:
- AWS fundamentals training for operators (tier-matched to Q3 team_experience)
- Service-specific deep dives for the services in the design (EKS, RDS, Bedrock, etc.)
- Author SOPs: deploy/rollback, incident response, cost monitoring, access requests
- Configure CloudWatch dashboards mirroring key Azure Monitor dashboards
- Set up on-call rotation in AWS account (ticketing integration, runbook migration)
- Validate IAM baseline permissions for migration engineers

### Week 3-6: Identity Workstream (parallel to Weeks 3-4)

Runs in parallel with Team Enablement. Duration depends on Q10 strategy.

| Q10 | Identity workstream |
|-----|--------------------|
| `identity-center` | Set up SCIM provisioning from Entra ID → IAM Identity Center; migrate SAML app trusts per-app; deprecate Entra ID app registrations post-cutover |
| `entra-federation` | Configure SAML federation Entra ID → IAM Identity Center; define AWS permission sets; map Entra ID groups to permission sets; NO app migration |
| `hybrid` | Set up both flows; per-app IdP selection documented |
| `to-be-evaluated` | 2-week identity assessment: catalog SAML apps, federated trusts, service principals; produce recommendation for next milestone |

### Week 5-7: PoC & Validation

Activities:
- Pick smallest cluster (lowest `creation_order_depth` with non-trivial workload)
- Deploy to AWS from `aws-design.json` specification
- Run functional validation tests against PoC
- Capture performance baseline (latency, throughput, error rate)
- Validate data pipeline (Azure → AWS) with DMS / DataSync / SCT
- Validate Identity workstream: SSO flow works end-to-end for PoC app
- Sign-off gate: architecture confirmed, no blocking issues, proceed to Wave Migration

### Week 8-10: Wave Migration

Activities:
- Cluster-by-cluster migration in `creation_order_depth` order
- Wave 1 (Week 8): Foundational network + support clusters (VPC, Route 53, Systems Manager parameters, Secrets Manager)
- Wave 2 (Week 9): Stateless compute tiers (Fargate / Lambda / EC2 without state)
- Wave 3 (Week 10): Stateful workloads (databases, caches, persistent volumes)
- Continuous data sync (DMS CDC for databases, DataSync scheduled for storage)
- Per-cluster validation: functional + performance + IAM access
- If any cluster fails validation: pause wave, root-cause, decide whether to proceed or adjust design

### Week 11: Cutover

Activities:
- Pre-cutover checklist run: data lag < 5min, all validation tests passing, rollback procedure rehearsed
- Announce maintenance window
- Pause Azure writes for cutover-critical services
- Final data sync to AWS
- DNS cutover (Route 53 weighted → 100% AWS, Azure DNS TTL pre-lowered 72h before)
- Dual-run monitoring: Azure and AWS both operational for 48h (read-only on Azure)
- Verify metrics, logs, alarms firing correctly on AWS
- On-call team on standby for rollback

### Week 12: Stabilization

Activities:
- Performance tuning: right-size based on first week's real utilization data
- Cost reconciliation: validate AWS Cost Explorer bill matches Phase 4 estimation
- Adjust Savings Plans / Reserved Instances if usage pattern confirmed
- Document lessons learned
- Azure teardown planning (schedule Week 14+)
- Resolve any P2/P3 issues deferred from cutover

### Week 14+: Azure Teardown

Activities:
- Archive all Azure data to cold storage (Azure Archive Storage OR S3 Glacier Deep Archive)
- Export RBAC assignments for audit trail
- Delete Azure resources in reverse dependency order (compute → data → network → subscription)
- Cancel Azure RI / Savings Plans (accept exit penalty already budgeted in Phase 4)
- Close Azure subscription OR downgrade to Free tier for audit retention (based on Q7 multi_cloud answer)
- Finalize billing closure

## Step 3: Risk Assessment (4 Categories)

Evaluate each risk; assign probability (low/medium/high) and impact (low/medium/high/critical). Add mitigation.

### Technical Risks

| Risk | Default probability/impact | Mitigation |
|------|---------------------------|-----------|
| Azure-unique services without direct AWS mapping | medium/high | PoC each in Week 5-7; defer non-critical to v1.1 |
| Data migration volume >10TB | medium (high if >10TB)/high | DataSync + Snow for bulk; DMS CDC for databases; time buffer in Week 9-10 |
| Application code deeply bound to Azure SDK | high if Azure SDK usage confirmed/high | Code analysis in Week 3; adaptation Week 4-8; consider compatibility layers |
| Database compatibility (esp. SQL Server → Aurora if Q9=open-source) | medium/high | AWS SCT assessment in Week 3; schema conversion PoC in Week 5-6 |
| Cosmos DB → DynamoDB data model redesign | high (only if Cosmos DB present)/high | Dedicated data-modeling sprint in Week 4-5; PoC migration Week 6 |
| Azure Front Door split into CloudFront + GA + WAF missing features | medium/medium | Feature-by-feature mapping in Design; gap list reviewed with user |

### Operational Risks

| Risk | Default probability/impact | Mitigation |
|------|---------------------------|-----------|
| Team lacks AWS experience | probability tied to Q3/high | AWS training Week 3-4; AWS Professional Services engagement; external consultants |
| Monitoring / alerting rebuild | high (always)/medium | CloudWatch dashboard authoring in Week 3-4; validation against Azure Monitor baseline |
| Runbook migration | high (always)/medium | SOP authoring in Week 3-4; tabletop exercises before cutover |
| On-call rotation disruption | medium/medium | Shadow rotations in Week 10; gradual cutover-aware rotation change |

### Compliance Risks

| Risk | Default probability/impact | Mitigation |
|------|---------------------------|-----------|
| Data residency / sovereignty constraints | probability tied to Q8/critical | Confirm AWS region meets residency before Landing Zone deployment |
| Industry certification (HIPAA, PCI, SOC2, FedRAMP) migration | probability tied to Q8/high | Map Azure compliance artifacts → AWS equivalents; audit firm engagement if required |
| Audit trail continuity during cutover | medium/high | CloudTrail + GuardDuty + Security Hub from Day 1; Azure audit logs exported and archived |

### Vendor Risks

| Risk | Default probability/impact | Mitigation |
|------|---------------------------|-----------|
| **Microsoft License restrictions on AWS** (post-2022 Listed Provider policy) | high if Microsoft licenses present/high | Q9 strategy applied; open-source PoC in Week 5-7; licensing review with Microsoft commercial team |
| Azure RI / Savings Plan early termination penalty | medium/medium | Penalty budgeted in Phase 4; time cutover to align with RI expiry where feasible |
| Azure contract early termination fee | low to medium/medium | Check existing Azure agreement; negotiate with Microsoft commercial |
| AWS service launch delays for roadmap-dependent features | low/low | Identify dependencies in Design; plan for manual alternatives |

**If Q1 = `0-3 months`**: Add risk: "Aggressive timeline increases probability of cutover issues" with mitigation: "Consider phased approach — migrate non-critical clusters first, defer complex clusters to a v1.1 wave."

## Step 4: Rollback Procedures

### Rollback Trigger Conditions

- Data integrity issues detected during validation
- Performance regression >20% vs Azure baseline (sustained >1 hour)
- Cost overruns >50% vs estimation (after Week 12 reconciliation)
- Critical unforeseen AWS service limitation
- Compliance finding blocking production traffic

### Rollback Window

**Reversible until DNS cutover (Week 11 completion).** Post-cutover rollback requires reverse data sync (48-72h RTO).

### Rollback Steps (pre-DNS cutover)

1. Pause AWS → Azure replication (if dual-write set up)
2. Keep Azure environment fully operational (not yet torn down)
3. Revert any Entra ID SAML trusts changed during identity workstream
4. Re-route test traffic from AWS → Azure
5. Postmortem before next attempt

### Rollback Steps (post-DNS cutover)

1. **Stop the bleeding**: revert Route 53 weighted records to Azure (DNS propagation 5-30 min based on TTL)
2. Pause new writes to AWS (set read-only on AWS databases)
3. Reverse data sync AWS → Azure via DMS CDC
4. Validate Azure data consistency
5. Resume full Azure operation
6. Keep AWS deployment for 1 week as standby while root cause investigated
7. Postmortem + revised plan before next attempt

## Step 5: Azure Teardown Checklist

**Only after 2 weeks of stable AWS operation.**

- [ ] Archive all Azure data to cold storage
  - Azure Blob → copied to S3 Glacier Deep Archive OR retained in Azure Archive tier for audit window
  - Azure SQL / Cosmos DB → final export to cold storage
  - Log data exported to long-term retention bucket
- [ ] Export RBAC assignments, policies, and configurations for audit trail
- [ ] Delete Azure resources in reverse dependency order:
  - Compute (VM, VMSS, App Service, AKS, Functions)
  - Data (Azure SQL, Cosmos DB, Storage Account, Redis)
  - Networking (Front Door, LB, VPN, VNet peering, VNet)
  - Identity (Entra ID cleanup — careful if retained per Q10)
- [ ] Cancel Azure Reserved Instances / Savings Plans (accept penalty)
- [ ] Close Azure subscription OR downgrade to Free tier
  - If Q7 = `no` (full exit): close subscription after audit window (typically 90 days)
  - If Q7 = `yes strategic`: retain subscription for M365 / Dynamics
- [ ] Document final state and archive runbooks
- [ ] Final Azure bill review — confirm no stragglers

## Step 6: Write Execution Output

**File 1: `execution.json`**

Schema: see `references/shared/output-schema.md` → `execution.json` section.

Required top-level fields:
- `timeline_weeks` (number)
- `phases[]` — list of phase objects with `weeks`, `name`, `activities[]`
- `critical_path[]`
- `risks[]` — list of risk objects with `category`, `description`, `probability`, `impact`, `mitigation`
- `rollback_window` (string)
- `azure_teardown_week` (number)
- `azure_teardown_checklist[]`
- `timestamp`

**File 2: `execution-timeline.md`**

Markdown format:

```
# Azure → AWS Migration Timeline ([timeline_weeks] weeks)

## Week 1-2: Planning & Setup
- [ ] AWS account structure
- [ ] Control Tower Landing Zone
- [ ] IAM Identity Center instance
- [ ] VPCs in target_region (matching Azure CIDRs)
- [ ] Direct Connect / VPN from on-prem / Azure
- [ ] Baseline CloudWatch + Security Hub + GuardDuty

## Week 3-4: Team Enablement
- [ ] AWS fundamentals training
- [ ] Service-specific deep dives
- [ ] SOPs authored
- [ ] CloudWatch dashboards
- [ ] On-call migration

## Week 3-6: Identity Workstream ([Q10 strategy])
- [ ] <workstream-specific activities>

## Week 5-7: PoC & Validation
- [ ] Pilot cluster deployed
- [ ] Functional validation
- [ ] Performance baseline
- [ ] Data pipeline dry-run
- [ ] Identity SSO end-to-end test
- [ ] Sign-off gate

## Week 8-10: Wave Migration
- [ ] Wave 1: Network + support
- [ ] Wave 2: Stateless compute
- [ ] Wave 3: Stateful workloads
- [ ] Continuous data sync
- [ ] Per-cluster validation

## Week 11: Cutover
- [ ] Pre-cutover checklist
- [ ] Final data sync
- [ ] DNS cutover (Route 53 weighted → 100% AWS)
- [ ] 48h dual-run monitoring
- [ ] Rollback standby

## Week 12: Stabilization
- [ ] Performance tuning (real utilization data)
- [ ] Cost reconciliation
- [ ] Savings Plan / RI adjustment
- [ ] Lessons learned doc

## Week 14+: Azure Teardown
- [ ] Data archival
- [ ] RBAC export
- [ ] Resource deletion
- [ ] RI/SP cancellation
- [ ] Subscription closure / downgrade

## Critical Path
- <items>

## Risks
### Technical
- <items>
### Operational
- <items>
### Compliance
- <items>
### Vendor
- <items>

## Rollback
Window: Reversible through DNS cutover (Week 11).
Triggers: [list]
Pre-cutover steps: [list]
Post-cutover steps: [list]

## Azure Teardown Checklist
(full list from Step 5)
```

## Step 7: Update Phase Status

Update `.phase-status.json`:

```json
{
  "phase": "execute",
  "status": "completed",
  "timestamp": "2026-04-21T14:30:00Z",
  "version": "1.0.0"
}
```

Output to user:

"✅ Migration plan complete.

- Timeline: [timeline_weeks] weeks
- AWS Balanced monthly cost: $[balanced total]
- Payback period: [payback_months] months
- 3-year TCO savings: $[three_year_savings]
- Identity strategy: [Q10] ([workstream_weeks] week workstream)
- License strategy: [Q9]
- Rollback window: Through DNS cutover (Week 11)

Files saved in `.migration/[MMDD-HHMM]/`:
- azure-resource-inventory.json
- azure-resource-clusters.json
- clarified.json
- aws-design.json
- aws-design-report.md
- estimation.json
- estimation-report.md
- execution.json
- execution-timeline.md

All 5 phases of the Azure-to-AWS migration analysis are complete. Use this plan to guide your migration."

## Differences from GCP2AWS Execute

- **7 phases over 12-14 weeks** (vs GCP's 6 phases over 8-12 weeks): adds Landing Zone / Team Enablement / Identity workstream phases.
- **Identity workstream** is a first-class parallel track driven by Q10.
- **Vendor risk category** includes Microsoft License and Azure RI/SP exit penalty (GCP equivalent is lighter).
- **Landing Zone via Control Tower** is an explicit Week 1-2 deliverable (GCP version doesn't emphasize multi-account structure as strongly).
- **Azure teardown checklist** explicitly includes RI/SP cancellation and subscription handling options based on Q7.
