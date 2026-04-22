# Storage Services Design Rubric

**Applies to**: Azure Blob Storage, Azure Files, Azure NetApp Files, Azure Managed Disks, Azure Data Lake Storage Gen2, Azure Disk Snapshots, Azure File Sync, Azure Backup.

**Quick lookup (no rubric)**: `fast-path.md` covers Managed Disks → EBS, Disk Snapshots → EBS Snapshots, Azure Files SMB → FSx for Windows, Azure Files NFS → EFS, Azure NetApp Files → FSx for NetApp ONTAP. Use those paths directly.

---

## 1. Service-by-Service Candidate Table

| Azure Service | Primary AWS Candidates | Complexity |
|---------------|------------------------|------------|
| Blob Storage (GPv2, Hot/Cool/Archive) | S3 (with lifecycle to IA / Glacier / Deep Archive) | Low |
| Blob Storage + Hierarchical Namespace (ADLS Gen2) | S3 + Glue Data Catalog / Lake Formation | Medium |
| Azure Files (SMB) | FSx for Windows File Server | Low |
| Azure Files (NFS 4.1) | EFS (or FSx for NetApp ONTAP) | Low |
| Azure NetApp Files | FSx for NetApp ONTAP | Low |
| Managed Disks (Premium SSD / Standard / Ultra) | EBS (gp3 / st1 / io2) | Low |
| Disk Snapshots | EBS Snapshots | Low |
| Azure File Sync | DataSync / Storage Gateway | Medium |
| Azure Backup (Recovery Services Vault) | AWS Backup | Medium |
| Azure Data Share | AWS Data Exchange / S3 Cross-Account | Medium |

---

## 2. Eliminators (Hard Blockers)

| Source | AWS Candidate | Blocker |
|--------|---------------|---------|
| Blob Storage with immutable policy (WORM legal hold) | S3 | Use S3 Object Lock in Compliance mode — verify retention period compatibility |
| Azure Files NFS with snapshot frequency < 1 hour | EFS | EFS snapshots via AWS Backup min 1h → use FSx for NetApp ONTAP (NetApp snapshots) |
| Blob Storage soft-delete retention > 365 days | S3 | S3 versioning + lifecycle supports any retention; verify policy alignment |
| Ultra Disk > 64 TiB | EBS io2 | EBS io2 Block Express max 64 TiB → partition or use FSx |
| Azure File Sync with > 30 cloud endpoints | DataSync | AWS DataSync agents support broader fan-out; re-architect sync topology |
| Archive Blob rehydrate SLA < 1 hour | Glacier Deep Archive | Deep Archive restore ≥ 12h standard, 48h bulk → use S3 Glacier Flexible for 1-5 min expedited |

---

## 3. Signals (Decision Criteria)

### Blob Storage → S3

Access tier mapping (apply always):

| Azure Blob Tier | S3 Storage Class | Lifecycle Trigger |
|-----------------|------------------|-------------------|
| Hot | S3 Standard | Default |
| Cool | S3 Standard-IA | After 30d (or explicit) |
| Cold (preview) | S3 Glacier Instant Retrieval | After 90d |
| Archive | S3 Glacier Deep Archive | After 180d |

Additional signals:

- **Static website hosting** → S3 + CloudFront
- **SFTP endpoint** → Transfer Family (SFTP) fronted by S3
- **Change feed / event grid** → S3 EventBridge notifications
- **Immutable policies (WORM)** → S3 Object Lock (Governance or Compliance mode)
- **CDN origin via AFD** → S3 + CloudFront (see `networking.md`)
- **Analytics workload (q5 = analytics + HNS enabled)** → S3 + Glue Catalog + Athena / Lake Formation

### Azure Files → FSx / EFS

Route by protocol:

- **SMB 3.x (Active Directory integrated)** → FSx for Windows File Server (joined to Managed Microsoft AD)
- **SMB 3.x (no AD)** → FSx for Windows File Server (stand-alone) OR S3 via File Gateway
- **NFS 4.1** → EFS (simpler) OR FSx for NetApp ONTAP (advanced features: SnapMirror, dedupe, cloning)
- **Dual-protocol (SMB + NFS)** → FSx for NetApp ONTAP (only service supporting both natively)
- **Premium Files (high IOPS)** → FSx for NetApp ONTAP (provisioned IOPS) OR FSx for Windows (SSD tier)

### Managed Disks → EBS

