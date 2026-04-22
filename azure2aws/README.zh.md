# Azure 迁移至 AWS 评估 Skill

> 🌐 [English Documentation](./README.md)

基于 Kiro CLI Agent Skill 的 AI 驱动迁移评估工具，用于将 Microsoft Azure 工作负载迁移至 Amazon Web Services。

## 概述

本 Skill 提供结构化的 5 阶段迁移评估流程：

1. **发现（Discover）** — 通过 CloudRays + Azure MCP 扫描 Azure 环境（资源、指标、成本）
2. **澄清（Clarify）** — 收集迁移需求（10 个结构化问题，含 License 策略和 Identity 策略）
3. **设计（Design）** — 基于评分体系将 Azure 服务映射至 AWS 服务
4. **估算（Estimate）** — 计算 AWS 费用并与 Azure TCO 对比
5. **执行（Execute）** — 生成迁移时间线、风险矩阵和回滚方案

## 目录结构

```
azure2aws/
├── skills/
│   └── azure-to-aws/
│       ├── SKILL.md                      # Skill 定义（入口文件）
│       └── references/
│           ├── phases/                   # 各阶段工作流说明
│           │   ├── discover.md
│           │   ├── clarify.md
│           │   ├── design.md
│           │   ├── estimate.md
│           │   └── execute.md
│           ├── design-refs/              # 服务类别映射评分体系
│           │   ├── index.md
│           │   ├── fast-path.md
│           │   ├── compute.md
│           │   ├── database.md
│           │   ├── storage.md
│           │   ├── networking.md
│           │   ├── security-identity.md
│           │   ├── analytics.md
│           │   ├── ai-ml.md
│           │   ├── integration.md
│           │   └── devops.md
│           └── shared/                   # 跨阶段公共引用
│               ├── clarify-questions.md
│               ├── output-schema.md
│               ├── service-mapping.md
│               ├── complexity-ratings.md
│               ├── license-guidance.md
│               └── cloudrays-integration.md
├── cloudrays-mcp-wrapper/                # CloudRays MCP Wrapper（Node.js）
│   ├── index.js
│   ├── tools/
│   │   ├── preflight.js
│   │   ├── scan.js
│   │   ├── status.js
│   │   ├── read.js
│   │   └── list-scans.js
│   ├── lib/
│   │   ├── aggregator.js
│   │   ├── progress-parser.js
│   │   └── state-manager.js
│   ├── package.json
│   └── README.md
├── .mcp.json                             # MCP Server 配置
├── README.md                             # 英文文档
└── README.zh.md                          # 本文件（中文）
```

## 前置条件

| 依赖 | 版本 | 用途 |
|------|------|------|
| PowerShell (`pwsh`) | 7.0+ | CloudRays 脚本 |
| Azure CLI (`az`) | 2.x | 认证 + 数据采集 |
| Node.js | 18+ | CloudRays MCP Wrapper + Kiro CLI |
| Kiro CLI | 最新版 | Agent 运行时 |

### 所需 Azure RBAC 角色

- `Reader` — 读取资源配置
- `Billing Reader` — 访问账单数据
- `Monitoring Reader` — 读取 Azure Monitor 指标
- `Cost Management Reader` — 读取成本管理数据

## 快速开始

```bash
# 1. 登录 Azure
az login

# 2. 在本目录启动 Kiro CLI
cd azure2aws
kiro chat

# 3. 触发 Skill
> Migrate my Azure environment to AWS
```

Skill 会自动检测可用工具（CloudRays、Azure MCP）并引导完成 5 阶段评估。

## 与 GCP2AWS 的主要差异

| 维度 | GCP2AWS | Azure2AWS |
|------|---------|-----------|
| 输入来源 | Terraform `.tf` 文件 | CloudRays 扫描 + Azure MCP + ARM/Bicep |
| 发现方式 | 静态 Terraform 解析 | 多源数据融合 |
| 澄清问题数 | 8 个 | 10 个（新增 License 策略、Entra ID 策略） |
| 特殊关注点 | — | Microsoft License 限制、Entra ID 迁移 |
| 成本基线 | 用户提供 | CloudRays 消费 JSON（自动获取） |

## 参考资源

- [resource-discovery-for-azure (CloudRays)](https://github.com/awslabs/resource-discovery-for-azure)
- [Azure MCP Server](https://github.com/microsoft/mcp)
- [AWS MCP Servers](https://github.com/awslabs/mcp)
- [Kiro CLI](https://kiro.dev)
