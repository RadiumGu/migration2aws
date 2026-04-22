# Clarification Questions (Q1-Q10) & Defaults

Azure-to-AWS migration extends the GCP2AWS 8-question set with two Azure-specific questions:
**Q9 (Microsoft License strategy)** and **Q10 (Azure AD / Entra ID strategy)**.

## Q1: Migration Timeline

**Question:** How quickly do you need to complete the migration?

**Options:**

- A. Immediate (0-3 months)
- B. Near-term (3-6 months)
- C. Flexible (6-12 months)
- D. No timeline pressure

**Default (Mode C):** C (6-12 months)

---

## Q2: Primary Concern

**Question:** What is your top priority for this migration?

**Options:**

- A. Cost reduction
- B. Technical capability / compliance
- C. Speed to execution
- D. Team familiarity / maintainability

**Default (Mode C):** A (Cost reduction)

---

## Q3: Team Experience

**Question:** What is your team's experience level with AWS?

**Options:**

- A. Expert (deployed 5+ production AWS services)
- B. Moderate (deployed 1-2 AWS services)
- C. Novice (AWS new to team)
- D. Mixed (varies by role)

**Default (Mode C):** C (Novice; assume managed services preferred)

---

## Q4: Traffic Profile

**Question:** What is your typical traffic pattern?

**Options:**

- A. Highly variable (10x-100x spikes)
- B. Predictable (±20% variation)
- C. Mostly steady (±5% variation)
- D. Unknown / hard to predict

**Default (Mode C):** B (Predictable; assume on-demand sizing)

---

## Q5: Database Requirements

**Question:** What type of database access pattern do you need?

**Options:**

- A. Structured (relational, ACID, SQL)
- B. Document-oriented (NoSQL, flexible schema)
- C. Analytics (data warehouse, OLAP)
- D. Mix of above

**Default (Mode C):** A (Structured; RDS Aurora default)

---

## Q6: Cost Sensitivity

**Question:** How cost-sensitive is your migration budget?

**Options:**

- A. Very sensitive (minimize at all costs)
- B. Moderate (balance cost + performance)
- C. Cost not primary (prioritize capability)
- D. Depends on service

**Default (Mode C):** B (Moderate; Balanced tier default)

---

## Q7: Multi-Cloud Strategy

**Question:** Do you plan to keep workloads running on Azure?

**Options:**

- A. No (full exit from Azure)
- B. Yes (multi-cloud for redundancy)
- C. Maybe (undecided)
- D. Yes (strategic Azure usage remains, e.g., Microsoft 365, Dynamics 365)

**Default (Mode C):** A (Full exit; assume full migration)

---

## Q8: Compliance / Regulatory

**Question:** Do you have specific compliance or regulatory requirements?

**Options:**

- A. None
- B. Standard (HIPAA, PCI-DSS, SOC2)
- C. Strict (FedRAMP, GxP, GDPR, data-residency)
- D. Varies by service

**Default (Mode C):** A (None)

---

## Q9: Microsoft License Strategy

**Question:** How do you want to handle workloads that currently depend on Microsoft licenses (SQL Server, Windows Server, etc.) on AWS?

**Context:** Since Microsoft's 2022 policy change, Bring-Your-Own-License (BYOL) to AWS as a "Listed Provider" is restricted. On Azure you may benefit from Azure Hybrid Benefit; on AWS the equivalent options are License Included (AWS provides the license), BYOL with dedicated tenancy, or migrating off Microsoft-licensed products entirely.

**Options:**

- A. **Migrate to open-source alternative** (SQL Server → Aurora PostgreSQL / MySQL; Windows → Amazon Linux + application refactor)
- B. **BYOL** (bring existing licenses; requires dedicated hosts or RDS Custom; verify Microsoft 2022 policy compliance)
- C. **License Included** (pay-as-you-go through AWS; simplest but usually most expensive)
- D. **To be evaluated** (produce side-by-side cost comparison of options A/B/C for affected workloads)

**Default (Mode C):** A (Migrate to open-source alternative — typically the largest cost saver)

**Impact on downstream phases:** Design (Step 3) applies this strategy to every resource whose `config.license_type` is `windows` or `sql_server`. Estimate (Step 4) uses this strategy to select the cost formula; "to be evaluated" produces parallel estimates.

---

## Q10: Azure AD / Entra ID Strategy

**Question:** How do you want to handle Azure AD (Entra ID) identities and authentication after migration?

**Context:** Entra ID is deeply integrated with Azure services and often with Microsoft 365, Dynamics 365, or on-prem Active Directory. Identity is frequently the most complex migration workstream. Options range from full replacement to continued federation.

**Options:**

- A. **Migrate to IAM Identity Center** (replace Entra ID as the primary IdP; establish new SCIM provisioning and SAML trust; AWS-native long-term)
- B. **Keep Entra ID + federate to AWS** (Entra ID remains primary; configure SAML federation to IAM Identity Center; recommended if Microsoft 365 stays)
- C. **Hybrid** (IAM Identity Center for AWS workloads + Entra ID for Microsoft 365; per-workload IdP selection)
- D. **To be evaluated** (schedule a dedicated identity-assessment workstream; design proceeds with placeholder assumptions)

**Default (Mode C):** D (To be evaluated — most enterprises need a separate identity discovery before committing)

**Impact on downstream phases:** Design (Step 4) generates an Entra ID migration plan following the selected strategy. Execute (Phase 5) adds a dedicated identity workstream to the timeline with appropriate duration (A: 4-6 weeks; B: 2-3 weeks; C: 6-8 weeks; D: 2-week assessment workstream before main migration).

---

## Mode Summary

| Mode  | Interaction                               | Defaults Used?                                            |
| ----- | ----------------------------------------- | --------------------------------------------------------- |
| **A** | User answers all 10 questions at once     | No; use user answers                                      |
| **B** | Agent asks each question separately       | No; use user answers                                      |
| **C** | No questions; use defaults immediately    | Yes; Mode C defaults above                                |
| **D** | User provides free-form requirements text | Partial; extract Q1-Q10 from text, fill gaps with defaults |

---

## Output: clarified.json

See `references/shared/output-schema.md` for the `clarified.json` schema.
