# PromptSpeak Directive Symbol Registry - Design Document

## Overview

The Directive Symbol Registry provides persistent, queryable storage for directive symbols
that ground multi-agent conversations. Symbols act as immutable context anchors that agents
query via MCP tools, preventing information drift across agent chains.

---

## Symbol ID Namespace Structure

### Design Principles

1. **LLM-Readable**: IDs should be instantly parseable without complex logic
2. **Self-Documenting**: The ID itself conveys meaning
3. **Hierarchical**: Natural nesting from general to specific
4. **Collision-Free**: Namespaces prevent ID conflicts

### Namespace Format

```
Ξ.{CATEGORY}.{IDENTIFIER}.{CONTEXT}[.{SUBCATEGORY}]
```

Where `Ξ` (Xi, Greek capital letter) is the universal directive symbol prefix.

---

## Category Namespaces

### 1. Public Companies (Most Common)

**Pattern**: `Ξ.{TICKER}.{PERIOD}[.{ASPECT}]`

For the most frequent use case, the category is implicit (tickers are recognizable).

```
Ξ.NVDA.Q3FY25                    # NVIDIA Q3 FY25 analysis (general)
Ξ.NVDA.Q3FY25.EARNINGS           # Specifically earnings focus
Ξ.NVDA.Q3FY25.COMPETITIVE        # Competitive analysis
Ξ.NVDA.Q3FY25.RISK               # Risk assessment
Ξ.AAPL.2024                      # Apple 2024 annual
Ξ.TSLA.Q4FY24.GUIDANCE           # Tesla Q4 guidance analysis
```

**Validation Rules**:
- Ticker: 1-5 uppercase letters (validated against known exchanges)
- Period: Alphanumeric + underscores (Q1FY25, 2024, H1_2025)
- Aspect: Optional, lowercase or SCREAMING_CASE

### 2. Individuals/People

**Pattern**: `Ξ.I.{NAME}.{CONTEXT}`

```
Ξ.I.JENSEN_HUANG.BIO             # Jensen Huang biography
Ξ.I.JENSEN_HUANG.QUOTES.Q3FY25   # Recent quotes from earnings
Ξ.I.WARREN_BUFFETT.LETTERS       # Buffett shareholder letters
Ξ.I.SATYA_NADELLA.STRATEGY       # Nadella's strategic vision
```

### 3. Events

**Pattern**: `Ξ.E.{EVENT_TYPE}.{IDENTIFIER}[.{DATE}]`

```
Ξ.E.EARNINGS.NVDA.20241120       # NVIDIA earnings call Nov 20, 2024
Ξ.E.IPO.ARM.2023                 # ARM IPO 2023
Ξ.E.MERGER.AVGO_VMW.2023         # Broadcom-VMware merger
Ξ.E.CONF.CES.2025                # CES 2025 conference
```

### 4. Sectors/Industries

**Pattern**: `Ξ.S.{SECTOR}.{CONTEXT}`

```
Ξ.S.SEMICONDUCTORS.2024          # Semiconductor industry 2024
Ξ.S.AI_INFRASTRUCTURE.TRENDS     # AI infrastructure trends
Ξ.S.CLOUD.COMPETITIVE            # Cloud competitive landscape
```

### 5. Tasks/Projects

**Pattern**: `Ξ.T.{PROJECT}.{TASK_ID}`

```
Ξ.T.PORTFOLIO_REVIEW.001         # Portfolio review task
Ξ.T.DUE_DILIGENCE.ACME.PHASE1    # Due diligence project
Ξ.T.QUARTERLY_REPORT.Q3          # Quarterly report generation
```

### 6. Knowledge/Reference

**Pattern**: `Ξ.K.{DOMAIN}.{TOPIC}`

```
Ξ.K.CHEMISTRY.WATER              # Water chemistry reference
Ξ.K.HISTORY.WHH_PRESIDENCY       # William Henry Harrison
Ξ.K.FINANCE.DCF_VALUATION        # DCF valuation methodology
```

