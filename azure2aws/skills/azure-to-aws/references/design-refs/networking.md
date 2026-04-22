# Networking Services Design Rubric

**Applies to**: Azure Virtual Network (VNet), Network Security Groups (NSG), Azure Load Balancer, Application Gateway, Azure Front Door, Azure DNS / Traffic Manager, VPN Gateway, ExpressRoute, Virtual WAN, Azure Private Link.

**Quick lookup (no rubric)**: `fast-path.md` covers VNet → VPC, Azure LB → NLB, App Gateway → ALB, Private Link → PrivateLink, VPN Gateway → Site-to-Site VPN. Use those paths directly.

---

## 1. Service-by-Service Candidate Table

| Azure Service | Primary AWS Candidates | Complexity |
|---------------|------------------------|------------|
| Virtual Network (VNet) | VPC | Low |
| Subnet | VPC Subnet | Low |
| Network Security Group (NSG) | Security Group + NACL | Low |
| User Defined Route (UDR) | VPC Route Table | Low |
| Azure Load Balancer (L4) | NLB | Low |
| Application Gateway (L7) | ALB (+ AWS WAF) | Low |
| Azure Front Door | CloudFront + Global Accelerator + AWS WAF | Medium (one-to-many) |
| Azure DNS / Traffic Manager | Route 53 | Low |
| Private DNS Zone | Route 53 Private Hosted Zone | Low |
| VPN Gateway | Site-to-Site VPN | Low |
| ExpressRoute | Direct Connect | Medium |
| Virtual WAN | Transit Gateway / Cloud WAN | High |
| Azure Private Link / Private Endpoint | PrivateLink / VPC Endpoint | Low |
| NAT Gateway | NAT Gateway | Low |
| Azure Bastion | EC2 Instance Connect Endpoint / SSM Session Manager | Low |
| Azure Firewall | AWS Network Firewall / Gateway Load Balancer + appliance | Medium |
| Azure Peering (VNet Peering) | VPC Peering / Transit Gateway | Low |

---

## 2. Eliminators (Hard Blockers)

| Source | AWS Candidate | Blocker |
|--------|---------------|---------|
| NSG with > 1000 rules | Security Group | SG default quota 60 rules/SG (soft), can raise to ~1000; NACLs limited — split SGs by role |
| App Gateway with WAF custom rules using Azure-only operators | ALB + AWS WAF | WAF rule format not compatible — rewrite rules |
| Azure Front Door Premium with Rules Engine rules | CloudFront | CloudFront Functions / Lambda@Edge required for logic; rewrite rules |
| Traffic Manager with nested profiles > 10 levels | Route 53 | Route 53 supports 3 levels of traffic policy nesting; flatten |
| ExpressRoute with carrier not in AWS Direct Connect partner list | Direct Connect | Re-contract with AWS DX partner in target region |
| VPN Gateway Generation 2 + 10 Gbps SKU | Site-to-Site VPN | S2S VPN max 1.25 Gbps/tunnel → use Direct Connect or multi-tunnel + BGP ECMP |
| Virtual WAN with > 100 VNet connections | Transit Gateway | TGW max 5000 attachments (OK); but routing policy and SD-WAN features differ — redesign |
| Azure Private Link Service (exposing own service) | PrivateLink | Must use NLB in front of service (not ALB directly for PrivateLink) |

---

## 3. Signals (Decision Criteria)

### VNet → VPC

- **Always-on**: CIDR plan reusable (copy CIDR block to VPC CIDR)
- **NSG attached to subnet** → NACL (stateless, subnet-level)
- **NSG attached to NIC** → Security Group (stateful, instance-level)
- **NSG with both inbound/outbound rules** → SG (stateful); only inbound denials need NACL
- **UDR** → Route Table (associate at subnet level)
- **Service Endpoints** → VPC Gateway Endpoint (S3, DynamoDB) / VPC Interface Endpoint (others)

### Load Balancers

