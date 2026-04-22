# Security & Identity Services Design Rubric

**Applies to**: Azure Active Directory (Entra ID), Azure Key Vault, Microsoft Defender for Cloud, Azure WAF, Azure DDoS Protection, Azure AD App Registrations, Conditional Access, Managed Identities, RBAC.

**This is the highest-stakes rubric file.** Identity changes ripple through every workload, every team, every external integration. Q10 selection (Identity strategy) is the single most consequential user choice in the Clarify phase.

**Quick lookup**: No fast-path — identity migrations always require rubric evaluation.

---

## 1. Service-by-Service Candidate Table

| Azure Service | Primary AWS Candidates | Complexity |
|---------------|------------------------|------------|
| Azure AD / Entra ID (user directory) | IAM Identity Center / IAM + SAML federation / Hybrid | High (Q10 applies) |
| Azure AD App Registrations (OIDC/SAML apps) | Cognito User Pools / IAM Identity Center SAML apps | High |
| Azure AD Conditional Access | IAM Policy + SCP + Identity Center permission sets + context-aware conditions | High |
| Managed Identity (System-assigned) | IAM Role (attached to EC2/Lambda/ECS task) | Medium |
| Managed Identity (User-assigned) | IAM Role (reusable) | Medium |
| Azure RBAC | IAM Policy + IAM Role + Resource Policy | Medium |
| Azure Key Vault (keys) | AWS KMS | Low |
| Azure Key Vault (secrets) | AWS Secrets Manager | Low |
| Azure Key Vault (certificates) | AWS Certificate Manager (ACM) + Secrets Manager | Medium |
| Microsoft Defender for Cloud | Security Hub + GuardDuty + Inspector + Macie | Medium |
| Azure WAF (on App Gateway / Front Door) | AWS WAF | Medium |
| Azure DDoS Protection Standard | AWS Shield Standard (free, auto) | Low |
| Azure DDoS Protection Network | AWS Shield Advanced | Low |
| Azure AD B2C | Cognito User Pools (with social/SAML IdPs) | High |
| Azure Privileged Identity Management (PIM) | IAM Identity Center + AWS Config + custom approval workflow | High |

---

## 2. Eliminators (Hard Blockers)

| Source | AWS Candidate | Blocker |
|--------|---------------|---------|
| Entra ID with on-prem AD FS federation | IAM Identity Center | IAM IC supports external IdP via SAML; keep AD FS as IdP OR migrate to IAM IC directly |
| Azure AD B2C with 100M+ users | Cognito | Cognito default limit 40M/pool; request raise or shard by geography/tenant |
| Conditional Access using Azure-specific signals (Intune compliance, sign-in risk) | IAM | Replace with AWS Verified Access + external device posture; redesign required |
| Managed Identity assumed by Azure-only services (Azure Function → Azure SQL) | IAM Role | Migrate workload first; then attach IAM Role to Lambda/ECS |
| Key Vault HSM-backed keys (FIPS 140-2 Level 3) | KMS | KMS Standard is FIPS 140-2 Level 3 in eligible regions; CloudHSM if specific hardware key ceremony required |
| Azure WAF custom rules with Azure-specific operators | AWS WAF | Rule syntax incompatible — rewrite all custom rules |
| Defender for Cloud regulatory compliance built-ins (Azure Security Benchmark) | Security Hub | Security Hub has CIS AWS, PCI, NIST — map requirements, not controls directly |

---

## 3. Signals (Decision Criteria)

### Entra ID Migration — Four Strategic Paths (Q10)

This is the core decision. Each path has dramatically different effort profiles and organizational impact. The agent MUST populate Q10 before producing design output for Entra ID.

#### Path A: Full Migration to IAM Identity Center (Q10 = "migrate-to-identity-center")

- **Target**: IAM Identity Center as sole IdP; create users/groups natively in AWS
- **User provisioning**: Manual CSV import OR SCIM from external HR system
- **Application authentication**: SAML/OIDC apps re-registered in IAM IC
- **MFA**: Built-in (TOTP, WebAuthn, FIDO2)
- **Effort**: **Very High** (6-12 months for enterprises)
- **Impact scope**: Every user, every application, every automated workflow
- **When to recommend**:
  - Organization is AWS-exclusive post-migration (no Microsoft 365)
  - Clean slate acceptable
  - < 500 users
  - Desire to exit Microsoft licensing entirely
