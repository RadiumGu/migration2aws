# Azure to AWS 迁移评估 Skill 实现文档

> **日期**：2026-04-21 | **状态**：Draft v1.0
>
> 基于 `azure2aws/migration-assessment-guide.md` 内容设计，参考 `gcp2aws` skill 结构实现

---

## 1. 概述

### 1.1 Skill 用途

`azure-to-aws` skill 是一个 Kiro CLI agent skill，用于引导用户完成从 Microsoft Azure 到 Amazon Web Services 的迁移评估。它将 `migration-assessment-guide.md` 中定义的方法论编码为可自动化执行的 5 阶段工作流。

**核心能力**：
- 读取 Azure 环境数据（CloudRays JSON 导出 + Azure MCP 实时查询）
- 自动化资源分类、服务映射、成本对比、风险评估
- 生成结构化的迁移评估报告

### 1.2 在 Kiro CLI 中的使用方式

```bash
# 触发短语示例
kiro chat
> Migrate my Azure environment to AWS
> Azure to AWS migration assessment
> 评估 Azure 迁移到 AWS 的方案
> Assess my Azure workloads for AWS migration
```

### 1.3 与 GCP2AWS 的定位差异

| 维度 | GCP2AWS | Azure2AWS |
|------|---------|-----------|
| **输入源** | Terraform `.tf` 文件 | CloudRays JSON + Azure MCP + ARM/Bicep 模板 |
| **发现方式** | 静态 Terraform 解析 | 多源数据融合（CloudRays + MCP + 手动补充） |
| **映射复杂度** | 中等（GCP/AWS 架构相似度高） | 高（Azure PaaS 生态差异大，License 问题突出） |
| **特殊关注** | 无 | Microsoft License 限制、Azure AD/Entra ID 迁移 |

---

## 2. 参考架构 — 目录结构设计

```
migration2aws/azure2aws/
├── skills/
│   └── azure-to-aws/
│       ├── SKILL.md                          # Skill 主定义（Phase Routing + 执行逻辑）
│       └── references/
│           ├── phases/
│           │   ├── discover.md               # Phase 1: 环境发现
│           │   ├── clarify.md                # Phase 2: 需求澄清
│           │   ├── design.md                 # Phase 3: AWS 架构设计
│           │   ├── estimate.md               # Phase 4: 成本评估
│           │   └── execute.md                # Phase 5: 执行计划
│           ├── design-refs/
│           │   ├── index.md                  # 服务类别索引
│           │   ├── fast-path.md              # 确定性 1:1 映射表
│           │   ├── compute.md                # Compute 服务选型 rubric
│           │   ├── database.md               # Database 服务选型 rubric
│           │   ├── storage.md                # Storage 服务选型 rubric
│           │   ├── networking.md             # Networking 服务选型 rubric
│           │   ├── security-identity.md      # Security & Identity rubric（含 Entra ID 专项）
│           │   ├── analytics.md              # Analytics & BI rubric
│           │   ├── ai-ml.md                  # AI/ML 服务 rubric
│           │   ├── integration.md            # Integration & Messaging rubric
│           │   └── devops.md                 # DevOps & Management rubric
│           └── shared/
│               ├── clarify-questions.md      # Q1-Q10 澄清问题与默认值
│               ├── output-schema.md          # 所有阶段输出 JSON Schema
│               ├── service-mapping.md        # Azure→AWS 完整服务映射表
│               ├── pricing-fallback.json     # 离线定价缓存
│               ├── complexity-ratings.md     # 迁移复杂度评级参考
│               └── license-guidance.md       # Microsoft License 在 AWS 上的限制指南
├── .mcp.json                                 # MCP Server 配置
└── README.md                                 # 项目说明
```

**与 GCP2AWS 结构的关键差异**：
- 新增 `design-refs/security-identity.md` — Azure AD/Entra ID 迁移是独立重大议题
- 新增 `shared/license-guidance.md` — Microsoft License 限制需专项指导
- 新增 `shared/complexity-ratings.md` — 基于 `service-mapping.md` 附录的复杂度评级
- `design-refs/` 下按 Azure 服务类别拆分为更多 rubric 文件（Azure 服务类别比 GCP 更多）

---

## 3. Skill 定义 — SKILL.md 内容设计

### 3.1 Header

```yaml
---
name: azure-to-aws
description: "Migrate workloads from Microsoft Azure to AWS. Triggers on: migrate from Azure, Azure to AWS, move off Azure, Azure migration assessment, migrate AKS to EKS, migrate Azure SQL to RDS, Azure AD to IAM Identity Center. Runs a 5-phase process: discover Azure resources from CloudRays data or Azure MCP, clarify migration requirements, design AWS architecture, estimate costs and TCO, and plan execution."
---
```

### 3.2 Philosophy

- **Re-platform by default**：选择 AWS 上功能最接近的托管服务（如 AKS → EKS, Azure SQL → RDS/Aurora）
- **License-aware**：主动识别 Microsoft License 限制，推荐开源替代方案（如 SQL Server → Aurora PostgreSQL）
- **Multi-source discovery**：支持 CloudRays JSON、Azure MCP 实时查询、ARM/Bicep 模板三种输入源
- **Dev sizing unless specified**：默认开发环境规格，升级需用户明确指示

### 3.3 Prerequisites

#### Azure 认证（两个工具共享同一套凭据，客户只需做一次）

**认证方式**（按场景选择）：

