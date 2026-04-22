# Integration Services Design Rubric

**Applies to**: Azure Service Bus, Event Grid, Event Hubs, Logic Apps, API Management, Azure SignalR, Relay, Notification Hubs.

**Quick lookup**: No fast-path — integration services mostly require per-artifact evaluation (each Logic App, each API policy, each Event Grid subscription).

---

## 1. Service-by-Service Candidate Table

| Azure Service | Primary AWS Candidates | Complexity |
|---------------|------------------------|------------|
| Service Bus Queue | **SQS (Standard or FIFO)** | Low |
| Service Bus Topic / Subscription | **SNS + SQS fan-out** (pub/sub) | Medium |
| Service Bus Sessions | SQS FIFO with MessageGroupId | Medium |
| Service Bus Dead Letter | SQS Dead Letter Queue (DLQ) | Low |
| Event Grid Topic (custom) | **EventBridge custom event bus** | Low |
| Event Grid System Topic | EventBridge (from AWS services) / CloudWatch Events | Medium |
| Event Hubs | **Kinesis Data Streams** / MSK (Kafka-protocol clients) | Medium |
| Event Hubs Capture | Kinesis Firehose → S3 | Low |
| Logic Apps (consumption) | **Step Functions + Lambda** / **EventBridge Pipes** | High |
| Logic Apps (standard) | Step Functions Express + Lambda | High |
| API Management | **API Gateway (REST + HTTP)** + WAF | High |
| Azure SignalR | **API Gateway WebSocket** / **AppSync Subscriptions** | Medium |
| Azure Relay (Hybrid Connections) | PrivateLink + NLB / VPN | Medium |
| Notification Hubs | **SNS Mobile Push** (+ Pinpoint for campaigns) | Medium |

---

## 2. Eliminators (Hard Blockers)

| Source | AWS Candidate | Blocker |
|--------|---------------|---------|
| Service Bus Topic with > 2000 subscriptions | SNS | SNS limit 12.5M subscriptions (OK); fan-out via SNS → SQS per consumer |
| Service Bus message > 256 KB (Premium 100MB) | SQS | SQS max 256 KB; use S3 extended client for larger (reference pattern) |
| Event Hubs with Kafka protocol consumers | Kinesis | Kinesis is not Kafka-compatible → use **MSK** for Kafka clients |
| Logic App with Azure-specific connector (Dynamics 365, Power Platform) | Step Functions | No equivalent AWS connector — custom Lambda + SaaS API integration |
| API Management with revision + version combined policies | API Gateway | API GW has stages + versions; migrate revisions as stages, policies rewritten |
| API Management SOAP policies | API Gateway | API GW does not natively parse SOAP — use Lambda for SOAP → REST adapter |
| SignalR persistent connections > 1M per instance | API Gateway WebSocket | API GW WS limit ~500k connections/account/region; use AppSync or multi-region |
| Event Grid with custom delivery schema + Azure Function trigger | EventBridge | EventBridge supports JSON schema (no Azure-specific binding); Lambda target |

---

## 3. Signals (Decision Criteria)

### Service Bus → SQS / SNS (Queue/Topic Pattern)

- **Queue (point-to-point)** → **SQS**
  - Standard Service Bus Queue → SQS Standard
  - Service Bus with FIFO (sessions) → SQS FIFO with MessageGroupId
  - Transaction support: SQS has no transactions; redesign OR use DynamoDB + SQS
  - Message TTL: SQS max 14 days (vs Service Bus unlimited w/ config); evaluate

- **Topic (pub/sub)** → **SNS + SQS fan-out**
  - Service Bus Topic → SNS Topic
  - Service Bus Subscription → SQS queue subscribed to SNS
  - Subscription filters (SQL) → SNS subscription filter policies (JSON attribute-based)
  - **Subscription filter SQL**: needs translation to attribute match policy (some SQL expressions not representable)

- **Dead letter**: Service Bus DLQ → SQS DLQ (native, redrive policy)

