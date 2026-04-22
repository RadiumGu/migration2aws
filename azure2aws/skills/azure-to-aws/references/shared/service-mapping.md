# Azure-to-AWS Service Mapping Reference

> **Purpose**: Agent lookup table for Azure → AWS service mappings during Design phase.
> Each mapping includes migration notes. The Appendix rates migration complexity (Low / Medium / High) — see `complexity-ratings.md` for the rationale behind each rating.
>
> **Usage**: The agent consults this file when `design-refs/fast-path.md` does not yield a deterministic 1:1 mapping, or when a resource type is not yet categorized. For rubric-based selection, see `design-refs/<category>.md`.

---

## Global Infrastructure

| Azure Service | AWS Service | Notes |
|---|---|---|
| Azure Region | AWS Region | Region layouts do not perfectly overlap; confirm target-region service availability |
| Availability Zones | Availability Zones | Concept equivalent; AZ counts and naming differ |
| Point-of-Presence | CloudFront Edge Locations | AWS has more edges overall; geographic coverage differs |
| Azure Extended Zones | Local Zones / Wavelength Zones | Local Zones for low-latency extension; Wavelength for 5G edge |
| ExpressRoute | AWS Direct Connect | Carrier roster and handoff points differ; re-contract required |
| Azure DNS; Traffic Manager | Amazon Route 53 | Route 53 covers both DNS hosting and traffic-routing policies |
| Azure Front Door | CloudFront + Global Accelerator + AWS WAF | One Azure service splits into three AWS services |
| Azure Virtual WAN | Transit Gateway / Cloud WAN | Cloud WAN for global orchestration; Transit Gateway for regional |

## Compute

| Azure Service | AWS Service | Notes |
|---|---|---|
| Azure Virtual Machines | Amazon EC2 | Instance-type mapping must be done per-SKU; naming schemes differ |
| Azure Spot Virtual Machines | EC2 Spot | Interruption model similar; pricing and notice times differ |
| Azure Cobalt / Ampere Altra VMs | AWS Graviton (EC2) | Both ARM; verify application ARM compatibility |
| Azure Confidential VMs | AWS Nitro Enclaves | Different isolation models (SEV-SNP vs Nitro Enclave) |
| Azure Batch | AWS Batch | Functionally equivalent; job-definition format conversion required |
| Azure CycleCloud | AWS ParallelCluster | HPC orchestration; scheduler config must be rewritten |
| Azure Container Registry | Amazon ECR | Images can be pushed directly; permission model differs (ACR RBAC → ECR IAM) |
| Azure Kubernetes Service (AKS) | Amazon EKS | Control plane similar; CNI (Azure CNI → VPC CNI), RBAC integration, Ingress all need adjustment |
| Open Service Mesh on AKS | AWS App Mesh | Different mesh implementations; rewrite mesh config and sidecar injection |
| Azure Container Apps; Azure Container Instances | Amazon ECS; AWS Fargate | Container Apps → ECS + Fargate (Serverless); ACI → Fargate single-task |
| Azure Functions | AWS Lambda | Trigger bindings, runtime versions, cold-start characteristics all differ; handler model adaptation required |
| Azure VMware Solution | AWS VMware Migration Pathways / Amazon EVS | Different VMware migration paths; EVS is new option |
| Azure Boost | AWS Nitro | Underlying acceleration platform, not directly user-configured |

## Storage

| Azure Service | AWS Service | Notes |
|---|---|---|
| Azure Blob Storage; ADLS | Amazon S3 | APIs incompatible; SDK rewrite required. ADLS hierarchical namespace maps to S3 prefix + Glue Catalog |
| Azure Archive Storage | S3 Glacier Flexible / Deep Archive | Retrieval time and pricing models differ |
| Azure Managed Disks | Amazon EBS | Premium SSD → gp3/io2; Standard HDD → st1 |
| Azure Files | Amazon EFS; FSx for Windows | SMB shares → FSx for Windows; NFS → EFS |
| Azure NetApp Files | Amazon FSx for NetApp ONTAP | Highly equivalent; NetApp-native protocols supported |
| Azure Managed Lustre | Amazon FSx for Lustre | HPC filesystem; performance parameters need re-tuning |
| Azure Site Recovery | AWS Elastic Disaster Recovery (DRS) | Replication agents and failover flows differ |
| Azure Backup | AWS Backup | Policies and retention rules rebuilt |

## Databases

