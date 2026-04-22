# Azure to AWS 迁移评估方法指南

> **版本**：v0.1 | **日期**：2026-04-20 | **状态**：V1.0
>
> 核心工具链：Kiro CLI/IDE + awslabs/mcp 官方 MCP 服务器群 + Azure MCP Server，实现半自动化迁移评估

---

# 第一章：概述与方法论

## 1.1 文档目的

本文档为企业从 Microsoft Azure 迁移到 Amazon Web Services (AWS) 提供系统化的评估方法。覆盖从环境发现、资源清单、服务映射、成本对比到风险评估的完整流程，并给出可直接落地的工具链配置和操作步骤。

**目标读者**：负责迁移项目的架构师、项目经理、运维工程师。

**本文档不覆盖**：具体的迁移执行（Mobilize / Migrate 阶段将在后续章节中展开）。

## 1.2 Agentic Cloud Modernization 方法论

### 1.2.1 传统迁移方法的痛点

传统的云迁移评估流程存在以下瓶颈：

| 痛点 | 典型表现 |
|------|---------|
| **周期长** | 资源发现 + 服务映射 + 成本估算，手动操作通常需要 4–8 周 |
| **文档密集** | 评估报告、架构图、映射表全靠人工编写，耗费大量架构师时间 |
| **开发资源瓶颈** | PoC 验证、IaC 模板编写依赖稀缺的高级工程师 |
| **信息碎片化** | Azure Portal 导出、Excel 手动整理、定价计算器手动查询，数据散落各处 |
| **知识断层** | 团队熟悉 Azure 但不熟悉 AWS，服务映射和最佳实践靠个人经验 |

### 1.2.2 AI 驱动的 Agentic Architecture 方法

 **Agentic Cloud Modernization** 方法论，核心思路是将 AI Agent（Kiro CLI）与一组专用 MCP (Model Context Protocol) Server 组合，形成可编排的自动化评估和实施流水线。

**核心理念**：

- **Agent as Orchestrator**：Kiro CLI 作为中央调度器，通过 MCP 协议连接多个专用工具服务器
- **MCP as Tool Layer**：每个 MCP Server 封装一个特定能力（读 Azure 资源、查 AWS 文档、获取定价、生成 IaC）
- **Human-in-the-Loop**：AI 生成草案，架构师审阅决策，减少重复劳动而非替代判断

### 1.2.3 三阶段框架

```
┌─────────────┐    ┌─────────────┐    ┌──────────────────┐
│  Analysis   │───▶│  Planning   │───▶│ Implementation   │
│  （评估）    │    │  （规划）    │    │  （实施）         │
└─────────────┘    └─────────────┘    └──────────────────┘
  • 环境发现         • 架构设计         • IaC 代码生成
  • 资源清单         • 迁移方案         • 部署验证
  • 服务映射         • 成本优化         • 功能测试
  • 成本评估         • 里程碑规划       • 切换执行
  • 风险评估
```

本文档聚焦 **Analysis（评估）** 阶段。

## 1.3 工具链总览

### 1.3.1 Kiro CLI/IDE

AWS 原生 AI 开发环境，核心能力：

- 集成 MCP Server 管理（通过 `.kiro/settings/mcp.json` 配置）
- 支持自然语言驱动的多工具编排
- 内置代码生成、文档生成、架构图生成能力
- 支持 headless 模式（`kiro-cli chat`）用于 CI/CD 集成

### 1.3.2 AWS MCP Servers（github.com/awslabs/mcp）

AWS 官方维护的 MCP 服务器群，按迁移阶段分组：

| 阶段 | MCP Server | 用途 |
|------|-----------|------|
| **Analysis** | `core-mcp-server` | 基础 AWS 资源操作 |
| **Analysis** | `code-doc-gen-mcp-server` | 代码分析与文档生成 |
| **Analysis** | `aws-diagram-mcp-server` | 架构图生成（Draw.io 格式） |
| **Planning** | `aws-documentation-mcp-server` | 搜索 AWS 官方文档 |
| **Planning** | `aws-knowledge-mcp-server` | AWS 架构知识库查询 |
| **Planning** | `aws-pricing-mcp-server` | 实时定价查询 |
| **Implementation** | `cdk-mcp-server` | AWS CDK 代码生成与验证 |
| **Implementation** | `terraform-mcp-server` | Terraform 代码生成与验证 |
| **Implementation** | `cfn-mcp-server` | CloudFormation 模板操作 |
| **Implementation** | `eks-mcp-server` | EKS 集群与 K8s 资源管理 |

### 1.3.3 Azure MCP Server（github.com/Azure/azure-mcp）

微软官方维护的 Azure MCP Server，提供对 Azure 资源的实时读取能力：

- 读取 Azure 资源状态（VM、Storage、Database、Network 等）
- 查询 Azure Resource Graph
- 获取资源配置详情
- 与 Kiro CLI 集成后可实现跨云查询

### 1.3.4 resource-discovery-for-azure（github.com/awslabs/resource-discovery-for-azure）

AWS 提供的 PowerShell 脚本工具（又名 **CloudRays**），专为迁移评估场景设计：

| 特性 | 说明 |
|------|------|
| **功能** | 扫描 Azure 环境，生成资源清单（Excel + JSON），含 31 天历史指标 |
| **权限要求** | Azure Reader + Billing Reader + Monitoring Reader + Cost Management Reader |
| **运行环境** | Azure Cloud Shell 或本地 PowerShell（需安装 Az 模块） |
| **输出文件** | Inventory JSON、Metrics JSON、Consumption JSON、合并 Excel 报告 |
| **用途** | 评估阶段的数据输入源，提供资源清单和使用量数据 |

