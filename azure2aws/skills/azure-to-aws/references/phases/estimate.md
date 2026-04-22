# Phase 4: Estimate AWS Costs and TCO vs Azure

Estimate AWS operating costs in three tiers (Premium / Balanced / Optimized), compare against the Azure baseline (from CloudRays Consumption or user estimate), calculate one-time migration costs including Azure RI/SP exit penalties, and produce ROI.

**Execute ALL steps in order.**

## Step 0: Validate Inputs

**0a. Validate `aws-design.json`:**

1. If file missing: **STOP**. Output: "Phase 3 (Design) not completed. Run Phase 3 first."
2. If invalid JSON: **STOP**. Output: "aws-design.json is corrupted (invalid JSON). Re-run Phase 3."
3. Required fields:
   - `clusters` array not empty
   - Each cluster has `resources` array
   - Each resource has `aws_service` and `aws_config`
   - `target_region` set
   - `license_strategy_applied` set
4. If any missing: **STOP**. Output specifies which field is missing.

**0b. Validate `clarified.json`:**

1. If file missing: **STOP**. Output: "Phase 2 (Clarify) not completed. Run Phase 2 first."
2. If invalid JSON: **STOP**. Output: "clarified.json is corrupted (invalid JSON). Re-run Phase 2."

**0c. Locate optional Azure Consumption data:**

Look for CloudRays Consumption output in the scan output directory (produced by Phase 1 CloudRays scan when `skip_consumption = false`). Typical filename: `*_Consumption.json`. If found, record path for Step 1.

If all validations pass, proceed to Step 1.

## Step 1: Extract Azure Cost Baseline

Azure monthly cost determination (priority order):

1. **From CloudRays Consumption JSON** (preferred):
   - Parse `*_Consumption.json`
   - Sum 31-day totals by service category (Compute, Database, Storage, Network, Security, Other)
   - Extrapolate to monthly (no extrapolation needed — CloudRays already reports monthly)
   - Set `azure_baseline.source = "cloudrays_consumption"`
2. **From clarified.json free-text notes**: If user mentioned a monthly spend figure during Mode D.
3. **From user prompt**: Ask user: "What is your current monthly Azure spend in USD? (Used for TCO comparison; provide best estimate.)"
4. **Cannot determine**: Set `tco_comparison.status = "cannot_calculate"` and `tco_comparison.message = "Azure baseline unavailable. Provide your monthly Azure spend to enable TCO comparison."` Continue Phase 4 with AWS cost estimates only.

Also attempt to capture Reserved Instance / Savings Plan commitments:

- If Consumption JSON has `reservationId` or `savingsPlanId` entries, extract:
  - `azure_ri_remaining_months` (months until RI expiry)
  - `azure_savings_plan_remaining_months`
- Ask user for estimated exit penalty if switching before RI/SP expiry. Default assumption if unknown: 20% of remaining-term RI value (guidance only).
- Record in `azure_baseline.reserved_commitments`.

## Step 2: Check AWS Pricing API Availability

Call `awspricing.get_pricing_service_codes()`:

### Retry Logic

Attempt up to 3 times (2 retries):

1. **Attempt 1**: Call `get_pricing_service_codes()`
2. **If timeout/error**: Wait 1s, retry (Attempt 2)
3. **If still fails**: Wait 2s, retry (Attempt 3)
4. **If all 3 fail**: Proceed to fallback

### Success Path

- Use live AWS pricing. Mark `pricing_source.status = "live"` in estimation.json.

### Fallback Path

1. Load `references/shared/pricing-fallback.json`.
2. Check staleness:
   - Read `metadata.last_updated`
   - Days since update: `today - last_updated`
   - If > 60 days: Add warning: "⚠️ Cached pricing data is >60 days old; accuracy may be significantly degraded"
   - If 30-60 days: Add warning: "⚠️ Cached pricing data is 30-60 days old; accuracy may be reduced"
   - If ≤ 30 days: Add note: "Using cached rates (±15-25% accuracy)"
3. Log warning. Add visible warning to estimation report with staleness notice.
4. Mark `pricing_source.status = "fallback"`.
5. Proceed.

## Step 3: Enumerate Services from Design

Read `aws-design.json`. Build the unique-services list with usage scenarios:

