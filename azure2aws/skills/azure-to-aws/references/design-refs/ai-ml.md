# AI & ML Services Design Rubric

**Applies to**: Azure OpenAI Service, Azure Machine Learning, Azure Cognitive Services (Vision, Language, Speech, Translation, Decision), Azure Bot Service.

**Quick lookup**: No fast-path — AI/ML migrations involve API adaptation and in many cases full pipeline rebuild. Always apply rubric.

---

## 1. Service-by-Service Candidate Table

| Azure Service | Primary AWS Candidates | Complexity |
|---------------|------------------------|------------|
| Azure OpenAI Service | **Amazon Bedrock** | Medium |
| Azure OpenAI (Assistants API) | Bedrock Agents | Medium |
| Azure Machine Learning | **SageMaker** | High |
| Azure ML Compute Instances | SageMaker Notebook Instances / SageMaker Studio | Medium |
| Azure ML Compute Clusters | SageMaker Training Jobs / HyperPod | High |
| Azure ML Managed Online Endpoints | SageMaker Real-time Inference Endpoints | Medium |
| Azure ML Batch Endpoints | SageMaker Batch Transform | Medium |
| Cognitive Services — Vision | **Amazon Rekognition** | Medium |
| Cognitive Services — Form Recognizer / Document Intelligence | **Amazon Textract** | Medium |
| Cognitive Services — Language (Text Analytics, Q&A) | **Amazon Comprehend** (+ Kendra for Q&A) | Medium |
| Cognitive Services — Speech to Text | **Amazon Transcribe** | Medium |
| Cognitive Services — Text to Speech | **Amazon Polly** | Low |
| Cognitive Services — Translator | **Amazon Translate** | Low |
| Cognitive Services — Anomaly Detector | **Amazon Lookout for Metrics** | Medium |
| Cognitive Services — Personalizer | **Amazon Personalize** | High |
| Cognitive Services — Content Moderator | Rekognition (image/video) + Comprehend (text) + Bedrock Guardrails | Medium |
| Azure Bot Service | **Amazon Lex** (+ Bedrock for LLM bots) | High |
| Azure AI Search (Cognitive Search) | **Amazon Kendra** / OpenSearch | High |

---

## 2. Eliminators (Hard Blockers)

| Source | AWS Candidate | Blocker |
|--------|---------------|---------|
| Azure OpenAI with GPT-4o fine-tune | Bedrock | Bedrock offers Claude / Llama / Titan / Mistral fine-tuning — no OpenAI-native models; re-evaluate model choice |
| Azure OpenAI Assistants with OpenAI-specific function calling schema | Bedrock Agents | Bedrock Agents use action groups + Lambda; schema rewrite required |
| Azure ML pipelines using AzureML SDK v1 deprecated features | SageMaker | Rewrite in SageMaker SDK; also SageMaker Pipelines for orchestration |
| Cognitive Services Custom Vision with > 500 classes | Rekognition Custom Labels | Rekognition Custom Labels limit 250 labels/model — split models or use SageMaker |
| Form Recognizer custom models with complex layout | Textract | Textract Queries + Custom Queries cover most; complex layouts may need SageMaker custom OCR |
| Azure Bot Composer flows using Azure-only channels (Teams native) | Lex | Lex integrates with Lambda, Kendra; Teams integration via Bot Framework adapter required |
| Azure Personalizer with RL-based ranking | Personalize | Personalize uses HRNN (deep learning) not RL — different algorithm family |
| Azure AI Search with semantic ranker | Kendra | Kendra has built-in semantic search; re-index + re-tune |

---

## 3. Signals (Decision Criteria)

### Azure OpenAI Service → Bedrock (Medium)

- **Model families**:
  - Azure OpenAI GPT-4 → Bedrock Claude 3/4 family (Anthropic) OR Amazon Nova OR Llama
  - **Claude models in Bedrock are the closest peer to GPT-4 class**
  - Azure OpenAI text-embedding-3 → Bedrock Titan Embeddings / Cohere Embed
  - Azure OpenAI DALL-E → Bedrock Stable Diffusion / Titan Image Generator