### 7. Queries/Benchmarks

**Pattern**: `Ξ.Q.{DATASET}.{QUERY_ID}`

```
Ξ.Q.DEEPSEARCHQA.001             # DeepSearchQA benchmark Q1
Ξ.Q.DEEPSEARCHQA.002             # DeepSearchQA benchmark Q2
Ξ.Q.CUSTOM.NVDA_ANALYSIS         # Custom query
```

---

## Symbol Object Schema

### TypeScript Interface

```typescript
interface DirectiveSymbol {
  // ═══════════════════════════════════════════════════════════════════
  // IDENTITY
  // ═══════════════════════════════════════════════════════════════════

  symbolId: string;              // e.g., "Ξ.NVDA.Q3FY25"
  version: number;               // Starts at 1, increments on update
  hash: string;                  // SHA-256 of content (first 16 chars)

  // ═══════════════════════════════════════════════════════════════════
  // CLASSIFICATION
  // ═══════════════════════════════════════════════════════════════════

  category: SymbolCategory;      // COMPANY | PERSON | EVENT | SECTOR | TASK | KNOWLEDGE | QUERY
  subcategory?: string;          // e.g., 'EARNINGS', 'COMPETITIVE', 'RISK'
  tags?: string[];               // Freeform tags for filtering

  // ═══════════════════════════════════════════════════════════════════
  // 5W+H FRAMEWORK (The Core Grounding)
  // ═══════════════════════════════════════════════════════════════════

  who: string;                   // Who needs this / audience
  what: string;                  // What is being analyzed/done
  why: string;                   // Why this matters / purpose
  where: string;                 // Scope (company, market, geography)
  when: string;                  // Time context

  how: {
    focus: string[];             // What to emphasize
    constraints: string[];       // Restrictions/guardrails
    output_format?: string;      // Expected output style
  };

  // ═══════════════════════════════════════════════════════════════════
  // COMMANDER'S INTENT (The Anchor)
  // ═══════════════════════════════════════════════════════════════════

  commanders_intent: string;     // Ultimate goal in one sentence

  // ═══════════════════════════════════════════════════════════════════
  // REQUIREMENTS (Explicit Grounding)
  // ═══════════════════════════════════════════════════════════════════

  requirements: string[];        // MUST include these elements
  anti_requirements?: string[];  // MUST NOT include these
  key_terms?: string[];          // Terms that MUST appear in output

  // ═══════════════════════════════════════════════════════════════════
  // METADATA
  // ═══════════════════════════════════════════════════════════════════

  created_at: string;            // ISO 8601 timestamp
  updated_at?: string;           // ISO 8601 timestamp
  created_by?: string;           // Creator identifier
  expires_at?: string;           // Optional TTL

  // ═══════════════════════════════════════════════════════════════════
  // VERSIONING & CHANGE TRACKING
  // ═══════════════════════════════════════════════════════════════════

  changelog?: Array<{
    version: number;
    change: string;
    timestamp: string;
    changed_by?: string;
  }>;

  // ═══════════════════════════════════════════════════════════════════
  // RELATIONSHIPS
  // ═══════════════════════════════════════════════════════════════════

  parent_symbol?: string;        // For hierarchical symbols
  related_symbols?: string[];    // Cross-references
  supersedes?: string;           // If this replaces another symbol
}

type SymbolCategory =
  | 'COMPANY'
  | 'PERSON'
  | 'EVENT'
  | 'SECTOR'
  | 'TASK'
  | 'KNOWLEDGE'
  | 'QUERY';
```

---

## Example Symbols

### Public Company Analysis