**与 Kiro CLI 的配合方式**：

```
resource-discovery-for-azure    Kiro CLI + MCP Servers
         扫描 Azure 环境  ───▶  读取 JSON 数据
         生成 JSON/Excel  ───▶  自动分析 + 生成报告
                                服务映射 + 成本估算
                                架构图生成
```

先用 CloudRays 导出 Azure 环境数据，再让 Kiro CLI 读取 JSON 做自动化分析。

### 1.3.5 工具链协作全景

```
┌──────────────────────────────────────────────────────────────────┐
│                         Kiro CLI (Agent)                         │
│                    自然语言驱动 · MCP 编排                        │
└──────┬──────────┬──────────┬──────────┬──────────┬──────────────┘
       │          │          │          │          │
  ┌────▼───┐ ┌───▼────┐ ┌───▼────┐ ┌───▼────┐ ┌──▼──────────┐
  │ Azure  │ │  AWS   │ │  AWS   │ │  AWS   │ │ resource-   │
  │  MCP   │ │ Docs   │ │Pricing │ │Diagram │ │ discovery-  │
  │ Server │ │  MCP   │ │  MCP   │ │  MCP   │ │ for-azure   │
  └────┬───┘ └───┬────┘ └───┬────┘ └───┬────┘ └──┬──────────┘
       │          │          │          │          │
  Azure 资源   AWS 文档   实时定价   架构图     JSON/Excel
  实时状态     最佳实践   成本估算   自动生成   资源清单
```

## 1.4 迁移过程框架

结合 AWS Migration Playbook 的三阶段模型：

### 阶段一：Assess（评估）

- **目标**：评估客户的迁移就绪度、技术能力、组织承诺
- **产出**：评估报告（资源清单、服务映射、成本对比、风险矩阵）
- **关键活动**：
  - Azure 环境发现与资源盘点
  - Azure → AWS 服务映射
  - 成本基线建立与 TCO 对比
  - 技术风险与组织就绪度评估
- **本文档重点覆盖此阶段**

### 阶段二：Mobilize（动员）

- **目标**：搭建迁移基础设施，提升团队能力
- **产出**：AWS Landing Zone、迁移计划、团队培训完成
- **关键活动**：
  - AWS 账号结构与 Landing Zone 搭建（AWS Control Tower）
  - 网络连通性建立（Direct Connect / VPN）
  - 团队 AWS 技能培训
  - 详细迁移计划与波次规划

### 阶段三：Migrate and Modernize（迁移与现代化）

- **目标**：执行迁移，可选进行应用现代化
- **产出**：应用在 AWS 上运行，Azure 资源退役
- **关键活动**：
  - 按波次执行迁移（Rehost / Replatform / Refactor）
  - 数据迁移与同步
  - 验证测试与性能调优
  - 切换与退役

---

# 第二章：评估阶段（Assessment）— 详细方法

> 本章是全文重点。评估阶段的质量直接决定后续迁移的成功率。

## 2.1 Azure 环境发现

环境发现是评估的第一步，目标是建立完整的 Azure 资源清单。推荐三种方法组合使用。

### 2.1.1 使用 resource-discovery-for-azure 工具

这是评估阶段的主力数据采集工具，推荐作为第一步执行。

#### 前置条件

**Azure 账号权限**（需要在目标 Subscription 级别分配）：

| 角色 | 用途 |
|------|------|
| Reader | 读取所有资源配置 |
| Billing Reader | 读取计费信息 |
| Monitoring Reader | 读取 Azure Monitor 指标（CPU、内存、网络等） |
| Cost Management Reader | 读取成本分析数据 |

**运行环境**：

- **推荐**：Azure Cloud Shell（预装 PowerShell + Az 模块，无需额外配置）
- **备选**：本地 PowerShell 7+（需安装 Az 模块：`Install-Module -Name Az -Scope CurrentUser`）

#### 执行步骤

```bash
# 1. 克隆工具仓库
git clone https://github.com/awslabs/resource-discovery-for-azure.git
cd resource-discovery-for-azure

# 2. 登录 Azure（本地运行时需要，Cloud Shell 已自动登录）
Connect-AzAccount

# 3. 执行资源发现（全量扫描）
./ResourceInventory.ps1 -ReportName "CustomerName" -ConcurrencyLimit 4

# 4. 指定 Subscription 范围扫描（推荐，避免扫描无关订阅）
./ResourceInventory.ps1 -ReportName "CustomerName" \
  -SubscriptionIds "sub-id-1,sub-id-2" \
  -ConcurrencyLimit 4

# 5. 指定 Resource Group 范围扫描
./ResourceInventory.ps1 -ReportName "CustomerName" \
  -ResourceGroups "rg-prod,rg-staging" \
  -ConcurrencyLimit 4
```

#### 输出文件说明

扫描完成后，在 `output/` 目录下生成以下文件：

| 文件 | 格式 | 内容 |
|------|------|------|
| `CustomerName_Inventory.json` | JSON | 所有 Azure 资源的配置详情（类型、SKU、区域、标签等） |
| `CustomerName_Metrics.json` | JSON | 过去 31 天的性能指标（CPU 利用率、内存使用、磁盘 IOPS、网络吞吐） |
| `CustomerName_Consumption.json` | JSON | 过去 31 天的成本数据（按资源、按服务类型、按日期） |
| `CustomerName_Report.xlsx` | Excel | 合并报告，包含上述所有数据的可视化汇总 |

