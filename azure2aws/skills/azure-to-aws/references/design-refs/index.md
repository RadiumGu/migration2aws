# Azure Resource Type → Design Reference Index

Routing table for Phase 3 Design Pass 2 (rubric-based selection). For each Azure resource type, the design agent loads the corresponding rubric file.

**Usage**:
1. Extract Azure `type` from inventory (e.g., `Microsoft.Compute/virtualMachines`).
2. Check `fast-path.md` first — if deterministic mapping exists, use it (no rubric required).
3. Otherwise, locate the resource type in the tables below and load the referenced rubric file.
4. Apply the 6-criteria rubric in that file.

---

## Compute Services

| Azure Type | Example Resource | Reference File | Fast-Path Target |
|-----------|------------------|----------------|------------------|
| `Microsoft.Compute/virtualMachines` | Standard VM | `compute.md` | EC2 |
| `Microsoft.Compute/virtualMachineScaleSets` | VMSS | `compute.md` | EC2 Auto Scaling Group |
| `Microsoft.Compute/availabilitySets` | Availability Set | `compute.md` | Placement Group (conceptual) |
| `Microsoft.Compute/images` | Custom image | `compute.md` | AMI |
| `Microsoft.Web/sites` | App Service / Web App | `compute.md` | Fargate / Elastic Beanstalk |
| `Microsoft.Web/sites` (Functions) | Azure Functions | `compute.md` | Lambda |
| `Microsoft.ContainerService/managedClusters` | AKS | `compute.md` | EKS |
| `Microsoft.ContainerInstance/containerGroups` | Azure Container Instances | `compute.md` | Fargate |
| `Microsoft.App/containerApps` | Container Apps | `compute.md` | ECS Fargate |
| `Microsoft.App/managedEnvironments` | Container Apps environment | `compute.md` | ECS Cluster |
| `Microsoft.Batch/batchAccounts` | Azure Batch | `compute.md` | AWS Batch |
| `Microsoft.ServiceFabric/*` | Service Fabric | `compute.md` | EKS / ECS |

## Database Services

| Azure Type | Example Resource | Reference File | Fast-Path Target |
|-----------|------------------|----------------|------------------|
| `Microsoft.Sql/servers` | Azure SQL logical server | `database.md` | RDS for SQL Server / Aurora (per Q9) |
| `Microsoft.Sql/servers/databases` | Azure SQL database | `database.md` | RDS for SQL Server / Aurora (per Q9) |
| `Microsoft.Sql/managedInstances` | SQL Managed Instance | `database.md` | RDS for SQL Server (per Q9) |
| `Microsoft.DocumentDB/databaseAccounts` | Cosmos DB | `database.md` | DynamoDB / DocumentDB (depends on API) |
| `Microsoft.DBforMySQL/servers` | Azure Database for MySQL (Single) | `database.md` | RDS MySQL / Aurora MySQL |
| `Microsoft.DBforMySQL/flexibleServers` | Azure Database for MySQL (Flexible) | `database.md` | Aurora MySQL |
| `Microsoft.DBforPostgreSQL/servers` | Azure Database for PostgreSQL (Single) | `database.md` | RDS PostgreSQL / Aurora PostgreSQL |
| `Microsoft.DBforPostgreSQL/flexibleServers` | Azure Database for PostgreSQL (Flexible) | `database.md` | Aurora PostgreSQL |
| `Microsoft.Cache/Redis` | Azure Cache for Redis | `database.md` | ElastiCache Redis |
| `Microsoft.DataFactory/factories` | Azure Data Factory | `analytics.md` (cross-ref) | AWS Glue |

## Storage Services

| Azure Type | Example Resource | Reference File | Fast-Path Target |
|-----------|------------------|----------------|------------------|
| `Microsoft.Storage/storageAccounts` (Blob) | Blob container | `storage.md` | S3 |
| `Microsoft.Storage/storageAccounts` (ADLS Gen2) | Hierarchical namespace | `storage.md` | S3 + Glue Catalog |
| `Microsoft.Storage/storageAccounts` (File) | File share | `storage.md` | FSx for Windows / EFS |
| `Microsoft.Storage/storageAccounts` (Queue) | Storage Queue | `storage.md` (cross-ref `integration.md`) | SQS |
| `Microsoft.Storage/storageAccounts` (Table) | Storage Table | `storage.md` (cross-ref `database.md`) | DynamoDB |
| `Microsoft.Compute/disks` | Managed Disk | `storage.md` | EBS |
| `Microsoft.Compute/snapshots` | Disk Snapshot | `storage.md` | EBS Snapshot |
| `Microsoft.NetApp/netAppAccounts` | Azure NetApp Files | `storage.md` | FSx for NetApp ONTAP |
| `Microsoft.StorageSync/*` | Azure File Sync | `storage.md` | DataSync / Storage Gateway |
| `Microsoft.DataShare/*` | Azure Data Share | `storage.md` | S3 Data Share / AWS Data Exchange |