- **Message size**:
  - Service Bus Standard ≤ 256 KB → SQS (direct fit)
  - Service Bus Premium ≤ 100 MB → SQS Extended Client Library (store payload in S3, message contains S3 pointer)

### Event Grid → EventBridge

- **Custom topic** → **EventBridge custom event bus**
- **Subscriptions** → EventBridge rules (pattern-based)
- **Webhook delivery** → EventBridge API destinations (with connection)
- **Azure Function handler** → Lambda target
- **Dead letter → Storage Account** → EventBridge DLQ → SQS
- **Event schemas**: Azure (CloudEvents / Event Grid schema) → EventBridge (JSON, no strict schema, optional Schema Registry)
- **System Topics** (events from Azure services): Map per source:
  - Storage Account events → S3 Event Notifications → EventBridge
  - Key Vault events → EventBridge (CloudTrail via EventBridge)
  - Resource events → CloudTrail → EventBridge

### Event Hubs → Kinesis Data Streams / MSK

Decision depends on client protocol:

| Event Hubs Usage | AWS Target | Reason |
|------------------|------------|--------|
| Event Hubs SDK (AMQP) | **Kinesis Data Streams** | Client library swap; similar semantics |
| Event Hubs Kafka endpoint (Kafka clients) | **MSK** (managed Kafka) | Preserve Kafka protocol; clients unchanged |
| Event Hubs Capture (to Blob) | **Kinesis Firehose → S3** | Direct fit |
| Event Hubs for Schema Registry | **AWS Glue Schema Registry** / Confluent Schema Registry on MSK | |

**Throughput mapping**:
- Event Hubs Throughput Unit (1 MB/s in, 2 MB/s out) ≈ Kinesis Shard (1 MB/s in, 2 MB/s out)
- Event Hubs Processing Unit (Dedicated) → Kinesis provisioned mode with multiple shards OR Kinesis On-Demand

### Logic Apps → Step Functions + Lambda + EventBridge Pipes (High)

Logic Apps migration is **per-workflow** evaluation. Mapping pattern:

| Logic App Component | AWS Target | Notes |
|---------------------|------------|-------|
| Trigger (HTTP, Recurrence, Event Grid) | Step Functions trigger (API GW / EventBridge / Schedule) | |
| Action (control flow) | Step Functions state | If/Switch/ForEach → Choice/Map/Parallel states |
| Action (connector) | Lambda function calling SaaS API | No drop-in for Azure Logic App connectors |
| Data operations | Step Functions intrinsic functions + Lambda | |
| Scope + error handling | Step Functions Catch/Retry | |

**Simpler patterns**:
- **Linear "when X happens, transform, send to Y"** → **EventBridge Pipes** (source → filter → enrich → target)
- **Simple HTTP-triggered → call one API** → **Lambda with Function URL**

**Effort**:
- Simple flows: 1-2 days each
- Complex flows (10+ actions, multi-connector): 1-3 weeks each

### API Management → API Gateway (High)

- **REST APIs** → **API Gateway REST API** (or HTTP API for simpler/cheaper)
- **Products** → Usage plans + API keys
- **Subscriptions** → API keys attached to usage plans
- **Policies** → Rewritten (fundamentally different execution model):
  - `<rate-limit>` → Usage plan throttling or WAF rate-based rule
  - `<check-header>`, `<set-header>` → API GW request/response mapping OR Lambda authorizer
  - `<validate-jwt>` → Lambda authorizer or Cognito authorizer
  - `<set-backend-service>` → Integration URL (direct Lambda/HTTP)
  - `<forward-request>` → Default passthrough
  - Custom C#/liquid → Lambda (request transformation / authorizer)
  - `<cache-lookup>` → API GW caching (REST API only) / CloudFront in front
- **Developer Portal** → **API Gateway Developer Portal** (CloudFormation template provided by AWS)
- **SOAP APIs** → API GW + Lambda SOAP-to-REST adapter (or keep SOAP service on EC2/ECS)
- **GraphQL APIs** → **AppSync** (purpose-built GraphQL)

### Azure SignalR → API Gateway WebSocket / AppSync