| Azure Service | AWS Service | Notes |
|---|---|---|
| Azure SQL Database / SQL Managed Instance | Amazon RDS for SQL Server / Amazon Aurora | Aurora is MySQL/PostgreSQL-compatible (not SQL Server); use RDS for SQL Server if SQL Server compatibility required. Q9 license strategy applies. |
| Azure Cosmos DB | Amazon DynamoDB | Large data-model gap: Cosmos multi-model APIs → DynamoDB KV/document only; consistency models differ |
| Azure Database for MySQL | RDS for MySQL / Aurora MySQL | Direct migration via DMS; version and parameter-group differences |
| Azure Database for PostgreSQL | RDS for PostgreSQL / Aurora PostgreSQL | Direct migration via DMS; verify extension compatibility |
| Azure Cache for Redis | Amazon ElastiCache for Redis | Equivalent; cluster topology and parameter groups must be reconfigured |
| Azure Database Migration Service | AWS DMS | Heterogeneous migration; CDC config and endpoint definitions rewritten |

## Analytics & BI

| Azure Service | AWS Service | Notes |
|---|---|---|
| Azure Synapse Analytics | Amazon Redshift | Different compute models (Synapse Serverless/Dedicated → Redshift Serverless/Provisioned); SQL dialect differences |
| Azure Data Factory | AWS Glue | ETL pipeline definitions incompatible; jobs rewritten in PySpark/Python |
| Azure Stream Analytics | Amazon Kinesis (Data Streams + Data Analytics) | Stream query language differs (SQL-like → Flink SQL or KCL) |
| Azure HDInsight | Amazon EMR | Hadoop/Spark ecosystems equivalent; cluster config and bootstrap scripts adapted |
| Power BI | Amazon QuickSight | Reports and dashboards rebuilt; data-source connections reconfigured |
| Azure Data Explorer (Kusto) | Amazon OpenSearch Service | Query languages completely different (KQL → OpenSearch DSL); rewrite required |
| Azure Databricks | Amazon EMR / AWS Glue / Databricks on AWS | Databricks runs natively on AWS — direct migration to Databricks on AWS possible |

## Machine Learning & AI

| Azure Service | AWS Service | Notes |
|---|---|---|
| Azure OpenAI Service | Amazon Bedrock | Bedrock supports multiple model families (Claude, Llama, Titan, etc.); API format differs |
| Azure Machine Learning | Amazon SageMaker | Training/inference pipelines rebuilt; experiment tracking and model registry differ |
| Azure Cognitive Services | Rekognition / Comprehend / Polly / Transcribe / Translate | Azure single entry point → AWS multiple purpose-specific services; API-by-API adaptation |
| Azure Bot Service | Amazon Lex | Dialog flows rewritten |

## Security & Identity

| Azure Service | AWS Service | Notes |
|---|---|---|
| Azure Active Directory (Entra ID) | AWS IAM Identity Center | Identity-federation architectures differ significantly; SAML/SCIM integration required or full migration to Identity Center. **Q10 strategy applies.** |
| Azure Key Vault | AWS KMS / AWS Secrets Manager | Key management → KMS; secrets/certs/connection strings → Secrets Manager |
| Microsoft Defender for Cloud | AWS Security Hub / Amazon GuardDuty | Security Hub aggregates findings; GuardDuty detects threats; rebuild security baseline and alerting |
| Azure DDoS Protection | AWS Shield (Standard / Advanced) | Shield Standard is free and auto-enabled; Advanced requires subscription |
| Azure WAF | AWS WAF | Rule formats incompatible; rule sets rewritten |

## Networking

| Azure Service | AWS Service | Notes |
|---|---|---|
| Azure Virtual Network | Amazon VPC | CIDR plans reusable; subnet / route table / security model differs (NSG → Security Group + NACL) |
| Azure Load Balancer | Elastic Load Balancing (NLB) | L4 Azure LB → AWS NLB; health-check config differs |
| Azure Application Gateway | Application Load Balancer (ALB) | L7 LB functionally equivalent; routing-rule syntax differs |
| Azure Private Link | AWS PrivateLink | Private endpoint model similar; service-endpoint config differs |
| Azure VPN Gateway | AWS Site-to-Site VPN | IPsec tunnel parameters reusable; BGP config adjustments required |

## Hybrid & Multi-Cloud

| Azure Service | AWS Service | Notes |
|---|---|---|
| Azure Arc | AWS Systems Manager / EKS Anywhere | Arc unified management plane → SSM (servers) + EKS Anywhere (K8s) separately |
| Azure Stack | AWS Outposts | On-prem hardware model; procurement and deployment completely different |
| Azure Stack HCI | AWS Outposts servers | HCI hyperconverged → Outposts servers; spec and management differ |

## DevOps & Management

| Azure Service | AWS Service | Notes |
|---|---|---|
| Azure DevOps | AWS CodePipeline / CodeBuild / CodeDeploy | Azure DevOps all-in-one → AWS split into separate services; pipelines completely rewritten |
| Azure Monitor | Amazon CloudWatch | Metrics / logs / alarms equivalent; query language differs (Kusto → CloudWatch Insights) |
| Azure Resource Manager (ARM) | AWS CloudFormation / AWS CDK | ARM templates → CloudFormation or CDK; not directly convertible |
| Azure Policy | AWS Config / AWS Organizations SCP | Compliance policies rebuilt; SCPs for org-level boundaries, Config Rules for resource compliance |

