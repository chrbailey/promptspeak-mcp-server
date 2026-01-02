# PromptSpeak Symbol Design Enhancement Proposal

**Version:** 2.0
**Date:** 2026-01-02
**Status:** Draft for Review

---

## Executive Summary

This document proposes comprehensive enhancements to the PromptSpeak symbol system across three dimensions:
1. **Naming Convention** - More expressive, hierarchical symbol identification
2. **Content Structure** - Extended 5W+H with domain-specific modules
3. **Category System** - Expanded MECE taxonomy with subcategories

---

## Part 1: Naming Convention Enhancement

### 1.1 Current State

```
Ξ.{CATEGORY_PREFIX}.{IDENTIFIER}.{QUALIFIER}
```

**Current Examples:**
- `Ξ.NVDA.Q3FY25` (Company - implicit by ticker)
- `Ξ.I.JENSEN_HUANG` (Person)
- `Ξ.E.EARNINGS.NVDA.20241120` (Event)
- `Ξ.S.SEMICONDUCTORS.2024` (Sector)
- `Ξ.T.PORTFOLIO_REVIEW.001` (Task)
- `Ξ.K.CHEMISTRY.WATER` (Knowledge)
- `Ξ.Q.DEEPSEARCHQA.001` (Query)

**Issues:**
1. Inconsistent prefix usage (COMPANY uses ticker, others use 1-char prefix)
2. No namespace isolation for different operators/tenants
3. Limited hierarchy depth
4. No version embedding in ID

### 1.2 Proposed Naming Convention v2

```
Ξ.{NAMESPACE}.{CATEGORY}.{ENTITY}.{QUALIFIER}.{VARIANT}
```

**Components:**

| Component | Required | Pattern | Description |
|-----------|----------|---------|-------------|
| `Ξ` | Yes | Literal | Universal symbol anchor |
| `NAMESPACE` | No | `[a-z][a-z0-9_]*` | Operator/tenant isolation |
| `CATEGORY` | Yes | `[A-Z]{1,3}` | Primary category (see §3) |
| `ENTITY` | Yes | `[A-Z0-9_]+` | Primary identifier |
| `QUALIFIER` | No | `[A-Z0-9_]+` | Temporal/contextual qualifier |
| `VARIANT` | No | `v[0-9]+` or tag | Version or variant tag |

### 1.3 Enhanced Category Prefixes

| Prefix | Category | Example |
|--------|----------|---------|
| `C` | COMPANY | `Ξ.C.NVDA.Q3FY25` |
| `P` | PERSON | `Ξ.P.JENSEN_HUANG` |
| `E` | EVENT | `Ξ.E.EARNINGS.NVDA.20241120` |
| `S` | SECTOR | `Ξ.S.SEMI.2024` |
| `T` | TASK | `Ξ.T.REVIEW.001` |
| `K` | KNOWLEDGE | `Ξ.K.CHEM.WATER` |
| `Q` | QUERY | `Ξ.Q.DSQA.001` |
| `R` | REGULATORY | `Ξ.R.SEC.10K.NVDA.2024` |
| `M` | METRIC | `Ξ.M.REVENUE.NVDA.Q3FY25` |
| `D` | DOCUMENT | `Ξ.D.FILING.NVDA.8K.20241120` |
| `G` | GEOGRAPHY | `Ξ.G.US.CA.SANTA_CLARA` |
| `F` | FLOW | `Ξ.F.APPROVAL.PO.001` |
| `U` | UNIT | `Ξ.U.USD.MILLIONS` |

### 1.4 Namespace Examples

```
# Default namespace (no prefix)
Ξ.C.NVDA.Q3FY25

# Operator-specific namespace
Ξ.acme.C.NVDA.Q3FY25

# Research namespace
Ξ.research.Q.DEEPSEARCHQA.001

# Legal namespace
Ξ.legal.D.BRIEF.SMITH_V_JONES.2024
```

### 1.5 Temporal Qualifier Patterns

