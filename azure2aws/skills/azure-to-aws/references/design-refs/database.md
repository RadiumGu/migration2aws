# Database Services Design Rubric

**Applies to**: Azure SQL Database/Managed Instance, Cosmos DB, Azure Database for MySQL/PostgreSQL, Azure Cache for Redis, Database Migration Service.

**Quick lookup (no rubric)**: `fast-path.md` covers MySQL → RDS/Aurora, PostgreSQL → RDS/Aurora, Redis → ElastiCache, Database Migration Service → AWS DMS. Use those paths directly.

---

## 1. Service-by-Service Candidate Table

| Azure Service | Primary AWS Candidates | Complexity |
|---------------|------------------------|------------|
| Azure Database for MySQL | RDS MySQL, Aurora MySQL | Low |
| Azure Database for PostgreSQL | RDS PostgreSQL, Aurora PostgreSQL | Low |
| Azure Cache for Redis | ElastiCache Redis | Low |
| Azure SQL Database (Q9 applies) | Aurora PostgreSQL (open-source) / RDS SQL Server LI / RDS Custom SQL Server (BYOL) | Medium |
| Azure SQL Managed Instance | RDS for SQL Server (LI or Custom BYOL) | Medium |
| Cosmos DB (SQL API) | DynamoDB, DocumentDB | High |
| Cosmos DB (Mongo API) | DocumentDB, MongoDB Atlas on AWS | High |
| Cosmos DB (Cassandra API) | Keyspaces, MCS on EC2 | High |
| Cosmos DB (Gremlin API) | Neptune | High |
| Cosmos DB (Table API) | DynamoDB | High |

---

## 2. Eliminators (Hard Blockers)

| Source | AWS Candidate | Blocker |
|--------|---------------|---------|
| Azure SQL with stored procedures using CLR assemblies | Aurora PostgreSQL | CLR not supported → rewrite logic in application tier or use Lambda |
| Azure SQL with linked servers to non-SQL sources | Aurora PostgreSQL | No linked-server equivalent → use Glue or Lambda as federation layer |
| Cosmos DB (strong consistency + multi-region writes) | DynamoDB | DynamoDB strong consistency is single-region reads; global tables use eventual consistency → redesign or accept trade-off |
| Cosmos DB with transactions spanning > 100 items | DynamoDB | DynamoDB transaction limit 100 items / 4 MB → redesign to smaller transactions or use RDS |
| Azure SQL with > 64 TB data | Aurora | Aurora limit 128 TB (higher); but migration bandwidth constraint drives Snow Family |
| PostgreSQL with extension unsupported in Aurora (e.g., `plperlu`) | Aurora PostgreSQL | Check extension list; if unsupported use RDS PostgreSQL (fewer restrictions) |

---

## 3. Signals (Decision Criteria)

### Azure SQL Database → RDS or Aurora (Q9 drives target family)

Apply Q9 first:

- **Q9 = open-source** (default):
  - Target: Aurora PostgreSQL (preferred) or Aurora MySQL
  - Requires: AWS SCT assessment, schema conversion (T-SQL → PL/pgSQL), application code changes (ADO.NET → npgsql, JDBC driver swap), SSIS → Glue, SQL Agent → EventBridge+Lambda, SSRS → QuickSight
  - Flag: `requires_schema_conversion = true`
  - Add to `special_mappings[]` with risk=medium and SCT compatibility-checklist reference

- **Q9 = byol**:
  - Target: RDS Custom for SQL Server (BYOL inside managed RDS) or EC2 Dedicated Host + self-managed SQL Server
  - Requires: SA/subscription verification; Dedicated Host capacity planning

- **Q9 = license-included**:
  - Target: RDS for SQL Server (License Included)
  - Simplest path; highest recurring cost

- **Q9 = to-be-evaluated**:
  - Produce two design entries per resource: open-source track + LI track. Cost comparison in Phase 4.

### Cosmos DB → DynamoDB / DocumentDB / Keyspaces / Neptune

Route by API type (Azure MCP should populate this in Phase 1 Step 7):

- **SQL API (Core)**: DynamoDB (KV) with data model redesign — MOST COMMON
- **Mongo API**: DocumentDB (Mongo-compatible) for minimal code change; or DynamoDB with app rewrite
- **Cassandra API**: Amazon Keyspaces (Cassandra-compatible)
- **Gremlin API**: Neptune (graph)
- **Table API**: DynamoDB (straightforward)