| 场景 | 认证方式 | 说明 |
|------|---------|------|
| 本地开发环境 | `az login` | 交互式浏览器登录，CloudRays 和 Azure MCP Server 都会自动拾取 |
| Azure Cloud Shell | 自动认证 | 无需额外操作 |
| CI/CD 或无人值守 | Service Principal | 设置环境变量 `AZURE_TENANT_ID` + `AZURE_CLIENT_ID` + `AZURE_CLIENT_SECRET` |
| 中国区/政务云 | `az login` + 云环境指定 | 额外设置 `AZURE_CLOUD=AzureChinaCloud`（或 `AzureUSGovernment`） |

**必需的 Azure RBAC 角色**（分配给登录用户或 Service Principal）：

| 角色 | 用途 | 哪个工具需要 |
|------|------|------------|
| `Reader` | 查看 Azure 资源 | CloudRays + Azure MCP |
| `Billing Reader` | 访问账单和成本数据 | CloudRays |
| `Monitoring Reader` | 访问 Azure Monitor 指标 | CloudRays |
| `Cost Management Reader` | 访问成本管理数据 | CloudRays |

> 💡 Azure MCP Server 只需 `Reader` 角色，因为它做的是实时资源查询，不涉及计费和监控数据采集。
> CloudRays 需要全部 4 个角色才能输出完整报告（跳过 `skip_consumption` 可仅需 Reader + Monitoring Reader）。

**客户需要提供的信息**：

| 信息 | 是否必填 | 说明 |
|------|---------|------|
| Azure Tenant ID | 可选 | 多租户场景才需要；单租户时 `az login` 自动确定 |
| Azure Subscription ID | 可选 | 指定扫描范围；省略则扫描认证用户可访问的所有 subscription |
| Resource Group | 可选 | 进一步缩小扫描范围；建议全量扫描后分析，而不是仅扫描单个 RG |
| 客户/项目名称 | 必填 | 用于报告文件命名（CloudRays `-ReportName` 参数） |

**运行环境依赖**：

| 依赖 | 版本要求 | 用途 |
|------|---------|------|
| PowerShell (`pwsh`) | 7.0+ | 运行 CloudRays 脚本 |
| Azure CLI (`az`) | 2.x | 认证 + CloudRays 数据采集 |
| Node.js | 18+ | CloudRays MCP wrapper + Kiro CLI |
| `npx` 或 `uvx` | 随 Node.js/Python | Azure MCP Server 启动 |

> `cloudrays_preflight` tool 会自动检查以上所有依赖和权限，并返回结构化的检查结果。客户不需要手动验证。

### 3.4 State Management

与 GCP2AWS 一致，状态存储在 `.migration/[MMDD-HHMM]/`：

```
.migration/
├── .gitignore
└── 0421-1430/
    ├── .phase-status.json
    ├── azure-resource-inventory.json    # Phase 1 输出
    ├── azure-resource-clusters.json     # Phase 1 输出
    ├── clarified.json                   # Phase 2 输出
    ├── aws-design.json                  # Phase 3 输出
    ├── aws-design-report.md             # Phase 3 输出
    ├── estimation.json                  # Phase 4 输出
    ├── estimation-report.md             # Phase 4 输出
    ├── execution.json                   # Phase 5 输出
    └── execution-timeline.md            # Phase 5 输出
```

### 3.5 Phase Routing

与 GCP2AWS 完全一致的路由逻辑（`.phase-status.json` 状态机），不再赘述。

### 3.6 Phase Summary Table

| Phase | 输入 | 输出 | Reference |
|-------|------|------|-----------|
| **Discover** | CloudRays MCP 全量扫描 + Azure MCP 实时补充（降级：纯 Azure MCP 或 ARM/Bicep） | `azure-resource-inventory.json`, `azure-resource-clusters.json` | `references/phases/discover.md` |
| **Clarify** | `azure-resource-inventory.json`, `azure-resource-clusters.json` | `clarified.json` | `references/phases/clarify.md` |
| **Design** | inventory + clusters + `clarified.json` | `aws-design.json`, `aws-design-report.md` | `references/phases/design.md` |
| **Estimate** | `aws-design.json`, `clarified.json`, 可选 `*_Consumption.json` | `estimation.json`, `estimation-report.md` | `references/phases/estimate.md` |
| **Execute** | `aws-design.json`, `estimation.json` | `execution.json`, `execution-timeline.md` | `references/phases/execute.md` |

### 3.7 MCP Servers

| MCP Server | 用途 | 必需? |
|------------|------|-------|
| **cloudrays** | CloudRays MCP wrapper，Discover 阶段全量扫描 Azure 环境（资源 + 成本 + 指标） | 推荐 |
| **azure-mcp** | Azure 资源实时查询，补充 PaaS 细节和依赖关系 | 推荐（与 CloudRays 互补协作） |
| **awspricing** | AWS 实时定价查询 | 推荐（有 fallback） |
| **awsknowledge** | AWS 架构知识库、区域可用性验证 | 推荐（非阻塞） |
| **aws-documentation** | AWS 官方文档搜索 | 可选 |
| **aws-diagram** | 架构图生成 | 可选 |
| **cost-analysis** | AWS Cost Explorer 分析（已有 AWS 环境时） | 可选 |

### 3.8 Scope Notes

**v1.0 包含**：
- CloudRays JSON + ARM/Bicep 模板解析发现
- 10 问题需求澄清（比 GCP 多 2 个：License 策略 + Azure AD 策略）
- 基于服务类别的 rubric 设计
- AWS 成本估算 + Azure TCO 对比
- 执行时间线与风险评估

**v1.1+ 延期**：
- 应用代码扫描（Azure SDK 依赖检测）
- IaC 代码生成（CDK/Terraform）
- Azure Billing API 直接对接