| Pattern | Meaning | Example |
|---------|---------|---------|
| `QXFYXX` | Fiscal Quarter | `Q3FY25` |
| `FYXX` | Fiscal Year | `FY25` |
| `YYYYMMDD` | Specific Date | `20241120` |
| `YYYYWXX` | Week Number | `2024W47` |
| `YYYY_HX` | Half Year | `2024_H2` |
| `TTM` | Trailing 12 Months | `TTM` |
| `LTM` | Last 12 Months | `LTM` |
| `MRQ` | Most Recent Quarter | `MRQ` |

---

## Part 2: Content Structure Enhancement

### 2.1 Current 5W+H Framework

```typescript
{
  who: string;           // Audience
  what: string;          // Subject
  why: string;           // Purpose
  where: string;         // Scope
  when: string;          // Time context
  how: {
    focus: string[];
    constraints: string[];
    output_format?: string;
  };
  commanders_intent: string;
  requirements: string[];
  anti_requirements?: string[];
  key_terms?: string[];
}
```

### 2.2 Proposed Enhanced Structure

```typescript
interface EnhancedDirectiveSymbol {
  // ═══════════════════════════════════════════════════════════════════════════
  // IDENTITY (Enhanced)
  // ═══════════════════════════════════════════════════════════════════════════

  symbolId: string;           // Enhanced pattern from §1
  version: number;
  hash: string;               // Content hash for integrity
  namespace?: string;         // Optional operator namespace

  // ═══════════════════════════════════════════════════════════════════════════
  // CLASSIFICATION (Enhanced)
  // ═══════════════════════════════════════════════════════════════════════════

  category: SymbolCategory;
  subcategory?: string;

  /** NEW: Domain classification (allows cross-cutting concerns) */
  domains?: Domain[];         // ['FINANCE', 'TECHNOLOGY', 'REGULATORY']

  /** NEW: Confidence in classification */
  classification_confidence?: number;  // 0.0-1.0

  /** NEW: Is this symbol derived from other symbols? */
  derived_from?: string[];    // Source symbol IDs

  tags?: string[];

  // ═══════════════════════════════════════════════════════════════════════════
  // 5W+H FRAMEWORK (Enhanced)
  // ═══════════════════════════════════════════════════════════════════════════

  /** WHO - Enhanced with role context */
  who: {
    audience: string;                   // Primary: "Portfolio managers"
    stakeholders?: string[];            // ["Risk team", "Compliance"]
    persona?: string;                   // "Expert", "Novice", "Executive"
  };

  /** WHAT - Enhanced with entity binding */
  what: {
    description: string;                // Core description
    entity_type?: string;               // "earnings_call", "10K_filing"
    primary_entity?: string;            // Bound symbol ID: "Ξ.C.NVDA"
    related_entities?: string[];        // Related symbol IDs
  };

  /** WHY - Enhanced with goal hierarchy */
  why: {
    purpose: string;                    // Immediate purpose
    business_value?: string;            // Business justification
    success_criteria?: string[];        // Measurable outcomes
    risk_if_failed?: string;            // Consequence of not doing this
  };

  /** WHERE - Enhanced with multi-scope */
  where: {
    scope: string;                      // Primary scope
    geography?: string[];               // ["US", "EMEA"]
    market?: string[];                  // ["NASDAQ", "NYSE"]
    segment?: string[];                 // ["Data Center", "Gaming"]
  };

  /** WHEN - Enhanced with temporal precision */
  when: {
    context: string;                    // Human description
    period_type?: 'POINT' | 'RANGE' | 'RECURRING';
    start_date?: string;                // ISO 8601
    end_date?: string;                  // ISO 8601
    fiscal_period?: string;             // Q3FY25
    recurrence?: string;                // "QUARTERLY", "MONTHLY"
  };

  /** HOW - Enhanced with execution detail */
  how: {
    focus: string[];
    constraints: string[];
    output_format?: string;

    /** NEW: Methodology specification */
    methodology?: string;               // "DCF", "Comparable Analysis"

    /** NEW: Required tools/capabilities */
    required_capabilities?: string[];   // ["web_search", "calculation"]

    /** NEW: Quality thresholds */
    quality_requirements?: {
      min_sources?: number;
      recency_days?: number;
      confidence_threshold?: number;
    };
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMANDER'S INTENT (Enhanced)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Ultimate goal - preserved as the north star */
  commanders_intent: string;

  /** NEW: Intent hierarchy for complex symbols */
  intent_hierarchy?: {
    strategic: string;                  // Long-term objective
    tactical: string;                   // Immediate goal
    operational?: string;               // Specific action
  };

  /** NEW: Success definition */
  done_when?: string[];                 // Completion criteria

  // ═══════════════════════════════════════════════════════════════════════════
  // REQUIREMENTS (Enhanced)
  // ═══════════════════════════════════════════════════════════════════════════

  requirements: string[];
  anti_requirements?: string[];
  key_terms?: string[];

  /** NEW: Prioritized requirements */
  prioritized_requirements?: {
    must_have: string[];
    should_have: string[];
    nice_to_have: string[];
  };

  /** NEW: Acceptance criteria */
  acceptance_criteria?: AcceptanceCriterion[];

  // ═══════════════════════════════════════════════════════════════════════════
  // DOMAIN-SPECIFIC EXTENSIONS (NEW)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Financial domain extension */
  financial?: FinancialExtension;

  /** Legal domain extension */
  legal?: LegalExtension;

  /** Regulatory domain extension */
  regulatory?: RegulatoryExtension;

  /** Metric domain extension */
  metric?: MetricExtension;

  // ═══════════════════════════════════════════════════════════════════════════
  // PROVENANCE & TRUST (NEW)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Source attribution */
  provenance?: {
    source_type: 'PRIMARY' | 'SECONDARY' | 'DERIVED' | 'SYNTHETIC';
    source_authority: 'HIGH' | 'MEDIUM' | 'LOW';  // SEC > News
    source_urls?: string[];
    extraction_method?: string;         // "manual", "llm", "api"
    verified_by?: string;
    verification_date?: string;
  };

  /** Trust score (computed) */
  trust_score?: number;                 // 0.0-1.0

  /** Confidence intervals for claims */
  confidence?: {
    overall: number;                    // 0.0-1.0
    by_field?: Record<string, number>;  // Per-field confidence
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE (Enhanced)
  // ═══════════════════════════════════════════════════════════════════════════

  status?: 'DRAFT' | 'ACTIVE' | 'DEPRECATED' | 'ARCHIVED';
  expires_at?: string;
  review_date?: string;                 // When to re-validate

  /** NEW: Staleness detection */
  freshness?: {
    last_validated: string;
    valid_for_days: number;
    is_stale: boolean;                  // Computed
  };
}
```

