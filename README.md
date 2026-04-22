# migration2aws

> 🌐 [中文文档](./README.zh.md)

A collection of AI-powered migration assessment skills and tools for migrating workloads from various cloud platforms to AWS.

## Sub-projects

| Project | Description | Status |
|---------|-------------|--------|
| [azure2aws](./azure2aws/) | Azure → AWS migration assessment (AI skill, 5-phase) | ✅ Active |
| [gcp2aws](./gcp2aws/) | GCP → AWS migration assessment (AI skill, 5-phase) | ✅ Active |

## Overview

Each sub-project provides a structured, AI-driven 5-phase migration assessment workflow:

1. **Discover** — Inventory source cloud resources
2. **Clarify** — Collect migration requirements
3. **Design** — Map source services to AWS equivalents
4. **Estimate** — Calculate AWS costs and TCO comparison
5. **Execute** — Generate migration timeline, risk matrix, and rollback plan

## Tools & References

- [Migration Evaluator](https://console.tsologic.com/) — Infrastructure data collection and TCO business case
- [AWS Transform Assessment](https://aws.amazon.com/transform/assessment/) — AI-driven migration planning and EC2 sizing
- [AWS Migration Hub](https://aws.amazon.com/migration-hub/) — Centralized migration tracking

## Repository Structure

```
migration2aws/
├── azure2aws/          # Azure to AWS migration skill
├── gcp2aws/            # GCP to AWS migration skill
├── doc/                # Internal documentation (not tracked in git)
├── README.md           # This file (English)
└── README.zh.md        # Chinese version
```

## License

Apache-2.0
