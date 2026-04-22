# Microsoft License Guidance for AWS Migration

> Critical reference for Phase 3 (Design) and Phase 4 (Estimate).
> Linked to **Q9 (Microsoft License Strategy)** in clarified.json.

---

## 1. Background: Listed Provider Restrictions

In October 2022, Microsoft revised its licensing terms for "Listed Providers" (AWS, Google Cloud, Alibaba Cloud). Key changes:

- **BYOL restrictions**: Customers can no longer freely bring their own Windows Server or SQL Server licenses to Listed Provider dedicated infrastructure unless they have **Software Assurance (SA)** or equivalent subscription licenses with **License Mobility**.
- **Dedicated Host requirement**: To use BYOL on AWS, customers must deploy on **EC2 Dedicated Hosts** (not shared tenancy), adding cost and operational complexity.
- **Azure Hybrid Benefit asymmetry**: Azure offers Hybrid Benefit discounts (~40-55% savings) that do not apply on AWS, creating a cost gap for Microsoft workloads.

### Impact Summary

| Workload | On Azure (Hybrid Benefit) | On AWS (License Included) | On AWS (BYOL + Dedicated Host) | Open-Source Alternative on AWS |
|----------|--------------------------|--------------------------|-------------------------------|-------------------------------|
| SQL Server Standard | ~$200/mo (D4s_v5) | ~$650/mo (db.r6i.xlarge RDS LI) | ~$450/mo (Dedicated Host amortized) | ~$200/mo (Aurora PostgreSQL) |
| SQL Server Enterprise | ~$800/mo (E4s_v5) | ~$3,200/mo (db.r6i.xlarge RDS LI) | ~$1,800/mo (Dedicated Host) | ~$400/mo (Aurora PostgreSQL) |
| Windows Server | ~$150/mo (D4s_v5) | ~$280/mo (m6i.xlarge LI) | ~$200/mo (Dedicated Host) | ~$100/mo (Amazon Linux) |

> Prices are illustrative. Use `awspricing` MCP tool or `pricing-fallback.json` for actual estimates.

---

## 2. SQL Server on AWS — Four Options

### Option A: Migrate to Open-Source (Recommended default — Q9 = "迁移到开源替代")

| Target | Use Case | Migration Tool |
|--------|----------|---------------|
| **Aurora PostgreSQL** | Most OLTP workloads; best price-performance | AWS SCT + DMS |
| **Aurora MySQL** | When MySQL compatibility preferred | AWS SCT + DMS |
| **RDS PostgreSQL** | Simpler workloads; need specific PG version | DMS |

**Pros**: Eliminates Microsoft licensing entirely. ~60-80% cost reduction vs License Included. No Dedicated Host requirement.

**Cons**: Requires schema conversion (T-SQL → PL/pgSQL). Stored procedures, CLR assemblies, linked servers need rewriting. Application code changes (ADO.NET → npgsql, JDBC driver change).

**Compatibility checklist** (run AWS SCT first):
- [ ] T-SQL stored procedures → PL/pgSQL conversion feasibility
- [ ] CLR assemblies → Lambda or application-layer replacement
- [ ] Linked servers → Federated queries or ETL
- [ ] SQL Agent jobs → EventBridge + Lambda or Step Functions
- [ ] SSRS reports → QuickSight or third-party
- [ ] SSIS packages → AWS Glue

### Option B: BYOL on Dedicated Hosts (Q9 = "BYOL")

| Target | Requirement |
|--------|-------------|
| **RDS Custom for SQL Server** | BYOL with some managed features |
| **EC2 Dedicated Host + self-managed SQL Server** | Full control, full responsibility |

**Pros**: Uses existing licenses (if SA/subscription). More cost-effective than License Included for large deployments.

**Cons**: Dedicated Host management overhead. Capacity planning for host utilization. SA/subscription license requirement.

### Option C: License Included (Q9 = "License Included")

| Target | Notes |
|--------|-------|
| **RDS for SQL Server** | Fully managed; license bundled in hourly rate |
| **EC2 with SQL Server AMI** | Self-managed; license bundled |

**Pros**: Simplest migration path. No license management. No Dedicated Host.

**Cons**: Highest cost option (2-4x vs open-source). Long-term cost disadvantage vs Azure Hybrid Benefit.

### Option D: Evaluate Both (Q9 = "待评估")

Present two parallel tracks in `aws-design.json`:
1. **Track A**: Open-source path (Aurora PostgreSQL) with SCT assessment
2. **Track B**: License Included path (RDS for SQL Server) as-is

Cost comparison in `estimation-report.md` should show both tracks side by side.

---

## 3. Windows Server on AWS

### Option A: Migrate to Amazon Linux (Q9 = "迁移到开源替代")

| Scenario | Feasibility |
|----------|-------------|
| .NET Core / .NET 6+ on Windows | ✅ High — runs natively on Linux |
| .NET Framework 4.x on Windows | ⚠️ Medium — assess Porting Assistant; may need refactoring |
| IIS-specific features (Windows Auth, ISAPI) | ❌ Low — requires re-architecture |
| Windows-only ISV software | ❌ Not feasible — keep Windows |

### Option B: BYOL on Dedicated Hosts

Deploy Windows Server on EC2 Dedicated Hosts with existing licenses + SA.

### Option C: License Included

Use Windows AMIs with license bundled in EC2 hourly rate. ~$0.046/hr premium for Windows on m6i.xlarge.

---

## 4. Other Microsoft Products on AWS

| Product | AWS Guidance |
|---------|-------------|
| **Office 365 / Microsoft 365** | Keep as SaaS; not affected by migration |
| **Active Directory (Entra ID)** | See Q10 strategy; typically federate rather than replace |
| **System Center** | Replace with AWS Systems Manager |
| **SharePoint** | Keep as SaaS (SharePoint Online) or migrate to third-party |
| **Exchange** | Keep as SaaS (Exchange Online) or migrate to WorkMail |
| **Power BI** | Migrate to QuickSight (report rebuild required) |
| **Dynamics 365** | Keep as SaaS; not affected |

---

## 5. Cost Modeling Rules for Phase 4 (Estimate)

When generating `estimation.json`:

1. **If Q9 = "迁移到开源替代"**: Use Aurora PostgreSQL/MySQL pricing. Add one-time SCT + migration effort cost.
2. **If Q9 = "BYOL"**: Use EC2 Dedicated Host pricing + self-managed overhead. Assume existing SA covers licenses.
3. **If Q9 = "License Included"**: Use RDS for SQL Server LI pricing. Flag cost premium vs Azure Hybrid Benefit.
4. **If Q9 = "待评估"**: Show both open-source and LI tracks. Highlight cost delta.

**Always include in `estimation-report.md`**:
- License cost as a separate line item (not buried in compute)
- 3-year TCO comparison showing license impact
- Recommendation based on Q2 (primary concern) × Q6 (cost sensitivity) × Q9 (license strategy)

---

## 6. Decision Matrix

| Q2 Primary Concern | Q6 Cost Sensitivity | Recommended Q9 Strategy |
|--------------------|--------------------|-----------------------|
| Cost | Very sensitive | Open-source (strongest recommendation) |
| Cost | Moderate | Open-source (with LI fallback for complex SPs) |
| Capability | Any | Evaluate both; favor compatibility |
| Speed | Any | License Included (fastest path) |
| Maintainability | Any | Open-source (fewer licensing constraints long-term) |