- **Risks**: User re-onboarding, password resets, MFA re-enrollment, app re-integration, helpdesk burden spike
- **Blocker checklist**: Microsoft 365 dependency? On-prem AD sync? ADFS? PIM? B2C? → If any = YES, reconsider Path B

#### Path B: Retain Entra ID as External IdP (Q10 = "federate-entra-id") — RECOMMENDED DEFAULT

- **Target**: IAM Identity Center configured with Entra ID as external SAML/SCIM IdP
- **User provisioning**: SCIM from Entra ID → IAM IC (automatic sync)
- **Application authentication**: Users SSO from Entra ID → IAM IC → AWS accounts
- **MFA**: Enforced at Entra ID layer (unchanged)
- **Effort**: **Medium** (4-8 weeks)
- **Impact scope**: IAM IC + SAML/SCIM config; users keep existing credentials
- **When to recommend**:
  - Hybrid environment continuing (Microsoft 365, on-prem AD sync, conditional access policies)
  - Large user base (> 500 users)
  - Existing ADFS / Entra ID investments
  - **Most enterprise migrations fit this path**
- **Risks**: Dependency on Entra ID availability for AWS access; cross-cloud egress costs (minimal)
- **Azure licensing**: Entra ID retained; Azure AD Premium P1/P2 licensing continues

#### Path C: Hybrid Mode (Q10 = "hybrid")