## Networking Services

| Azure Type | Example Resource | Reference File | Fast-Path Target |
|-----------|------------------|----------------|------------------|
| `Microsoft.Network/virtualNetworks` | VNet | `networking.md` | VPC |
| `Microsoft.Network/virtualNetworks/subnets` | Subnet | `networking.md` | VPC Subnet |
| `Microsoft.Network/networkSecurityGroups` | NSG | `networking.md` | Security Group + NACL |
| `Microsoft.Network/loadBalancers` | Azure Load Balancer (L4) | `networking.md` | NLB |
| `Microsoft.Network/applicationGateways` | Application Gateway (L7) | `networking.md` | ALB |
| `Microsoft.Network/frontDoors` | Azure Front Door (classic) | `networking.md` | CloudFront + Global Accelerator + WAF |
| `Microsoft.Cdn/profiles` (AFD Premium/Standard) | Front Door Standard/Premium | `networking.md` | CloudFront + Global Accelerator + WAF |
| `Microsoft.Network/dnszones` | Azure DNS (public) | `networking.md` | Route 53 Public Hosted Zone |
| `Microsoft.Network/privateDnsZones` | Private DNS Zone | `networking.md` | Route 53 Private Hosted Zone |
| `Microsoft.Network/trafficmanagerprofiles` | Traffic Manager | `networking.md` | Route 53 Traffic Policy |
| `Microsoft.Network/virtualNetworkGateways` | VPN Gateway | `networking.md` | Site-to-Site VPN |
| `Microsoft.Network/expressRouteCircuits` | ExpressRoute | `networking.md` | Direct Connect |
| `Microsoft.Network/virtualWans` | Virtual WAN | `networking.md` | Transit Gateway / Cloud WAN |
| `Microsoft.Network/privateEndpoints` | Private Endpoint | `networking.md` | VPC PrivateLink endpoint |
| `Microsoft.Network/natGateways` | NAT Gateway | `networking.md` | NAT Gateway |
| `Microsoft.Network/bastionHosts` | Azure Bastion | `networking.md` | Systems Manager Session Manager |

## Security & Identity

| Azure Type | Example Resource | Reference File | Fast-Path Target |
|-----------|------------------|----------------|------------------|
| Entra ID (tenant) | Azure AD directory | `security-identity.md` | IAM Identity Center (per Q10) |
| `Microsoft.ManagedIdentity/userAssignedIdentities` | Managed Identity | `security-identity.md` | IAM Role (trust policy per service) |
| `Microsoft.KeyVault/vaults` | Key Vault | `security-identity.md` | KMS + Secrets Manager (split) |
| `Microsoft.Network/frontdoorWebApplicationFirewallPolicies` | Front Door WAF | `security-identity.md` | AWS WAF (WebACL for CloudFront) |
| `Microsoft.Network/applicationGatewayWebApplicationFirewallPolicies` | App Gateway WAF | `security-identity.md` | AWS WAF (WebACL for ALB) |
| `Microsoft.Security/*` | Defender for Cloud | `security-identity.md` | Security Hub + GuardDuty |
| `Microsoft.Authorization/roleAssignments` | RBAC | `security-identity.md` | IAM policy attachment |

## Integration & Messaging

| Azure Type | Example Resource | Reference File | Fast-Path Target |
|-----------|------------------|----------------|------------------|
| `Microsoft.ServiceBus/namespaces` | Service Bus namespace | `integration.md` | SQS + SNS |
| `Microsoft.ServiceBus/namespaces/queues` | Service Bus queue | `integration.md` | SQS (FIFO if ordered) |
| `Microsoft.ServiceBus/namespaces/topics` | Service Bus topic | `integration.md` | SNS |
| `Microsoft.EventHub/namespaces` | Event Hubs | `integration.md` | Kinesis Data Streams / MSK |
| `Microsoft.EventGrid/topics` | Event Grid custom topic | `integration.md` | EventBridge custom bus |
| `Microsoft.EventGrid/systemTopics` | Event Grid system topic | `integration.md` | EventBridge + partner source |
| `Microsoft.Logic/workflows` | Logic Apps | `integration.md` | Step Functions |
| `Microsoft.ApiManagement/service` | API Management | `integration.md` | API Gateway |
| `Microsoft.Relay/*` | Azure Relay | `integration.md` | PrivateLink / VPC endpoint |

## Analytics & BI

| Azure Type | Example Resource | Reference File | Fast-Path Target |
|-----------|------------------|----------------|------------------|
| `Microsoft.Synapse/workspaces` | Synapse Analytics | `analytics.md` | Redshift / EMR / Glue |
| `Microsoft.HDInsight/clusters` | HDInsight | `analytics.md` | EMR |
| `Microsoft.Databricks/workspaces` | Azure Databricks | `analytics.md` | Databricks on AWS / EMR |
| `Microsoft.StreamAnalytics/streamingjobs` | Stream Analytics | `analytics.md` | Kinesis Data Analytics (Flink) |
| `Microsoft.DataFactory/factories` | Data Factory | `analytics.md` | AWS Glue + Step Functions |
| `Microsoft.Kusto/clusters` | Azure Data Explorer (Kusto) | `analytics.md` | OpenSearch / Timestream |
| Power BI (tenant-level) | Power BI workspace | `analytics.md` | QuickSight |

