# Migration Complexity Ratings

> Per-service complexity assessment for Azure-to-AWS migration.
> Ratings drive Phase 3 (Design) routing: **Low** → fast-path auto-mapping, **Medium** → rubric evaluation, **High** → special handling + PoC.

---

## Low Complexity (~15 services)

Direct 1:1 mapping. Minimal code changes, well-documented migration paths.

| Azure Service | AWS Target | Key Notes |
|---------------|------------|-----------|
| Azure Region / AZ | AWS Region / AZ | Select region; concepts map directly |
| Azure DNS / Traffic Manager | Route 53 | DNS records exportable; routing policies map simply |
| Azure Virtual Machines | Amazon EC2 | Instance type mapping clear; VM Import/Export available |
| Azure Spot VMs | EC2 Spot | Concept equivalent; minor interrupt-handling adjustments |
| Azure Container Registry | Amazon ECR | Push images directly; rewrite IAM policies |
| Azure Managed Disks | Amazon EBS | Snapshot-based migration; type mapping: Premium SSD→gp3/io2, Standard HDD→st1 |
| Azure Files | EFS / FSx for Windows | Protocol-matched: NFS→EFS, SMB→FSx; DataSync for transfer |
| Azure NetApp Files | FSx for NetApp ONTAP | High feature parity; NetApp native protocol compatible |
| Azure Database for MySQL | RDS / Aurora MySQL | DMS direct migration; verify version compatibility |
| Azure Database for PostgreSQL | RDS / Aurora PostgreSQL | DMS direct migration; verify extension compatibility |
| Azure Cache for Redis | ElastiCache for Redis | RDB/AOF data migration; reconfigure cluster topology |
| Azure Databricks | EMR / Glue / Databricks on AWS | Can migrate to Databricks on AWS directly (preserves compatibility) |
| Azure Virtual Network | Amazon VPC | CIDR reusable; NSG→Security Group + NACL |
| Azure Load Balancer | ELB (NLB) | L4 config maps directly |
| Azure Private Link | AWS PrivateLink | Endpoint configuration similar |
| Azure Batch | AWS Batch | Functional parity; rewrite job definitions |

**Design action**: Apply `fast-path.md` mapping table. No rubric needed.

---

## Medium Complexity (~13 services)

Requires rubric evaluation (6 dimensions). Some code changes, configuration rewrite, or data format adaptation.

| Azure Service | AWS Target | Key Risk | Suggested Strategy |
|---------------|------------|----------|-------------------|
| ExpressRoute | Direct Connect | New ISP contract, physical link lead time | Plan 4-8 weeks for circuit provisioning |
| Azure Front Door | CloudFront + Global Accelerator + WAF | One Azure service → multiple AWS services | Map features individually; may simplify |
| Azure Kubernetes Service (AKS) | Amazon EKS | Network plugin (Azure CNI→VPC CNI), RBAC, Ingress | Workload YAML mostly reusable; test networking |
| Azure Container Apps / ACI | ECS / Fargate | Deployment model rewrite | Rewrite task definitions; map scaling rules |
| Azure Functions | AWS Lambda | Trigger bindings, handler model, cold start | Rewrite handlers; map triggers individually |
| Azure Blob / ADLS | Amazon S3 | API incompatible; large data volume transfer | Rewrite SDK calls; use DataSync/Snow for bulk |
| Azure SQL Database | RDS for SQL Server / Aurora | Stored procedures, CLR, License implications | Evaluate Q9 strategy; test SP compatibility |
| Azure Stream Analytics | Amazon Kinesis | Query language migration (ASA SQL→Flink) | Rewrite stream processing logic |
| Azure OpenAI Service | Amazon Bedrock | API format difference; multi-model access | Rewrite API integration; prompts reusable |
| Azure Cognitive Services | Rekognition / Comprehend / Polly / etc. | Single Azure entry → multiple AWS services | Map per-capability; rewrite API calls |
| Azure Key Vault | KMS / Secrets Manager | Key rotation policies, access policies | Split: keys→KMS, secrets→Secrets Manager |
| Defender for Cloud | Security Hub / GuardDuty | Security baseline and alert rules | Rebuild compliance baselines |
| Azure Monitor | Amazon CloudWatch | Query language (Kusto→CloudWatch Insights) | Rewrite queries and alert rules |
| Azure Policy | Config / SCP | Compliance policy rebuild | Map policies individually |
| Azure Arc | SSM / EKS Anywhere | Hybrid management model difference | Plan per-workload type |

**Design action**: Apply category-specific rubric from `design-refs/`. Human confirmation recommended for services marked "Key Risk".

---

## High Complexity (~9 services)

Requires special handling, PoC validation, or significant re-architecture. Often involves data model changes, ecosystem re-integration, or organizational impact.

| Azure Service | AWS Target | Key Risk | Suggested Strategy |
|---------------|------------|----------|-------------------|
| Azure Virtual WAN | Transit Gateway / Cloud WAN | Global network topology redesign | Dedicated network workstream; PoC required |
| Azure Cosmos DB | Amazon DynamoDB | Multi-model API → single KV/document model; consistency model differences | Full data modeling rework; PoC mandatory |
| Azure Synapse Analytics | Amazon Redshift | SQL dialect, storage format, pipeline integration | Rewrite queries + pipelines; parallel run recommended |
| Azure Data Factory | AWS Glue | ETL pipeline definitions incompatible | Rewrite all jobs in PySpark/Python |
| Power BI | Amazon QuickSight | Reports need full rebuild; no auto-conversion | Budget for report recreation; train analysts |
| Azure Machine Learning | Amazon SageMaker | Training pipeline, model registry, inference endpoints | Rebuild ML platform; significant effort |
| Azure AD (Entra ID) | IAM Identity Center | Core identity system; affects all service auth | Dedicated identity workstream; phased migration |
| Azure DevOps | CodePipeline / CodeBuild / CodeDeploy | Full CI/CD pipeline rewrite | Consider GitHub Actions as alternative |
| Azure Resource Manager (ARM) | CloudFormation / CDK | IaC templates incompatible | Full rewrite; consider CDK for maintainability |
| Azure Stack / Stack HCI | AWS Outposts | Hardware platform replacement | Long lead time; procurement + deployment planning |

**Design action**: Create dedicated assessment section per service. Require PoC validation before committing to migration wave. Flag in execution plan as critical-path items.

---

## Complexity Distribution Summary

| Complexity | Count | Design Path | Typical Effort per Service |
|------------|-------|-------------|---------------------------|
| **Low** | ~15 | `fast-path.md` auto-mapping | Hours |
| **Medium** | ~13 | Category rubric + human review | Days |
| **High** | ~9 | Special handling + PoC | Weeks |

> Use this rating table during Phase 3 (Design) to route each discovered Azure service to the appropriate mapping strategy.