---

## Appendix: Migration Complexity Ratings

See `complexity-ratings.md` for the full rationale and migration strategy per complexity level.

| Azure Service | AWS Service | Complexity | Brief Reason |
|---|---|---|---|
| Azure Region / AZ | AWS Region / AZ | Low | Concepts directly correspond; region selection only |
| ExpressRoute | Direct Connect | Medium | Carrier re-contract; physical delivery lead time |
| Azure DNS / Traffic Manager | Route 53 | Low | DNS records exportable; routing-policy syntax mapping simple |
| Azure Front Door | Global Accelerator + CloudFront | Medium | Splits into multiple AWS services |
| Azure Virtual WAN | Transit Gateway / Cloud WAN | High | Global network topology redesigned |
| Azure Virtual Machines | Amazon EC2 | Low | Instance-type mapping clear; VM Import/Export available |
| Azure Spot VMs | EC2 Spot | Low | Concepts equivalent; interruption handling minor tweak |
| Azure Container Registry | Amazon ECR | Low | Image push migration; permission policy rewrite |
| Azure Kubernetes Service | Amazon EKS | Medium | Most workload YAML reusable; network/storage/IAM integration adjusted |
| Azure Container Apps / ACI | ECS / Fargate | Medium | Different deployment model; task definitions rewritten |
| Azure Functions | AWS Lambda | Medium | Trigger bindings and handler model rewritten; cold-start differs |
| Azure Blob / ADLS | Amazon S3 | Medium | Large-data migrations take time; API incompatibility requires code changes |
| Azure Managed Disks | Amazon EBS | Low | Disk snapshots migratable |
| Azure Files | EFS / FSx for Windows | Low | Protocol-equivalent; DataSync available |
| Azure SQL Database | RDS for SQL Server / Aurora | Medium | Schema compatible; stored procedures / CLR features need validation. **Q9 applies.** |
| Azure Cosmos DB | Amazon DynamoDB | High | Multi-model API → KV-only; data model must be fully redesigned |
| Azure Database for MySQL | RDS / Aurora MySQL | Low | DMS-supported; version compat verification |
| Azure Database for PostgreSQL | RDS / Aurora PostgreSQL | Low | DMS-supported; extension compat verification |
| Azure Cache for Redis | ElastiCache for Redis | Low | Data migratable via RDB/AOF |
| Azure Synapse Analytics | Amazon Redshift | High | SQL dialect, storage format, pipeline integration all rebuilt |
| Azure Data Factory | AWS Glue | High | ETL pipelines completely rewritten |
| Azure Stream Analytics | Amazon Kinesis | Medium | Stream logic migrated from ASA SQL to Flink |
| Azure Databricks | EMR / Glue / Databricks on AWS | Low | Direct migration to Databricks on AWS preserves compatibility |
| Power BI | Amazon QuickSight | High | Reports fully rebuilt; no automated conversion tooling |
| Azure OpenAI Service | Amazon Bedrock | Medium | API format differs; prompt engineering reusable; integration code adapted |
| Azure Machine Learning | Amazon SageMaker | High | Training pipelines, model registry, inference endpoints all rebuilt |
| Azure Cognitive Services | Rekognition / Comprehend / Polly / etc. | Medium | Split into multiple services; API-by-API adaptation |
| Azure AD (Entra ID) | IAM Identity Center | High | Core identity component; broad impact; requires careful planning. **Q10 applies.** |
| Azure Key Vault | KMS / Secrets Manager | Medium | Key rotation and access policies rebuilt |
| Defender for Cloud | Security Hub / GuardDuty | Medium | Security baseline and alerting rules rebuilt |
| Azure Virtual Network | Amazon VPC | Low | Network concepts equivalent; CIDRs reusable |
| Azure Load Balancer | ELB (NLB) | Low | Config mapping direct |
| Azure Private Link | AWS PrivateLink | Low | Endpoint configuration similar |
| Azure DevOps | CodePipeline / CodeBuild / CodeDeploy | High | CI/CD pipelines completely rewritten |
| Azure Monitor | Amazon CloudWatch | Medium | Metrics/logs concepts equivalent; query language and alerting rules rewritten |
| Azure Resource Manager | CloudFormation / CDK | High | IaC templates incompatible; rewrite required |
| Azure Policy | Config / SCP | Medium | Compliance policies rebuilt |
| Azure Arc | SSM / EKS Anywhere | Medium | Different hybrid-management model |
| Azure Stack / Stack HCI | AWS Outposts | High | Hardware platform change; completely different deployment flow |