Always add to `special_mappings[]` with `risk_level = "high"` and note: "Data model redesign required before cutover."

### Azure Database for MySQL / PostgreSQL → RDS / Aurora

- **Q6 = very cost-sensitive + dev environment** → Aurora Serverless v2 (scales to 0.5 ACU)
- **Production always-on** → Aurora Provisioned (db.r6g.xlarge baseline) with Multi-AZ
- **Flexible Server with HA zone-redundant** → Aurora with Multi-AZ
- **Single Server (legacy)** → RDS + plan for upgrade path

### Azure Cache for Redis → ElastiCache Redis

- **Standard / Premium without clustering** → ElastiCache Redis single-shard, Multi-AZ
- **Premium with cluster mode** → ElastiCache Redis cluster mode enabled
- **Enterprise tier with RedisJSON / Search / Bloom** → ElastiCache Redis (check module parity); else self-managed Redis Enterprise on EC2

---

## 4. 6-Criteria Rubric

Apply in order; first match wins.

1. **Eliminators**: Any Azure feature blocked on target AWS service? If yes, switch candidate.
2. **Operational Model**: Managed (Aurora, DynamoDB, ElastiCache) vs self-managed (RDS Custom, EC2-based).
   - Prefer managed unless: BYOL requirement or engine version not in RDS catalog
3. **User Preference**:
   - `q5 = structured` → RDS / Aurora
   - `q5 = document` → DynamoDB
   - `q5 = analytics` → route to `analytics.md` (Redshift)
   - `q5 = mix` → use per-workload
   - `q6 = very cost-sensitive` → Aurora Serverless v2 or DynamoDB on-demand
   - `q9 = open-source` → prefer Aurora PostgreSQL for SQL Server sources
4. **Feature Parity**: Azure-specific features without AWS equivalent?
   - Example: Azure SQL geo-replication → Aurora Global Database (different setup)
   - Example: Cosmos DB multi-region writes → DynamoDB Global Tables (eventually consistent)
5. **Cluster Context**: Other data tier in cluster using RDS / DynamoDB? Prefer same family for ops consistency.
6. **Simplicity**: Fewer moving parts = higher score.
   - Aurora Serverless > Aurora Provisioned > self-managed on EC2

---

## 5. Decision Tree

```
Is it Azure SQL / SQL MI?
├─ Q9 = open-source → Aurora PostgreSQL (default) [+ SCT conversion effort]
├─ Q9 = byol → RDS Custom for SQL Server or EC2 Dedicated Host SQL Server
├─ Q9 = license-included → RDS for SQL Server LI
└─ Q9 = to-be-evaluated → BOTH open-source and LI designs (parallel tracks)

Is it Cosmos DB?
├─ SQL / Core API → DynamoDB [+ data model redesign]
├─ Mongo API → DocumentDB (minimal code change) or DynamoDB
├─ Cassandra API → Keyspaces
├─ Gremlin API → Neptune
└─ Table API → DynamoDB

Is it Azure MySQL / PostgreSQL?
├─ Flexible Server + HA → Aurora (same engine)
├─ Single Server → RDS (same engine) or Aurora
└─ Dev / non-critical → Aurora Serverless v2

Is it Azure Cache for Redis?
├─ Premium cluster → ElastiCache Redis cluster mode
└─ Standard / Premium non-cluster → ElastiCache Redis Multi-AZ
```

---

## 6. Special Handling: Cosmos DB Data Model Redesign

When Cosmos DB → DynamoDB is selected, add a dedicated section to `aws-design-report.md`:

```
## Cosmos DB → DynamoDB Data Model Redesign

Affected containers:
- container-1 (partition key: /tenantId) → table-1 (PK: tenantId, SK: <inferred>)
  Access patterns detected: <from Azure MCP query>
  Recommended SK strategy: <composite of itemId + createdAt>

- container-2 (multi-partition, 10k RU/s) → table-2 (on-demand billing)
  [...]

Migration effort:
- Data model review: 2-3 weeks per container
- Application code rewrite: 4-8 weeks (CosmosClient SDK → DynamoDB client)
- PoC validation: 2 weeks
```

If consistency model = Strong across regions: warn that DynamoDB global tables are eventually consistent; design may need CRDT or conflict-resolution logic.