| Azure Disk Type | EBS Volume Type | Notes |
|-----------------|-----------------|-------|
| Premium SSD v2 | `gp3` | IOPS/throughput decoupled — map directly |
| Premium SSD | `gp3` (default) or `io2` (>16k IOPS sustained) | Peer size; verify IOPS baseline |
| Standard SSD | `gp3` | Lower baseline IOPS |
| Standard HDD | `st1` (throughput optimized) or `sc1` (cold) | Depends on access pattern |
| Ultra Disk | `io2 Block Express` | Verify IOPS + latency requirements |

### Azure NetApp Files → FSx for NetApp ONTAP

- **Always** use FSx for NetApp ONTAP for feature parity (native NetApp, SnapMirror, FlexCache)
- **Performance tiers**:
  - ANF Standard → FSx ONTAP `single-AZ` low throughput
  - ANF Premium → FSx ONTAP `multi-AZ` medium-high throughput
  - ANF Ultra → FSx ONTAP `multi-AZ` max throughput (scale up via `throughput_capacity_per_ha_pair`)

### Azure File Sync → DataSync / Storage Gateway

- **Sync hybrid on-prem to cloud** → Storage Gateway (File Gateway mode) + S3
- **Periodic batch sync** → AWS DataSync (scheduled tasks)
- **Continuous sync (near real-time)** → DataSync with scheduled pulls + S3 replication

### Azure Backup → AWS Backup

- **VM backup / File backup / SQL backup** → AWS Backup with resource-level backup plans
- **Cross-region DR copies** → AWS Backup cross-region copy action
- **Long-term retention (>10 years)** → AWS Backup + Glacier Deep Archive via lifecycle

---

## 4. 6-Criteria Rubric

Apply in order; first match wins.

1. **Eliminators**: Any Azure storage feature blocked on target AWS service? If yes, switch candidate.
2. **Operational Model**: Managed (S3, FSx, EFS) vs self-managed (EC2 + EBS RAID)?
   - Prefer managed; self-managed only for legacy software requiring specific filesystem semantics.
3. **User Preference**:
   - `q6 = very cost-sensitive` → aggressive lifecycle to IA / Glacier tiers
   - `q8 = strict compliance` → S3 Object Lock + bucket policies + VPC endpoints
4. **Feature Parity**:
   - Blob change feed → S3 EventBridge
   - Blob versioning → S3 versioning (1:1)
   - Azure Files AD-joined → FSx for Windows (requires Managed AD or AD Connector)
5. **Cluster Context**: Other storage in cluster using S3? EFS? Prefer same family.
6. **Simplicity**: Fewer moving parts.
   - S3 + lifecycle > S3 + separate Glacier vault

---

## 5. Decision Tree

```
Is it Blob Storage?
├─ Hierarchical Namespace (ADLS Gen2) → S3 + Glue Catalog + Lake Formation (cross-ref analytics.md)
├─ Static website → S3 + CloudFront
├─ Hot tier + frequent access → S3 Standard
├─ Cool / Archive → S3 + lifecycle (Standard-IA → Glacier → Deep Archive)
└─ SFTP endpoint → Transfer Family + S3

Is it Azure Files?
├─ SMB + AD-joined → FSx for Windows File Server + Managed AD
├─ SMB standalone → FSx for Windows or File Gateway + S3
├─ NFS 4.1 (simple) → EFS
├─ NFS advanced (snapshots / clones) → FSx for NetApp ONTAP
└─ Dual-protocol → FSx for NetApp ONTAP

Is it a Managed Disk?
├─ Premium SSD / SSD v2 → EBS gp3 (default) or io2 (high IOPS)
├─ Standard SSD → EBS gp3 (lower baseline)
├─ Standard HDD → EBS st1 or sc1
└─ Ultra Disk → EBS io2 Block Express

Is it NetApp Files?
└─ FSx for NetApp ONTAP (always; performance tier per ANF tier)

Is it Azure Backup / File Sync?
├─ Azure Backup → AWS Backup (resource-level plans)
├─ File Sync hybrid → Storage Gateway + S3
└─ File Sync batch → DataSync + S3
```

---

## 6. Access Tier & Lifecycle Policy Mapping

When a Blob Storage resource has lifecycle rules in Azure, translate to S3 lifecycle:

**Azure lifecycle rule**:
```json
{
  "name": "move-cool-after-30d",
  "enabled": true,
  "type": "Lifecycle",
  "definition": {
    "actions": {
      "baseBlob": {
        "tierToCool": {"daysAfterModificationGreaterThan": 30},
        "tierToArchive": {"daysAfterModificationGreaterThan": 180},
        "delete": {"daysAfterModificationGreaterThan": 2555}
      }
    }
  }
}
```

