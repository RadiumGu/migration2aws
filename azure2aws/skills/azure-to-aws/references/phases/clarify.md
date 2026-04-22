# Phase 2: Clarify Requirements

Collect user migration requirements via 10 questions (8 shared with GCP2AWS + Q9 License, Q10 Identity).

**Execute ALL steps in order.**

Full question text, options, defaults, and mode descriptions live in `references/shared/clarify-questions.md`. This file is the orchestration flow.

## Step 0: Validate Inputs

1. Read `azure-resource-inventory.json` from `$MIGRATION_DIR`. If missing: **STOP**. Output: "Missing azure-resource-inventory.json. Complete Phase 1 (Discover) first."
2. If invalid JSON: **STOP**. Output: "azure-resource-inventory.json is corrupted (invalid JSON). Re-run Phase 1."
3. If `resources` array is empty: **STOP**. Output: "azure-resource-inventory.json contains no resources. Re-run Phase 1 with a valid Azure environment."
4. Read `azure-resource-clusters.json` from `$MIGRATION_DIR`. If missing: **STOP**. Output: "Missing azure-resource-clusters.json. Complete Phase 1 (Discover) first."
5. If invalid JSON: **STOP**. Output: "azure-resource-clusters.json is corrupted (invalid JSON). Re-run Phase 1."
6. If `clusters` array is empty: **STOP**. Output: "azure-resource-clusters.json contains no clusters. Re-run Phase 1."

## Step 1: Load Inventory Context

Read both inventory files (validated in Step 0). Extract context used to pre-fill question suggestions:

- **Any Windows or SQL Server resources?** (drives Q9 relevance) — search inventory for `config.license_type ∈ {"windows", "sql_server"}`
- **Any Entra ID / identity artifacts?** (drives Q10 relevance) — search for `type` matching `Microsoft.ManagedIdentity/*`, Entra ID group entries, or federation metadata
- **Azure region distribution** — may inform Q1 timeline (multi-region = longer)
- **Resource count** — inform Q3 team-experience framing (larger env = more ops load)

Record these flags in scratch state. Use them when presenting questions to set realistic context (do **not** change defaults based on this).

## Step 2: Select Answering Mode

Present 4 modes to user:

| Mode  | Style       | When to use                                   |
| ----- | ----------- | --------------------------------------------- |
| **A** | All at once | "I'll answer all 10 questions together"       |
| **B** | One-by-one  | "Ask me each question separately"             |
| **C** | Defaults    | "Use default answers (no questions)"          |
| **D** | Free text   | "I'll describe requirements in my own words"  |

Mode routing:

- **Mode C**: Apply all defaults from `shared/clarify-questions.md` → Step 3.
- **Mode D**: Ask user for free-text description → Step 3 (free-text extraction path).
- **Mode A**: Present all 10 questions in one block (Q1-Q10 with options) → collect answers → Step 3.
- **Mode B**: Ask each question separately, waiting for answer before the next → collect answers → Step 3.

**If parallel Discover is still running** (per Phase 1 Step 3 parallelization): agent may begin presenting Q1-Q10 even while CloudRays scan runs. Re-merge results before writing `clarified.json`.

**Fallback handling**: If user selects Mode A or B but then declines to answer questions or provides incomplete answers, offer Mode C (use defaults) or Mode D (free-text description) as alternatives. Phase 2 completes using whichever mode provides answers.

## Step 3: Normalize Answers

Produce the canonical enum values expected by `clarified.json` schema (see `shared/output-schema.md`).

### For Modes A/B (explicit answers)

1. For each question Q1-Q10, validate the user's answer maps to one of the valid options.
2. If the user gives a free-form answer (e.g., "we want to move fast"), map to closest option using keyword rules:

| Question | Free-form keywords → canonical value |
|----------|-------------------------------------|
| Q1 | "urgent", "0-3m" → `0-3 months`; "soon", "3-6m" → `3-6 months`; "flexible" → `6-12 months`; "no rush" → `no pressure` |
| Q2 | "cost", "cheap" → `cost`; "compliance", "features" → `capability`; "fast", "speed" → `speed`; "team", "familiar" → `maintainability` |
| Q3 | "expert", "advanced" → `expert`; "some", "little" → `moderate`; "none", "new" → `novice`; "varies" → `mixed` |
| Q4 | "spiky", "burst" → `highly variable`; "normal" → `predictable`; "flat" → `steady`; "don't know" → `unknown` |
| Q5 | "relational", "sql" → `structured`; "nosql", "json" → `document`; "warehouse", "analytics" → `analytics`; "both" → `mix` |
| Q6 | "tight budget" → `very`; "balanced" → `moderate`; "capability first" → `not primary`; "depends" → `depends` |
| Q7 | "full exit", "get off" → `no`; "multi-cloud" → `yes redundancy`; "maybe" → `maybe`; "keep m365" → `yes strategic` |
| Q8 | "none" → `none`; "hipaa", "pci", "soc2" → `standard`; "fedramp", "gxp", "gdpr" → `strict`; "varies" → `varies` |
| Q9 | "aurora", "open source", "ditch sql server" → `open-source`; "keep licenses", "byol" → `byol`; "pay aws", "li" → `license-included`; "unsure", "evaluate" → `to-be-evaluated` |
| Q10 | "replace entra", "aws native" → `identity-center`; "keep entra", "federate" → `entra-federation`; "both", "per app" → `hybrid`; "need assessment" → `to-be-evaluated` |