- **API format differences**:
  - OpenAI API schema (`messages`, `role`, `content`) vs Anthropic Messages API — similar structure, different parameter names
  - **Prompt engineering is largely reusable**; tuning per model may be needed
  - Function calling: OpenAI functions → Bedrock tool use (both JSON-based; rewrite schema)

- **Fine-tuning**: Azure OpenAI fine-tuning → Bedrock fine-tuning (Claude Haiku, Titan, Nova, Llama supported); GPT model weights not portable

- **Content filtering**: Azure OpenAI content filters → **Bedrock Guardrails** (topic denial, content filters, PII redaction, word filters)

- **Integration**: Azure OpenAI on Private Link → Bedrock via VPC Endpoint

- **Effort**: 2-6 weeks for typical app (API client swap, prompt tuning, evaluation)

### Azure Machine Learning → SageMaker (High)

Azure ML is a full platform. Map per sub-service:

| Azure ML Component | AWS Target | Notes |
|-------------------|------------|-------|
| Workspace | SageMaker domain | Multi-tenant via SageMaker user profiles |
| Compute Instance (notebook VM) | SageMaker Notebook Instance / Studio JupyterLab | |
| Compute Cluster (training) | SageMaker Training Job / HyperPod | On-demand or Managed Spot |
| Pipelines | SageMaker Pipelines | Different DSL (Python SDK) — rewrite |
| Managed Online Endpoint | SageMaker Real-time Endpoint | Container format compatible (BYO container) |
| Batch Endpoint | SageMaker Batch Transform | |
| Model Registry | SageMaker Model Registry | Export/import manually |
| Experiments | SageMaker Experiments | MLflow compatible via SageMaker MLflow managed service |
| Data Labeling | SageMaker Ground Truth | |
| AutoML | SageMaker Autopilot / Canvas | Different algorithm family |
| Responsible AI dashboard | SageMaker Clarify | Bias + explainability |

- **Training scripts**: Mostly portable (PyTorch, TensorFlow, scikit-learn). Replace `azureml.core` with `sagemaker` SDK.
- **Model artifacts**: Portable (pickle, ONNX, PyTorch, TF)
- **Effort**: 6-16 weeks depending on pipeline count

### Cognitive Services → Split Mapping

Azure Cognitive Services is a unified API surface. AWS has purpose-specific services:

#### Vision
- **Image Analysis / Tag / Caption** → **Rekognition DetectLabels / DetectText / DetectFaces**
- **OCR (Read API)** → **Textract** (documents) / **Rekognition DetectText** (simple text in images)
- **Spatial Analysis** → Rekognition Video / custom SageMaker model
- **Custom Vision** → **Rekognition Custom Labels** (simple cases) / **SageMaker** (complex)

#### Language
- **Text Analytics: Sentiment, Entity Recognition, Key Phrase Extraction** → **Comprehend**
- **Language Understanding (LUIS)** → **Lex** (for conversational) OR **Comprehend Custom Classification** (for pure NLU)
- **Question Answering** → **Kendra** + Bedrock (RAG pattern)
- **Translator** → **Translate**
- **Language Detection** → **Comprehend DetectDominantLanguage**
- **Named Entity Recognition Custom** → **Comprehend Custom Entity Recognition**

#### Speech
- **Speech to Text** → **Transcribe** (batch + streaming)
- **Text to Speech** → **Polly** (NTTS + generative voices)
- **Speech Translation** → Transcribe + Translate + Polly (pipeline)
- **Custom Speech** (acoustic model) → **Transcribe Custom Vocabulary + Custom Language Model**
- **Speaker Recognition** → **Amazon Connect Voice ID** OR custom SageMaker

#### Decision
- **Anomaly Detector** → **Lookout for Metrics** (metric anomaly) / **Lookout for Equipment** (industrial)
- **Personalizer** → **Amazon Personalize** (recommendation engine)
- **Content Moderator** → Rekognition Content Moderation + Comprehend + **Bedrock Guardrails**

