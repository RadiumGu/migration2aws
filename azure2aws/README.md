# Azure to AWS Migration Assessment Skill

AI-driven migration assessment from Microsoft Azure to Amazon Web Services, powered by Kiro CLI agent skills.

## Overview

This skill guides a 5-phase migration assessment process:

1. **Discover** — Scan Azure environment via CloudRays + Azure MCP (resources, metrics, costs)
2. **Clarify** — Collect migration requirements (10 structured questions including License & Identity strategy)
3. **Design** — Map Azure services to AWS with rubric-based evaluation
4. **Estimate** — Calculate AWS costs with Azure TCO comparison
5. **Execute** — Generate migration timeline, risk matrix, and rollback plan

## Directory Structure

```
azure2aws/
├── skills/
│   └── azure-to-aws/
│       ├── SKILL.md                      # Skill definition (entry point)
│       └── references/
│           ├── phases/                   # Per-phase workflow instructions
│           │   ├── discover.md
│           │   ├── clarify.md
│           │   ├── design.md
│           │   ├── estimate.md
│           │   └── execute.md
│           ├── design-refs/              # Service-category mapping rubrics
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
│           └── shared/                   # Cross-phase references
│               ├── clarify-questions.md
│               ├── output-schema.md
│               ├── service-mapping.md
│               ├── pricing-fallback.json
│               ├── complexity-ratings.md
│               ├── license-guidance.md
│               └── cloudrays-integration.md
├── cloudrays-mcp-wrapper/                # CloudRays MCP wrapper (Node.js)
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
├── .mcp.json                             # MCP Server configuration
└── README.md                             # This file
```

## Prerequisites

| Dependency | Version | Purpose |
|------------|---------|---------|
| PowerShell (`pwsh`) | 7.0+ | CloudRays scripts |
| Azure CLI (`az`) | 2.x | Auth + data collection |
| Node.js | 18+ | CloudRays MCP wrapper + Kiro CLI |
| Kiro CLI | latest | Agent runtime |

### Azure RBAC Roles Required

- `Reader` — read resource configuration
- `Billing Reader` — access billing data
- `Monitoring Reader` — read Azure Monitor metrics
- `Cost Management Reader` — read cost management data

## Quick Start

```bash
# 1. Authenticate to Azure
az login

# 2. Start Kiro CLI in this directory
cd azure2aws
kiro chat

# 3. Trigger the skill
> Migrate my Azure environment to AWS
```

The skill will automatically detect available tools (CloudRays, Azure MCP) and guide you through the 5-phase assessment.

## Key Differences from GCP2AWS

| Dimension | GCP2AWS | Azure2AWS |
|-----------|---------|-----------|
| Input source | Terraform `.tf` files | CloudRays scan + Azure MCP + ARM/Bicep |
| Discovery | Static Terraform parsing | Multi-source data fusion |
| Clarify questions | 8 | 10 (+ License strategy, + Entra ID strategy) |
| Special concerns | — | Microsoft License restrictions, Entra ID migration |
| Cost baseline | User-provided | CloudRays Consumption JSON (automatic) |

## References

- [resource-discovery-for-azure (CloudRays)](https://github.com/awslabs/resource-discovery-for-azure)
- [Azure MCP Server](https://github.com/microsoft/mcp)
- [AWS MCP Servers](https://github.com/awslabs/mcp)
- [Kiro CLI](https://kiro.dev)