---

## 4. 阶段设计

### Phase 1: Discover（环境发现）

**目标**：建立完整的 Azure 资源清单，分类并聚簇。

**双工具协作模型**：

CloudRays 和 Azure MCP Server 不是主备关系，而是互补协作：

| 维度 | CloudRays MCP Wrapper | Azure MCP Server |
|------|----------------------|------------------|
| 数据模式 | 快照式 — 一次扫描，全量报告 | 实时式 — 按需查询，当前状态 |
| 核心价值 | **全面体检**：资源全景 + 31 天历史指标 + 月度成本 | **专科问诊**：具体资源的 SKU 细节、配置、依赖关系 |
| 成本数据 | ✅ Consumption JSON 直接给月度成本 | ❌ 需单独调 Cost Management API |
| 性能指标 | ✅ 31 天历史 CPU/内存/IOPS | ❌ 需单独调 Monitor API |
| PaaS 深度 | 浅（映射常见服务） | 深（具体 SKU、Feature Flag、runtime stack） |
| 资源依赖 | ❌ flat list，靠推断 | ✅ ARM 模板、NSG 关联、VNet peering |

**Discover 流程（三步走）**：

| Step | 工具 | 动作 | 说明 |
|------|------|------|------|
| 1 | CloudRays | 环境检查 | 调用 `cloudrays_preflight` 检查 pwsh、az cli、认证、权限 |
| 2 | CloudRays | 全量扫描 | `cloudrays_scan` 启动异步扫描，期间并行推进 Clarify 阶段 |
| 3 | CloudRays | 读取结果 | 扫描完成后按类别 `cloudrays_read` 获取资源全景 + 成本基线 |
| 4 | Agent | 标记深挖目标 | 分析 CloudRays 结果，标记未映射的 PaaS、复杂配置的服务、依赖不明的资源 |
| 5 | Azure MCP | 针对性补充 | 对深挖目标查询具体 SKU 配置、runtime stack、node pool 细节等 |
| 6 | Azure MCP | 依赖补全 | 查询 VNet/Subnet/NSG 关联、VNet peering，补全资源依赖图 |
| 7 | Agent | 汇总分析 | 合并两个数据源，进入通用分析流程 |

**降级场景**：如果 CloudRays 扫描失败（环境不满足前提），Azure MCP Server 可以独立完成基本的资源发现，但评估质量降级（缺少历史指标和成本汇总，需在报告中标注数据局限性）。

**通用分析步骤**（数据汇合后）：

| Step | 动作 | 说明 |
|------|------|------|
| 1 | 资源分类 | 按 8 大类别分类（Compute / Storage / Database / Network / Security / Integration / AI-ML / DevOps） |
| 2 | 使用率分析 | 如有 Metrics 数据，按 CPU/内存利用率分为 idle/low/medium/high 四档，标记 right-sizing 建议 |
| 3 | 依赖分析 | 合并 CloudRays 推断 + Azure MCP 实时查询的依赖数据；如有 ARM 模板则解析 `dependsOn` |
| 4 | 聚簇 | 按依赖关系和服务亲和性将资源分组为 cluster，确定部署顺序（`creation_order_depth`） |
| 5 | 写输出 | 生成 `azure-resource-inventory.json` 和 `azure-resource-clusters.json` |

**阶段输出**：
- 资源清单（按类别聚合，标注数据来源：CloudRays / Azure MCP / 两者合并）
- 成本摘要（按服务 Top 20）
- 未映射服务列表（含 Azure MCP 补充的配置细节）
- 资源依赖图（Azure MCP 补全后）
- 环境复杂度评级（Low/Medium/High/Very High）

**与 GCP2AWS Discover 的差异**：
- GCP 版本只解析 Terraform 静态文件；Azure 版本通过 CloudRays 全量扫描 + Azure MCP 实时补充，双工具协作
- Azure 版本增加使用率分析（利用 CloudRays Metrics 数据），可直接给出 right-sizing 建议
- Azure 版本支持异步扫描 + 并行推进 Clarify，减少用户等待时间
- Azure 版本的 PaaS 深度查询能力更强（通过 Azure MCP 补充 CloudRays 覆盖不到的服务细节）

**azure-resource-inventory.json Schema**（核心字段）：

```json
{
  "timestamp": "2026-04-21T14:30:00Z",
  "metadata": {
    "total_resources": 120,
    "source": "cloudrays|arm|bicep|azure-mcp",
    "has_metrics": true,
    "has_consumption": true
  },
  "resources": [
    {
      "resource_id": "/subscriptions/.../virtualMachines/web-01",
      "type": "Microsoft.Compute/virtualMachines",
      "name": "web-01",
      "resource_group": "rg-prod",
      "location": "eastasia",
      "sku": "Standard_D4s_v5",
      "tags": {"env": "production"},
      "classification": "PRIMARY",
      "cluster_id": "compute_vm_eastasia_001",
      "config": {
        "os_type": "Linux",
        "vcpu": 4,
        "memory_gb": 16,
        "disk_size_gb": 128
      },
      "metrics": {
        "cpu_avg": 34.5,
        "cpu_p95": 67.8,
        "memory_avg_pct": 55.2,
        "utilization_tier": "medium"
      },
      "monthly_cost_usd": 245.00,
      "dependencies": [],
      "depth": 1
    }
  ]
}
```

### Phase 2: Clarify（需求澄清）

**目标**：收集用户的迁移需求和约束条件。

**与 GCP2AWS 的差异**：增加 2 个 Azure 特有问题（Q9 License 策略、Q10 Azure AD 策略），共 10 题。

