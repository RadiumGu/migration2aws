# Azure-to-AWS Service Mapping

> **用途：** 此文档用于 Kiro CLI agent 在 Azure-to-AWS 迁移评估中快速查找服务映射关系。每个映射包含迁移注意事项。
>
> **使用方式：** 按服务类别查表，或搜索具体 Azure/AWS 服务名称。末尾附录提供迁移复杂度评级。

---

## Global Infrastructure

| Azure Service | AWS Service | Notes |
|---|---|---|
| Azure Region | AWS Region | 区域分布不完全对等，需确认目标区域服务可用性 |
| Availability Zones | Availability Zones | 概念一致，但 AZ 数量和命名不同 |
| Point-of-Presence | CloudFront Edge Locations | AWS 边缘节点数量更多，覆盖范围有差异 |
| Azure Extended Zones | Local Zones / Wavelength Zones | Local Zones 用于低延迟扩展；Wavelength 用于 5G 边缘 |
| ExpressRoute | AWS Direct Connect | 专线供应商和接入点不同，需重新签约 |
| Azure DNS; Traffic Manager | Amazon Route 53 | Route 53 同时提供 DNS 托管和流量路由策略 |
| Azure Front Door | AWS Global Accelerator | Front Door 含 CDN+WAF；AWS 侧可能需 CloudFront + Global Accelerator + WAF 组合 |
| Azure Virtual WAN | AWS Transit Gateway / AWS Cloud WAN | Cloud WAN 提供全局网络编排，Transit Gateway 区域级互联 |

## Compute

| Azure Service | AWS Service | Notes |
|---|---|---|
| Azure Virtual Machines | Amazon EC2 | 实例类型映射需逐一对照，命名体系不同 |
| Azure Spot Virtual Machines | Amazon EC2 Spot | 中断机制类似，定价模型和回收通知时间有差异 |
| Azure Cobalt / Ampere Altra VMs | AWS Graviton (EC2) | 均为 Arm 架构；应用需验证 Arm 兼容性 |
| Azure Confidential VMs | AWS Nitro Enclaves | 安全计算模型不同：Azure 用 SEV-SNP，AWS 用 Nitro Enclave 隔离 |
| Azure Batch | AWS Batch | 功能对等，作业定义格式需转换 |
| Azure CycleCloud | AWS ParallelCluster | HPC 集群编排，调度器配置需重写 |
| Azure Container Registry | Amazon ECR | 镜像可直接推送迁移，权限模型不同（ACR RBAC → ECR IAM Policy） |
| Azure Kubernetes Service (AKS) | Amazon EKS | 控制面托管方式类似；网络插件（Azure CNI → VPC CNI）、RBAC 集成、Ingress 配置均需调整 |
| Open Service Mesh on AKS | AWS App Mesh | 服务网格实现不同，需重写 mesh 配置和 sidecar 注入策略 |
| Azure Container Apps; Azure Container Instances | Amazon ECS; AWS Fargate | Container Apps → ECS + Fargate（Serverless）；ACI → Fargate 单任务模式 |
| Azure Functions | AWS Lambda | 触发器绑定、运行时版本、冷启动特性均有差异；代码需适配 Lambda handler 模型 |
| Azure VMware Solution | AWS VMware Migration Pathways / Amazon EVS | VMware 工作负载迁移路径不同，EVS 为新选项 |
| Azure Boost | AWS Nitro | 底层加速平台，非用户直接配置项 |

## Storage

| Azure Service | AWS Service | Notes |
|---|---|---|
| Azure Blob Storage; ADLS | Amazon S3 | API 不兼容，需改写 SDK 调用；ADLS 分层命名空间对应 S3 前缀 + Glue Catalog |
| Azure Archive Storage | Amazon S3 Glacier | 取回时间和定价模型不同（Glacier Flexible / Deep Archive） |
| Azure Managed Disks | Amazon EBS | 磁盘类型映射：Premium SSD → gp3/io2，Standard HDD → st1 |
| Azure Files | Amazon EFS; Amazon FSx for Windows | SMB 共享 → FSx for Windows；NFS 共享 → EFS |
| Azure NetApp Files | Amazon FSx for NetApp ONTAP | 功能高度对等，NetApp 原生协议兼容 |
| Azure Managed Lustre | Amazon FSx for Lustre | HPC 文件系统，性能配置参数需重新调优 |
| Azure Site Recovery | AWS Elastic Disaster Recovery (DRS) | 复制代理和故障切换流程不同 |
| Azure Backup | AWS Backup | 备份策略和保留规则需重建 |

## Databases