#### 关键数据字段

**Inventory JSON 核心字段**：

```json
{
  "subscriptionId": "xxx",
  "resourceGroup": "rg-prod",
  "resourceType": "Microsoft.Compute/virtualMachines",
  "name": "web-server-01",
  "location": "eastasia",
  "sku": "Standard_D4s_v5",
  "tags": { "env": "production", "app": "frontend" },
  "properties": { ... }
}
```

**Metrics JSON 核心字段**：

```json
{
  "resourceId": "/subscriptions/.../virtualMachines/web-server-01",
  "metricName": "Percentage CPU",
  "average": 34.5,
  "maximum": 89.2,
  "p95": 67.8,
  "period": "31d"
}
```

### 2.1.2 使用 Azure MCP Server 补充发现

resource-discovery-for-azure 输出的是时间切面数据（扫描时刻）。Azure MCP Server 提供实时查询能力，可补充以下场景：

- 发现扫描后新增的资源
- 查询资源的实时状态（运行 / 停止 / 异常）
- 深入查看特定资源的详细配置

#### 安装配置

```bash
# 安装 Azure MCP Server
pip install azure-mcp-server

# 或使用 uvx（推荐）
uvx azure-mcp-server
```

#### 通过 Kiro CLI 连接

在 `.kiro/settings/mcp.json` 中配置（完整配置见第三章）：

```json
{
  "mcpServers": {
    "azure-mcp": {
      "command": "uvx",
      "args": ["azure-mcp-server"],
      "env": {
        "AZURE_SUBSCRIPTION_ID": "<your-subscription-id>"
      }
    }
  }
}
```

#### 典型查询示例

在 Kiro CLI 中使用自然语言查询：

```
> 列出 eastasia 区域所有 VM 的名称、SKU 和当前状态
> 查看 rg-prod 资源组下所有 SQL Database 的配置
> 获取 VNet "vnet-prod" 的子网和 NSG 规则
```

#### 与 CloudRays 数据互补

| 数据需求 | CloudRays | Azure MCP |
|---------|-----------|-----------|
| 全量资源清单 | ✅ 主力 | 补充 |
| 历史性能指标 | ✅ 31天 | ❌ |
| 历史成本数据 | ✅ 31天 | ❌ |
| 实时资源状态 | ❌ | ✅ 主力 |
| 按需深入查询 | ❌ | ✅ 主力 |
| 扫描后变更检测 | ❌ | ✅ 主力 |

### 2.1.3 手动补充发现

自动化工具可能遗漏以下内容，需要手动补充：

#### Azure Portal 导出

```
Azure Portal → All Resources → Export to CSV
Azure Portal → Cost Management → Cost Analysis → Export
```

适用场景：快速获取资源列表用于交叉验证。

#### Azure Resource Graph 查询

```bash
# 查询所有 VM 及其 SKU
az graph query -q "
  Resources
  | where type == 'microsoft.compute/virtualmachines'
  | project name, resourceGroup, location,
    properties.hardwareProfile.vmSize,
    properties.storageProfile.osDisk.osType
" --output table

# 查询所有公网 IP
az graph query -q "
  Resources
  | where type == 'microsoft.network/publicipaddresses'
  | project name, resourceGroup,
    properties.ipAddress,
    properties.publicIPAllocationMethod
" --output table

# 查询未使用的磁盘
az graph query -q "
  Resources
  | where type == 'microsoft.compute/disks'
  | where properties.diskState == 'Unattached'
  | project name, resourceGroup, sku.name,
    properties.diskSizeGB
" --output table
```

#### 第三方工具

- **Azure Migrate**：微软官方迁移评估工具，可生成依赖关系图
- **Application Insights / Service Map**：识别应用间调用关系
- **第三方 CMDB**：如客户已有 ServiceNow、CMDB 等，获取其资产数据

## 2.2 资源清单整理

### 2.2.1 资源分类与统计

将发现的 Azure 资源按服务类型分类，建立标准化清单：

#### 分类框架

| 类别 | Azure 服务示例 | 关注指标 |
|------|---------------|---------|
| **Compute** | Virtual Machines, VMSS, App Service, AKS, Functions | vCPU、内存、实例数、利用率 |
| **Storage** | Blob Storage, File Storage, Managed Disks | 容量、IOPS、吞吐量、访问频率 |
| **Database** | Azure SQL, Cosmos DB, MySQL/PostgreSQL, Redis Cache | DTU/vCore、存储大小、连接数、QPS |
| **Network** | VNet, Load Balancer, Application Gateway, CDN, DNS | 带宽、连接数、规则数 |
| **Security** | Key Vault, Azure AD, NSG, WAF | 密钥数、用户数、策略数 |
| **Integration** | Service Bus, Event Grid, API Management | 消息量、API 调用量 |
| **AI/ML** | Cognitive Services, Machine Learning | 调用量、模型数 |
| **DevOps** | Azure DevOps, Container Registry | Pipeline 数、镜像数 |

#### 使用率分析

从 Metrics JSON 提取关键使用率数据：

