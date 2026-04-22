# Output Schema Reference

Complete JSON schemas for all phase outputs and state files in the Azure-to-AWS skill.

**Convention**: Values shown as `enum: ["X", "Y"]` indicate allowed alternatives — use exactly one value per field. Always select one concrete value.

## .phase-status.json

Current phase tracking and status.

```json
{
  "phase": "discover",
  "status": "in-progress",
  "timestamp": "2026-04-21T14:30:00Z",
  "version": "1.0.0"
}
```

| Field | Type | Allowed values |
|-------|------|----------------|
| `phase` | string | `"discover"`, `"clarify"`, `"design"`, `"estimate"`, `"execute"` |
| `status` | string | `"in-progress"`, `"completed"` |
```

---

## azure-resource-inventory.json (Phase 1 output)

All discovered Azure resources with configuration, utilization metrics, cost, and dependencies.

```json
{
  "timestamp": "2026-04-21T14:30:00Z",
  "metadata": {
    "total_resources": 120,
    "primary_resources": 35,
    "secondary_resources": 85,
    "total_clusters": 12,
    "source": "cloudrays",
    "has_metrics": true,
    "has_consumption": true,
    "scan_id": "uuid-of-cloudrays-scan",
    "azure_subscriptions": ["sub-id-1", "sub-id-2"],
    "azure_regions": ["eastasia", "japaneast"]
  },
  "resources": [
    {
      "resource_id": "/subscriptions/xxx/resourceGroups/rg-prod/providers/Microsoft.Compute/virtualMachines/web-01",
      "type": "Microsoft.Compute/virtualMachines",
      "name": "web-01",
      "resource_group": "rg-prod",
      "subscription_id": "xxx",
      "location": "eastasia",
      "sku": "Standard_D4s_v5",
      "tags": { "env": "production", "app": "frontend" },
      "classification": "PRIMARY",
      "secondary_role": null,
      "cluster_id": "compute_vm_eastasia_001",
      "config": {
        "os_type": "Linux",
        "vcpu": 4,
        "memory_gb": 16,
        "disk_size_gb": 128,
        "license_type": "none"
      },
      "metrics": {
        "cpu_avg": 34.5,
        "cpu_p95": 67.8,
        "memory_avg_pct": 55.2,
        "disk_iops_avg": 120,
        "network_in_mbps_avg": 25.3,
        "utilization_tier": "medium"
      },
      "monthly_cost_usd": 245.00,
      "dependencies": [
        "/subscriptions/xxx/.../virtualNetworks/vnet-prod"
      ],
      "depth": 1,
      "serves": [],
      "source": "cloudrays",
      "needs_depth_query": false
    },
    {
      "resource_id": "/subscriptions/xxx/.../virtualNetworks/vnet-prod",
      "type": "Microsoft.Network/virtualNetworks",
      "name": "vnet-prod",
      "resource_group": "rg-prod",
      "subscription_id": "xxx",
      "location": "eastasia",
      "sku": null,
      "tags": { "env": "production" },
      "classification": "PRIMARY",
      "secondary_role": null,
      "cluster_id": "network_vnet_eastasia_001",
      "config": {
        "address_space": ["10.0.0.0/16"],
        "subnets": [
          { "name": "web", "cidr": "10.0.1.0/24" },
          { "name": "db", "cidr": "10.0.2.0/24" }
        ]
      },
      "metrics": null,
      "monthly_cost_usd": 0,
      "dependencies": [],
      "depth": 0,
      "serves": [],
      "source": "cloudrays",
      "needs_depth_query": false
    }
  ]
}
```

**Schema fields:**

- `metadata`: Summary statistics plus data-source provenance (`source` indicates which tool produced the majority of data; `mixed` when CloudRays + Azure MCP were merged).
- `resources[].source`: Per-resource provenance (`cloudrays`, `azure-mcp`, or `merged` when both tools contributed).
- `resources[].needs_depth_query`: Flag set by discover logic when Azure MCP should be queried for additional detail before Design.
- `resources[].config.license_type`: Explicit field for downstream License Strategy processing (Phase 3 Step 3).
- `resources[].metrics.utilization_tier`: Derived from `cpu_avg`/`memory_avg_pct` using Low<10%, Low=10-40%, Medium=40-70%, High>70% (only populated when metrics data is available).
- `resources[].classification`: PRIMARY or SECONDARY.
- `resources[].secondary_role`: Role when SECONDARY (`identity`, `access_control`, `network_path`, `configuration`, `encryption`, `orchestration`); null when PRIMARY.
- `resources[].depth`: Topological depth (0 = no dependencies).

---

## azure-resource-clusters.json (Phase 1 output)

Resources grouped by affinity with deployment order.

```json
{
  "timestamp": "2026-04-21T14:30:00Z",
  "clusters": [
    {
      "cluster_id": "network_vnet_eastasia_001",
      "name": "VNet Prod",
      "type": "network",
      "description": "Primary: vnet-prod, Secondary: nsg-web-allow-http, nsg-db-allow-sql",
      "azure_region": "eastasia",
      "creation_order_depth": 0,
      "primary_resources": [
        "/subscriptions/xxx/.../virtualNetworks/vnet-prod"
      ],
      "secondary_resources": [
        "/subscriptions/xxx/.../networkSecurityGroups/nsg-web-allow-http"
      ],
      "network": null,
      "must_migrate_together": true,
      "dependencies": [],
      "edges": []
    },
    {
      "cluster_id": "compute_vm_eastasia_001",
      "name": "Web VM Tier",
      "type": "compute",
      "description": "Primary: web-01, web-02",
      "azure_region": "eastasia",
      "creation_order_depth": 1,
      "primary_resources": [
        "/subscriptions/xxx/.../virtualMachines/web-01",
        "/subscriptions/xxx/.../virtualMachines/web-02"
      ],
      "secondary_resources": [],
      "network": "network_vnet_eastasia_001",
      "must_migrate_together": true,
      "dependencies": ["network_vnet_eastasia_001"],
      "edges": [
        {
          "from": "/subscriptions/xxx/.../virtualMachines/web-01",
          "to": "/subscriptions/xxx/.../virtualNetworks/vnet-prod",
          "relationship_type": "network_path"
        }
      ]
    }
  ]
}
```

---

## clarified.json (Phase 2 output)

User answers to the 10 clarification questions. Azure-specific: `q9_license_strategy` and `q10_identity_strategy`.

```json
{
  "mode": "A|B|C|D",
  "answers": {
    "q1_timeline": "0-3 months|3-6 months|6-12 months|no pressure",
    "q2_primary_concern": "cost|capability|speed|maintainability",
    "q3_team_experience": "expert|moderate|novice|mixed",
    "q4_traffic_profile": "highly variable|predictable|steady|unknown",
    "q5_database_requirements": "structured|document|analytics|mix",
    "q6_cost_sensitivity": "very|moderate|not primary|depends",
    "q7_multi_cloud": "no|yes redundancy|maybe|yes strategic",
    "q8_compliance": "none|standard|strict|varies",
    "q9_license_strategy": "open-source|byol|license-included|to-be-evaluated",
    "q10_identity_strategy": "identity-center|entra-federation|hybrid|to-be-evaluated"
  },
  "timestamp": "2026-04-21T14:30:00Z"
}
```

---

## aws-design.json (Phase 3 output)

AWS services mapped from Azure resources, clustered by affinity, with license and identity treatment.

```json
{
  "validation_status": {
    "status": "completed",
    "message": "All services validated for regional availability and feature parity"
  },
  "target_region": "us-east-1|ap-northeast-1|eu-west-1|...",
  "license_strategy_applied": "open-source|byol|license-included|mixed",
  "identity_plan": {
    "strategy": "identity-center|entra-federation|hybrid|to-be-evaluated",
    "summary": "Replace Entra ID with IAM Identity Center. Retain Entra ID for M365 only.",
    "workstream_weeks": 4
  },
  "clusters": [
    {
      "cluster_id": "compute_vm_eastasia_001",
      "azure_region": "eastasia",
      "aws_region": "ap-northeast-1",
      "resources": [
        {
          "azure_resource_id": "/subscriptions/xxx/.../virtualMachines/web-01",
          "azure_type": "Microsoft.Compute/virtualMachines",
          "azure_config": {
            "sku": "Standard_D4s_v5",
            "vcpu": 4,
            "memory_gb": 16,
            "os_type": "Linux",
            "license_type": "none"
          },
          "aws_service": "EC2",
          "aws_config": {
            "instance_type": "m6i.xlarge",
            "vcpu": 4,
            "memory_gb": 16,
            "region": "ap-northeast-1",
            "license_model": "not_applicable"
          },
          "right_sizing": {
            "utilization_tier": "medium",
            "action": "peer|downsize|eliminate",
            "original_size_if_changed": null,
            "rationale": "CPU p95 67.8% — keep 4 vCPU peer sizing"
          },
          "confidence": "deterministic",
          "rationale": "VM → EC2 1:1; Linux Standard_D4s_v5 → m6i.xlarge (4 vCPU / 16 GB)",
          "rubric_applied": [
            "Eliminators: PASS",
            "Operational Model: IaaS EC2 (matches source operational model)",
            "User Preference: Cost (q2)",
            "Feature Parity: Full",
            "Cluster Context: Web tier; standalone",
            "Simplicity: EC2 m6i.xlarge"
          ]
        }
      ]
    }
  ],
  "special_mappings": [
    {
      "category": "identity",
      "azure_services": ["Azure AD / Entra ID"],
      "aws_plan": "IAM Identity Center with SCIM from Azure AD during cutover window; SAML apps migrated per-app.",
      "risk_level": "high",
      "notes": "Q10 answer = identity-center"
    }
  ],
  "warnings": [
    "Service X not available in ap-northeast-1; deploying to us-east-1 instead"
  ],
  "timestamp": "2026-04-21T14:30:00Z"
}
```

**Design resource template (aws-design.json resource object):**

```json
{
  "azure_resource_id": "/subscriptions/xxx/.../databases/prod-sql",
  "azure_type": "Microsoft.Sql/servers/databases",
  "azure_config": {
    "sku": "GP_Gen5_4",
    "max_size_gb": 500,
    "license_type": "sql_server"
  },
  "aws_service": "RDS Aurora PostgreSQL",
  "aws_config": {
    "engine_version": "15.4",
    "instance_class": "db.r6g.xlarge",
    "multi_az": true,
    "region": "ap-northeast-1",
    "license_model": "open_source"
  },
  "right_sizing": {
    "utilization_tier": "medium",
    "action": "peer",
    "rationale": "DTU utilization medium; peer sizing"
  },
  "confidence": "inferred",
  "rationale": "Q9=open-source → SQL Server migrated to Aurora PostgreSQL (largest TCO saver); schema conversion via AWS SCT required",
  "rubric_applied": [
    "Eliminators: Schema conversion required — PASS with PoC",
    "Operational Model: Managed Aurora",
    "User Preference: Cost (q2) + Open-source (q9)",
    "Feature Parity: Partial (T-SQL → PL/pgSQL conversion)",
    "Cluster Context: Database tier",
    "Simplicity: Aurora (managed, serverless option available)"
  ]
}
```

---

## estimation.json (Phase 4 output)

Monthly operating costs, Azure TCO baseline comparison, license cost detail, and ROI.

```json
{
  "pricing_source": {
    "status": "live",
    "message": "Using live AWS pricing API",
    "fallback_staleness": {
      "last_updated": "2026-03-15",
      "days_old": 37,
      "is_stale": false,
      "staleness_warning": null
    },
    "services_by_source": {
      "live": ["EC2", "RDS Aurora", "S3", "ALB"],
      "fallback": ["NAT Gateway"],
      "estimated": []
    },
    "services_with_missing_fallback": []
  },
  "azure_baseline": {
    "source": "cloudrays_consumption",
    "monthly_total_usd": 14500,
    "breakdown": {
      "Compute (VM + AKS)": 5200,
      "Database (SQL + Cosmos)": 4100,
      "Storage (Blob + Disk)": 1800,
      "Network (LB + Bandwidth)": 1200,
      "Security (Key Vault + WAF)": 400,
      "Other": 1800
    },
    "reserved_commitments": {
      "azure_ri_remaining_months": 14,
      "azure_ri_exit_penalty_usd": 3200,
      "azure_savings_plan_remaining_months": 8,
      "azure_savings_plan_exit_penalty_usd": 1100
    }
  },
  "license_costs": {
    "strategy_applied": "open-source|byol|license-included|mixed",
    "affected_resources": 6,
    "breakdown": {
      "open_source_replacement_monthly": 1200,
      "byol_monthly_if_chosen": 2800,
      "license_included_monthly_if_chosen": 4100,
      "selected_monthly": 1200
    },
    "notes": "Q9=open-source; 4 SQL Server DBs migrated to Aurora PostgreSQL, 2 Windows VMs replaced by Amazon Linux"
  },
  "monthly_costs": {
    "premium": {
      "total": 12800,
      "breakdown": {
        "EC2": 4500,
        "RDS Aurora": 3200,
        "S3": 1500,
        "ALB": 400,
        "NAT Gateway": 600,
        "Data Transfer": 800,
        "License (selected strategy)": 1200,
        "Other": 600
      }
    },
    "balanced": {
      "total": 9800,
      "breakdown": {
        "EC2 + Savings Plan": 2800,
        "RDS Aurora Serverless v2": 2400,
        "S3": 1500,
        "ALB": 400,
        "NAT Gateway": 400,
        "Data Transfer": 600,
        "License (selected strategy)": 1200,
        "Other": 500
      }
    },
    "optimized": {
      "total": 6900,
      "breakdown": {
        "EC2 Spot + Fargate": 1400,
        "RDS Aurora Serverless v2": 1600,
        "S3 IA": 900,
        "ALB": 400,
        "NAT Gateway": 400,
        "Data Transfer": 600,
        "License (selected strategy)": 1200,
        "Other": 400
      }
    }
  },
  "one_time_costs": {
    "dev_hours": "400 hours @ $150/hr = $60,000",
    "data_transfer": "5000 GB @ $0.02/GB = $100",
    "training": "Team AWS training = $10,000",
    "dual_run_period": "8 weeks @ $14,500/month Azure + $9,800/month AWS = $48,600",
    "azure_ri_sp_exit_penalty": 4300,
    "identity_migration_consulting": 15000,
    "total": 138000
  },
  "tco_comparison": {
    "azure_monthly": 14500,
    "aws_monthly_balanced": 9800,
    "monthly_savings": 4700,
    "annual_savings": 56400,
    "three_year_savings": 169200,
    "payback_months": 29.4
  },
  "roi": {
    "aws_monthly_balanced": 9800,
    "monthly_savings": 4700,
    "payback_months": 29.4,
    "three_year_tco_aws": 490800,
    "three_year_tco_azure": 522000,
    "five_year_savings": 282000
  },
  "assumptions": [
    "24/7 workload operation",
    "ap-northeast-1 region selection (matches Azure eastasia for latency parity)",
    "Balanced tier uses 1-year Savings Plan, no RI",
    "Optimized tier uses Spot for stateless workloads only",
    "Azure baseline: from CloudRays Consumption JSON (31-day extrapolation)",
    "License strategy: open-source replacement (Q9=A)"
  ],
  "timestamp": "2026-04-21T14:30:00Z"
}
```

---

## execution.json (Phase 5 output)

Timeline, risk assessment, rollback procedures, and Azure teardown plan.

```json
{
  "timeline_weeks": 14,
  "phases": [
    { "weeks": "1-2", "name": "Planning & Setup", "activities": ["AWS account structure", "Landing Zone (Control Tower)", "Direct Connect / VPN"] },
    { "weeks": "3-4", "name": "Team Enablement", "activities": ["AWS training", "SOP authoring", "CloudWatch baseline"] },
    { "weeks": "3-6", "name": "Identity Workstream", "activities": ["Entra ID to IAM Identity Center SCIM", "SAML trust for priority apps"] },
    { "weeks": "5-7", "name": "PoC & Validation", "activities": ["Smallest cluster pilot", "Performance baseline", "Data pipeline dry-run"] },
    { "weeks": "8-10", "name": "Wave Migration", "activities": ["Cluster-by-cluster by creation_order_depth", "Data sync", "Functional validation"] },
    { "weeks": "11", "name": "Cutover", "activities": ["DNS switch", "Dual-run monitoring", "Rollback standby"] },
    { "weeks": "12", "name": "Stabilization", "activities": ["Performance tuning", "Cost reconciliation", "Azure teardown planning"] },
    { "weeks": "14+", "name": "Azure Teardown", "activities": ["Data archival", "Resource deletion", "Billing closure"] }
  ],
  "critical_path": [
    "Landing Zone (Week 1-2)",
    "Identity Center SCIM (Week 3-4)",
    "PoC deployment (Week 5-7)",
    "Aurora schema conversion (Week 6-9)",
    "Data migration cutover (Week 10-11)",
    "DNS cutover (Week 11)"
  ],
  "risks": [
    {
      "category": "technical",
      "description": "Azure-unique services without direct AWS mapping",
      "probability": "medium",
      "impact": "high",
      "mitigation": "PoC each unmapped service in Week 5-7; defer non-critical ones to v1.1"
    },
    {
      "category": "technical",
      "description": "Data migration volume (>10TB)",
      "probability": "medium",
      "impact": "high",
      "mitigation": "AWS DataSync + Snow Family for bulk; DMS with CDC for databases"
    },
    {
      "category": "technical",
      "description": "Application code deeply bound to Azure SDK",
      "probability": "high",
      "impact": "high",
      "mitigation": "Code analysis in Week 3; adaptation in Week 4-8"
    },
    {
      "category": "operational",
      "description": "Team lacks AWS experience",
      "probability": "high",
      "impact": "high",
      "mitigation": "AWS training Week 3-4 + AWS Professional Services engagement"
    },
    {
      "category": "compliance",
      "description": "Data residency / sovereignty constraints",
      "probability": "low",
      "impact": "critical",
      "mitigation": "Confirm AWS region meets residency rules before cutover"
    },
    {
      "category": "vendor",
      "description": "Microsoft License restrictions on AWS (post-2022 Listed Provider policy)",
      "probability": "high",
      "impact": "high",
      "mitigation": "Q9 strategy applied; open-source replacements validated in PoC"
    },
    {
      "category": "vendor",
      "description": "Azure RI / Savings Plan early termination penalty",
      "probability": "medium",
      "impact": "medium",
      "mitigation": "Coordinate with Azure commercial team; time cutover to align with RI expiry where possible"
    }
  ],
  "rollback_window": "Reversible until DNS cutover (Week 11); post-cutover rollback requires reverse data sync (48-72h)",
  "azure_teardown_week": 14,
  "azure_teardown_checklist": [
    "Archive all data to cold storage (Azure Archive or S3 Glacier Deep Archive)",
    "Document exported RBAC assignments for audit",
    "Delete production resources in reverse dependency order",
    "Cancel Azure RI/Savings Plans (accept penalty)",
    "Close Azure subscription or downgrade to Free tier for audit retention"
  ],
  "timestamp": "2026-04-21T14:30:00Z"
}
```