### 2.3 Domain-Specific Extensions

#### 2.3.1 Financial Extension

```typescript
interface FinancialExtension {
  /** Ticker symbols */
  tickers?: string[];

  /** Market identifiers */
  markets?: string[];                   // ["NASDAQ", "NYSE"]

  /** Financial metrics */
  metrics?: {
    revenue?: MonetaryValue;
    net_income?: MonetaryValue;
    eps?: number;
    pe_ratio?: number;
    market_cap?: MonetaryValue;
    guidance?: {
      type: 'RAISED' | 'LOWERED' | 'MAINTAINED' | 'WITHDREW';
      value?: MonetaryValue;
      period?: string;
    };
  };

  /** Sentiment indicators */
  sentiment?: {
    overall: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidence: number;
    drivers?: string[];
  };

  /** Peer comparison context */
  peer_group?: string[];                // Symbol IDs of peer companies
}

interface MonetaryValue {
  amount: number;
  currency: string;
  unit: 'ONES' | 'THOUSANDS' | 'MILLIONS' | 'BILLIONS';
  as_of?: string;
}
```

#### 2.3.2 Legal Extension

```typescript
interface LegalExtension {
  /** Case citation */
  citation?: {
    format: 'BLUEBOOK' | 'ALWD' | 'CUSTOM';
    full_citation: string;
    short_form?: string;
  };

  /** Court information */
  court?: {
    name: string;
    jurisdiction: string;
    level: 'TRIAL' | 'APPELLATE' | 'SUPREME';
  };

  /** Legal concepts */
  legal_concepts?: string[];            // ["res judicata", "stare decisis"]

  /** Holdings/Rules */
  holdings?: string[];

  /** Precedential value */
  precedential_value?: 'BINDING' | 'PERSUASIVE' | 'NOT_CITABLE';
}
```