```bash
# 使用 jq 分析 VM CPU 使用率分布
cat CustomerName_Metrics.json | jq '
  [.[] | select(.metricName == "Percentage CPU")]
  | group_by(
    if .average < 10 then "idle(<10%)"
    elif .average < 40 then "low(10-40%)"
    elif .average < 70 then "medium(40-70%)"
    else "high(>70%)"
    end
  )
  | map({usage: .[0] | (
    if .average < 10 then "idle(<10%)"
    elif .average < 40 then "low(10-40%)"
    elif .average < 70 then "medium(40-70%)"
    else "high(>70%)"
    end
  ), count: length})
'
```

使用率分析结论直接影响迁移策略：

| 使用率 | 迁移建议 |
|--------|---------|
| Idle（<10%） | 考虑淘汰或合并 |
| Low（10–40%） | Right-sizing：选择更小的实例 |
| Medium（40–70%） | 1:1 映射或轻微调整 |
| High（>70%） | 1:1 映射，可能需要更大实例 |

### 2.2.2 依赖关系分析

#### 应用间调用关系

识别方法：

1. **Azure Application Insights**：如已启用，可直接导出 Application Map
2. **网络流日志（NSG Flow Logs）**：分析 IP 间通信模式
3. **应用团队访谈**：获取架构文档，确认调用链
4. **代码分析**：使用 `code-doc-gen-mcp-server` 分析连接字符串和 API 调用

#### 网络拓扑

需要文档化的网络元素：

```
┌─ VNet 结构
│  ├─ VNet 名称、地址空间
│  ├─ Subnet 划分（名称、CIDR、关联 NSG）
│  ├─ VNet Peering（跨 VNet 连接）
│  └─ VPN Gateway / ExpressRoute（混合连接）
│
├─ 安全规则
│  ├─ NSG 规则（入站/出站）
│  ├─ Azure Firewall 规则
│  └─ Application Gateway / WAF 规则
│
└─ DNS
   ├─ Azure DNS Zone
   ├─ Private DNS Zone
   └─ 自定义 DNS 配置
```

#### 数据流向

标记关键数据路径：

- **数据摄入**：外部数据 → Azure 存储/数据库
- **数据处理**：计算服务读取 → 处理 → 写入
- **数据输出**：API 响应、报告导出、数据同步

### 2.2.3 Kiro CLI 自动化分析

利用 Kiro CLI 挂载多个 MCP Server，实现自动化分析：

#### 配置要求

Kiro CLI 需同时连接以下 MCP Server：

- `azure-mcp`：读取 Azure 实时资源
- `aws-documentation-mcp-server`：查询 AWS 文档做服务映射
- `aws-diagram-mcp-server`：生成架构图
- `code-doc-gen-mcp-server`：分析应用代码

#### Prompt 示例：分析资源清单

```
请分析以下 Azure 环境 JSON 文件，生成资源清单文档：

输入文件：
- output/CustomerName_Inventory.json（资源清单）
- output/CustomerName_Metrics.json（性能指标）
- output/CustomerName_Consumption.json（成本数据）

请完成以下任务：
1. 按服务类型分类统计所有资源
2. 标记使用率低于 10% 的资源（可能可以淘汰）
3. 识别资源间的依赖关系（基于同一 VNet/Subnet/Resource Group）
4. 输出 Markdown 格式的资源清单表格

将结果保存到 output/resource-inventory-report.md
```

#### Prompt 示例：生成架构图

```
基于 output/CustomerName_Inventory.json 中的资源信息，
使用 aws-diagram-mcp-server 生成当前 Azure 环境的架构图。

要求：
1. 按 VNet/Subnet 组织网络拓扑
2. 标注各资源的 SKU 和关键配置
3. 用不同颜色区分 Compute/Storage/Database/Network
4. 标记资源间的数据流向

输出 Draw.io 格式文件到 output/current-architecture.drawio
```

#### Prompt 示例：分析应用代码

```
使用 code-doc-gen-mcp-server 分析以下应用代码仓库：
- /path/to/app-repo

识别：
1. Azure SDK 依赖（pip/npm/maven packages）
2. Azure 服务连接字符串和终端节点
3. Azure 特有 API 调用（需要迁移适配的部分）
4. 配置文件中的 Azure 资源引用

输出迁移影响分析报告到 output/code-analysis-report.md
```

## 2.3 服务映射（Azure → AWS）

### 2.3.1 映射原则

服务映射遵循以下优先级：

1. **功能等价映射**：Azure 服务 → AWS 功能最接近的服务（如 Azure VM → EC2）
2. **现代化映射**：趁迁移机会升级（如 Azure VM → ECS/EKS 容器化）
3. **合并映射**：多个 Azure 服务合并为一个 AWS 服务
4. **替代映射**：Azure 独有服务 → AWS 上的替代方案或第三方服务

### 2.3.2 核心服务映射表

> 完整映射请参考 `service-mapping.md` 文档。以下为高频映射：