### Azure Bot Service → Amazon Lex (High)

- **Bot Framework SDK** → **Lex bot + Lambda fulfillment**
- **Dialog flows (LUIS)** → Lex intents + slots + dialog code hook
- **QnA Maker** → Kendra (for retrieval) + Bedrock (for generative answers)
- **Channels**:
  - Teams → Bot Framework adapter on Lambda
  - Slack → Lex Slack integration (native)
  - Web → Lex Web UI (Amplify)
  - Voice → Amazon Connect + Lex
- **For LLM-based bots**: Replace Bot Service with Bedrock Agents directly (more capable than Lex for open-domain)

---

## 4. 6-Criteria Rubric

Apply in order; first match wins.

1. **Eliminators**: Custom model limits exceeded? Function calling schema? → Switch or add special handling
2. **Operational Model**: Managed (Bedrock, Rekognition, Polly) vs self-managed (SageMaker custom containers, EC2 GPU).
   - Always prefer managed unless specific model/algorithm required
3. **User Preference**:
   - `q2 = cost` → Bedrock on-demand (pay-per-token); SageMaker Serverless Inference
   - `q2 = capability` → SageMaker full stack; Bedrock + Agents
   - `q2 = speed` → Bedrock (no training); use managed services exclusively
4. **Feature Parity**:
   - OpenAI → Claude: prompt reusable with minor tweaks
   - LUIS → Lex: dialog semantics differ
   - Personalizer (RL) → Personalize (deep learning): algorithm family change
5. **Cluster Context**: Other ML workloads on SageMaker? → Keep SageMaker. On Bedrock? → Bedrock.
6. **Simplicity**: Managed API (Rekognition) > Self-managed (SageMaker custom model) when accuracy acceptable.

---

## 5. Decision Tree

```
Is it Azure OpenAI?
├─ Chat/completion → Bedrock Claude (default) / Nova / Llama
├─ Embeddings → Bedrock Titan Embeddings
├─ Image generation → Bedrock Stable Diffusion / Titan Image
├─ Assistants API → Bedrock Agents
└─ Fine-tuned model → Bedrock fine-tuning (Claude Haiku / Titan / Nova / Llama)

Is it Azure ML?
├─ Notebook / Studio → SageMaker Studio
├─ Training Compute Cluster → SageMaker Training Job
├─ Online Endpoint → SageMaker Real-time Endpoint
├─ Batch Endpoint → SageMaker Batch Transform
├─ Pipelines → SageMaker Pipelines [+ rewrite]
└─ AutoML → SageMaker Autopilot / Canvas

Is it Cognitive Services?
├─ Vision → Rekognition (+ Textract for documents)
├─ Language NLU → Comprehend (+ Lex for conversational)
├─ Speech to Text → Transcribe
├─ Text to Speech → Polly
├─ Translation → Translate
├─ Anomaly Detector → Lookout for Metrics
├─ Personalizer → Personalize
└─ Content Moderator → Rekognition + Comprehend + Bedrock Guardrails

Is it Bot Service?
├─ LUIS-based → Lex + Lambda
├─ QnA-based → Kendra + Bedrock (RAG)
└─ LLM-powered → Bedrock Agents (direct)

Is it Azure AI Search?
├─ Keyword / hybrid → OpenSearch
└─ Semantic search / RAG → Kendra + Bedrock
```

---

## 6. Examples

### Example 1: Azure OpenAI GPT-4 for Customer Support Bot

- Azure: Azure OpenAI GPT-4 deployment, 10k requests/day, custom prompts, content filters enabled
- Pass 2 rubric:
  - Eliminators: Standard chat (no fine-tuning) → PASS
  - Operational Model: Bedrock (managed)
  - User Preference: q2=cost → Bedrock on-demand
  - Feature Parity: Content filters → Bedrock Guardrails
- → **Bedrock Claude Sonnet (cross-region inference for throughput)** + Bedrock Guardrails
- special_mappings: add with risk=medium, notes: "API schema swap (OpenAI → Anthropic Messages); prompt tune 1-2 weeks; Guardrails config"
- Confidence: `inferred`