#### 2.3.3 Regulatory Extension

```typescript
interface RegulatoryExtension {
  /** Filing type */
  filing_type?: string;                 // "10-K", "8-K", "DEF 14A"

  /** Regulatory body */
  regulator?: string;                   // "SEC", "FDA", "FTC"

  /** Filing details */
  filing?: {
    accession_number?: string;
    file_number?: string;
    filed_date?: string;
    accepted_date?: string;
  };

  /** Compliance status */
  compliance?: {
    status: 'COMPLIANT' | 'NON_COMPLIANT' | 'PENDING' | 'EXEMPT';
    deadline?: string;
    requirements?: string[];
  };
}
```

#### 2.3.4 Metric Extension

```typescript
interface MetricExtension {
  /** Metric definition */
  definition: string;

  /** Calculation formula (LaTeX or plain) */
  formula?: string;

  /** Unit of measure */
  unit: string;

  /** Current value */
  value?: number;

  /** Historical values */
  time_series?: Array<{
    period: string;
    value: number;
    source?: string;
  }>;

  /** Benchmarks */
  benchmarks?: Array<{
    name: string;                       // "Industry Average"
    value: number;
    comparison: 'ABOVE' | 'BELOW' | 'AT';
  }>;

  /** Trend analysis */
  trend?: {
    direction: 'UP' | 'DOWN' | 'FLAT';
    change_percent?: number;
    period?: string;
  };
}
```

---

## Part 3: Category System Enhancement

### 3.1 Current Categories (7)

| Category | Prefix | Description |
|----------|--------|-------------|
| COMPANY | (ticker) | Public companies |
| PERSON | I | Individuals |
| EVENT | E | Events |
| SECTOR | S | Industries |
| TASK | T | Projects/Tasks |
| KNOWLEDGE | K | Reference |
| QUERY | Q | Benchmarks |

### 3.2 Proposed MECE Taxonomy (13 Categories)

Following PromptSpeak Registry v2.0 principles, we expand to a MECE (Mutually Exclusive, Collectively Exhaustive) taxonomy:

```
SYMBOL CATEGORY TAXONOMY
├── AGENT (A) - Active entities that act
│   ├── COMPANY (C) - Organizations
│   ├── PERSON (P) - Individuals
│   └── SYSTEM (SY) - Automated systems
│
├── RESOURCE (R) - Passive entities acted upon
│   ├── DOCUMENT (D) - Documents, filings
│   ├── KNOWLEDGE (K) - Reference knowledge
│   └── ASSET (AS) - Tangible/intangible assets
│
├── EVENT (E) - Things that happen
│   ├── OCCURRENCE (E) - One-time events
│   ├── MILESTONE (MS) - Project milestones
│   └── REGULATORY_EVENT (RE) - Regulatory events
│
├── FLOW (F) - Processes and workflows
│   ├── TASK (T) - Work items
│   ├── WORKFLOW (WF) - Multi-step processes
│   └── TRANSACTION (TX) - Business transactions
│
├── RULE (RL) - Constraints and policies
│   ├── REGULATORY (RG) - Regulatory requirements
│   ├── POLICY (PL) - Business policies
│   └── CONSTRAINT (CN) - Technical constraints
│
├── UNIT (U) - Reference data
│   ├── METRIC (M) - Measured quantities
│   ├── GEOGRAPHY (G) - Locations
│   └── SECTOR (S) - Industry classifications
│
└── QUERY (Q) - Benchmark/test queries
```

### 3.3 Category Type Definitions