| 类别 | Azure 服务 | AWS 服务 | 备注 |
|------|-----------|---------|------|
| Compute | Virtual Machines | EC2 | SKU 映射需单独核对 |
| Compute | VMSS | EC2 Auto Scaling | |
| Compute | App Service | Elastic Beanstalk / ECS / App Runner | 视复杂度选型 |
| Compute | AKS | EKS | K8s 版本需对齐 |
| Compute | Azure Functions | Lambda | 运行时和触发器需适配 |
| Storage | Blob Storage | S3 | 访问层映射：Hot→Standard, Cool→S3 IA, Archive→Glacier |
| Storage | File Storage | EFS / FSx | 视协议选型（NFS/SMB） |
| Storage | Managed Disks | EBS | 磁盘类型需映射 |
| Database | Azure SQL | RDS SQL Server / Aurora | License 模式需确认 |
| Database | Cosmos DB | DynamoDB | API 模式差异大，需深入评估 |
| Database | Azure MySQL/PostgreSQL | RDS MySQL/PostgreSQL / Aurora | |
| Database | Redis Cache | ElastiCache Redis | |
| Network | VNet | VPC | CIDR 重新规划 |
| Network | Load Balancer | ALB/NLB | |
| Network | Application Gateway | ALB + WAF | |
| Network | Azure CDN | CloudFront | |
| Network | Azure DNS | Route 53 | |
| Security | Key Vault | Secrets Manager / KMS | |
| Security | Azure AD | IAM Identity Center + Cognito | 复杂度最高的映射之一 |
| Integration | Service Bus | SQS / SNS / EventBridge | |
| Integration | API Management | API Gateway | |
| Monitoring | Azure Monitor | CloudWatch | |
| DevOps | Azure DevOps | CodePipeline / GitHub Actions | |

### 2.3.3 特殊服务处理

以下 Azure 服务没有直接对等的 AWS 服务，需要特殊处理：

#### Azure Active Directory (Entra ID)

- **身份认证**：迁移到 AWS IAM Identity Center（前 SSO）+ 外部 IdP
- **应用集成**：Cognito User Pool 替代 Azure AD B2C
- **条件访问策略**：需在 IAM 策略 + SCP 中重新实现
- ⚠️ 这通常是迁移中最复杂的部分之一，建议专项评估

#### Azure DevOps

- **Repos**：迁移到 CodeCommit（已停止新客户注册）或 GitHub
- **Pipelines**：迁移到 CodePipeline + CodeBuild 或 GitHub Actions
- **Boards**：迁移到 Jira 或其他第三方工具
- **Artifacts**：迁移到 CodeArtifact

#### Azure Logic Apps

- **简单工作流**：Step Functions
- **集成场景**：EventBridge + Lambda
- **需逐个评估每个 Logic App 的 connector 和触发器**

### 2.3.4 PaaS 服务映射注意事项

PaaS 服务的迁移比 IaaS 复杂，因为应用代码可能深度绑定平台特性：

| 注意点 | 说明 |
|--------|------|
| **SDK 依赖** | 应用代码中的 Azure SDK 调用需替换为 AWS SDK |
| **连接字符串** | Azure 特有的连接字符串格式需要修改 |
| **Managed Identity** | Azure Managed Identity → IAM Role（概念类似，实现不同） |
| **平台特性** | App Service 的 slot swapping、Functions 的 Durable Functions 等需要找替代方案 |
| **数据格式** | Cosmos DB 的多模型 API、Service Bus 的消息格式可能需要适配 |

## 2.4 成本评估

### 2.4.1 当前 Azure 成本基线

#### 从 Consumption JSON 提取成本数据

```bash
# 过去 31 天总成本
cat CustomerName_Consumption.json | jq '
  [.[].cost] | add | . * 100 | round / 100
'

# 按服务类型分解成本（Top 10）
cat CustomerName_Consumption.json | jq '
  group_by(.serviceType)
  | map({service: .[0].serviceType, total: ([.[].cost] | add)})
  | sort_by(-.total)
  | .[0:10]
  | .[] | "\(.service): $\(.total | . * 100 | round / 100)"
'

# 按资源组分解成本
cat CustomerName_Consumption.json | jq '
  group_by(.resourceGroup)
  | map({rg: .[0].resourceGroup, total: ([.[].cost] | add)})
  | sort_by(-.total)
'
```

#### 成本基线报告模板

| 维度 | 月度成本 (USD) | 占比 |
|------|---------------|------|
| Compute (VM + AKS) | $X,XXX | XX% |
| Database (SQL + Cosmos) | $X,XXX | XX% |
| Storage (Blob + Disk) | $X,XXX | XX% |
| Network (带宽 + LB) | $X,XXX | XX% |
| Security (Key Vault + WAF) | $XXX | X% |
| Other | $XXX | X% |
| **Total** | **$XX,XXX** | **100%** |

#### 预留实例 / Savings Plan 现状

需要确认客户在 Azure 上的承诺购买：

- Azure Reserved Instances：哪些 VM 有 RI？剩余期限？
- Azure Savings Plan：覆盖范围？到期时间？
- ⚠️ 未到期的 Azure RI/Savings Plan 是迁移的隐性成本（无法退费或退费有损失）

### 2.4.2 AWS 目标成本估算

#### 使用 aws-pricing-mcp-server

通过 Kiro CLI 调用 `aws-pricing-mcp-server` 进行实时定价查询：

```
基于以下 Azure 资源清单，估算迁移到 AWS 后的月度成本：

资源文件：output/CustomerName_Inventory.json
使用率文件：output/CustomerName_Metrics.json

要求：
1. 将每个 Azure VM SKU 映射到最合适的 EC2 实例类型
2. 考虑使用率数据进行 right-sizing（利用率<30% 的建议降配）
3. 分别给出按需价格和 Savings Plan 价格
4. 存储按对等类型映射
5. 数据传输成本按当前网络流量估算
6. 输出对比表格

将结果保存到 output/aws-cost-estimate.md
```

#### 关键成本映射考虑