**Equivalent S3 lifecycle rule**:
```json
{
  "Rules": [{
    "ID": "move-cool-after-30d",
    "Status": "Enabled",
    "Transitions": [
      {"Days": 30, "StorageClass": "STANDARD_IA"},
      {"Days": 180, "StorageClass": "DEEP_ARCHIVE"}
    ],
    "Expiration": {"Days": 2555}
  }]
}
```

Always carry lifecycle rules into `aws_config.lifecycle_policy` so they are generated in IaC.

---

## 7. Examples

### Example 1: Azure Blob Storage (Hot, 2 TB, no lifecycle)

- Azure: `Microsoft.Storage/storageAccounts`, kind `StorageV2`, Hot tier, 2 TB, LRS
- Pass 1 (fast-path): **S3** (sub-case: Blob Storage)
- AWS config: `storage_class: STANDARD`, versioning enabled, SSE-KMS, bucket policy restricting public access
- Confidence: `deterministic`

### Example 2: ADLS Gen2 with 50 TB analytics workload

- Azure: `Microsoft.Storage/storageAccounts`, HNS=true, 50 TB, lifecycle rule to Cool after 90d
- Pass 2 rubric:
  - Eliminators: PASS
  - Operational Model: Managed S3
  - User Preference: q5=analytics → include Glue Catalog
  - Feature Parity: HNS → S3 prefixes + Glue Catalog partition registration
  - Cluster Context: Analytics cluster (Databricks / Synapse) — cross-ref `analytics.md`
  - Simplicity: S3 + lifecycle
- → **S3 (STANDARD with lifecycle STANDARD-IA at 90d, GLACIER at 180d) + Glue Data Catalog**
- Confidence: `inferred`
- special_mappings: add with `risk_level: medium`, notes: "HNS → prefix-based hierarchy; validate Spark/Databricks read patterns"

### Example 3: Azure Files Premium SMB with AD

- Azure: `Microsoft.Storage/storageAccounts` kind `FileStorage`, Premium SMB, 10 TB, AD-joined
- Pass 2 rubric:
  - Eliminators: PASS
  - Operational Model: Managed FSx for Windows
  - Feature Parity: AD-joined → FSx for Windows requires Managed AD or AD Connector
  - Cluster Context: File tier
- → **FSx for Windows File Server (Multi-AZ, SSD tier, 10 TB, Managed AD integration)**
- Confidence: `inferred`

### Example 4: Managed Disk Premium SSD (P30, 1 TiB)

- Azure: `Microsoft.Compute/disks`, Premium SSD, 1024 GB, 5000 IOPS, 200 MB/s
- Pass 1 (fast-path): **EBS gp3**
- AWS config: `volume_type: gp3`, `size_gb: 1024`, `iops: 5000`, `throughput: 250`
- Confidence: `deterministic`

### Example 5: Azure NetApp Files Premium (8 TB)

- Azure: `Microsoft.NetApp/netAppAccounts/.../volumes`, Premium service level, 8 TB, NFSv4.1
- Pass 1 (fast-path): **FSx for NetApp ONTAP**
- AWS config: `deployment_type: MULTI_AZ_1`, `storage_capacity_gb: 8192`, `throughput_capacity_per_ha_pair: 256`
- Confidence: `deterministic`

---

## 8. Output Schema (per resource)

```json
{
  "azure_resource_id": "/subscriptions/xxx/.../storageAccounts/prod-data",
  "azure_type": "Microsoft.Storage/storageAccounts",
  "azure_config": {
    "kind": "StorageV2",
    "access_tier": "Hot",
    "size_gb": 2048,
    "replication": "LRS",
    "hierarchical_namespace": false
  },
  "aws_service": "S3",
  "aws_config": {
    "bucket_name": "prod-data-<account-id>-apne1",
    "storage_class": "STANDARD",
    "versioning": "Enabled",
    "sse": "aws:kms",
    "lifecycle_policy": [
      {"days": 30, "storage_class": "STANDARD_IA"},
      {"days": 180, "storage_class": "GLACIER_DEEP_ARCHIVE"}
    ],
    "region": "ap-northeast-1"
  },
  "right_sizing": {
    "utilization_tier": "medium",
    "action": "peer",
    "rationale": "Hot tier access pattern — S3 Standard peer"
  },
  "confidence": "deterministic",
  "rationale": "Blob Hot → S3 Standard; lifecycle mapped 1:1",
  "rubric_applied": [
    "Eliminators: PASS",
    "Operational Model: Managed S3",
    "User Preference: q6=balanced cost → default lifecycle applies",
    "Feature Parity: Full (versioning, lifecycle, SSE)",
    "Cluster Context: Data tier",
    "Simplicity: S3 + lifecycle"
  ]
}
```