---

## 7. Examples

### Example 1: Azure SQL Database (Q9 = open-source)

- Azure: `Microsoft.Sql/servers/databases`, SKU `GP_Gen5_4`, 500 GB, 1000 DTU/v-core hours/month
- Q9 = open-source
- Pass 2 rubric:
  - Eliminators: CLR not detected → PASS (pending SCT run)
  - Operational Model: Managed Aurora
  - User Preference: q5=structured, q9=open-source → Aurora PostgreSQL
  - Feature Parity: Partial (T-SQL → PL/pgSQL conversion required)
  - Cluster Context: Database tier
  - Simplicity: Aurora Serverless v2 (dev) or Provisioned (prod)
- → **Aurora PostgreSQL (db.r6g.xlarge, Multi-AZ, 500 GB storage)**
- Confidence: `inferred`
- special_mappings: add with `risk_level: medium`, notes: "SCT run required; stored procedure conversion effort"

### Example 2: Cosmos DB (SQL API)

- Azure: `Microsoft.DocumentDB/databaseAccounts`, API=SQL, 5 containers, 30k RU/s provisioned, 3 regions
- Pass 2 rubric:
  - Eliminators: multi-region write → DynamoDB global tables (eventually consistent) — verify acceptable
  - Operational Model: Managed DynamoDB
  - User Preference: q5=document → DynamoDB
  - Feature Parity: Partial (consistency model difference)
  - Cluster Context: Data tier
  - Simplicity: DynamoDB (fully managed)
- → **DynamoDB (on-demand or 30k RCU/WCU provisioned), global tables for 3 regions**
- Confidence: `inferred`
- special_mappings: add with `risk_level: high`, notes: "Full data model redesign; 2-3 weeks per container"

### Example 3: Azure Cache for Redis (Premium P2 cluster)

- Azure: `Microsoft.Cache/Redis`, Premium P2, 13 GB, cluster mode enabled, 3 shards
- Pass 1 (fast-path): **ElastiCache Redis**
- Peer sizing: `cache.r6g.xlarge × 3 shards`, cluster mode enabled, Multi-AZ
- Confidence: `deterministic`

### Example 4: Azure Database for PostgreSQL Flexible Server

- Azure: `Microsoft.DBforPostgreSQL/flexibleServers`, PG 15, `Standard_D4ds_v4`, 500 GB, HA zone-redundant
- Pass 1 (fast-path): **Aurora PostgreSQL**
- Peer sizing: `db.r6g.xlarge`, Multi-AZ
- Confidence: `deterministic`

### Example 5: Azure SQL Database (Q9 = to-be-evaluated)

- Azure: `Microsoft.Sql/servers/databases`, Business Critical, 4 vCore, 200 GB
- Q9 = to-be-evaluated → produce TWO design entries:
  - Track A: Aurora PostgreSQL (open-source) + SCT assessment
  - Track B: RDS for SQL Server LI
- Both tracked in Phase 4 estimation.json → `license_costs.breakdown`
- Confidence: `inferred`

---

## 8. Output Schema (per resource)

```json
{
  "azure_resource_id": "/subscriptions/xxx/.../databases/prod-sql",
  "azure_type": "Microsoft.Sql/servers/databases",
  "azure_config": {
    "sku": "GP_Gen5_4",
    "max_size_gb": 500,
    "license_type": "sql_server",
    "multi_az": false
  },
  "aws_service": "RDS Aurora PostgreSQL",
  "aws_config": {
    "engine_version": "15.4",
    "instance_class": "db.r6g.xlarge",
    "multi_az": true,
    "storage_gb": 500,
    "region": "ap-northeast-1",
    "license_model": "open_source"
  },
  "right_sizing": {
    "utilization_tier": "medium",
    "action": "peer",
    "rationale": "DTU utilization medium; peer sizing"
  },
  "confidence": "inferred",
  "rationale": "Q9=open-source → SQL Server → Aurora PostgreSQL; SCT required for schema conversion",
  "rubric_applied": [
    "Eliminators: No CLR detected — PASS with SCT PoC",
    "Operational Model: Managed Aurora",
    "User Preference: q9=open-source + q5=structured",
    "Feature Parity: Partial (T-SQL → PL/pgSQL)",
    "Cluster Context: Database tier",
    "Simplicity: Aurora Serverless v2 available"
  ]
}
```