- **Azure LB Basic/Standard (L4 TCP/UDP)** → **NLB**
  - Health probes map 1:1
  - Static IP → NLB EIP
  - Cross-zone load balancing → NLB setting (off by default, enable to match Azure)
- **App Gateway Standard (L7 HTTP/HTTPS)** → **ALB**
  - Path-based routing → ALB listener rules
  - Host-based routing → ALB listener rules
  - SSL termination → ACM certificate
  - URL rewrite → ALB actions (limited) or CloudFront Functions
- **App Gateway WAF_v2** → **ALB + AWS WAF**
  - WAF rules rewritten in AWS WAF syntax (not compatible)
  - Managed rule sets: AWS Managed Rules (Core Rule Set)

### Azure Front Door → CloudFront + Global Accelerator + WAF (IMPORTANT: One-to-Many)

Azure Front Door is a single service combining:
1. Global anycast acceleration
2. CDN
3. L7 load balancing
4. WAF

AWS requires splitting into multiple services:

| Front Door Feature | AWS Equivalent | Notes |
|-------------------|----------------|-------|
| Global CDN cache | CloudFront | Edge locations; cache behaviors |
| Anycast acceleration (non-cached) | Global Accelerator | Static anycast IPs, TCP/UDP acceleration |
| L7 routing rules | CloudFront behaviors + Lambda@Edge | Rules Engine → Lambda@Edge or CloudFront Functions |
| WAF | AWS WAF | Attach to CloudFront distribution |
| Custom domains + managed certs | CloudFront + ACM (us-east-1) | Certs MUST be in us-east-1 for CloudFront |
| Health probes | Route 53 Health Checks | Combine with CloudFront failover origins |

**Selection logic**:
- **Static content / CDN focus** → CloudFront only
- **TCP/UDP acceleration** → Global Accelerator only
- **HTTP/HTTPS with global anycast** → CloudFront (cached) + Global Accelerator (dynamic) — dual setup
- **WAF required** → Attach AWS WAF web ACL to CloudFront distribution

### Azure DNS / Traffic Manager → Route 53

- **Azure DNS** (public hosted zone) → **Route 53 Public Hosted Zone** (records exportable via AXFR)
- **Azure Private DNS** → **Route 53 Private Hosted Zone** (associate with VPCs)
- **Traffic Manager Performance routing** → **Route 53 Latency-based routing**
- **Traffic Manager Priority routing** → **Route 53 Failover routing** (+ health checks)
- **Traffic Manager Weighted routing** → **Route 53 Weighted routing**
- **Traffic Manager Geographic routing** → **Route 53 Geolocation routing**

### VPN Gateway → Site-to-Site VPN

- **Route-based VPN** → S2S VPN (default, supports BGP)
- **Policy-based VPN** → S2S VPN (static routing only; IKEv1)
- **Aggregate bandwidth > 1.25 Gbps** → Multi-tunnel VPN (up to 10 Gbps with ECMP) or Direct Connect
- **Active-Active** → S2S VPN supports two tunnels per connection natively
- **P2S VPN (Point-to-Site)** → AWS Client VPN

### ExpressRoute → Direct Connect (Medium Complexity)

- **Physical delivery**: Requires re-contracting with AWS DX partner; lead time 4-12 weeks
- **Carrier overlap**: Check AWS DX Partner list — carriers like Equinix, Megaport, NTT available in ap-northeast-1
- **ExpressRoute Direct 100 Gbps** → Direct Connect Dedicated (10/100 Gbps)
- **ExpressRoute Gateway (transit within Azure)** → Direct Connect Gateway + Transit Gateway attachment
- **Global Reach (inter-region via MS backbone)** → Direct Connect Gateway with multi-region VIFs
- **BGP ASNs reusable** (verify no conflicts with AWS reserved ranges)

### Virtual WAN → Transit Gateway / Cloud WAN (High Complexity)