| 因素 | 说明 |
|------|------|
| **实例类型** | Azure Standard_D4s_v5 → AWS m6i.xlarge（需逐一核对 vCPU/内存） |
| **存储类型** | Premium SSD → gp3, Standard SSD → gp3, Standard HDD → st1 |
| **数据传输** | Azure 和 AWS 的出站流量定价模型不同，需单独计算 |
| **License** | SQL Server License：Azure 包含 vs AWS BYOL/License Included 的价差 |
| **预留折扣** | 对比 Azure RI vs AWS Savings Plan 的折扣力度 |
| **免费额度** | AWS Free Tier 可在初期降低成本 |

### 2.4.3 TCO 对比

#### 对比框架

| 成本项 | Azure 当前 (月) | AWS 估算 (月) | 差异 |
|--------|---------------|--------------|------|
| Compute | $X,XXX | $X,XXX | ±X% |
| Database | $X,XXX | $X,XXX | ±X% |
| Storage | $X,XXX | $X,XXX | ±X% |
| Network | $X,XXX | $X,XXX | ±X% |
| Security | $XXX | $XXX | ±X% |
| Support Plan | $XXX | $XXX | ±X% |
| **月度合计** | **$XX,XXX** | **$XX,XXX** | **±X%** |
| **年度合计** | **$XXX,XXX** | **$XXX,XXX** | **±X%** |

#### 迁移一次性成本

| 成本项 | 估算 |
|--------|------|
| 迁移工具 License（如有） | $XXX |
| 专业服务（外部顾问） | $XX,XXX |
| 内部人力（N人 × M月） | $XX,XXX |
| 双跑期成本（Azure + AWS 并行） | $XX,XXX |
| 培训成本 | $X,XXX |
| Azure RI/SP 退出损失 | $X,XXX |
| **一次性总计** | **$XXX,XXX** |

#### ROI 分析

```
月度节省 = Azure 月度成本 - AWS 月度成本
迁移回收期 = 一次性迁移成本 / 月度节省
3 年 TCO = (AWS 月度成本 × 36) + 一次性迁移成本
3 年节省 = (Azure 月度成本 × 36) - 3 年 TCO
```

## 2.5 风险评估

### 2.5.1 技术风险

| 风险 | 影响 | 可能性 | 缓解措施 |
|------|------|--------|---------|
| Azure 独有服务无法直接映射 | 高 | 中 | 提前 PoC 验证替代方案 |
| 数据迁移量大（>10TB） | 中 | 中 | 使用 AWS Snow Family 或 DMS |
| 应用代码深度绑定 Azure SDK | 高 | 中 | 代码分析 + 重构评估 |
| 数据库兼容性问题 | 高 | 低 | 使用 AWS SCT 评估兼容性 |
| 网络延迟变化影响性能 | 中 | 低 | 压测验证 |

### 2.5.2 运营风险

| 风险 | 影响 | 可能性 | 缓解措施 |
|------|------|--------|---------|
| 团队缺乏 AWS 经验 | 高 | 高 | 提前培训 + AWS 认证 |
| 迁移窗口不足 | 高 | 中 | 分波次迁移 + 蓝绿部署 |
| 监控和告警重建 | 中 | 高 | 提前搭建 CloudWatch 体系 |
| 运维流程变更 | 中 | 高 | SOP 文档 + 演练 |

### 2.5.3 合规风险

| 风险 | 影响 | 可能性 | 缓解措施 |
|------|------|--------|---------|
| 数据驻留要求（数据不能出境） | 高 | 中 | 确认 AWS 区域满足合规要求 |
| 行业认证迁移（ISO/SOC/PCI） | 中 | 低 | AWS 已有对应认证，需更新文档 |
| GDPR / 个保法合规 | 高 | 低 | 数据分类 + 加密策略 |

### 2.5.4 供应商风险

| 风险 | 影响 | 可能性 | 缓解措施 |
|------|------|--------|---------|
| **Microsoft License 限制** | 高 | 高 | 详见下文 |
| Azure 合同提前终止费 | 中 | 中 | 提前与 Azure 商务沟通 |
| 第三方 SaaS 的云依赖 | 低 | 低 | 逐一确认兼容性 |

**⚠️ Microsoft License 在 AWS 上的限制（重点关注）**：

- Microsoft 在 2022 年修改了 BYOL 政策，Windows Server 和 SQL Server 在 AWS 等"Listed Provider"上使用 License Mobility 受限
- **影响**：在 AWS 上运行 SQL Server 可能需要购买 License Included 的 RDS，成本可能比 Azure 上的 Azure Hybrid Benefit 更高
- **缓解**：评估是否可迁移到 Aurora PostgreSQL / MySQL 以彻底避免 Microsoft License 依赖

## 2.6 评估报告模板

以下为标准的迁移评估报告结构：