### Example 2: Azure ML with 15 Training Pipelines + 8 Real-time Endpoints

- Azure: Azure ML workspace, 15 pipelines (PyTorch), 8 real-time endpoints, Model Registry with 40 models
- Pass 2 rubric:
  - Operational Model: SageMaker (managed)
  - User Preference: q2=capability
- → **SageMaker Studio domain + Training Jobs + Real-time Endpoints + Model Registry**
- special_mappings: add with risk=high, notes: "AzureML SDK → SageMaker SDK rewrite; 15 pipelines × 2-4 wk; model artifacts portable"
- Confidence: `inferred`

### Example 3: Cognitive Services Form Recognizer (Custom Model)

- Azure: Form Recognizer custom model, 10 form templates, 50k pages/month
- Pass 2 rubric:
  - Eliminators: Moderate complexity templates → PASS on Textract Queries
- → **Textract AnalyzeDocument with Queries + Custom Queries**
- special_mappings: add with risk=medium, notes: "Re-train queries on sample docs; 2-4 weeks validation"
- Confidence: `inferred`

### Example 4: Cognitive Services Speech (STT) for Call Analytics

- Azure: Speech-to-Text batch, 1000 hours/month, custom acoustic model, 5 languages
- Pass 2 rubric:
  - Operational Model: Transcribe (managed)
- → **Amazon Transcribe Call Analytics + Custom Vocabulary + Custom Language Model**
- Confidence: `inferred`

### Example 5: Azure Bot Service with LUIS

- Azure: Bot Framework bot, LUIS for NLU (30 intents, 120 entities), QnA Maker (500 Q&A pairs), channels: Teams + Web
- Pass 2 rubric:
  - Eliminators: Teams channel needs adapter → PASS with custom adapter
- → **Lex V2 bot (30 intents) + Kendra (for QnA content) + Lambda fulfillment + Bot Framework adapter for Teams**
- special_mappings: add with risk=high, notes: "LUIS → Lex dialog migration 4-6 wk; QnA → Kendra re-index; Teams channel adapter"
- Confidence: `inferred`

### Example 6: Azure AI Search with RAG over SharePoint

- Azure: Cognitive Search, semantic ranker, 2M docs from SharePoint, vector search enabled
- Pass 2 rubric:
  - Eliminators: Semantic ranker → Kendra built-in
- → **Kendra + Bedrock Knowledge Bases (RAG)** with SharePoint connector (Kendra native)
- special_mappings: add with risk=high, notes: "Re-index 2M docs; RAG prompt tune; 4-6 weeks"
- Confidence: `inferred`

---

## 7. Output Schema (per resource)

```json
{
  "azure_resource_id": "/subscriptions/xxx/.../accounts/openai-prod",
  "azure_type": "Microsoft.CognitiveServices/accounts",
  "azure_config": {
    "kind": "OpenAI",
    "model_deployments": ["gpt-4", "text-embedding-3-small"],
    "requests_per_day": 10000,
    "content_filter": "default"
  },
  "aws_service": "Bedrock",
  "aws_config": {
    "models": ["anthropic.claude-sonnet-4-5", "amazon.titan-embed-text-v2"],
    "guardrails": "default-content-filter",
    "region": "ap-northeast-1",
    "inference_mode": "on-demand + cross-region inference"
  },
  "confidence": "inferred",
  "rationale": "Azure OpenAI GPT-4 → Bedrock Claude (closest peer); API format swap; prompts tuned",
  "rubric_applied": [
    "Eliminators: No fine-tune",
    "Operational Model: Bedrock managed",
    "User Preference: q2=cost → on-demand",
    "Feature Parity: Content filter → Guardrails",
    "Cluster Context: AI tier",
    "Simplicity: Bedrock single service"
  ],
  "special_mappings": {
    "risk_level": "medium",
    "notes": "API client swap; prompt tuning 1-2 wk; Guardrails config",
    "effort_weeks": "2-4"
  }
}
```