- **Single-region hub-and-spoke** → Transit Gateway
- **Multi-region global network** → Cloud WAN (preferred) or TGW Peering across regions
- **SD-WAN integration** → AWS Cloud WAN with SD-WAN appliance (Cisco, Aruba, Palo Alto)
- **Route propagation and segmentation** → TGW Route Tables (route domains → separate TGW RTs)
- **Hub firewall** → Gateway Load Balancer + appliance OR AWS Network Firewall in inspection VPC

### Azure Private Link → AWS PrivateLink

- **Private Endpoint to PaaS** → VPC Interface Endpoint (for AWS services)
- **Private Link Service (expose own service)** → PrivateLink service (requires NLB in front)
- **Cross-region Private Link** → PrivateLink across regions via Transit Gateway or VPC Peering

### Azure Firewall → AWS Network Firewall / Gateway Load Balancer

- **Azure Firewall Standard** → AWS Network Firewall (stateful Suricata rules)
- **Azure Firewall Premium (TLS inspection, IDPS)** → AWS Network Firewall Premium features OR Gateway Load Balancer + 3rd party appliance (Palo Alto, Fortinet)
- **Threat intel feeds** → AWS Network Firewall managed rule groups

---

## 4. 6-Criteria Rubric

Apply in order; first match wins.

1. **Eliminators**: Any Azure config violating AWS constraint? Switch candidate.
2. **Operational Model**: Managed (NLB, ALB, CloudFront, Route 53) vs self-managed (3rd-party firewall appliance on EC2).
   - Prefer managed unless Azure Firewall Premium features required → GWLB + appliance
3. **User Preference**:
   - `q2 = cost` + `q3 = novice` → NLB / ALB only (skip Front Door split complexity)
   - `q2 = capability` → Full CloudFront + Global Accelerator + WAF split
   - `q2 = speed` → ALB + CloudFront (minimal)
4. **Feature Parity**: Any Azure feature unavailable?
   - Front Door Rules Engine → Lambda@Edge (adds complexity)
   - Traffic Manager nested profiles → Route 53 traffic policy
5. **Cluster Context**: Other services using CloudFront? Route 53? Prefer consistent ingress family.
6. **Simplicity**: Fewer AWS services = higher score.
   - ALB (1 service) > ALB + CloudFront + WAF (3 services) unless Front Door splitting is mandatory

---

## 5. Decision Tree

```
Is it VNet?
└─ → VPC (CIDR reuse, NSG subnet → NACL, NSG NIC → SG)

Is it a Load Balancer?
├─ L4 TCP/UDP (Azure LB) → NLB
├─ L7 HTTP/HTTPS (App Gateway) → ALB
├─ L7 + WAF (App Gateway WAF_v2) → ALB + AWS WAF
└─ Global anycast (Front Door) → CloudFront + Global Accelerator + AWS WAF

Is it DNS?
├─ Public DNS → Route 53 Public Hosted Zone
├─ Private DNS → Route 53 Private Hosted Zone
└─ Traffic Manager (global routing) → Route 53 routing policy (latency/failover/weighted/geo)

Is it a VPN?
├─ S2S IPsec → Site-to-Site VPN
├─ P2S (user VPN) → Client VPN
└─ ExpressRoute → Direct Connect [+ carrier re-contract]

Is it Virtual WAN?
├─ Single-region hub-spoke → Transit Gateway
└─ Multi-region global → Cloud WAN

Is it Private Link?
├─ Private Endpoint (consumer) → VPC Interface Endpoint
└─ Private Link Service (provider) → PrivateLink + NLB

Is it Azure Firewall?
├─ Standard → AWS Network Firewall
└─ Premium (TLS inspection) → GWLB + 3rd-party appliance
```

---

## 6. Examples

### Example 1: Azure Load Balancer Standard (L4)

- Azure: `Microsoft.Network/loadBalancers`, SKU Standard, 3 frontend IPs, TCP health probes
- Pass 1 (fast-path): **NLB**
- Config: NLB with 3 listeners, target groups per backend pool, cross-zone LB enabled
- Confidence: `deterministic`

### Example 2: Application Gateway WAF_v2 with Path-Based Routing