| Azure Service | AWS Service | Notes |
|---|---|---|
| Azure SQL Database / SQL Managed Instance | Amazon RDS for SQL Server / Amazon Aurora | Aurora 兼容 MySQL/PostgreSQL 而非 SQL Server；如需 SQL Server 兼容用 RDS for SQL Server |
| Azure Cosmos DB | Amazon DynamoDB | 数据模型差异大：Cosmos 多模型 API → DynamoDB 仅 KV/文档；一致性模型不同 |
| Azure Database for MySQL | Amazon RDS for MySQL / Aurora MySQL | 迁移相对直接，注意版本兼容和参数组差异 |
| Azure Database for PostgreSQL | Amazon RDS for PostgreSQL / Aurora PostgreSQL | 迁移相对直接，注意扩展插件兼容性 |
| Azure Cache for Redis | Amazon ElastiCache for Redis | 功能对等，集群拓扑和参数组需重新配置 |
| Azure Database Migration Service | AWS DMS | 异构迁移工具，CDC 配置和端点定义需重写 |

## Analytics & BI

| Azure Service | AWS Service | Notes |
|---|---|---|
| Azure Synapse Analytics | Amazon Redshift | 计算模型不同（Synapse Serverless/Dedicated → Redshift Serverless/Provisioned）；SQL 方言有差异 |
| Azure Data Factory | AWS Glue | ETL 管道定义不兼容，需重写作业逻辑；Glue 用 PySpark/Python |
| Azure Stream Analytics | Amazon Kinesis (Data Streams + Data Analytics) | 流处理查询语言不同（SQL-like → Flink SQL 或 KCL） |
| Azure HDInsight | Amazon EMR | Hadoop/Spark 生态对等，集群配置和引导脚本需适配 |
| Power BI | Amazon QuickSight | 报表和仪表盘需重建，数据源连接需重新配置 |
| Azure Data Explorer (Kusto) | Amazon OpenSearch Service | 查询语言完全不同（KQL → OpenSearch DSL），需重写查询 |
| Azure Databricks | Amazon EMR / AWS Glue | Databricks 也可在 AWS 上原生运行，可考虑直接迁移到 Databricks on AWS |

## Machine Learning & AI

| Azure Service | AWS Service | Notes |
|---|---|---|
| Azure OpenAI Service | Amazon Bedrock | Bedrock 支持多模型（Claude、Llama、Titan 等）；API 格式不同 |
| Azure Machine Learning | Amazon SageMaker | 训练/推理管道需重建；实验跟踪和模型注册机制不同 |
| Azure Cognitive Services | Amazon Rekognition / Comprehend / Polly / Transcribe / Translate | Azure 单入口 → AWS 按功能拆分为独立服务，API 逐一对接 |
| Azure Bot Service | Amazon Lex | 对话流定义需重写 |

## Security & Identity

| Azure Service | AWS Service | Notes |
|---|---|---|
| Azure Active Directory (Entra ID) | AWS IAM Identity Center | 身份联合架构差异大；需配置 SAML/SCIM 集成或迁移到 Identity Center |
| Azure Key Vault | AWS KMS / AWS Secrets Manager | 密钥管理 → KMS；密钥/证书/连接字符串 → Secrets Manager |
| Microsoft Defender for Cloud | AWS Security Hub / Amazon GuardDuty | Security Hub 聚合发现，GuardDuty 威胁检测；需重建安全基线和告警规则 |
| Azure DDoS Protection | AWS Shield (Standard / Advanced) | Shield Standard 免费自动启用；Advanced 需额外订阅 |
| Azure WAF | AWS WAF | 规则格式不兼容，需重写 WAF 规则集 |

## Networking

| Azure Service | AWS Service | Notes |
|---|---|---|
| Azure Virtual Network | Amazon VPC | CIDR 规划可复用，但子网/路由表/安全组模型有差异（NSG → Security Group + NACL） |
| Azure Load Balancer | Elastic Load Balancing (NLB) | Azure LB L4 → AWS NLB；注意健康检查配置差异 |
| Azure Application Gateway | Application Load Balancer (ALB) | L7 负载均衡功能对等，路由规则语法不同 |
| Azure Private Link | AWS PrivateLink | 私有端点连接模式类似，服务端点配置不同 |
| Azure VPN Gateway | AWS Site-to-Site VPN | IPSec 隧道参数可复用，BGP 配置需调整 |

## Hybrid & Multicloud

| Azure Service | AWS Service | Notes |
|---|---|---|
| Azure Arc | AWS Systems Manager / EKS Anywhere | Arc 统一管理面 → SSM（服务器）+ EKS Anywhere（K8s）分别覆盖 |
| Azure Stack | AWS Outposts | 本地硬件托管模式，硬件采购和部署流程完全不同 |
| Azure Stack HCI | AWS Outposts servers | HCI 超融合 → Outposts servers，规格和管理方式不同 |

## DevOps & Management

| Azure Service | AWS Service | Notes |
|---|---|---|
| Azure DevOps | AWS CodePipeline / CodeBuild / CodeDeploy | Azure DevOps 全家桶 → AWS 拆分为独立服务；管道定义需完全重写 |
| Azure Monitor | Amazon CloudWatch | 指标/日志/告警概念对等，查询语言不同（Kusto → CloudWatch Insights） |
| Azure Resource Manager (ARM) | AWS CloudFormation / AWS CDK | ARM 模板 → CloudFormation 模板或 CDK 代码，不可直接转换 |
| Azure Policy | AWS Config / AWS Organizations SCP | 合规策略需重建；SCP 用于组织级权限边界，Config Rules 用于资源合规检测 |