```json
{
  "symbolId": "Ξ.NVDA.Q3FY25",
  "version": 1,
  "hash": "a3f8c2d1e5b7f9a2",

  "category": "COMPANY",
  "subcategory": "QUARTERLY_ANALYSIS",
  "tags": ["semiconductor", "ai", "datacenter"],

  "who": "Investment Committee",
  "what": "NVIDIA Q3 FY25 quarterly performance analysis",
  "why": "Evaluate position sizing for portfolio rebalancing",
  "where": "NVIDIA Corporation (NASDAQ: NVDA)",
  "when": "Q3 FY2025 (ended October 2024)",

  "how": {
    "focus": ["datacenter_revenue", "gross_margins", "guidance"],
    "constraints": ["cite_specific_numbers", "compare_to_prior_quarter", "note_risks"],
    "output_format": "structured_analysis"
  },

  "commanders_intent": "Determine if we should maintain, increase, or reduce our overweight position in NVDA",

  "requirements": [
    "MUST mention $30.8 billion datacenter revenue",
    "MUST discuss Blackwell GPU transition timeline",
    "MUST address China export restriction impact",
    "MUST compare gross margins to prior quarter (75.0% vs 75.1%)",
    "MUST include forward guidance for Q4"
  ],

  "anti_requirements": [
    "Do NOT provide buy/sell recommendations",
    "Do NOT speculate beyond stated guidance"
  ],

  "key_terms": ["$30.8B", "Blackwell", "datacenter", "China", "75%", "Q4"],

  "created_at": "2024-12-25T10:00:00Z",
  "created_by": "system"
}
```

### DeepSearchQA Benchmark Query

```json
{
  "symbolId": "Ξ.Q.DEEPSEARCHQA.001",
  "version": 1,
  "hash": "b7e9f3a2c1d4e8f6",

  "category": "QUERY",
  "subcategory": "BENCHMARK",
  "tags": ["deepsearchqa", "huggingface", "test"],

  "who": "Benchmark Evaluation System",
  "what": "Answer complex multi-hop question requiring web search",
  "why": "Validate symbol grounding effectiveness on standard benchmark",
  "where": "Google DeepSearchQA evaluation dataset",
  "when": "2024 benchmark run",

  "how": {
    "focus": ["accuracy", "completeness", "citation"],
    "constraints": ["must_cite_sources", "answer_all_parts"],
    "output_format": "direct_answer_with_sources"
  },

  "commanders_intent": "Provide accurate, complete answer with all required components",

  "requirements": [
    "MUST answer the primary question",
    "MUST include specific numerical data if asked",
    "MUST cite sources for factual claims"
  ],

  "key_terms": [],

  "created_at": "2024-12-25T10:00:00Z",
  "source_dataset": "google/deepsearchqa",
  "source_id": "eval_001"
}
```

---

## File Storage Structure

```
mcp-server/
├── symbols/
│   ├── registry.json              # Master index of all symbols
│   │
│   ├── companies/                 # Company symbols by ticker
│   │   ├── NVDA/
│   │   │   ├── Q3FY25.json
│   │   │   └── Q4FY25.json
│   │   └── AAPL/
│   │       └── 2024.json
│   │
│   ├── people/                    # Individual symbols
│   │   └── JENSEN_HUANG/
│   │       └── BIO.json
│   │
│   ├── events/                    # Event symbols
│   │   └── EARNINGS_NVDA_20241120.json
│   │
│   ├── sectors/                   # Sector symbols
│   │   └── SEMICONDUCTORS_2024.json
│   │
│   ├── tasks/                     # Task symbols
│   │   └── PORTFOLIO_REVIEW_001.json
│   │
│   ├── knowledge/                 # Knowledge symbols
│   │   └── CHEMISTRY_WATER.json
│   │
│   └── queries/                   # Query/benchmark symbols
│       └── DEEPSEARCHQA/
│           ├── 001.json
│           └── 002.json
```

### Registry Index (registry.json)