- Azure: `Microsoft.Network/applicationGateways`, SKU WAF_v2, 5 path rules, OWASP 3.2 ruleset
- Pass 2 rubric:
  - Eliminators: WAF rules need rewrite (format incompatible)
  - Operational Model: Managed (ALB + AWS WAF)
  - User Preference: q2=capability → full ALB + WAF
  - Feature Parity: WAF rules rewritten in AWS WAF syntax
- → **ALB + AWS WAF web ACL (AWS Managed Core Rule Set + custom)**
- special_mappings: add with risk=medium, notes: "WAF rules require manual translation"
- Confidence: `inferred`

### Example 3: Azure Front Door Premium with Rules Engine

- Azure: `Microsoft.Cdn/profiles` kind Front Door Premium, 10 rules (geo-block, header manipulation, URL rewrite), WAF
- Pass 2 rubric:
  - Eliminators: Rules Engine → Lambda@Edge / CloudFront Functions
  - Operational Model: Managed (CloudFront + GA + WAF)
  - Feature Parity: Partial — Rules Engine logic rewritten
- → **CloudFront (cached paths) + Global Accelerator (dynamic TCP) + AWS WAF (us-east-1)** + Lambda@Edge for rules
- special_mappings: add with risk=high, notes: "One-to-many split; rules engine rewrite 2-4 weeks; ACM cert must be us-east-1"
- Confidence: `inferred`

### Example 4: ExpressRoute 10 Gbps via Equinix

- Azure: `Microsoft.Network/expressRouteCircuits`, 10 Gbps, Equinix TY2 (Tokyo)
- Pass 2 rubric:
  - Eliminators: Carrier present in AWS DX partner list (Equinix) — PASS
  - Operational Model: Direct Connect (hosted or dedicated)
  - Feature Parity: BGP config reusable; MACsec optional on DX
- → **Direct Connect 10 Gbps Dedicated Connection via Equinix TY2 → DX Gateway → Transit Gateway**
- special_mappings: add with risk=medium, notes: "Physical delivery 4-12 weeks; re-contract required"
- Confidence: `inferred`

### Example 5: Virtual WAN with 30 Spokes across 3 Regions

- Azure: `Microsoft.Network/virtualWans`, 3 hubs (Japan East, US East, West Europe), 30 spoke VNets
- Pass 2 rubric:
  - Eliminators: < 5000 TGW attachments → PASS
  - Operational Model: Managed (Cloud WAN)
  - User Preference: q3=expert → Cloud WAN (more control)
  - Feature Parity: Segmentation → Cloud WAN segments
- → **AWS Cloud WAN with 3 core network edges (ap-northeast-1, us-east-1, eu-west-1), 30 VPC attachments**
- special_mappings: add with risk=high, notes: "Global network topology redesign; routing policies rewritten"
- Confidence: `inferred`

---

## 7. Output Schema (per resource)

```json
{
  "azure_resource_id": "/subscriptions/xxx/.../applicationGateways/agw-prod",
  "azure_type": "Microsoft.Network/applicationGateways",
  "azure_config": {
    "sku": "WAF_v2",
    "tier": "WAF_v2",
    "capacity": 3,
    "waf_enabled": true,
    "ssl_certs": 2
  },
  "aws_service": "ALB + AWS WAF",
  "aws_config": {
    "load_balancer_type": "application",
    "scheme": "internet-facing",
    "waf_web_acl": "core-rule-set",
    "acm_cert_arn": "<to-be-created>",
    "region": "ap-northeast-1"
  },
  "confidence": "inferred",
  "rationale": "App Gateway WAF_v2 → ALB + AWS WAF; WAF rules require manual translation",
  "rubric_applied": [
    "Eliminators: WAF rules need rewrite",
    "Operational Model: Managed ALB + AWS WAF",
    "User Preference: q2=capability",
    "Feature Parity: Partial (WAF rule syntax)",
    "Cluster Context: Ingress tier",
    "Simplicity: ALB+WAF (2 services)"
  ]
}
```
