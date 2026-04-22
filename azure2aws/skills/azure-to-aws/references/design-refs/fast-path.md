# Fast-Path: Direct Azure→AWS Mappings

**Confidence: `deterministic`** (1:1 mapping, no rubric evaluation needed).

These ~15 Low-complexity services map without rubric-based selection. Use this table when Azure `type` is listed below.

See `references/shared/complexity-ratings.md` for the full Low/Medium/High classification rationale.

## Direct Mappings Table

| Azure Type | Example Azure SKU | AWS Target | AWS Config Template | Migration Tool | Notes |
|-----------|-------------------|-----------|---------------------|----------------|-------|
| `Microsoft.Compute/virtualMachines` (Linux, no SQL) | `Standard_D4s_v5` | **EC2** | `instance_type: m6i.xlarge` (peer), `ami: Amazon Linux 2023`, `ebs: gp3` | AWS Application Migration Service (MGN) | Peer-size per SKU map |
| `Microsoft.Compute/virtualMachineScaleSets` | `Standard_D2s_v5 × 3-10` | **EC2 Auto Scaling Group** | `instance_type: <per-sku>`, `min_size/max_size: <from scale rule>` | MGN + launch template | Scale rules rewritten to AWS Auto Scaling policies |
| `Microsoft.Compute/disks` | `Premium SSD / Standard HDD` | **EBS** | `volume_type: gp3` (Premium SSD) / `st1` (Standard HDD) / `io2` (Ultra SSD) | Azure Disk snapshot → AMI + EBS | Preserve IOPS target |
| `Microsoft.Compute/snapshots` | Disk snapshot | **EBS Snapshot** | `source: disk` | Snapshot copy via MGN | 1:1 |
| `Microsoft.Compute/images` | Shared Image Gallery | **AMI** | N/A | Image Builder or manual | Map OS + extensions |
| `Microsoft.ContainerRegistry/registries` | `Basic/Standard/Premium` | **ECR** | `repository_policy: <mapped IAM>` | `docker pull/push` or `skopeo` | ACR RBAC → ECR IAM policy |
| `Microsoft.Batch/batchAccounts` | Batch account | **AWS Batch** | `compute_environment: EC2 on-demand / Spot`, `job_queue` | Re-author job definitions in AWS Batch format | Functional parity |
| `Microsoft.Storage/storageAccounts` (File, SMB) | GPv2 File share | **FSx for Windows File Server** | `deployment_type: SINGLE_AZ_2` (dev) / `MULTI_AZ_1` (prod) | AWS DataSync | SMB 3.x equivalent |
| `Microsoft.Storage/storageAccounts` (File, NFS) | Premium File NFS | **EFS** | `throughput_mode: bursting`, `performance_mode: generalPurpose` | AWS DataSync | NFSv4.1 equivalent |
| `Microsoft.NetApp/netAppAccounts` | Azure NetApp Files | **FSx for NetApp ONTAP** | `deployment_type: MULTI_AZ_1`, `throughput_capacity: <per volume>` | SnapMirror or AWS DataSync | Native NetApp compat |
| `Microsoft.DBforMySQL/servers`, `/flexibleServers` | `GP_Standard_D4ds_v4` | **RDS MySQL / Aurora MySQL** | `engine: aurora-mysql`, `instance_class: db.r6g.xlarge`, `multi_az: true` | AWS DMS | Version compat check |
| `Microsoft.DBforPostgreSQL/servers`, `/flexibleServers` | `GP_Standard_D4ds_v4` | **RDS PostgreSQL / Aurora PostgreSQL** | `engine: aurora-postgresql`, `instance_class: db.r6g.xlarge`, `multi_az: true` | AWS DMS + SCT (extension review) | Verify extensions compat |
| `Microsoft.Cache/Redis` | `Premium P1` (6 GB) | **ElastiCache Redis** | `node_type: cache.r6g.large`, `cluster_mode: enabled` (if Azure Premium cluster) | Redis RDB/AOF export + import | Preserve cluster topology |
| `Microsoft.Databricks/workspaces` | Azure Databricks workspace | **Databricks on AWS** | Databricks workspace on AWS with same region | Databricks admin-to-admin migration | Preserve notebooks, jobs, libraries |
| `Microsoft.Network/virtualNetworks` | `vnet-prod` (`10.0.0.0/16`) | **VPC** | `cidr_block: 10.0.0.0/16` (preserve) | Terraform / CloudFormation | 1:1; preserve CIDR |
| `Microsoft.Network/virtualNetworks/subnets` | `subnet-web` | **VPC Subnet** | `cidr_block: <same>` | IaC | Preserve CIDR; map `availabilityZone` |
| `Microsoft.Network/loadBalancers` (Basic/Standard L4) | Azure LB | **NLB** | `scheme: internal/internet-facing`, `listeners: TCP/UDP per frontend` | Manual rewrite | L4 config 1:1 |
| `Microsoft.Network/privateEndpoints` | Private Endpoint to Storage | **VPC PrivateLink Endpoint** | `vpc_endpoint_type: Interface`, `service_name: com.amazonaws.<region>.s3` | Manual | Endpoint 1:1 |
| `Microsoft.Network/dnszones` (public) | `contoso.com` zone | **Route 53 Public Hosted Zone** | `hosted_zone: contoso.com`, `records: <from export>` | Azure DNS export → Route 53 import | Zone records exportable |

## Skip Mappings Table

These Azure resources do **not** require AWS equivalents in v1.0. Log as "secondary resource, no AWS equivalent needed" and note in report warnings.

| Azure Type | Reason |
|-----------|--------|
| `Microsoft.Resources/resourceGroups` | AWS has no direct Resource Group concept; tags and account structure serve this role |
| `Microsoft.Resources/subscriptions` | Map to AWS accounts manually (Landing Zone), not IaC |
| `Microsoft.Network/networkInterfaces` | ENIs are implicit in AWS (created with EC2/Lambda/RDS instances) |
| `Microsoft.Network/publicIPAddresses` (attached to LB) | Implicit in ELB listener; only standalone Public IPs need Elastic IP |
| `Microsoft.Authorization/locks` | AWS equivalent is SCP / IAM deny policies (use Phase 5 Landing Zone) |
| `Microsoft.Resources/deployments` (ARM deployments) | ARM template itself — rewrite is a DevOps workstream (see `devops.md`) |
| `Microsoft.Insights/diagnosticSettings` | Replace with CloudWatch Log Groups + log subscriptions (implicit in deployment) |
| Tags on every resource | Propagated via IaC; not standalone |

## Secondary Behavior Lookups

For resources in the Skip Mappings table but present in inventory:

1. Log as "secondary resource, no AWS equivalent needed"
2. Do not include in `aws-design.json.clusters[].resources[]`
3. Note in `aws-design-report.md` warnings section
4. For tagging, surface as implicit configuration in related resources

---

## Workflow

```
1. Extract Azure type from inventory resource
2. Look up in Direct Mappings table above
   - If found: assign AWS target (confidence = "deterministic")
   - If found but condition unmet: fall through to rubric
3. Look up in Skip Mappings table
   - If found: skip (do not include in design)
4. Else: use `index.md` to route to category rubric file
```

**Example invocation pattern**:

```python
resource = inventory["resources"][i]
azure_type = resource["type"]

if azure_type == "Microsoft.Compute/virtualMachines":
    if resource["config"]["license_type"] == "none":  # Linux, no SQL
        # Fast-path: EC2 peer mapping
        confidence = "deterministic"
        aws_service = "EC2"
    else:
        # License present — fall to compute.md rubric (Q9 applies)
        confidence = "inferred"
        # ... call compute.md rubric
```