```typescript
type SymbolCategoryV2 =
  // AGENT family
  | 'COMPANY'           // Ξ.C.NVDA
  | 'PERSON'            // Ξ.P.JENSEN_HUANG
  | 'SYSTEM'            // Ξ.SY.TRADING_ENGINE

  // RESOURCE family
  | 'DOCUMENT'          // Ξ.D.10K.NVDA.2024
  | 'KNOWLEDGE'         // Ξ.K.GAAP.REVENUE_RECOGNITION
  | 'ASSET'             // Ξ.AS.PATENT.US12345678

  // EVENT family
  | 'EVENT'             // Ξ.E.EARNINGS.NVDA.Q3FY25
  | 'MILESTONE'         // Ξ.MS.PRODUCT_LAUNCH.H100
  | 'REGULATORY_EVENT'  // Ξ.RE.FDA_APPROVAL.DRUG123

  // FLOW family
  | 'TASK'              // Ξ.T.ANALYSIS.001
  | 'WORKFLOW'          // Ξ.WF.ONBOARDING.NEW_CLIENT
  | 'TRANSACTION'       // Ξ.TX.ACQUISITION.ARM

  // RULE family
  | 'REGULATORY'        // Ξ.RG.SEC.RULE_10B5
  | 'POLICY'            // Ξ.PL.TRADING.INSIDER
  | 'CONSTRAINT'        // Ξ.CN.SYSTEM.RATE_LIMIT

  // UNIT family
  | 'METRIC'            // Ξ.M.REVENUE.NVDA.Q3FY25
  | 'GEOGRAPHY'         // Ξ.G.US.CA.SANTA_CLARA
  | 'SECTOR'            // Ξ.S.SEMICONDUCTORS

  // QUERY family
  | 'QUERY';            // Ξ.Q.BENCHMARK.001

type CategoryFamily = 'AGENT' | 'RESOURCE' | 'EVENT' | 'FLOW' | 'RULE' | 'UNIT' | 'QUERY';
```

### 3.4 Category Prefix Mapping

```typescript
const CATEGORY_PREFIX_V2: Record<string, SymbolCategoryV2> = {
  // Explicit prefixes (1-2 chars)
  'C': 'COMPANY',
  'P': 'PERSON',
  'SY': 'SYSTEM',
  'D': 'DOCUMENT',
  'K': 'KNOWLEDGE',
  'AS': 'ASSET',
  'E': 'EVENT',
  'MS': 'MILESTONE',
  'RE': 'REGULATORY_EVENT',
  'T': 'TASK',
  'WF': 'WORKFLOW',
  'TX': 'TRANSACTION',
  'RG': 'REGULATORY',
  'PL': 'POLICY',
  'CN': 'CONSTRAINT',
  'M': 'METRIC',
  'G': 'GEOGRAPHY',
  'S': 'SECTOR',
  'Q': 'QUERY',
};

const CATEGORY_FAMILY: Record<SymbolCategoryV2, CategoryFamily> = {
  COMPANY: 'AGENT',
  PERSON: 'AGENT',
  SYSTEM: 'AGENT',
  DOCUMENT: 'RESOURCE',
  KNOWLEDGE: 'RESOURCE',
  ASSET: 'RESOURCE',
  EVENT: 'EVENT',
  MILESTONE: 'EVENT',
  REGULATORY_EVENT: 'EVENT',
  TASK: 'FLOW',
  WORKFLOW: 'FLOW',
  TRANSACTION: 'FLOW',
  REGULATORY: 'RULE',
  POLICY: 'RULE',
  CONSTRAINT: 'RULE',
  METRIC: 'UNIT',
  GEOGRAPHY: 'UNIT',
  SECTOR: 'UNIT',
  QUERY: 'QUERY',
};
```

---

## Part 4: Migration Strategy

### 4.1 Backward Compatibility

The enhanced naming convention is **backward compatible**:

```typescript
// OLD: Still valid
Ξ.NVDA.Q3FY25           // Recognized as COMPANY by ticker heuristic
Ξ.I.JENSEN_HUANG        // Recognized as PERSON by I prefix

// NEW: More explicit
Ξ.C.NVDA.Q3FY25         // Explicitly COMPANY
Ξ.P.JENSEN_HUANG        // Explicitly PERSON
```

### 4.2 Validation Rules