**问题列表（Q1-Q10）**：

| # | 问题 | 选项 | 默认值 |
|---|------|------|--------|
| Q1 | 迁移时间线 | Immediate (0-3m) / Near-term (3-6m) / Flexible (6-12m) / No pressure | Flexible |
| Q2 | 首要关注点 | Cost / Capability / Speed / Maintainability | Cost |
| Q3 | 团队 AWS 经验 | Expert / Moderate / Novice / Mixed | Novice |
| Q4 | 流量模式 | Highly variable / Predictable / Steady / Unknown | Predictable |
| Q5 | 数据库需求 | Structured / Document / Analytics / Mix | Structured |
| Q6 | 成本敏感度 | Very / Moderate / Not primary / Depends | Moderate |
| Q7 | 多云策略 | Full exit / Multi-cloud / Undecided / Strategic Azure remains | Full exit |
| Q8 | 合规要求 | None / Standard / Strict / Varies | None |
| **Q9** | **Microsoft License 策略** | **迁移到开源替代 / BYOL / License Included / 待评估** | **迁移到开源替代** |
| **Q10** | **Azure AD/Entra ID 处理** | **迁移到 IAM Identity Center / 保留 Entra ID 联合 / 混合模式 / 待评估** | **待评估** |

**回答模式**：与 GCP2AWS 一致（Mode A/B/C/D 四种模式）。

### Phase 3: Design（AWS 架构设计）

**目标**：将 Azure 资源映射到 AWS 服务，生成架构设计方案。

**关键步骤**：

| Step | 动作 | 说明 |
|------|------|------|
| 0 | 验证输入 | 检查 inventory + clusters + clarified.json |
| 1 | 排序 Cluster | 按 `creation_order_depth` 排序 |
| 2 | 双遍映射 | Pass 1: fast-path 确定性映射；Pass 2: rubric 评估（6 维度） |
| 3 | License 检查 | 对含 Microsoft License 的服务（SQL Server, Windows）应用 Q9 策略 |
| 4 | Entra ID 专项 | 如发现 Azure AD 相关资源，根据 Q10 策略设计身份迁移方案 |
| 5 | Right-sizing | 基于 Metrics 使用率数据调整 AWS 实例规格（idle→降档/淘汰, low→降档, medium/high→对等） |
| 6 | 架构验证 | 使用 awsknowledge 检查区域可用性和功能兼容性（非阻塞） |
| 7 | 写输出 | `aws-design.json` + `aws-design-report.md` |

**6 维度 Rubric 评估**（与 GCP2AWS 一致）：

1. **Eliminators** — 功能不兼容的硬阻断
2. **Operational Model** — 托管 vs 自管理
3. **User Preference** — `clarified.json` 中的用户偏好
4. **Feature Parity** — Azure 特性 → AWS 特性可用性
5. **Cluster Context** — 与同 cluster 其他资源的亲和性
6. **Simplicity** — 更少服务/更少配置优先

**Azure 特有的 Design 考虑**：

- **Azure Front Door → CloudFront + Global Accelerator + WAF**：一个 Azure 服务拆为多个 AWS 服务
- **Azure DevOps → CodePipeline + CodeBuild + CodeDeploy**：全家桶 vs 分离服务
- **Cosmos DB → DynamoDB**：多模型 → 单模型，数据建模需完全重做
- **Azure AD → IAM Identity Center**：身份体系迁移，影响面最广

### Phase 4: Estimate（成本评估）

**目标**：估算 AWS 成本，与 Azure 当前成本做 TCO 对比。

**与 GCP2AWS 的关键差异**：

1. **Azure 成本基线可用** — 如有 `*_Consumption.json`，直接提取 Azure 月度成本（GCP 版本没有此数据源）
2. **License 成本显式计算** — SQL Server / Windows Server 的 License 成本单独列出
3. **Azure RI/Savings Plan 退出损失** — 作为一次性迁移成本项

**关键步骤**：

| Step | 动作 | 说明 |
|------|------|------|
| 0 | 验证输入 | `aws-design.json` + `clarified.json` |
| 1 | 提取 Azure 基线 | 从 `*_Consumption.json` 获取 Azure 月度成本；无数据则问用户 |
| 2 | 检查定价 API | 尝试 awspricing（3 次重试），失败则用 `pricing-fallback.json` |
| 3 | 查询 AWS 定价 | 三档估算：Premium / Balanced / Optimized |
| 4 | License 成本 | 单独计算 Windows/SQL Server 的 License Included vs BYOL vs 开源替代成本差异 |
| 5 | TCO 对比 | Azure 当前成本 vs AWS 目标成本，含年度和 3 年对比 |
| 6 | 一次性成本 | 开发人力 + 数据传输 + 培训 + 双跑期 + Azure RI/SP 退出损失 |
| 7 | ROI 分析 | 月度节省、回收期、3 年 / 5 年总节省 |
| 8 | 写输出 | `estimation.json` + `estimation-report.md` |

### Phase 5: Execute（执行计划）

**目标**：生成迁移执行时间线、风险评估、回滚方案。

**时间线框架**（基于 migration-assessment-guide.md 三阶段模型）：

| 周 | 阶段 | 活动 |
|----|------|------|
| 1-2 | Planning & Setup | AWS 账号结构、Landing Zone（Control Tower）、网络连通性（Direct Connect/VPN） |
| 3-4 | Team Enablement | AWS 技能培训、SOP 编写、监控体系搭建（CloudWatch） |
| 5-7 | PoC & Validation | 优先迁移最小 cluster、性能基线测试、数据管道验证 |
| 8-10 | Wave Migration | 按 cluster 依赖顺序分波次迁移、数据同步、功能验证 |
| 11 | Cutover | DNS 切换、双跑监控、回滚待命 |
| 12 | Stabilization | 性能调优、成本对账、Azure 退役规划 |
| 14+ | Azure Teardown | 归档数据、删除资源、关闭计费 |