- **Persistent bi-directional messaging** → **API Gateway WebSocket API** with Lambda
- **Pub/Sub (SignalR Hubs)** → **AppSync Subscriptions** (GraphQL-based, managed scale)
- **Client SDK migration**: SignalR JS/.NET SDK → API GW WebSocket client or AppSync client (Amplify)
- **Scaling**: SignalR Premium → AppSync (auto-scale) or API GW WebSocket (with DynamoDB-backed connection store)

### Notification Hubs → SNS Mobile Push

- **Android (FCM), iOS (APNs), Windows** → **SNS Mobile Push** (native support for all)
- **Tags-based targeting** → SNS attribute-based filter policies OR **Pinpoint segments**
- **Campaign scheduling** → **Pinpoint** (mobile engagement platform — better fit for campaigns than SNS)
- **Installations / registrations** → Pinpoint endpoints

---

## 4. 6-Criteria Rubric

Apply in order; first match wins.

1. **Eliminators**: Message size, connector availability, protocol compat? Switch candidate.
2. **Operational Model**: Managed (SQS, SNS, EventBridge, API GW) strongly preferred. Integration category rarely uses self-managed.
3. **User Preference**:
   - `q2 = cost` → SQS Standard, SNS, EventBridge, API GW HTTP API
   - `q2 = capability` → Step Functions for complex workflow; MSK for Kafka
4. **Feature Parity**:
   - Service Bus SQL filter → SNS attribute filter (simpler expressions only)
   - Logic App connectors → custom Lambda
   - APIM policies → API GW + Lambda authorizer
5. **Cluster Context**: Events flowing into EventBridge already? Use EventBridge. SQS-based workflow? Use SQS.
6. **Simplicity**: EventBridge Pipes > Step Functions for linear flows. SQS > SNS+SQS if single consumer.

---

## 5. Decision Tree

```
Is it Service Bus?
├─ Queue (P2P) → SQS (Standard / FIFO)
├─ Topic (pub/sub) → SNS + SQS fan-out
├─ Sessions → SQS FIFO + MessageGroupId
└─ > 256KB message → SQS Extended Client (S3-backed)

Is it Event Grid?
├─ Custom topic → EventBridge custom event bus
├─ System topic → Map per source (S3 events / CloudTrail / EventBridge)
└─ Webhook delivery → EventBridge API destinations

Is it Event Hubs?
├─ Native SDK clients → Kinesis Data Streams
├─ Kafka clients → MSK
└─ Event Hubs Capture → Kinesis Firehose → S3

Is it Logic Apps?
├─ Simple linear flow → EventBridge Pipes
├─ Simple HTTP trigger + 1 API call → Lambda Function URL
├─ Complex workflow → Step Functions + Lambda [+ per-connector rewrite]
└─ Azure-only connector → Custom Lambda + SaaS API

Is it API Management?
├─ REST → API Gateway REST (or HTTP API)
├─ SOAP → API GW + Lambda SOAP adapter
├─ GraphQL → AppSync
└─ Complex policies → API GW + Lambda authorizer

Is it SignalR?
├─ Bi-directional WebSocket → API Gateway WebSocket
└─ Pub/sub subscriptions → AppSync Subscriptions

Is it Notification Hubs?
├─ Direct push → SNS Mobile Push
└─ Campaigns + segmentation → Pinpoint
```

---

## 6. Examples

### Example 1: Service Bus Standard with Queues + Topics

- Azure: `Microsoft.ServiceBus/namespaces` Standard, 5 queues, 3 topics with 12 subscriptions, max message 200 KB
- Pass 1 (per-entity):
  - 5 queues → **5 SQS Standard queues**
  - 3 topics → **3 SNS topics** + **12 SQS queues** subscribed to SNS (fan-out)
  - Subscription filters (SQL) → SNS filter policies (attribute-based, need translation)
- special_mappings: add with risk=low, notes: "SNS filter policy translation for 12 subscriptions"
- Confidence: `deterministic` (for SQS/SNS structure); `inferred` (for filter translation)

### Example 2: Event Hubs with Kafka Clients