3. Store normalized answers keyed by question name (see schema).

### For Mode C (defaults)

Apply the Mode C defaults from `shared/clarify-questions.md`:

```
q1_timeline = "6-12 months"
q2_primary_concern = "cost"
q3_team_experience = "novice"
q4_traffic_profile = "predictable"
q5_database_requirements = "structured"
q6_cost_sensitivity = "moderate"
q7_multi_cloud = "no"
q8_compliance = "none"
q9_license_strategy = "open-source"
q10_identity_strategy = "to-be-evaluated"
```

### For Mode D (free-text)

1. Parse the user's free-text description for keywords matching the tables above.
2. For each question, mark as `extracted` (found in text) or `default` (not found, using Mode C default).
3. Present a confirmation block:

   ```
   Based on your requirements, I extracted:
   - Q1 (Timeline): [value] ← [extracted|default]
   - Q2 (Primary concern): [value] ← [extracted|default]
   - Q3 (Team experience): [value] ← [extracted|default]
   - ...
   - Q9 (License strategy): [value] ← [extracted|default]
   - Q10 (Identity strategy): [value] ← [extracted|default]

   Accept these, or switch to Mode A/B to override?
   ```

4. If user accepts → store answers with per-field provenance.
5. If user declines → fall back to Mode A or B.

## Step 4: Consistency Cross-Checks

After normalization, validate these cross-field consistency rules. If any fail, warn the user (do **not** auto-correct; let the user reconcile):

| Rule | If violated |
|------|-------------|
| Q9 = `byol` but inventory has no `license_type = windows` or `sql_server` resources | Warn: "BYOL selected but no Microsoft-licensed workloads detected. Q9 has no effect — proceeding." |
| Q9 = `license-included` and Q6 = `very` (very cost-sensitive) | Warn: "License Included is typically the most expensive option; reconsider for cost-sensitive migrations. Phase 4 will show TCO delta." |
| Q10 = `entra-federation` and Q7 = `no` (full exit from Azure) | Warn: "You selected full Azure exit (Q7) but want to retain Entra ID (Q10). Entra ID requires an active Azure tenant. Reconcile before Phase 3." |
| Q1 = `0-3 months` and inventory has >100 resources | Warn: "Aggressive 0-3 month timeline with a large environment is high risk. Phase 5 will flag critical-path items." |
| Q3 = `novice` and Q2 = `capability` | Info: "Novice team + capability focus — expect higher consulting / training budget in Phase 4." |

## Step 5: Write Clarified Output

Write `clarified.json` to `.migration/[MMDD-HHMM]/`.

**Schema**: See `references/shared/output-schema.md` → `clarified.json (Phase 2 output)` for the complete schema.

**Required fields**:

- `mode`: "A", "B", "C", or "D"
- `answers`: object with all 10 keys (`q1_timeline` through `q10_identity_strategy`)
- `timestamp`: ISO 8601

If using Mode D, also include per-question provenance under `answers_source` (extracted | default).

## Step 6: Update Phase Status

Update `.phase-status.json`:

```json
{
  "phase": "clarify",
  "status": "completed",
  "timestamp": "2026-04-21T14:30:00Z",
  "version": "1.0.0"
}
```

Output to user: "✅ Clarification complete (Mode X). Proceeding to Phase 3: Design AWS Architecture."

If any cross-check warning fired, restate the top 3 warnings in the output message so the user sees them before Phase 3 starts.

## Differences from GCP2AWS Clarify

- **10 questions** (vs 8): adds Q9 (License strategy) and Q10 (Identity strategy).
- **Cross-check step** (Step 4): Azure-specific consistency rules around License and Identity strategy interactions.
- **Parallel-discover awareness**: Clarify may run while CloudRays scan is still in progress.