**风险评估矩阵**（基于 migration-assessment-guide.md 2.5 节）：

| 风险类别 | 关键风险项 |
|----------|-----------|
| 技术 | Azure 独有服务无直接映射、数据迁移量大(>10TB)、应用代码深度绑定 Azure SDK、数据库兼容性 |
| 运营 | 团队缺乏 AWS 经验、监控告警重建、运维流程变更 |
| 合规 | 数据驻留要求、行业认证迁移 |
| 供应商 | **Microsoft License 限制（重点）**、Azure 合同提前终止费 |

---

## 5. 服务映射策略

### 5.1 映射优先级

1. **Fast-path（确定性映射）** — Low 复杂度、1:1 对应的服务直接映射
2. **Rubric（评估映射）** — Medium/High 复杂度的服务需 6 维度评估
3. **Special handling（专项处理）** — Entra ID、DevOps、Cosmos DB 等需专项方案

### 5.2 复杂度分层

基于 `service-mapping.md` 附录的复杂度评级：

| 复杂度 | 服务数 | 映射策略 | 示例 |
|--------|--------|---------|------|
| **Low** | ~15 | fast-path 自动映射 | VM→EC2, VNet→VPC, Managed Disks→EBS, Redis→ElastiCache |
| **Medium** | ~13 | rubric 评估 + 人工确认 | AKS→EKS, Functions→Lambda, Blob→S3, Azure SQL→RDS/Aurora |
| **High** | ~9 | 专项评估 + PoC 验证 | Cosmos DB→DynamoDB, Synapse→Redshift, Azure AD→IAM Identity Center, DevOps→CodePipeline |

### 5.3 License-Aware 映射

对含 Microsoft License 的服务，根据 Q9 用户策略：

| 用户策略 | SQL Server 映射 | Windows VM 映射 |
|----------|---------------|----------------|
| 迁移到开源替代 | Aurora PostgreSQL/MySQL | Amazon Linux + 应用适配 |
| BYOL | RDS Custom for SQL Server | EC2 BYOL |
| License Included | RDS for SQL Server (LI) | EC2 with Windows LI |
| 待评估 | 两种方案并列，成本对比 | 两种方案并列 |

---

## 6. MCP Server 配置

### 6.1 完整配置（`.mcp.json`）

```json
{
  "mcpServers": {
    "azure-mcp": {
      "command": "npx",
      "args": ["-y", "@azure/mcp@latest", "server", "start"],
      "env": {},
      "timeout": 120000,
      "type": "stdio"
    },
    "awsknowledge": {
      "type": "http",
      "url": "https://knowledge-mcp.global.api.aws"
    },
    "awspricing": {
      "command": "uvx",
      "args": ["awslabs.aws-pricing-mcp-server@latest"],
      "env": {
        "FASTMCP_LOG_LEVEL": "ERROR"
      },
      "timeout": 120000,
      "type": "stdio"
    },
    "aws-documentation": {
      "command": "uvx",
      "args": ["awslabs.aws-documentation-mcp-server@latest"],
      "env": {
        "FASTMCP_LOG_LEVEL": "ERROR"
      },
      "timeout": 60000,
      "type": "stdio"
    },
    "aws-diagram": {
      "command": "uvx",
      "args": ["awslabs.aws-diagram-mcp-server@latest"],
      "env": {
        "FASTMCP_LOG_LEVEL": "ERROR"
      },
      "timeout": 60000,
      "type": "stdio"
    },
    "cost-analysis": {
      "command": "uvx",
      "args": ["awslabs.cost-analysis-mcp-server@latest"],
      "env": {
        "FASTMCP_LOG_LEVEL": "ERROR"
      },
      "timeout": 60000,
      "type": "stdio"
    },
    "cloudrays": {
      "command": "node",
      "args": ["cloudrays-mcp-wrapper/index.js"],
      "env": {
        "CLOUDRAYS_REPO": "https://github.com/awslabs/resource-discovery-for-azure.git",
        "CLOUDRAYS_WORK_DIR": "/tmp/cloudrays"
      },
      "timeout": 300000,
      "type": "stdio"
    }
  }
}
```

### 6.2 与 GCP2AWS 配置的差异

| 差异点 | GCP2AWS | Azure2AWS |
|--------|---------|-----------|
| 源云 MCP | 无 | `azure-mcp` — 实时读取 Azure 资源 |
| 文档搜索 | 无 | `aws-documentation` — 服务映射时查询文档 |
| 架构图 | 无 | `aws-diagram` — 生成当前/目标架构图 |
| 成本分析 | 无 | `cost-analysis` — 已有 AWS 环境时的 Cost Explorer |
| 共有 | `awsknowledge` + `awspricing` | `awsknowledge` + `awspricing` |
| CloudRays | 无 | `cloudrays` — CloudRays MCP wrapper，自动扫描 Azure 环境 |

**rationale**：Azure 迁移评估比 GCP 迁移需要更多工具支持，因为 (a) 需要实时查询 Azure 环境补充 CloudRays 数据，(b) 服务映射更复杂需要频繁查文档，(c) 评估报告通常需要架构图。

---

## 7. CloudRays MCP Wrapper 详细规格

### 7.1 概述