## AI / ML

| Azure Type | Example Resource | Reference File | Fast-Path Target |
|-----------|------------------|----------------|------------------|
| `Microsoft.CognitiveServices/accounts` (OpenAI) | Azure OpenAI | `ai-ml.md` | Bedrock |
| `Microsoft.CognitiveServices/accounts` (ComputerVision) | Computer Vision | `ai-ml.md` | Rekognition |
| `Microsoft.CognitiveServices/accounts` (TextAnalytics) | Text Analytics | `ai-ml.md` | Comprehend |
| `Microsoft.CognitiveServices/accounts` (SpeechServices) | Speech Service | `ai-ml.md` | Polly / Transcribe |
| `Microsoft.CognitiveServices/accounts` (Translator) | Translator | `ai-ml.md` | Translate |
| `Microsoft.CognitiveServices/accounts` (FormRecognizer) | Form Recognizer | `ai-ml.md` | Textract |
| `Microsoft.MachineLearningServices/workspaces` | Azure ML workspace | `ai-ml.md` | SageMaker |
| `Microsoft.BotService/botServices` | Azure Bot Service | `ai-ml.md` | Lex |
| `Microsoft.Search/searchServices` | Cognitive Search | `ai-ml.md` | OpenSearch + Kendra |

## DevOps & Management

| Azure Type | Example Resource | Reference File | Fast-Path Target |
|-----------|------------------|----------------|------------------|
| Azure DevOps (organization) | DevOps org | `devops.md` | CodePipeline + CodeBuild + CodeDeploy + CodeArtifact |
| `Microsoft.DevTestLab/*` | DevTest Labs | `devops.md` | EC2 Instance Scheduler |
| `Microsoft.ContainerRegistry/registries` | Azure Container Registry | `devops.md` | ECR |
| `Microsoft.OperationalInsights/workspaces` | Log Analytics Workspace | `devops.md` | CloudWatch Logs + OpenSearch |
| `Microsoft.Insights/components` | Application Insights | `devops.md` | CloudWatch + X-Ray |
| `Microsoft.Insights/actionGroups` | Action Group | `devops.md` | SNS + EventBridge |
| `Microsoft.Insights/metricAlerts` | Metric Alert | `devops.md` | CloudWatch Alarm |
| `Microsoft.Automation/automationAccounts` | Azure Automation | `devops.md` | Systems Manager Automation |
| `Microsoft.Resources/deployments` | ARM deployment | `devops.md` | CloudFormation Stack |
| Bicep modules | Bicep-sourced ARM | `devops.md` | CDK |
| `Microsoft.PolicyInsights/*`, `Microsoft.Authorization/policy*` | Azure Policy | `devops.md` | AWS Config Rules + SCP |
| `Microsoft.HybridCompute/*` | Azure Arc | `devops.md` | Systems Manager / EKS Anywhere |

## Secondary / Infrastructure

| Azure Type | Example Resource | Reference File | Fast-Path Target |
|-----------|------------------|----------------|------------------|
| `Microsoft.Network/networkInterfaces` | NIC | `networking.md` | ENI (implicit) |
| `Microsoft.Network/publicIPAddresses` | Public IP | `networking.md` | Elastic IP |
| `Microsoft.Network/routeTables` | Route Table | `networking.md` | VPC Route Table |
| `Microsoft.RecoveryServices/vaults` | Recovery Services Vault | `storage.md` | AWS Backup |
| `Microsoft.DataMigration/services` | Database Migration Service | `database.md` | AWS DMS |

---

## Resolution Algorithm

```
def resolve_reference_file(azure_type: str) -> str:
    # 1. Check fast-path.md first
    if azure_type in FAST_PATH_TABLE:
        return "fast-path"  # deterministic, no rubric
    # 2. Check exact type match in this index
    if azure_type in INDEX_TABLE:
        return INDEX_TABLE[azure_type]
    # 3. Check type prefix match (e.g., Microsoft.Compute/*)
    prefix = azure_type.split("/")[0]
    if prefix in PREFIX_TABLE:
        return PREFIX_TABLE[prefix]
    # 4. Name-pattern heuristic
    if "sql" in azure_type.lower() or "db" in azure_type.lower():
        return "database.md"
    if "network" in azure_type.lower() or "vpn" in azure_type.lower():
        return "networking.md"
    if "storage" in azure_type.lower() or "disk" in azure_type.lower():
        return "storage.md"
    # 5. Unresolved — add to warnings, skip
    return None
```
