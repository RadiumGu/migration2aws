# migration2aws

> 🌐 [English Documentation](./README.md)

一套 AI 驱动的云迁移评估工具集，用于将工作负载从各主流云平台迁移至 AWS。

## 子项目

| 项目 | 说明 | 状态 |
|------|------|------|
| [azure2aws](./azure2aws/README.zh.md) | Azure → AWS 迁移评估（AI Skill，5 阶段） | ✅ 可用 |
| [gcp2aws](./gcp2aws/README.zh.md) | GCP → AWS 迁移评估（AI Skill，5 阶段） | ✅ 可用 |

## 概述

每个子项目均提供结构化的 AI 驱动 5 阶段迁移评估流程：

1. **发现（Discover）** — 盘点源云环境资源
2. **澄清（Clarify）** — 收集迁移需求
3. **设计（Design）** — 将源服务映射至 AWS 对应服务
4. **估算（Estimate）** — 计算 AWS 费用及 TCO 对比
5. **执行（Execute）** — 生成迁移时间线、风险矩阵和回滚方案

## 工具与参考资源

- [Migration Evaluator](https://console.tsologic.com/) — 基础设施数据采集及 TCO 商业案例生成
- [AWS Transform Assessment](https://aws.amazon.com/transform/assessment/) — AI 驱动的迁移规划与 EC2 选型
- [AWS Migration Hub](https://aws.amazon.com/migration-hub/) — 统一迁移进度跟踪

## 目录结构

```
migration2aws/
├── azure2aws/          # Azure 迁移至 AWS 的 Skill
├── gcp2aws/            # GCP 迁移至 AWS 的 Skill
├── doc/                # 内部文档（不同步至 GitHub）
├── README.md           # 英文文档
└── README.zh.md        # 本文件（中文）
```

## 许可证

Apache-2.0