```markdown
# [客户名称] Azure to AWS 迁移评估报告

## 1. 执行摘要
   - 评估范围和方法
   - 关键发现（3-5 条）
   - 推荐的迁移策略
   - 预估成本变化和 ROI

## 2. Azure 环境概况
   ### 2.1 资源清单摘要
   ### 2.2 架构图（当前状态）
   ### 2.3 应用清单与分类
   ### 2.4 依赖关系图

## 3. 服务映射
   ### 3.1 完整映射表（Azure → AWS）
   ### 3.2 特殊服务处理方案
   ### 3.3 无法直接映射的服务及替代方案

## 4. 成本分析
   ### 4.1 Azure 当前成本基线
   ### 4.2 AWS 目标成本估算
   ### 4.3 TCO 对比（1年 / 3年）
   ### 4.4 迁移一次性成本
   ### 4.5 ROI 分析

## 5. 风险评估
   ### 5.1 风险矩阵（影响 × 可能性）
   ### 5.2 Top 5 风险及缓解计划
   ### 5.3 合规要求确认

## 6. 迁移策略建议
   ### 6.1 推荐的 R 策略（Rehost / Replatform / Refactor）
   ### 6.2 波次规划建议
   ### 6.3 优先迁移的应用

## 7. 下一步行动
   ### 7.1 Mobilize 阶段准备事项
   ### 7.2 所需资源和时间线
   ### 7.3 决策点

## 附录
   A. 完整资源清单
   B. 详细服务映射表
   C. 成本明细
   D. 工具和方法说明
```

---

# 第三章：评估阶段工具链配置

> 本章提供完整的工具安装和配置步骤，确保可直接落地执行。

## 3.1 Kiro CLI 安装与配置

### 3.1.1 安装 Kiro CLI

```bash
# macOS / Linux
curl -fsSL https://kiro.dev/install.sh | sh

# 验证安装
kiro --version

# 首次运行，按提示完成 AWS 账号认证
kiro auth login
```

### 3.1.2 Kiro IDE（可选）

如果更习惯 GUI 环境：