---

## 附录：迁移复杂度评级

| Azure Service | AWS Service | 复杂度 | 原因简述 |
|---|---|---|---|
| Azure Region / AZ | AWS Region / AZ | Low | 概念直接对应，选区域即可 |
| ExpressRoute | Direct Connect | Medium | 需重新签约专线供应商，物理链路交付周期长 |
| Azure DNS / Traffic Manager | Route 53 | Low | DNS 记录可导出导入，路由策略语法简单映射 |
| Azure Front Door | Global Accelerator + CloudFront | Medium | 需拆分为多个 AWS 服务组合 |
| Azure Virtual WAN | Transit Gateway / Cloud WAN | High | 全局网络拓扑需重新设计 |
| Azure Virtual Machines | Amazon EC2 | Low | 实例类型映射清晰，VM Import/Export 可用 |
| Azure Spot VMs | EC2 Spot | Low | 概念对等，中断处理逻辑微调 |
| Azure Container Registry | Amazon ECR | Low | 镜像推送迁移，权限策略重写 |
| Azure Kubernetes Service | Amazon EKS | Medium | 工作负载 YAML 大部分可复用，网络/存储/IAM 集成需调整 |
| Azure Container Apps / ACI | ECS / Fargate | Medium | 部署模型不同，需重写任务定义 |
| Azure Functions | AWS Lambda | Medium | 触发器绑定和 handler 模型需重写，冷启动特性不同 |
| Azure Blob / ADLS | Amazon S3 | Medium | 数据量大时迁移耗时，API 不兼容需改代码 |
| Azure Managed Disks | Amazon EBS | Low | 磁盘快照可迁移 |
| Azure Files | EFS / FSx for Windows | Low | 协议对等，数据同步工具可用（DataSync） |
| Azure SQL Database | RDS for SQL Server / Aurora | Medium | Schema 兼容但需验证存储过程/CLR 等特性 |
| Azure Cosmos DB | Amazon DynamoDB | High | 多模型 API → 单一 KV 模型，数据建模需完全重做 |
| Azure Database for MySQL | RDS / Aurora MySQL | Low | DMS 可直接迁移，版本兼容性验证 |
| Azure Database for PostgreSQL | RDS / Aurora PostgreSQL | Low | DMS 可直接迁移，扩展插件兼容性验证 |
| Azure Cache for Redis | ElastiCache for Redis | Low | 数据可通过 RDB/AOF 迁移 |
| Azure Synapse Analytics | Amazon Redshift | High | SQL 方言、存储格式、管道集成均需重做 |
| Azure Data Factory | AWS Glue | High | ETL 管道定义完全不兼容，逻辑需重写 |
| Azure Stream Analytics | Amazon Kinesis | Medium | 流处理逻辑需从 ASA SQL 迁移到 Flink |
| Azure Databricks | EMR / Glue / Databricks on AWS | Low | 可直接迁移到 Databricks on AWS 保留兼容性 |
| Power BI | Amazon QuickSight | High | 报表需完全重建，无自动转换工具 |
| Azure OpenAI Service | Amazon Bedrock | Medium | API 格式不同，prompt 工程可复用，集成代码需改 |
| Azure Machine Learning | Amazon SageMaker | High | 训练管道、模型注册、推理端点均需重建 |
| Azure Cognitive Services | Rekognition / Comprehend / Polly / etc. | Medium | 拆分为多个服务，API 逐一适配 |
| Azure AD (Entra ID) | IAM Identity Center | High | 身份体系核心组件，影响面广，需周密规划 |
| Azure Key Vault | KMS / Secrets Manager | Medium | 密钥轮换策略和访问策略需重建 |
| Defender for Cloud | Security Hub / GuardDuty | Medium | 安全基线和告警规则需重建 |
| Azure Virtual Network | Amazon VPC | Low | 网络概念对等，CIDR 可复用 |
| Azure Load Balancer | ELB (NLB) | Low | 配置映射直接 |
| Azure Private Link | AWS PrivateLink | Low | 端点配置方式类似 |
| Azure DevOps | CodePipeline / CodeBuild / CodeDeploy | High | CI/CD 管道需完全重写 |
| Azure Monitor | Amazon CloudWatch | Medium | 指标/日志概念对等，查询语言和告警规则需重写 |
| Azure Resource Manager | CloudFormation / CDK | High | IaC 模板不兼容，需完全重写 |
| Azure Policy | Config / SCP | Medium | 合规策略需重建 |
| Azure Arc | SSM / EKS Anywhere | Medium | 混合管理模型不同 |
| Azure Stack / Stack HCI | AWS Outposts | High | 硬件平台更换，部署流程完全不同 |
