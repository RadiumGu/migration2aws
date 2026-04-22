# Compute Services Design Rubric

**Applies to**: Azure VM, VMSS, App Service, AKS, Container Apps / ACI, Functions, Batch, Service Fabric.

**Quick lookup (no rubric)**: Check `fast-path.md` first for Low-complexity services (VM Linux no-license → EC2; VMSS → ASG; Batch → AWS Batch).

---

## 1. Service-by-Service Candidate Table

| Azure Service | Primary AWS Candidates | Complexity |
|---------------|------------------------|------------|
| VM (Linux, no MS license) | EC2, Fargate (if containerizable), Lambda (if short) | Low |
| VM (Windows or SQL Server) | EC2 (Linux + refactor) / EC2 Dedicated Host BYOL / EC2 Windows LI | Medium (Q9 applies) |
| VMSS | EC2 Auto Scaling Group, EKS (if containerized), Fargate Spot | Low (if VMSS as-is) |
| App Service | Fargate, Elastic Beanstalk, Lambda (if short + stateless), App Runner | Medium |
| Azure Functions | Lambda, Fargate (if long-running) | Medium |
| AKS | EKS, ECS Fargate (if minimal K8s dependency) | Medium |
| Container Apps / ACI | Fargate (ECS), App Runner | Medium |
| Batch | AWS Batch, EMR (if data-workflow) | Low |
| Service Fabric | EKS + service mesh, ECS + Cloud Map | High |

---

## 2. Eliminators (Hard Blockers)

| Source | AWS Candidate | Blocker |
|--------|--------------|---------|
| Azure Functions (timeout > 15 min) | Lambda | Lambda hard limit 15 min → use Fargate task or Step Functions |
| Azure Functions (custom runtime unsupported) | Lambda | Use Lambda custom runtime or Fargate |
| VM with GPU (NDv5, NCasT4_v3) | Fargate | No GPU → use EC2 with GPU (g5, p4d, p5) |
| VM > 16 vCPU or > 128 GB RAM | Fargate | Fargate max 16 vCPU / 120 GB → use EC2 |
| App Service with Windows Auth (IIS-specific) | Fargate Linux | Migrate to Linux requires app refactor or use EC2 Windows |
| AKS with Windows nodes | EKS (Linux nodes only) | EKS supports Windows nodes but feature parity narrower |
| AKS with custom CNI not in AWS equivalents | EKS | Use VPC CNI or Calico; manual workaround or ECS |

---

## 3. Signals (Decision Criteria)

### VM → EC2 / Fargate / Lambda

- **Always-on stateful workload** → EC2 (reserved or on-demand)
- **Stateless HTTP service** → Fargate (better dev/prod parity)
- **Batch/periodic job < 15 min** → Lambda with EventBridge schedule
- **Batch/periodic job 15 min - 24h** → Fargate task or EC2 + Auto Scaling (scale to 0 in dev)
- **Windows-only** → EC2 Windows (LI or BYOL per Q9)
- **Utilization = idle and non-production** → Flag for elimination

### App Service → Fargate / Beanstalk / Lambda

- **Always-on or cold-start sensitive** → Fargate
- **Short-lived, event-driven (< 15 min)** → Lambda
- **Legacy monolith with deployment slots** → Beanstalk (supports environments similar to slots)
- **Container-native** → Fargate
- **.NET Framework 4.x** → EC2 Windows or refactor to .NET 6+ on Linux Fargate

### Azure Functions → Lambda / Fargate

- **Event-driven + < 15 min + Python/Node/Go/.NET 6+/Java** → Lambda
- **Long-running + event-driven** → Fargate task with EventBridge
- **Durable Functions** → Step Functions (explicit state machine) + Lambda

### AKS → EKS / ECS Fargate

- **Kubernetes-native (operators, Helm, CRDs)** → EKS
- **Simple container deployment without K8s requirement** → ECS Fargate
- **Windows containers** → EKS with Windows node groups
- **Service mesh (Open Service Mesh / Istio)** → EKS + App Mesh or self-managed Istio

### Container Apps / ACI → Fargate

- **Short-lived single container** → Fargate single-task (standalone)
- **Scale-to-zero web service** → App Runner (scale-to-zero) or Fargate with Application Auto Scaling

### Batch → AWS Batch

- **HPC / high-parallelism jobs** → AWS Batch with EC2 On-Demand or Spot
- **Mixed workload with EMR characteristics** → EMR

---

## 4. 6-Criteria Rubric

Apply in order; first match wins.

1. **Eliminators**: Does the Azure config violate an AWS constraint? If yes, switch candidate.
2. **Operational Model**: Managed (Fargate, Lambda) vs self-managed (EC2, EKS)?
   - Prefer managed unless: always-on + cost-critical + predictable → EC2
3. **User Preference (clarified.json)**:
   - `q2 = "cost"` + `q3 = "novice"` → Fargate / Lambda
   - `q2 = "capability"` + `q3 = "expert"` → EKS (full K8s control)
   - `q2 = "speed"` → App Runner / Beanstalk (fastest deploy)
   - `q2 = "maintainability"` → Fargate (simpler ops)
4. **Feature Parity**: Any Azure feature unavailable in AWS target?
   - Example: Deployment slots → Beanstalk environments OR CodeDeploy blue-green
   - Example: App Service managed certs → ACM
5. **Cluster Context**: Other resources in cluster using EKS? EC2? Fargate? Prefer same platform for affinity.
6. **Simplicity**: Fewer AWS services = higher score.
   - Fargate (1 service + ALB) > EC2 (ASG + launch template + target group + SSM)

---

## 5. Decision Tree