- **Target**: Core workforce via Entra ID federation; machine identities and selected accounts use native IAM IC
- **User provisioning**: Split — human users from Entra ID; service accounts / break-glass accounts native
- **When to recommend**:
  - Break-glass / DR account isolation required (don't depend on Entra ID for emergency access)
  - Compliance requirement for separation of duties
  - Phased migration strategy
- **Effort**: **High** (6-10 months) — combines Path A + Path B complexity
- **Risks**: Two identity planes to operate; confusion about which accounts live where

#### Path D: To Be Evaluated (Q10 = "to-be-evaluated")

- **Action**: Produce design entries for ALL paths (A, B, C) in parallel tracks in the Design Report
- **Deliverable**: Comparison table with effort estimate, cost, risk, recommendation per path
- **Decision point**: Phase 4 Estimate step should include cost comparison (Entra ID P1/P2 licenses vs IAM IC free + AWS support)

### Application Authentication Migration (Entra ID App Registrations)

Azure AD App Registrations → AWS candidates depend on app type:

| App Type | Source | AWS Target | Notes |
|----------|--------|------------|-------|
| Internal SaaS app (OIDC/SAML) | Entra ID App Registration | IAM Identity Center application | Path B: federate via SAML |
| Customer-facing B2C app | Azure AD B2C | **Cognito User Pools** | Full rewrite of auth flows; SDK swap (MSAL → Cognito/Amplify) |
| Machine-to-machine (client credentials) | Entra ID App Reg + client secret | **IAM Role with OIDC federation** OR **Cognito app client** | Prefer IAM Role if workload runs in AWS |
| Mobile app | MSAL / Entra ID | **Cognito + Amplify** | Rewrite auth UI and token handling |

### Conditional Access → IAM Policy + SCP + Context

Azure Conditional Access is **policy-as-rule** (if user/device/location/risk → require MFA / block). AWS has no direct equivalent.

Mapping approach:

| Azure CA Signal | AWS Equivalent |
|-----------------|----------------|
| User/group membership | IAM IC permission sets per group |
| Location (named locations, IP) | IAM Policy `Condition: aws:SourceIp` |
| Device compliance (Intune) | AWS Verified Access + external posture provider (Jamf, Ivanti) |
| Sign-in risk (Entra ID Protection) | No direct equivalent — log to Security Hub + custom Lambda |
| Require MFA | Enforce at IdP layer (Entra ID) OR IAM IC MFA requirement |
| Session controls (app enforced restrictions) | AWS Verified Access policies |
| Block legacy auth | Force OIDC/SAML only in IAM IC config |

**Flag**: If Conditional Access uses sign-in risk scoring, add to `special_mappings[]` with risk=high, notes: "Sign-in risk scoring has no direct AWS equivalent; requires custom detection via GuardDuty + Security Hub + Lambda"

### Key Vault → KMS + Secrets Manager (Split by Object Type)

| Key Vault Object | AWS Target | Notes |
|------------------|------------|-------|
| Keys (encryption, signing) | **KMS CMK** | Key policies differ; rotation: KMS auto-rotates annually |
| Secrets (passwords, tokens, connection strings) | **Secrets Manager** | Rotation via Lambda rotation function; cross-region replication supported |
| Certificates (TLS) | **ACM** (for AWS-integrated services) + **Secrets Manager** (for app-consumed certs) | ACM auto-renews; private CAs via ACM Private CA |

**Migration path**:
1. Export non-HSM keys (if allowed) or re-create in KMS with new material
2. Re-encrypt data with new KMS keys (envelope encryption pattern)
3. Secrets: bulk import via CLI / Secrets Manager API
4. Certs: regenerate via ACM (DNS validation) or import if external CA

**Rotation parity**:
- Key Vault auto-rotation policy → KMS annual rotation (KMS) + Lambda rotation (Secrets Manager)
- Azure Event Grid on Key Vault events → EventBridge on KMS/Secrets Manager events

### Defender for Cloud → Security Hub + GuardDuty + Inspector + Macie

Defender for Cloud bundles multiple capabilities. AWS splits them:

| Defender Capability | AWS Service | Notes |
|---------------------|-------------|-------|
| Cloud Security Posture Management (CSPM) | **Security Hub** (with AWS Config) | CIS benchmarks, Security Hub standards |
| Cloud Workload Protection (CWPP) - VMs | **Inspector** (agentless + agent-based) | EC2 vuln assessment |
| Threat detection (Defender for Servers) | **GuardDuty** | Continuous threat detection |
| Defender for Storage | **Macie** (S3 PII/sensitive data) + GuardDuty S3 Protection | Split capability |
| Defender for SQL | **GuardDuty RDS Protection** + CloudTrail data events | Less mature than Defender for SQL |
| Defender for Containers | **GuardDuty EKS Protection** + **Inspector container scanning** | |
| Defender for Key Vault | CloudTrail data events + EventBridge rules on KMS | Manual alerting |
| Regulatory compliance dashboards | Security Hub compliance standards | CIS, PCI, NIST available |

**Effort**: Medium. Security baseline and alerting rules must be rebuilt. Azure Sentinel → **Amazon Security Lake + OpenSearch** (if SIEM retained on AWS).

### Azure WAF → AWS WAF (Rules Incompatible)

- **Rule format**: Fundamentally different (Azure WAF ~ OWASP managed rule engine; AWS WAF uses JSON rule statements)
- **Managed rule sets**: Azure OWASP 3.2 → AWS Managed Rules Core Rule Set (CRS)
- **Custom rules**: Full rewrite (match conditions, rate limits, geo-blocking all re-expressed)
- **Attach points**:
  - Azure WAF on App Gateway → AWS WAF on ALB
  - Azure WAF on Front Door → AWS WAF on CloudFront (web ACL must be global scope / us-east-1)
- **Bot Manager** → AWS WAF Bot Control managed rule group

**Flag**: Always add to `special_mappings[]` with risk=medium, notes: "WAF rules require manual translation; 1-2 weeks per 50 rules"

### Azure DDoS Protection → AWS Shield

- **Azure DDoS Protection Basic** (free, auto) → **AWS Shield Standard** (free, auto)
- **Azure DDoS Protection Standard/Network** → **AWS Shield Advanced** (subscription $3,000/month)
- **Protected resources**: VNet → VPC (Shield Advanced protects EIP, NLB, ALB, CloudFront, Global Accelerator, Route 53)
- **DRT (Azure Rapid Response)** → **AWS Shield Response Team (SRT)** — included with Shield Advanced + Business/Enterprise Support

---

## 4. 6-Criteria Rubric

Apply in order; first match wins. For Entra ID, Q10 dominates.

1. **Eliminators**: Conditional Access sign-in risk? Azure-only features in Defender? → Redesign required
2. **Operational Model**: Managed (IAM IC, KMS, Secrets Manager) vs self-managed (3rd-party IdP on EC2).
   - Always prefer managed unless specific compliance reason
3. **User Preference**:
   - **Q10 dominates** Entra ID decisions (A/B/C/D paths above)
   - `q2 = cost` → Shield Standard (not Advanced); GuardDuty without Macie
   - `q2 = capability` → full Security Hub + GuardDuty + Inspector + Macie
4. **Feature Parity**: Any Azure feature without AWS equivalent?
   - PIM (Privileged Identity Management) → IAM IC + custom approval workflow
   - Sign-in risk scoring → GuardDuty + custom detection
   - Azure AD B2C social logins → Cognito federated IdPs (Google, Facebook, SAML)
5. **Cluster Context**: Multiple accounts? Use IAM IC (multi-account SSO). Single account? IAM roles + SAML may suffice.
6. **Simplicity**: Fewer identity planes = higher score. Path B (single Entra ID plane) > Path C (hybrid).

---

## 5. Decision Tree

```
Is it Entra ID?
├─ Q10 = migrate-to-identity-center → Full IAM IC with native users [VERY HIGH effort]
├─ Q10 = federate-entra-id → IAM IC + SAML/SCIM from Entra ID [MEDIUM effort, RECOMMENDED DEFAULT]
├─ Q10 = hybrid → Mix: humans via Entra, service accounts native IAM IC [HIGH effort]
└─ Q10 = to-be-evaluated → Produce ALL paths as parallel tracks in Design Report

Is it Azure AD App Registration?
├─ Internal SAML/OIDC app → IAM IC application
├─ Customer-facing B2C → Cognito User Pools
├─ Machine-to-machine → IAM Role (if workload in AWS) or Cognito app client
└─ Mobile → Cognito + Amplify

Is it Key Vault?
├─ Keys → KMS CMK
├─ Secrets → Secrets Manager
└─ Certificates → ACM (AWS-integrated) + Secrets Manager (app-consumed)

Is it Defender for Cloud?
└─ Split: Security Hub (CSPM) + GuardDuty (threat) + Inspector (vuln) + Macie (data)

Is it Azure WAF?
└─ AWS WAF [+ full rule rewrite]

Is it DDoS Protection?
├─ Basic → Shield Standard (free, auto)
└─ Standard/Network → Shield Advanced
```

---

## 6. Entra ID Decision Comparison Table

Use this table when Q10 = "to-be-evaluated" to present all paths in the Design Report:

| Dimension | Path A: Full IAM IC | Path B: Federate Entra ID | Path C: Hybrid |
|-----------|---------------------|---------------------------|----------------|
| **Effort** | Very High (6-12 mo) | Medium (4-8 wk) | High (6-10 mo) |
| **User impact** | Full re-onboarding | Transparent (SSO continues) | Partial (service accts only) |
| **MFA re-enrollment** | Required | No | Partial |
| **Ongoing Azure cost** | $0 (Entra ID retired) | Entra ID P1/P2 continues | Entra ID P1/P2 continues |
| **AWS cost** | IAM IC free | IAM IC free | IAM IC free |
| **Operational complexity** | Single plane (AWS) | Single plane (Entra ID) | Two planes |
| **Break-glass isolation** | Native AWS break-glass | Depends on Entra ID | Native (Path C strength) |
| **M365 dependency** | Must eliminate | Compatible | Compatible |
| **Recommended for** | AWS-exclusive future; < 500 users | Hybrid cloud; > 500 users | Compliance-driven sep of duties |

---

## 7. Examples

### Example 1: Entra ID with 2,000 users, hybrid M365 (Q10 = "federate-entra-id")

- Azure: Entra ID tenant, 2k users, 150 groups, SCIM from Workday, M365 E3 licenses, 40 enterprise apps
- Pass 2 rubric:
  - Eliminators: No sign-in risk-based CA → PASS
  - Operational Model: IAM IC (managed)
  - User Preference: Q10=federate-entra-id
  - Feature Parity: SCIM + SAML supported; CA policies expressed as IAM IC permission sets
- → **IAM Identity Center with Entra ID external IdP (SAML + SCIM)**
- Migration effort: 4-8 weeks
- special_mappings: add with risk=medium, notes: "40 enterprise apps require individual SAML re-registration in IAM IC"
- Confidence: `inferred`

### Example 2: Azure Key Vault with 500 secrets + 20 keys + 10 certs

- Azure: `Microsoft.KeyVault/vaults`, Premium (HSM), 500 secrets, 20 keys, 10 TLS certs
- Pass 1 (split by object type):
  - 20 keys → **KMS** (20 CMKs, annual rotation)
  - 500 secrets → **Secrets Manager** (bulk import via API)
  - 10 TLS certs → **ACM** (regenerate with DNS validation)
- Confidence: `deterministic` (for keys/secrets), `inferred` (certs may need regeneration)

### Example 3: Defender for Cloud (Standard tier, all plans enabled)

- Azure: Defender for Servers, SQL, Storage, Containers, Key Vault, App Services enabled; 3 regulatory compliance dashboards (ISO 27001, PCI, SOC 2)
- Pass 2 rubric:
  - Operational Model: Split across 4 AWS services
- → **Security Hub (CSPM + compliance) + GuardDuty (threat + EKS + RDS + S3 Protection) + Inspector (EC2 + ECR vuln) + Macie (S3 sensitive data)**
- special_mappings: add with risk=medium, notes: "Security baseline rebuild 4-6 weeks; alerting rules rewritten"
- Confidence: `inferred`

### Example 4: Azure WAF on App Gateway with 120 custom rules

- Azure: WAF_v2 policy, OWASP 3.2 + 120 custom rules (rate limit, geo-block, header inspection, regex match)
- Pass 2 rubric:
  - Eliminators: Custom rule format incompatible → rewrite
- → **AWS WAF web ACL: Managed Core Rule Set + 120 custom rules rewritten**
- special_mappings: add with risk=medium, notes: "~3 weeks to translate 120 rules; test in count mode before enforce"
- Confidence: `inferred`

### Example 5: Azure AD B2C with 5M customer users

- Azure: Azure AD B2C tenant, 5M users, 3 custom policies, social IdPs (Google, Facebook, Apple), email OTP
- Pass 2 rubric:
  - Eliminators: 5M < 40M Cognito default → PASS
  - Operational Model: Managed Cognito
- → **Cognito User Pool + federated IdPs + custom UI + Lambda triggers for custom policies**
- special_mappings: add with risk=high, notes: "Custom policies (XML) → Cognito Lambda triggers; full auth flow rewrite 8-12 weeks"
- Confidence: `inferred`

### Example 6: Q10 = "to-be-evaluated" (parallel tracks)

Produce THREE design entries (Paths A, B, C) for the Entra ID tenant. Present comparison table from Section 6 in the Design Report. Defer selection to Phase 4 after cost estimation.

---

## 8. Output Schema (per resource)

```json
{
  "azure_resource_id": "<tenant-id>",
  "azure_type": "Microsoft.AAD/domainServices",
  "azure_config": {
    "tenant_type": "Workforce",
    "users": 2000,
    "groups": 150,
    "apps_registered": 40,
    "mfa_enforced": true,
    "conditional_access_policies": 12
  },
  "aws_service": "IAM Identity Center",
  "aws_config": {
    "instance_type": "Organization",
    "identity_source": "External IdP (Entra ID via SAML + SCIM)",
    "permission_sets": ["<to-be-derived-from-groups>"],
    "region": "ap-northeast-1"
  },
  "q10_path": "federate-entra-id",
  "confidence": "inferred",
  "rationale": "Q10=federate-entra-id: retain Entra ID as external IdP; IAM IC for AWS account access; SCIM sync",
  "rubric_applied": [
    "Eliminators: No sign-in risk CA",
    "Operational Model: IAM IC managed",
    "User Preference: Q10=federate-entra-id",
    "Feature Parity: SCIM + SAML supported",
    "Cluster Context: Multi-account — IAM IC preferred",
    "Simplicity: Single identity plane (Entra ID)"
  ],
  "special_mappings": {
    "risk_level": "medium",
    "notes": "40 apps require SAML re-registration; CA policies translated to permission sets",
    "effort_weeks": "4-8"
  }
}
```
