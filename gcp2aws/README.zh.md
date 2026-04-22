# GCP 迁移至 AWS 插件

> 🌐 [English Documentation](./README.md)

通过 AI 驱动的 5 阶段引导流程，将 Google Cloud Platform 工作负载迁移至 AWS。

## 概述

本插件通过以下步骤引导 GCP 基础设施迁移至 AWS：

1. **发现（Discover）** — 扫描 Terraform 文件中的 GCP 资源
2. **澄清（Clarify）** — 回答 8 个迁移需求问题
3. **设计（Design）** — 将 GCP 服务映射至对应 AWS 服务
4. **估算（Estimate）** — 计算月度费用及 ROI
5. **执行（Execute）** — 规划迁移时间线和回滚方案

## 使用方式

使用以下迁移相关语句触发 Skill：

- "Migrate my GCP infrastructure to AWS"
- "Move off Google Cloud"
- "Migrate Cloud SQL to RDS"
- "GCP to AWS migration plan"

## 适用范围（v1.0）

- **支持**：基于 Terraform 的 GCP 基础设施
- **输出**：AWS 架构设计、成本估算、执行时间线
- **暂不支持**（v1.1+ 规划）：应用代码扫描、账单数据导入、CDK 代码生成

## 集成的 MCP Server

- **awspricing** — 实时 AWS 定价（含缓存数据兜底）
- **awsknowledge** — AWS 服务指南和最佳实践

## 文件说明

- `SKILL.md` — 主 Skill 编排器
- `references/phases/` — 各阶段工作流实现
- `references/design-refs/` — AWS 服务映射评分体系
- `references/shared/` — 公共工具和定价数据

## 状态追踪架构

插件使用状态文件（`.migration/[MMDD-HHMM]/`）在多次调用间保持迁移进度：

- `.phase-status.json` — 当前阶段和状态
- `gcp-resource-inventory.json` — 已发现的 GCP 资源
- `clarified.json` — 用户迁移需求
- `aws-design.json` — 已映射的 AWS 服务
- `estimation.json` — 成本分析结果
- `execution.json` — 时间线和风险矩阵

## 安装

```bash
/plugin marketplace add awslabs/agent-plugins
/plugin install migration-to-aws@agent-plugins-for-aws
```

## 本地开发测试

```bash
claude --plugin-dir ./plugins/migration-to-aws
```

## 许可证

Apache-2.0