- EC2 (by instance type × count × region × OS) — e.g., `m6i.xlarge × 4 × ap-northeast-1 × Linux`
- RDS Aurora / RDS (by engine, instance class, Multi-AZ, storage)
- EKS (cluster hours × # clusters + node EC2 separately)
- Fargate (vCPU-hour × memory-hour)
- Lambda (invocations × duration × memory)
- S3 (GB × access tier; IA/Glacier/DA breakdown if applicable)
- EBS (GB × volume type)
- EFS / FSx (GB × type)
- ALB / NLB (LCU-hour + LCU consumption)
- NAT Gateway (hour + GB processed)
- CloudFront (requests + data transfer)
- Global Accelerator (endpoint hours + data transfer)
- WAF (web ACLs + rules + requests)
- Route 53 (hosted zones + queries)
- DynamoDB (RCU/WCU or on-demand + storage)
- ElastiCache (node type × count × hours)
- Redshift / Redshift Serverless (RPU-hours or node-hours)
- Glue (DPU-hours)
- SageMaker (endpoint hours + training hours)
- Bedrock (tokens × model)
- KMS (keys × requests)
- Secrets Manager (secrets × API calls)
- IAM Identity Center (free for AWS; account for third-party IdP integration fees if Q10 = entra-federation)

## Step 4: Query Pricing — Three Tiers

For each service, produce Premium / Balanced / Optimized cost:

### Tier Definitions

| Tier | Compute | Database | Storage | Commitments |
|------|---------|----------|---------|-------------|
| **Premium** | Latest-gen on-demand (m7i, r7i) | Aurora Provisioned (db.r7g) | S3 Standard | None |
| **Balanced** | Current-gen + 1yr Compute SP | Aurora Serverless v2 or provisioned db.r6g | S3 Standard + lifecycle to IA at 30d | 1yr Compute Savings Plan |
| **Optimized** | Spot for stateless / Graviton everywhere / Savings Plan | Aurora Serverless v2 min 0.5 ACU (dev) or 1yr RI | S3 IA + Glacier | 1yr/3yr RI + Spot + Graviton |

### Pricing Query Steps

For each service:

1. Extract service attributes from `aws-design.json` (instance type, storage GB, region, etc.).
2. Query pricing:
   - **Live**: Call `awspricing.get_pricing(service_code, region, filters)` with tier-specific filters.
   - **Fallback**: Look up in `pricing-fallback.json[service_code][region][sku]`. If missing → add to `services_with_missing_fallback[]`, use conservative average estimate, mark `pricing_source: "estimated"`.
3. Assume 730 hours/month (24/7) unless:
   - `utilization_tier = "idle"` → treat as 0 hours (elimination candidate) or batch-job hours
   - Q4 `traffic_profile = "highly variable"` → model with autoscaling average (60% of peak hours)

## Step 5: License Cost Computation (Separate Line Item)

For resources with `config.license_type ∈ {"windows", "sql_server"}` in the inventory:

Based on Q9 strategy:

| Q9 value | Cost computation |
|----------|-----------------|
| `open-source` | SQL Server → Aurora PostgreSQL pricing (no license fee). Windows → Linux EC2 pricing (no license fee). One-time: AWS SCT + schema conversion effort in `one_time_costs.dev_hours`. |
| `byol` | SQL Server → RDS Custom or EC2 Dedicated Host + self-managed SQL Server (Dedicated Host hourly + instance hours). Windows → EC2 Dedicated Host + Windows instance (BYOL). No AWS license fee, but Dedicated Host amortized cost. |
| `license-included` | RDS for SQL Server LI (higher hourly rate). EC2 Windows LI (Windows premium per hour). |
| `to-be-evaluated` | Compute **all three** columns (open-source, byol, license-included) and store in `license_costs.breakdown`. Recommend the lowest-cost option but defer user decision. |

Write to `license_costs`:

```json
{
  "strategy_applied": "<q9>",
  "affected_resources": <count>,
  "breakdown": {
    "open_source_replacement_monthly": <usd>,
    "byol_monthly_if_chosen": <usd>,
    "license_included_monthly_if_chosen": <usd>,
    "selected_monthly": <usd (matches strategy_applied)>
  },
  "notes": "<summary>"
}
```

See `references/shared/license-guidance.md` Section 1 for illustrative TCO deltas and Section 5 for cost-modeling rules.

## Step 6: Calculate Monthly Totals per Tier

Per tier (Premium / Balanced / Optimized):

```
total = sum(all service monthly costs) + license_costs.selected_monthly
```

Store under `monthly_costs.<tier>.total` and `monthly_costs.<tier>.breakdown.<service>`.

## Step 7: One-Time Migration Costs

Compute:

| Line item | Formula |
|-----------|---------|
| Development hours | (complexity-weighted resource count) × 2-5 hours × $150/hr. Use complexity-ratings.md: Low=2hr, Medium=5hr, High=15hr per resource. Minimum 200 hours for any non-trivial environment. |
| Data transfer | Total outbound data (GB) × $0.02/GB (Azure egress); add $0.09/GB for inbound S3 if data volume >10TB (Direct Connect more cost-effective) |
| Training | Q3 team_experience = `novice` → $10,000; `moderate` → $5,000; `expert` → $0-2,000 |
| Dual-run period | (weeks of dual-run from Phase 5 timeline) × (Azure monthly + AWS monthly). Default 8 weeks for Medium envs, 12 weeks for Large. |
| Azure RI / SP exit penalty | From `azure_baseline.reserved_commitments` |
| Identity migration consulting | Q10 strategy: `identity-center` → $15,000; `entra-federation` → $5,000; `hybrid` → $20,000; `to-be-evaluated` → $3,000 (assessment only) |
| License conversion (SCT + PoC) | If Q9 = `open-source`: $5,000 per SQL Server instance requiring T-SQL → PL/pgSQL conversion |
| IaC rewrite | Per ARM/Bicep template count detected in inventory: $2,000 per significant template family |

Write to `one_time_costs` with line items and total.

## Step 8: TCO Comparison (Azure vs AWS)

Compute:

```
azure_monthly = azure_baseline.monthly_total_usd
aws_monthly_balanced = monthly_costs.balanced.total
monthly_savings = azure_monthly - aws_monthly_balanced
annual_savings = monthly_savings × 12
three_year_savings = (monthly_savings × 36) - one_time_costs.total
five_year_savings = (monthly_savings × 60) - one_time_costs.total
payback_months = one_time_costs.total / monthly_savings   (if monthly_savings > 0)
```

If `monthly_savings ≤ 0`: set `payback_months = null`, add note: "AWS Balanced tier monthly cost exceeds Azure baseline. Consider Optimized tier (sum = X) or revisit Q9/Q10 strategies for cost savings."

Write to `tco_comparison` and `roi`.

## Step 9: Write Estimation Output

**File 1: `estimation.json`**

Schema: see `references/shared/output-schema.md` → `estimation.json` section.

Required top-level fields:
- `pricing_source` (object with status, staleness, services_by_source)
- `azure_baseline` (object with source, monthly_total_usd, breakdown, reserved_commitments)
- `license_costs` (object)
- `monthly_costs` (object with premium/balanced/optimized)
- `one_time_costs` (object with line items and total)
- `tco_comparison` (object)
- `roi` (object)
- `assumptions[]` (array of strings, including pricing source + baseline source + currency + region + utilization assumptions)
- `timestamp`

**File 2: `estimation-report.md`**

Markdown sections:

```
# AWS Cost Estimation & Azure TCO Comparison

[If pricing_source = "fallback": staleness warning banner here]

## Azure Baseline
- Source: [cloudrays_consumption|user_estimate]
- Monthly total: $X,XXX
- Breakdown:
  - Compute: $X
  - Database: $X
  - Storage: $X
  - Network: $X
  - Security: $X
  - Other: $X
- Reserved commitments: X months RI / Y months SP remaining
- Early exit penalty estimate: $Z

## AWS Monthly Operating Costs (Balanced Tier — Recommended)
- EC2: $X
- RDS Aurora: $X
- S3: $X
- ...
- License (<q9 strategy>): $X
- **Total: $X,XXX/month**

### Tier Comparison
- Premium: $X,XXX/month
- Balanced: $X,XXX/month ← recommended
- Optimized: $X,XXX/month

## License Cost Detail (Q9 = <strategy>)
Affected resources: X SQL Server DBs, Y Windows VMs

| Strategy | Monthly cost |
|----------|-------------|
| Open-source replacement | $X |
| BYOL (Dedicated Host) | $Y |
| License Included | $Z |
| **Selected: <strategy>** | **$W** |

## One-Time Migration Costs
- Dev hours: $X
- Data transfer: $X
- Training: $X
- Dual-run (N weeks): $X
- Azure RI/SP exit penalty: $X
- Identity migration consulting: $X
- License conversion: $X
- IaC rewrite: $X
- **Total: $XX,XXX**

## TCO Comparison (3-Year)
- Azure 3-year: $X
- AWS 3-year: $Y (incl. one-time $Z)
- **3-year savings: $N**
- **Payback: X months**

## ROI Analysis
- Monthly savings: $X
- Annual savings: $Y
- 3-year savings: $Z
- 5-year savings: $W
- Payback: X.X months

## Assumptions
- 24/7 operation unless otherwise noted
- Region: [target_region]
- Pricing source: [live|fallback]
- Azure baseline source: [cloudrays_consumption|user_estimate]
- License strategy: [Q9]
- Identity strategy: [Q10]
- [other assumptions]
```

## Step 10: Update Phase Status

Update `.phase-status.json`:

```json
{
  "phase": "estimate",
  "status": "completed",
  "timestamp": "2026-04-21T14:30:00Z",
  "version": "1.0.0"
}
```

Output to user:

"✅ Cost estimation complete.
- Azure baseline: $[monthly]/mo
- AWS Balanced: $[monthly]/mo
- Monthly savings: $[savings]
- Payback: [months] months
- 3-year TCO savings: $[3y_savings]

Proceeding to Phase 5: Execution Plan."

## Differences from GCP2AWS Estimate

- **Azure baseline available**: CloudRays Consumption data provides direct Azure monthly cost (GCP version requires user estimate).
- **License line item**: Microsoft SQL Server / Windows License cost is displayed separately (GCP version has no equivalent).
- **RI/SP exit penalty**: Azure Reserved Instance / Savings Plan early-termination penalty captured as one-time cost.
- **Dual-run period typically longer**: Default 8-12 weeks vs GCP's 6-8 (due to license/identity complexity).
- **Identity migration consulting** is a separate line item tied to Q10 strategy.