- Azure: `Microsoft.EventHub/namespaces` Standard, 10 TUs, Kafka protocol enabled, 20 producers + 5 consumer groups
- Pass 2 rubric:
  - Eliminators: Kafka clients → MSK required (not Kinesis)
  - Operational Model: MSK (managed)
- → **MSK `kafka.m7g.large × 3 brokers`**, equivalent throughput, Schema Registry via Glue Schema Registry
- special_mappings: add with risk=medium, notes: "Connection strings update; MSK IAM auth recommended vs Event Hubs SAS"
- Confidence: `inferred`

### Example 3: Logic App — Order Processing Workflow

- Azure: Logic App Standard, HTTP trigger, 12 actions: validate → call CRM (Dynamics) → branch → call Service Bus → write to SQL → send email
- Pass 2 rubric:
  - Eliminators: Dynamics connector → custom Lambda
- → **Step Functions** (orchestration) + 5 Lambdas (validate, CRM API call, SQS publish, RDS write, SES email)
- special_mappings: add with risk=high, notes: "Complex workflow rewrite 2-3 weeks; custom CRM integration Lambda required"
- Confidence: `inferred`

### Example 4: API Management with 30 APIs + OAuth2

- Azure: APIM Developer tier, 30 APIs, OAuth2 with Entra ID, rate limits per product, custom C# policies (6 APIs)
- Pass 2 rubric:
  - Eliminators: Custom C# policies → Lambda authorizer + request transform
  - Operational Model: API Gateway + Lambda
- → **API Gateway REST (30 APIs)** + Lambda authorizers (Entra ID JWT validation) + usage plans + WAF (rate limits) + Lambda for 6 policies
- special_mappings: add with risk=high, notes: "Policy rewrite 4-8 weeks; OAuth2 flow via Entra ID JWT verified in Lambda authorizer"
- Confidence: `inferred`

### Example 5: Azure SignalR for Real-Time Chat

- Azure: Azure SignalR Standard (5 units), 50k concurrent, chat application
- Pass 2 rubric:
  - Eliminators: 50k << 500k API GW WS limit → PASS
  - Operational Model: API GW WebSocket
- → **API Gateway WebSocket API** + Lambda ($connect, $disconnect, sendmessage routes) + DynamoDB for connection state
- special_mappings: add with risk=medium, notes: "SignalR SDK → API GW WebSocket client; 2-4 weeks"
- Confidence: `inferred`

### Example 6: Event Grid for Storage Events → Function

- Azure: Event Grid system topic on Blob Storage (Created event) → Azure Function
- Pass 2 rubric:
  - Operational Model: EventBridge + Lambda
- → **S3 Event Notifications → EventBridge rule → Lambda** (direct S3→Lambda also valid for simpler pattern)
- Confidence: `deterministic`

---

## 7. Output Schema (per resource)

```json
{
  "azure_resource_id": "/subscriptions/xxx/.../namespaces/sb-prod",
  "azure_type": "Microsoft.ServiceBus/namespaces",
  "azure_config": {
    "sku": "Standard",
    "queues": 5,
    "topics": 3,
    "subscriptions": 12,
    "max_message_kb": 200
  },
  "aws_service": "SQS + SNS",
  "aws_config": {
    "sqs_queues": 5,
    "sns_topics": 3,
    "sqs_fanout_queues": 12,
    "region": "ap-northeast-1",
    "queue_type": "Standard"
  },
  "confidence": "inferred",
  "rationale": "Service Bus Queues → SQS; Topics → SNS+SQS fan-out; subscription filters translated to attribute-based policies",
  "rubric_applied": [
    "Eliminators: Message < 256 KB — PASS",
    "Operational Model: Managed SQS+SNS",
    "User Preference: q2=cost → Standard queues",
    "Feature Parity: Filter SQL → attribute policy",
    "Cluster Context: Messaging tier",
    "Simplicity: Separate queue per consumer"
  ],
  "special_mappings": {
    "risk_level": "low",
    "notes": "12 subscription filters require SQL → attribute policy translation",
    "effort_weeks": "1-2"
  }
}
```