```typescript
function validateSymbolIdV2(id: string): SymbolIdValidation {
  // Must start with Ξ.
  if (!id.startsWith('Ξ.')) {
    return { valid: false, error: 'Must start with Ξ.' };
  }

  const parts = id.slice(2).split('.');

  // Check for namespace (lowercase first segment)
  let namespace: string | undefined;
  let categoryIndex = 0;

  if (parts[0] && /^[a-z][a-z0-9_]*$/.test(parts[0])) {
    namespace = parts[0];
    categoryIndex = 1;
  }

  // Must have category + entity at minimum
  if (parts.length < categoryIndex + 2) {
    return { valid: false, error: 'Must have category and entity' };
  }

  const categoryPart = parts[categoryIndex];

  // Check explicit prefix
  if (CATEGORY_PREFIX_V2[categoryPart]) {
    return {
      valid: true,
      category: CATEGORY_PREFIX_V2[categoryPart],
      namespace,
      segments: parts,
      inferred: false,
    };
  }

  // Check ticker heuristic (1-5 uppercase letters)
  if (/^[A-Z]{1,5}$/.test(categoryPart)) {
    return {
      valid: true,
      category: 'COMPANY',
      namespace,
      segments: parts,
      inferred: true,  // Ticker-based inference
    };
  }

  return { valid: false, error: `Unknown category: ${categoryPart}` };
}
```

### 4.3 Migration Script Outline

```typescript
async function migrateSymbolsToV2(manager: SymbolManager): Promise<MigrationReport> {
  const stats = { migrated: 0, skipped: 0, errors: [] };

  const allSymbols = await manager.list({ limit: 10000 });

  for (const entry of allSymbols.symbols) {
    const symbol = await manager.get({ symbolId: entry.symbolId });
    if (!symbol.found || !symbol.symbol) continue;

    // Already using explicit prefix?
    const parts = entry.symbolId.slice(2).split('.');
    if (CATEGORY_PREFIX_V2[parts[0]]) {
      stats.skipped++;
      continue;
    }

    // Generate new ID with explicit prefix
    const prefix = PREFIX_FOR_CATEGORY_V2[symbol.symbol.category];
    const newId = `Ξ.${prefix}.${parts.join('.')}`;

    // Create superseding relationship
    // (implementation details...)

    stats.migrated++;
  }

  return stats;
}
```

---

## Part 5: Implementation Recommendations

### 5.1 Phase 1: Schema Enhancement (Week 1)
- [ ] Update `types.ts` with enhanced interfaces
- [ ] Add domain extension types
- [ ] Add validation for new patterns
- [ ] Update hash calculation to include new fields

### 5.2 Phase 2: Database Migration (Week 2)
- [ ] Add new columns for enhanced fields
- [ ] Create indexes for domain queries
- [ ] Implement FTS on new searchable fields
- [ ] Test backward compatibility

### 5.3 Phase 3: API Updates (Week 3)
- [ ] Update MCP tool schemas
- [ ] Add domain-specific create/update endpoints
- [ ] Add migration utilities
- [ ] Update documentation

### 5.4 Phase 4: Validation (Week 4)
- [ ] Write comprehensive test suite
- [ ] Migrate test symbols
- [ ] Performance benchmarking
- [ ] Security validation for new fields

---

## Appendix A: Example Symbols in New Format

### A.1 Company Symbol (Enhanced)