```json
{
  "version": "1.0.0",
  "updated_at": "2024-12-25T10:00:00Z",
  "symbols": {
    "Ξ.NVDA.Q3FY25": {
      "path": "companies/NVDA/Q3FY25.json",
      "category": "COMPANY",
      "version": 1,
      "hash": "a3f8c2d1e5b7f9a2",
      "created_at": "2024-12-25T10:00:00Z"
    },
    "Ξ.Q.DEEPSEARCHQA.001": {
      "path": "queries/DEEPSEARCHQA/001.json",
      "category": "QUERY",
      "version": 1,
      "hash": "b7e9f3a2c1d4e8f6",
      "created_at": "2024-12-25T10:00:00Z"
    }
  },
  "stats": {
    "total_symbols": 2,
    "by_category": {
      "COMPANY": 1,
      "QUERY": 1
    }
  }
}
```

---

## MCP Tools

### ps_symbol_create

Create a new directive symbol.

```typescript
interface CreateSymbolRequest {
  symbolId: string;              // Must follow namespace rules
  category: SymbolCategory;
  who: string;
  what: string;
  why: string;
  where: string;
  when: string;
  how: {
    focus: string[];
    constraints: string[];
    output_format?: string;
  };
  commanders_intent: string;
  requirements: string[];
  // ... optional fields
}

interface CreateSymbolResponse {
  success: boolean;
  symbolId: string;
  version: number;
  hash: string;
  path: string;
}
```

### ps_symbol_get

Retrieve a symbol by ID.

```typescript
interface GetSymbolRequest {
  symbolId: string;
  version?: number;              // Optional: get specific version
}

interface GetSymbolResponse {
  found: boolean;
  symbol?: DirectiveSymbol;
  error?: string;
}
```

### ps_symbol_update

Update an existing symbol (creates new version).

```typescript
interface UpdateSymbolRequest {
  symbolId: string;
  changes: Partial<DirectiveSymbol>;
  change_description: string;    // For changelog
  changed_by?: string;
}

interface UpdateSymbolResponse {
  success: boolean;
  symbolId: string;
  old_version: number;
  new_version: number;
  old_hash: string;
  new_hash: string;
}
```

### ps_symbol_list

List symbols with optional filtering.

```typescript
interface ListSymbolsRequest {
  category?: SymbolCategory;
  tags?: string[];
  created_after?: string;
  created_before?: string;
  search?: string;               // Search in symbolId, what, commanders_intent
  limit?: number;
  offset?: number;
}

interface ListSymbolsResponse {
  symbols: Array<{
    symbolId: string;
    category: SymbolCategory;
    version: number;
    hash: string;
    commanders_intent: string;   // Preview
    created_at: string;
  }>;
  total: number;
  has_more: boolean;
}
```

### ps_symbol_delete

Remove a symbol.

```typescript
interface DeleteSymbolRequest {
  symbolId: string;
  reason: string;
}

interface DeleteSymbolResponse {
  success: boolean;
  deleted: boolean;
}
```

### ps_symbol_import

Bulk import symbols from external data.

```typescript
interface ImportSymbolsRequest {
  source: 'huggingface' | 'json' | 'csv';
  data: unknown;                 // Source-specific format
  category: SymbolCategory;
  id_prefix: string;             // e.g., "Ξ.Q.DEEPSEARCHQA"
  transform?: {                  // Field mapping
    who?: string;
    what?: string;
    // ...
  };
}

interface ImportSymbolsResponse {
  success: boolean;
  imported: number;
  failed: number;
  symbols_created: string[];
  errors?: Array<{ index: number; error: string }>;
}
```

---

## Symbol ID Validation Rules

### General Rules

1. Must start with `Ξ.`
2. Segments separated by `.`
3. Each segment: 1-50 characters
4. Allowed characters: `A-Z`, `0-9`, `_`
5. No consecutive underscores
6. No trailing underscores

### Category-Specific Rules