CloudRays（[awslabs/resource-discovery-for-azure](https://github.com/awslabs/resource-discovery-for-azure)）是一组 PowerShell 脚本，通过 Azure 只读 API 采集资源清单、计费数据和性能指标。MCP wrapper 将其封装为标准 MCP tool，提供异步扫描、进度查询、结构化读取能力，使 Kiro agent 能够在 Discover 阶段自动完成 Azure 环境扫描。

### 7.2 Tool 定义（5 个 tool）

#### Tool 1: `cloudrays_preflight`

- **用途**：检查运行环境和认证状态
- **输入**：无必选参数
- **输出**：

```json
{
  "ready": true,
  "checks": {
    "pwsh": { "available": true, "version": "7.4.x" },
    "az_cli": { "available": true, "version": "2.x.x" },
    "az_auth": { "authenticated": true, "subscription": "xxx", "tenant": "xxx" },
    "permissions": {
      "reader": true,
      "billing_reader": true,
      "monitoring_reader": true,
      "cost_management_reader": true
    }
  },
  "issues": []
}
```

#### Tool 2: `cloudrays_scan`

- **用途**：启动异步 CloudRays 扫描
- **输入**：
  - `report_name` (required): 客户/项目名称
  - `subscription_id` (optional): 指定扫描的 subscription
  - `resource_group` (optional): 指定资源组
  - `concurrency_limit` (optional, default 4): 并发采集数
  - `skip_consumption` (optional, default false): 是否跳过成本数据采集
- **输出**：

```json
{
  "scan_id": "uuid",
  "status": "running",
  "started_at": "ISO8601",
  "estimated_duration_minutes": 15,
  "message": "扫描已启动，可通过 cloudrays_status 查询进度"
}
```

- **内部实现**：spawn detached PowerShell 子进程，立即返回

#### Tool 3: `cloudrays_status`

- **用途**：查询扫描进度和状态
- **输入**：`scan_id` (required)
- **输出**：

```json
{
  "scan_id": "uuid",
  "status": "running|completed|failed|partial",
  "started_at": "ISO8601",
  "elapsed_seconds": 420,
  "progress": {
    "current_collector": "VirtualMachines",
    "collectors_completed": 12,
    "collectors_total": 28,
    "percent": 43
  },
  "output_dir": "/tmp/cloudrays/uuid/InventoryReports/",
  "error": null
}
```

- **进度解析**：通过 tail CloudRays 的 stdout log，正则匹配 collector 进度

#### Tool 4: `cloudrays_read`

- **用途**：读取扫描结果，支持按类别筛选和聚合
- **输入**：
  - `scan_id` (required)
  - `category` (required): 枚举值
    - `summary` — 全局摘要（资源总数、服务类型数、总月度成本）
    - `compute` — VM、VMSS、App Service、Functions 等
    - `storage` — Storage Account、Blob、Files、Disks
    - `database` — SQL Database、Cosmos DB、MySQL、PostgreSQL
    - `networking` — VNet、Load Balancer、Application Gateway、Front Door
    - `analytics` — Synapse、Data Factory、Databricks、HDInsight
    - `security_identity` — Entra ID、Key Vault、Defender
    - `integration` — Service Bus、Event Grid、Event Hub、Logic Apps、API Management
    - `ai_ml` — Cognitive Services、Machine Learning、OpenAI Service
    - `cost_summary` — 按服务分类的月度成本 Top 20
    - `unmapped_services` — CloudRays 未能自动映射的 Azure PaaS 服务
    - `raw_inventory` — 完整资源清单（仅在其他类别信息不够时使用）
    - `raw_consumption` — 完整成本数据
    - `raw_metrics` — 完整性能指标
  - `top_n` (optional, default 20): 返回条目数限制
  - `sort_by` (optional): cost | count | name
- **输出**：结构化 JSON，每个 category 返回聚合后的数据，不超过 50KB
- **内部实现**：读取 CloudRays JSON 输出，用预定义的 filter + aggregation 逻辑处理

#### Tool 5: `cloudrays_list_scans`

- **用途**：列出历史扫描记录（支持 session 恢复）
- **输入**：无必选参数
- **输出**：

```json
{
  "scans": [
    {
      "scan_id": "uuid",
      "report_name": "客户A",
      "status": "completed",
      "started_at": "ISO8601",
      "completed_at": "ISO8601",
      "resource_count": 347
    }
  ]
}
```

### 7.3 状态管理

- 每个 scan 的状态持久化到 `{CLOUDRAYS_WORK_DIR}/{scan_id}/state.json`
- 包含：scan_id, status, config, timestamps, output file paths, error info
- Kiro session 断开重连后，通过 `cloudrays_list_scans` 恢复上下文

### 7.4 错误处理

| 错误类型 | 处理策略 |
|----------|----------|
| `auth_expired` | 提示用户重新 `az login` |
| `subscription_not_found` | 列出可用 subscription 让用户选择 |
| `permission_denied` | 明确列出缺失的角色（Reader / Billing Reader / Monitoring Reader / Cost Management Reader） |
| `timeout` | 部分结果可用时返回 `partial` 状态，agent 可以基于已有数据继续 |
| `script_error` | 返回最后 50 行 log 供诊断 |

### 7.5 安全考虑

- wrapper 本身不存储任何 Azure 凭证，依赖 `az cli` 的认证
- CloudRays 脚本只使用只读 API，不修改任何 Azure 资源
- 扫描结果存储在本地 `/tmp/cloudrays/`，不上传到任何外部服务
- 建议用户在评估完成后清理 `/tmp/cloudrays/` 目录

### 7.6 技术栈和依赖

- Node.js >= 18（与 Kiro CLI 环境一致）
- 使用 `@modelcontextprotocol/sdk` 构建 MCP server
- 子进程管理用 Node.js `child_process.spawn`
- JSON 解析和聚合用原生 Node.js，无额外依赖
- CloudRays 脚本从 GitHub clone 到 `{CLOUDRAYS_WORK_DIR}/repo/`

### 7.7 目录结构

```
cloudrays-mcp-wrapper/
├── index.js              # MCP server 入口
├── tools/
│   ├── preflight.js      # 环境检查
│   ├── scan.js           # 启动扫描
│   ├── status.js         # 进度查询
│   ├── read.js           # 结果读取 + 聚合
│   └── list-scans.js     # 历史记录
├── lib/
│   ├── aggregator.js     # JSON 聚合逻辑（按类别过滤、Top N、摘要生成）
│   ├── progress-parser.js # CloudRays log 进度解析
│   └── state-manager.js  # 扫描状态持久化
├── package.json
└── README.md
```

---

## 8. References 文件规划

### 8.1 Phase References

| 文件 | 行数估计 | 用途 |
|------|---------|------|
| `phases/discover.md` | ~300 | CloudRays + Azure MCP 双工具协作流程、资源分类框架、使用率分析、聚簇算法、降级策略 |
| `phases/clarify.md` | ~120 | Q1-Q10 问题展示、四种回答模式、答案归一化 |
| `phases/design.md` | ~300 | 双遍映射流程、6 维 rubric、License 检查、Right-sizing、架构验证 |
| `phases/estimate.md` | ~250 | Azure 基线提取、三档 AWS 估算、License 成本、TCO 对比、ROI |
| `phases/execute.md` | ~200 | 12 周时间线、风险矩阵、回滚方案、Azure 退役 checklist |

### 8.2 Design References

| 文件 | 用途 |
|------|------|
| `design-refs/index.md` | Azure 资源类型 → 服务类别的索引（`Microsoft.Compute/*` → compute 等） |
| `design-refs/fast-path.md` | ~15 个 Low 复杂度服务的确定性 1:1 映射表 |
| `design-refs/compute.md` | VM, VMSS, App Service, AKS, Functions, Batch 的选型 rubric |
| `design-refs/database.md` | Azure SQL, Cosmos DB, MySQL, PostgreSQL, Redis 的选型 rubric |
| `design-refs/storage.md` | Blob, Files, Managed Disks, NetApp Files 的选型 rubric |
| `design-refs/networking.md` | VNet, LB, App Gateway, Front Door, DNS, VPN 的选型 rubric |
| `design-refs/security-identity.md` | **重点**：Entra ID 迁移方案、Key Vault→KMS/Secrets Manager、WAF 规则迁移 |
| `design-refs/analytics.md` | Synapse, Data Factory, Stream Analytics, HDInsight, Power BI 的选型 rubric |
| `design-refs/ai-ml.md` | Azure OpenAI→Bedrock, Azure ML→SageMaker, Cognitive Services 拆分映射 |
| `design-refs/integration.md` | Service Bus→SQS/SNS, Event Grid→EventBridge, API Management→API Gateway |
| `design-refs/devops.md` | Azure DevOps 全家桶拆分、Azure Monitor→CloudWatch、ARM→CloudFormation/CDK |

### 8.3 Shared References

| 文件 | 用途 |
|------|------|
| `shared/clarify-questions.md` | Q1-Q10 完整问题、选项、默认值、模式说明 |
| `shared/output-schema.md` | 所有阶段输出文件的 JSON Schema |
| `shared/service-mapping.md` | 完整 Azure→AWS 映射表（从源材料 `service-mapping.md` 精炼） |
| `shared/pricing-fallback.json` | 离线 AWS 定价数据（按服务/区域/规格缓存） |
| `shared/complexity-ratings.md` | 每个 Azure 服务的迁移复杂度（Low/Medium/High）及原因 |
| `shared/license-guidance.md` | Microsoft BYOL 政策、Listed Provider 限制、开源替代建议 |
| `shared/cloudrays-integration.md` | CloudRays MCP wrapper 使用指南，含 SKILL.md 中 Discover 阶段调用 tool 的示例流程 |

---

## 9. 与 GCP2AWS 的差异点

### 9.1 输入源差异

| 维度 | GCP2AWS | Azure2AWS |
|------|---------|-----------|
| 主要输入 | Terraform `.tf` 文件 | CloudRays 全量扫描（主力）+ Azure MCP 实时补充 |
| 实时查询 | 无 | Azure MCP Server（PaaS 细节 + 依赖关系） |
| 使用率数据 | 无（v1.0） | CloudRays Metrics JSON（31 天历史） |
| 成本数据 | 无（v1.0） | CloudRays Consumption JSON |
| 代码扫描 | v1.1 | v1.1 |

**设计影响**：Phase 1 (Discover) 需要支持多输入源分派和数据归一化，比 GCP 版本复杂。

### 9.2 映射复杂度差异

Azure 生态与 AWS 的差异点比 GCP 更多：

1. **身份体系**：Azure AD/Entra ID 是 Azure 生态核心，渗透到几乎所有服务的认证授权。迁移到 AWS 需要重建整个身份体系，这在 GCP 迁移中不存在（GCP IAM 与 AWS IAM 相似度更高）。

2. **License 限制**：Microsoft 2022 年修改 BYOL 政策后，在 AWS 上运行 SQL Server / Windows Server 的成本可能显著高于 Azure（Azure Hybrid Benefit）。GCP 迁移不存在此问题。

3. **PaaS 深度绑定**：Azure 有大量企业级 PaaS 服务（Logic Apps, Power Platform, Dynamics 365）与 Microsoft 365 深度集成，迁移这些服务到 AWS 需要找替代方案或第三方服务。

4. **一对多映射**：Azure Front Door → CloudFront + Global Accelerator + WAF；Azure DevOps → CodePipeline + CodeBuild + CodeDeploy + CodeArtifact。GCP 到 AWS 的服务粒度更对等。

### 9.3 成本评估差异

| 维度 | GCP2AWS | Azure2AWS |
|------|---------|-----------|
| 源云成本基线 | 无直接数据，问用户 | CloudRays Consumption JSON 直接提取 |
| License 成本 | 不涉及 | 需显式计算 Microsoft License 影响 |
| RI/SP 退出 | GCP CUD 退出损失 | Azure RI/Savings Plan 退出损失 |
| 双跑期 | 含 | 含（且通常更长，因映射复杂度高） |

### 9.4 Skill 设计上的注意事项

1. **discover.md 需要双工具协作逻辑**：CloudRays MCP wrapper 全量扫描 + Azure MCP Server 针对性补充，以及降级到纯 Azure MCP 的 fallback 路径
2. **design-refs/ 文件更多**：Azure 服务类别更细，需要 9 个 rubric 文件 vs GCP 的 ~5 个
3. **clarify-questions.md 扩展到 10 题**：增加 License 和 Identity 两个 Azure 特有问题
4. **license-guidance.md 是全新文件**：GCP 迁移不需要此文件
5. **estimate.md 增加 TCO 对比逻辑**：有 Azure 成本基线数据，可以做更精确的 TCO 对比
6. **execute.md 增加 Landing Zone 步骤**：Azure 企业客户通常需要 AWS Control Tower 搭建

---

## 10. 实施路线图

### Phase A：基础框架（Week 1-2）

- [ ] 创建目录结构（`skills/azure-to-aws/` 全目录树）
- [ ] 编写 `SKILL.md`（基于本文档第 3 节）
- [ ] 编写 `shared/output-schema.md`（所有阶段 JSON Schema）
- [ ] 编写 `shared/clarify-questions.md`（Q1-Q10）
- [ ] 编写 `shared/service-mapping.md`（从源材料精炼）
- [ ] 编写 `shared/complexity-ratings.md`
- [ ] 配置 `.mcp.json`
- [ ] 编写 `README.md`
- [ ] **开发 CloudRays MCP wrapper**（`cloudrays-mcp-wrapper/` 全部文件，含 5 个 tool 实现、aggregator、state manager）
- [ ] **编写 `shared/cloudrays-integration.md`**（wrapper 使用指南 + Discover 阶段调用示例）

### Phase B：Phase 1-2 实现（Week 3-4）

- [ ] 编写 `phases/discover.md`（CloudRays + Azure MCP 双工具协作流程 + 降级策略 + 聚簇算法）
- [ ] 编写 `phases/clarify.md`（10 题 + 4 种模式）
- [ ] 准备测试数据（模拟 CloudRays JSON 输出）
- [ ] 端到端测试 Discover → Clarify 流程

### Phase C：Phase 3 实现（Week 5-7）

- [ ] 编写 `design-refs/index.md`
- [ ] 编写 `design-refs/fast-path.md`
- [ ] 编写所有 9 个 design rubric 文件
- [ ] 编写 `shared/license-guidance.md`
- [ ] 编写 `phases/design.md`
- [ ] 测试 fast-path 映射准确性
- [ ] 测试 rubric 评估逻辑

### Phase D：Phase 4-5 实现（Week 8-9）

- [ ] 准备 `shared/pricing-fallback.json`（从 AWS Pricing API 缓存主要服务定价）
- [ ] 编写 `phases/estimate.md`（含 Azure TCO 对比逻辑）
- [ ] 编写 `phases/execute.md`
- [ ] 端到端测试全 5 阶段流程

### Phase E：验证与发布（Week 10）

- [ ] 用真实 Azure 环境数据做集成测试
- [ ] 对比人工评估结果校准 skill 输出
- [ ] 编写使用文档和示例
- [ ] 发布 v1.0

### 里程碑

| 时间 | 里程碑 | 产出 |
|------|--------|------|
| Week 2 | 框架就绪 | SKILL.md + shared/ 全部文件 |
| Week 4 | Discover+Clarify 可用 | 能完成 Phase 1-2 |
| Week 7 | Design 可用 | 能完成 Phase 1-3，核心 rubric 完成 |
| Week 9 | 全流程可用 | 5 阶段端到端 |
| Week 10 | v1.0 发布 | 通过集成测试 |

---

## 附录 A：PDF 参考资料

`Mastering Cloud Differentiation- AWS and Azure.pdf` 由于文件访问限制未能读取。建议后续补充以下内容到 `design-refs/` 中：
- AWS vs Azure 在 AI/ML、数据分析、混合云方面的架构差异
- 两家云厂商的定价策略和折扣模型对比
- 企业客户在双云决策中的常见考量

## 附录 B：关键工具链接

| 工具 | 链接 | 用途 |
|------|------|------|
| resource-discovery-for-azure (CloudRays) | https://github.com/awslabs/resource-discovery-for-azure | Azure 环境扫描 |
| Azure MCP Server | https://github.com/microsoft/mcp | Azure 资源实时查询（微软官方，40+ Azure 服务） |
| AWS MCP Servers | https://github.com/awslabs/mcp | AWS 官方 MCP 服务器群 |
| Kiro CLI | https://kiro.dev | AI 开发环境 |