```json
{
  "symbolId": "Ξ.C.NVDA.Q3FY25",
  "version": 3,
  "hash": "a1b2c3d4e5f6g7h8",
  "category": "COMPANY",
  "subcategory": "EARNINGS",
  "domains": ["FINANCE", "TECHNOLOGY"],

  "who": {
    "audience": "Institutional investors and equity analysts",
    "stakeholders": ["Portfolio managers", "Risk teams"],
    "persona": "Expert"
  },

  "what": {
    "description": "NVIDIA Q3 FY2025 earnings analysis and forward guidance assessment",
    "entity_type": "earnings_period",
    "primary_entity": "Ξ.C.NVDA",
    "related_entities": ["Ξ.S.SEMICONDUCTORS", "Ξ.P.JENSEN_HUANG"]
  },

  "why": {
    "purpose": "Evaluate financial performance and guidance trajectory",
    "business_value": "Investment decision support for $2T market cap company",
    "success_criteria": ["Revenue variance explained", "Guidance delta quantified"],
    "risk_if_failed": "Missed trading signals, suboptimal position sizing"
  },

  "where": {
    "scope": "NVIDIA Corporation global operations",
    "geography": ["US", "TAIWAN", "CHINA"],
    "market": ["NASDAQ"],
    "segment": ["Data Center", "Gaming", "Automotive"]
  },

  "when": {
    "context": "Fiscal Q3 2025 ending October 2024",
    "period_type": "RANGE",
    "start_date": "2024-08-01",
    "end_date": "2024-10-31",
    "fiscal_period": "Q3FY25"
  },

  "how": {
    "focus": ["Revenue by segment", "Gross margin trajectory", "AI demand signals"],
    "constraints": ["No speculation beyond disclosed guidance"],
    "output_format": "Structured earnings brief with tables",
    "methodology": "Comparable period analysis, guidance variance",
    "required_capabilities": ["financial_calculation", "chart_generation"],
    "quality_requirements": {
      "min_sources": 3,
      "recency_days": 7,
      "confidence_threshold": 0.85
    }
  },

  "commanders_intent": "Surface actionable signals for portfolio positioning before market opens",

  "intent_hierarchy": {
    "strategic": "Maintain information edge in semiconductor sector",
    "tactical": "Identify Q3 results vs consensus delta",
    "operational": "Generate pre-market brief by 6 AM ET"
  },

  "done_when": [
    "Revenue variance vs consensus quantified",
    "Guidance change explained",
    "Key metric tables generated",
    "Risk factors highlighted"
  ],

  "requirements": [
    "Include segment-level revenue breakdown",
    "Compare to prior quarter and year-ago quarter",
    "Extract verbatim guidance quotes"
  ],

  "financial": {
    "tickers": ["NVDA"],
    "markets": ["NASDAQ"],
    "metrics": {
      "revenue": { "amount": 35.1, "currency": "USD", "unit": "BILLIONS" },
      "eps": 0.78,
      "guidance": {
        "type": "RAISED",
        "value": { "amount": 37.5, "currency": "USD", "unit": "BILLIONS" },
        "period": "Q4FY25"
      }
    },
    "sentiment": {
      "overall": "BULLISH",
      "confidence": 0.82,
      "drivers": ["AI demand", "Data center growth"]
    },
    "peer_group": ["Ξ.C.AMD", "Ξ.C.INTC", "Ξ.C.AVGO"]
  },

  "provenance": {
    "source_type": "PRIMARY",
    "source_authority": "HIGH",
    "source_urls": [
      "https://investor.nvidia.com/earnings",
      "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001045810"
    ],
    "extraction_method": "llm",
    "verification_date": "2024-11-20"
  },

  "trust_score": 0.92,

  "confidence": {
    "overall": 0.88,
    "by_field": {
      "financial.metrics.revenue": 0.99,
      "financial.sentiment.overall": 0.75
    }
  },

  "status": "ACTIVE",
  "freshness": {
    "last_validated": "2024-11-20T10:30:00Z",
    "valid_for_days": 90,
    "is_stale": false
  }
}
```

---

## Appendix B: Decision Log

| Decision | Rationale | Date |
|----------|-----------|------|
| Single-letter prefixes for main categories | Compact IDs, easy typing | 2026-01-02 |
| Two-letter prefixes for subcategories | Avoid collision, maintain clarity | 2026-01-02 |
| Optional namespace prefix | Multi-tenant support without breaking existing | 2026-01-02 |
| Enhanced 5W+H with nested objects | Preserve compatibility, add expressiveness | 2026-01-02 |
| Domain extensions as optional objects | Not all symbols need all domains | 2026-01-02 |
| MECE category taxonomy | Registry v2.0 alignment | 2026-01-02 |

---

## Next Steps

1. **Review this proposal** with stakeholders
2. **Prioritize enhancements** based on immediate needs
3. **Create detailed implementation tasks** for approved changes
4. **Build migration tooling** before schema changes
5. **Update documentation** throughout implementation