**Companies (implicit category)**:
```regex
^Ξ\.[A-Z]{1,5}\.[A-Z0-9_]+(\.[A-Z0-9_]+)*$
```
- Second segment: Valid ticker (1-5 uppercase letters)
- Third segment: Period/context identifier
- Example: `Ξ.NVDA.Q3FY25.EARNINGS`

**Explicit Categories**:
```regex
^Ξ\.[IESTK]\.[A-Z0-9_]+(\.[A-Z0-9_]+)*$
```
- Second segment: Single letter category (I, E, S, T, K, Q)
- Remaining segments: Identifier and context
- Example: `Ξ.E.EARNINGS.NVDA.20241120`

### Validation Function

```typescript
function validateSymbolId(symbolId: string): ValidationResult {
  // Check prefix
  if (!symbolId.startsWith('Ξ.')) {
    return { valid: false, error: 'Must start with Ξ.' };
  }

  const parts = symbolId.slice(2).split('.');

  if (parts.length < 2) {
    return { valid: false, error: 'Must have at least 2 segments after Ξ.' };
  }

  // Determine if company (ticker) or explicit category
  const firstPart = parts[0];

  if (/^[A-Z]{1,5}$/.test(firstPart)) {
    // Looks like a ticker - company category
    return { valid: true, category: 'COMPANY', inferred: true };
  }

  if (/^[IESTK]$/.test(firstPart)) {
    // Explicit category prefix
    const categoryMap: Record<string, SymbolCategory> = {
      'I': 'PERSON',
      'E': 'EVENT',
      'S': 'SECTOR',
      'T': 'TASK',
      'K': 'KNOWLEDGE',
      'Q': 'QUERY'
    };
    return { valid: true, category: categoryMap[firstPart], inferred: false };
  }

  return { valid: false, error: 'Unrecognized category or invalid ticker' };
}
```

---

## Hash Calculation

Symbols include a content hash for integrity verification.

```typescript
import { createHash } from 'crypto';

function calculateSymbolHash(symbol: DirectiveSymbol): string {
  // Include only semantic content, not metadata
  const content = {
    who: symbol.who,
    what: symbol.what,
    why: symbol.why,
    where: symbol.where,
    when: symbol.when,
    how: symbol.how,
    commanders_intent: symbol.commanders_intent,
    requirements: symbol.requirements,
    anti_requirements: symbol.anti_requirements,
    key_terms: symbol.key_terms,
  };

  const json = JSON.stringify(content, Object.keys(content).sort());
  return createHash('sha256').update(json).digest('hex').substring(0, 16);
}
```

---

## LLM-Friendly Design Notes

1. **Flat Structure**: Symbol objects are shallow (max 2 levels deep) for easy LLM parsing
2. **Explicit Field Names**: `commanders_intent` not `ci`, `requirements` not `reqs`
3. **Arrays for Lists**: Never comma-separated strings
4. **Self-Documenting IDs**: `Ξ.NVDA.Q3FY25` immediately conveys "NVIDIA Q3 FY25"
5. **Consistent Casing**:
   - Category prefixes: UPPERCASE
   - Tickers: UPPERCASE
   - Field names: snake_case
6. **Hash for Verification**: Agents can check they have correct version
7. **Changelog for Context**: Agents see what changed and when

---

## Agent Usage Pattern

```typescript
// Agent 1 queries the symbol
const symbol = await mcp.call('ps_symbol_get', { symbolId: 'Ξ.NVDA.Q3FY25' });

// Agent uses symbol for grounding
const prompt = `
You are analyzing NVIDIA.

DIRECTIVE SYMBOL: ${symbol.symbolId} (v${symbol.version}, hash: ${symbol.hash})

WHO: ${symbol.who}
WHAT: ${symbol.what}
WHY: ${symbol.why}

COMMANDER'S INTENT: "${symbol.commanders_intent}"

REQUIREMENTS:
${symbol.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Your analysis MUST satisfy all requirements above.
`;

// Agent 2, 3, 4... all query the SAME symbol - no drift!
```