- 从 [kiro.dev](https://kiro.dev) 下载 Kiro IDE
- 基于 VS Code 架构，支持所有 VS Code 扩展
- MCP Server 配置方式与 CLI 一致

### 3.1.3 MCP Server 配置文件

Kiro CLI 的 MCP 配置文件路径：`~/.kiro/settings/mcp.json`

> 项目级配置：`.kiro/settings/mcp.json`（放在项目根目录）

## 3.2 resource-discovery-for-azure 配置

### 3.2.1 权限配置步骤

```bash
# 1. 在 Azure Portal 中为服务主体或用户分配角色
# （以下示例使用 Azure CLI）

# 获取 Subscription ID
az account show --query id -o tsv

# 分配 Reader 角色
az role assignment create \
  --assignee <user-or-sp-object-id> \
  --role "Reader" \
  --scope "/subscriptions/<subscription-id>"

# 分配 Billing Reader 角色
az role assignment create \
  --assignee <user-or-sp-object-id> \
  --role "Billing Reader" \
  --scope "/subscriptions/<subscription-id>"

# 分配 Monitoring Reader 角色
az role assignment create \
  --assignee <user-or-sp-object-id> \
  --role "Monitoring Reader" \
  --scope "/subscriptions/<subscription-id>"

# 分配 Cost Management Reader 角色
az role assignment create \
  --assignee <user-or-sp-object-id> \
  --role "Cost Management Reader" \
  --scope "/subscriptions/<subscription-id>"
```

### 3.2.2 参数说明

| 参数 | 必选 | 说明 |
|------|------|------|
| `-ReportName` | ✅ | 报告名称前缀，用于输出文件命名 |
| `-SubscriptionIds` | ❌ | 指定 Subscription ID（逗号分隔），不指定则扫描所有可访问的订阅 |
| `-ResourceGroups` | ❌ | 指定 Resource Group 名称（逗号分隔） |
| `-ConcurrencyLimit` | ❌ | 并发线程数（默认 2，推荐 4，大环境可设 8） |
| `-SkipMetrics` | ❌ | 跳过性能指标采集（加速扫描，但会缺少使用率数据） |
| `-SkipConsumption` | ❌ | 跳过成本数据采集 |

### 3.2.3 常见问题排查

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| `Insufficient privileges` | 缺少必要角色 | 检查 4 个角色是否全部分配 |
| `Az module not found` | 缺少 PowerShell Az 模块 | `Install-Module -Name Az -Scope CurrentUser` |
| `Rate limit exceeded` | API 请求过多 | 降低 `-ConcurrencyLimit` |
| Metrics 数据为空 | Azure Monitor 未启用 | 确认资源的诊断设置已开启 |
| Consumption 数据为空 | Cost Management 未开通 | 在 Azure Portal 中开通 Cost Management |
| 扫描超时 | 资源数量过多 | 按 Subscription 分批扫描 |

## 3.3 MCP Server 配置示例

以下为评估阶段的完整 Kiro CLI MCP 配置（`~/.kiro/settings/mcp.json`）：

```json
{
  "mcpServers": {
    "azure-mcp": {
      "command": "uvx",
      "args": ["azure-mcp-server"],
      "env": {
        "AZURE_SUBSCRIPTION_ID": "<your-azure-subscription-id>",
        "AZURE_TENANT_ID": "<your-azure-tenant-id>"
      },
      "description": "Azure 资源实时查询"
    },
    "aws-documentation": {
      "command": "uvx",
      "args": ["awslabs.aws-documentation-mcp-server@latest"],
      "env": {
        "FASTMCP_LOG_LEVEL": "ERROR"
      },
      "description": "AWS 官方文档搜索"
    },
    "aws-pricing": {
      "command": "uvx",
      "args": ["awslabs.aws-pricing-mcp-server@latest"],
      "env": {
        "FASTMCP_LOG_LEVEL": "ERROR"
      },
      "description": "AWS 实时定价查询"
    },
    "aws-diagram": {
      "command": "uvx",
      "args": ["awslabs.aws-diagram-mcp-server@latest"],
      "env": {
        "FASTMCP_LOG_LEVEL": "ERROR"
      },
      "description": "架构图生成（Draw.io 格式）"
    },
    "aws-knowledge": {
      "command": "uvx",
      "args": ["awslabs.aws-knowledge-mcp-server@latest"],
      "env": {
        "FASTMCP_LOG_LEVEL": "ERROR"
      },
      "description": "AWS 架构知识库查询（Well-Architected 等）"
    },
    "code-doc-gen": {
      "command": "uvx",
      "args": ["awslabs.code-doc-gen-mcp-server@latest"],
      "env": {
        "FASTMCP_LOG_LEVEL": "ERROR"
      },
      "description": "代码分析与文档生成"
    },
    "core": {
      "command": "uvx",
      "args": ["awslabs.core-mcp-server@latest"],
      "env": {
        "FASTMCP_LOG_LEVEL": "ERROR"
      },
      "description": "AWS 基础资源操作"
    },
    "cost-analysis": {
      "command": "uvx",
      "args": ["awslabs.cost-analysis-mcp-server@latest"],
      "env": {
        "FASTMCP_LOG_LEVEL": "ERROR"
      },
      "description": "AWS Cost Explorer 分析"
    }
  }
}
```

### 验证配置

```bash
# 在 Kiro CLI 中验证所有 MCP Server 连接
kiro mcp list

# 测试单个 MCP Server
kiro mcp test azure-mcp
kiro mcp test aws-pricing
```

## 3.4 端到端评估工作流

以下为使用 Kiro CLI 执行完整评估的步骤流程：

### Step 1：环境准备（Day 1）

```bash
# 1.1 安装工具
curl -fsSL https://kiro.dev/install.sh | sh
pip install azure-mcp-server
git clone https://github.com/awslabs/resource-discovery-for-azure.git

# 1.2 配置 MCP Servers
# 将上述 mcp.json 内容写入 ~/.kiro/settings/mcp.json
# 填入实际的 Azure Subscription ID 和 Tenant ID

# 1.3 验证连接
kiro mcp list
az account show
```

### Step 2：Azure 环境发现（Day 1–2）

```bash
# 2.1 运行 CloudRays 全量扫描
cd resource-discovery-for-azure
./ResourceInventory.ps1 -ReportName "CustomerName" -ConcurrencyLimit 4

# 2.2 验证输出
ls -la output/
# 应看到：CustomerName_Inventory.json, CustomerName_Metrics.json,
#         CustomerName_Consumption.json, CustomerName_Report.xlsx

# 2.3 快速预览资源数量
cat output/CustomerName_Inventory.json | jq 'length'
cat output/CustomerName_Inventory.json | jq 'group_by(.resourceType) | map({type: .[0].resourceType, count: length}) | sort_by(-.count)'
```

### Step 3：资源分析与服务映射（Day 2–3）

在 Kiro CLI 交互模式中执行：

```bash
kiro chat
```

```
> 请读取 output/CustomerName_Inventory.json，完成以下分析：
>
> 1. 按服务类型分类统计所有资源，输出表格
> 2. 将每个 Azure 服务映射到对应的 AWS 服务
> 3. 标记无法直接映射的服务，给出替代方案
> 4. 使用 aws-diagram-mcp-server 生成当前 Azure 架构图
>
> 将分析结果保存到 output/service-mapping-analysis.md
> 将架构图保存到 output/current-architecture.drawio
```

### Step 4：成本评估（Day 3–4）

```
> 基于 output/CustomerName_Consumption.json 和 output/CustomerName_Inventory.json：
>
> 1. 汇总当前 Azure 月度成本（按服务类型分解）
> 2. 使用 aws-pricing-mcp-server 查询对应 AWS 服务的定价
> 3. 生成 Azure vs AWS 成本对比表
> 4. 计算迁移 ROI（假设迁移一次性成本为月度成本的 3 倍）
>
> 将结果保存到 output/cost-comparison.md
```

### Step 5：风险评估（Day 4）

```
> 基于前面的分析结果，评估迁移风险：
>
> 1. 识别技术风险（不兼容服务、数据迁移复杂度）
> 2. 识别运营风险（团队技能、停机影响）
> 3. 特别关注 Microsoft License 在 AWS 上的限制
> 4. 生成风险矩阵（影响 × 可能性）
>
> 将结果保存到 output/risk-assessment.md
```

### Step 6：生成评估报告（Day 5）

```
> 汇总以下文件内容，生成完整的迁移评估报告：
>
> - output/service-mapping-analysis.md
> - output/cost-comparison.md
> - output/risk-assessment.md
> - output/current-architecture.drawio
>
> 按照标准评估报告模板（执行摘要、环境概况、服务映射、
> 成本分析、风险评估、迁移策略建议、下一步行动）生成报告
>
> 将最终报告保存到 output/migration-assessment-report.md
```

### 评估工作流时间线

```
P 1    P 2     P 3     P 4     P 5
 │         │         │         │         │
 ├─ 环境准备 ├─ 发现完成 ├─ 映射完成 ├─ 风险评估 ├─ 报告交付
 ├─ 开始扫描 ├─ 资源分析 ├─ 成本对比 │         │
 │         │         │         │         │
 ▼         ▼         ▼         ▼         ▼
 工具配置    CloudRays  Kiro CLI   风险矩阵   最终报告
 权限验证    数据验证    自动分析   团队讨论   客户交付
```



---