```
Is it a VM?
├─ Linux + no Microsoft license → EC2 (fast-path)
├─ Windows / SQL Server → apply Q9 strategy:
│   ├─ open-source → refactor to Linux EC2 (Amazon Linux) + porting assessment
│   ├─ byol → EC2 Dedicated Host (Windows or SQL Server)
│   └─ license-included → EC2 Windows LI / RDS SQL Server LI
└─ GPU/specialized → EC2 with accelerated instance family

Is it containerized?
├─ K8s-required (AKS with operators/CRDs) → EKS
├─ K8s without operators → ECS Fargate (simpler) or EKS (if q3=expert)
├─ Single-container (ACI / Container Apps) → Fargate task or App Runner
└─ Windows containers → EKS with Windows node groups

Is it a Function?
├─ Event-driven + <15min → Lambda
├─ Event-driven + long-running → Fargate task + EventBridge
├─ Durable Functions → Step Functions + Lambda
└─ Custom runtime unsupported in Lambda → Lambda custom runtime or Fargate

Is it an App Service?
├─ Container-based → Fargate
├─ Code-based stateless HTTP → Elastic Beanstalk or App Runner
├─ .NET Framework 4.x on Windows → EC2 Windows (with refactor-to-Linux roadmap)
└─ Cold-start sensitive → Fargate (not Lambda)

Is it Batch?
└─ HPC / embarrassingly parallel → AWS Batch
```

---

## 6. AWS Instance Type Peer Mapping

| Azure SKU Family | AWS Instance Family | Notes |
|------------------|--------------------|-------|
| `Standard_B*` (burstable) | `t3/t4g` | t4g on Graviton preferred |
| `Standard_D*s_v5` (general) | `m6i/m7i` | m6i for x86; m7g if app supports ARM |
| `Standard_E*s_v5` (memory) | `r6i/r7i` | r6i; r7g if ARM |
| `Standard_F*s_v2` (compute) | `c6i/c7i` | c6i; c7g if ARM |
| `Standard_L*s_v3` (storage) | `i4i/im4gn` | NVMe SSD |
| `Standard_N*` (GPU) | `g5/p4d/p5` | Verify CUDA / driver compat |
| `Standard_HB*` / `Standard_HC*` (HPC) | `hpc6a/hpc7g` | HPC-optimized |
| `Standard_M*` (large memory) | `u6i-*` or `x2iedn` | Very high memory |

---

## 7. Examples

### Example 1: Azure Linux VM (no license)

- Azure: `Microsoft.Compute/virtualMachines`, SKU `Standard_D4s_v5`, OS Linux, utilization medium
- Pass 1 (fast-path): **EC2** (Linux, no license)
- Peer sizing: `m6i.xlarge` (4 vCPU / 16 GB)
- Right-sizing: medium → peer
- Confidence: `deterministic`

### Example 2: Azure App Service (Node.js, always-on)

- Azure: `Microsoft.Web/sites`, runtime Node 18, `Always On = true`, ~60% CPU peak
- Pass 2 rubric:
  - Eliminators: PASS
  - Operational Model: Managed preferred (q3=novice)
  - User Preference: q2=cost → Fargate
  - Feature Parity: Deployment slots → CodeDeploy blue-green
  - Cluster Context: App tier standalone
  - Simplicity: Fargate (single service)
- → **Fargate (0.5 vCPU / 1 GB)** behind ALB
- Confidence: `inferred`

### Example 3: Azure SQL Server VM (Q9 = open-source)

- Azure: `Microsoft.Compute/virtualMachines`, `Standard_E8s_v5`, Windows + SQL Server
- Q9 override: refactor to open-source
- Design: Application code migrates to Aurora PostgreSQL-compatible form; VM itself replaced by the Aurora cluster
- If VM cannot be eliminated (e.g., also runs application): EC2 Linux + Aurora PostgreSQL
- Confidence: `inferred` (requires SCT assessment)
- Add to `special_mappings[]` with risk=high

### Example 4: AKS with Istio and Windows nodes

- Azure: `Microsoft.ContainerService/managedClusters`, 10 Linux + 3 Windows node pools, Istio add-on
- Pass 2 rubric:
  - Eliminators: Windows nodes require EKS with Windows node groups
  - Operational Model: Managed EKS
  - Feature Parity: Istio → App Mesh (limited) OR self-managed Istio on EKS
  - Cluster Context: EKS affinity
- → **EKS (Linux + Windows node groups) with self-managed Istio**
- Confidence: `inferred`

### Example 5: Azure Functions HTTP trigger (.NET 6, 30s timeout)

- Azure: `Microsoft.Web/sites` kind Functions, runtime .NET 6, HTTP trigger, 30s timeout
- Pass 2 rubric:
  - Eliminators: 30s << 15 min → PASS on Lambda
  - Operational Model: Lambda (fully managed)
  - Feature Parity: Bindings mapped individually
- → **Lambda (.NET 6, 512 MB, 30s timeout)** behind API Gateway
- Confidence: `inferred`

---

## 8. Output Schema (per resource)

```json
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
    "action": "peer",
    "rationale": "CPU p95 67% — peer sizing"
  },
  "confidence": "deterministic",
  "rationale": "VM Linux no-license → EC2 peer (m6i.xlarge for Standard_D4s_v5)",
  "rubric_applied": [
    "Eliminators: PASS",
    "Operational Model: EC2 (always-on)",
    "User Preference: q2=cost → consider Savings Plan in Estimate",
    "Feature Parity: Full",
    "Cluster Context: Web tier",
    "Simplicity: EC2 standalone"
  ]
}
```
