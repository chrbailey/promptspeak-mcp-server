# Ahgen OS -- What's Actually Working (March 2026)

## Executive Summary

Ahgen OS is a personal AI operating system built on Claude Code as runtime, running on an always-on Mac Mini. It uses markdown files (CLAUDE.md + MEMORY.md) as persistent memory, MCP plugins for capabilities (governance, emotional memory, knowledge retrieval), Python/TypeScript hooks for automation, launchd for scheduling, and SQLite for all persistence. The system spans eight layers: memory, knowledge, governance, intelligence, collection, automation, skills, and output. It currently runs 56 MCP tools, 834 tests, 6 launchd jobs, and a live HTTPS governance server -- all coordinated through a single CLI interface with no web app, no cloud database, and no orchestration framework.

---

## Layer 1: Memory

The foundation. Two markdown files loaded automatically into every session, every agent, every sub-agent.

### CLAUDE.md -- Behavioral Instructions

- **Global** (`~/.claude/CLAUDE.md`): ~77 lines. Security rules, communication patterns, decision authority matrix, code style, MCP server reference, development principles, OWC drive layout.
- **Project** (`mcp-server/CLAUDE.md`): ~121 lines. Pipeline architecture, symbol frame syntax, validation rules, security enforcement table, "Don't" list learned from production failures.

Design principle from Boris Cherny: instructions (what to do) live in CLAUDE.md; knowledge (what is true) lives in MEMORY.md. Mixing them degrades both.

### MEMORY.md -- State and Knowledge

- **Project memory** (`~/.claude/projects/.../memory/MEMORY.md`): ~69 lines of active state. Version numbers, automation status table, plugin reference, gotchas list, archived cold references.
- **Updated every session**: before compaction or session end, new findings are written, stale entries removed, kept under 200 lines.

### How It Works

```
Session Start
    |
    v
Load ~/.claude/CLAUDE.md (global instructions)
    |
    v
Load mcp-server/CLAUDE.md (project instructions)
    |
    v
Load MEMORY.md (project state)
    |
    v
Agent has full context: rules + current state
```

No RAG. No vector search for memory. Just files in known locations, loaded deterministically. The simplicity is the feature -- there is no retrieval failure mode.

---

## Layer 2: Knowledge Store

A SQLite FTS5 database holding 1,201 insights across 18 domains, accumulated over months of sessions.

### Storage

- **Location**: `/Volumes/OWC drive/Knowledge/knowledge.db`
- **Engine**: SQLite with FTS5 full-text search, WAL mode
- **Schema**: insight text, domain tag, vote count, pin status, timestamps
- **Access**: MCP plugin (`~/.claude/plugins/knowledge-store/`) exposing 5 tools: `search`, `get`, `vote`, `pin`, `stats`

### Write Pipeline (3-Pass)

The session-stop hook (`~/.claude/hooks/knowledge-write.py`) runs on every session end:

1. **Explicit pass**: Extract insights the user explicitly flagged
2. **Pattern pass**: Detect recurring patterns across the session
3. **Haiku pass**: Send conversation to Claude Haiku with a quality gate -- only novel, non-obvious insights survive

Each insight is domain-tagged (one of 18 domains), deduplicated by content hash, and stored.

### Read Pipeline

The session-start hook (`~/.claude/hooks/knowledge-read.py`) injects relevant knowledge:

1. Query knowledge.db with current project context
2. Domain-filter results to project-relevant domains
3. Inject top hits into session context
4. Auto-upvote retrieved insights (reinforcement signal)

### Full Lifecycle

```
Conversation happens
        |
        v
Session Stop hook fires
        |
        v
3-pass extraction (explicit -> pattern -> Haiku)
        |
        v
Domain tagging + quality gate
        |
        v
Dedup check (content hash)
        |
        v
Store in knowledge.db
        |
        v
[Next session starts]
        |
        v
Session Start hook fires
        |
        v
FTS5 query with domain filter
        |
        v
Top insights injected into context
        |
        v
Auto-upvote on retrieval
```

---

## Layer 3: Governance (PromptSpeak)

The crown jewel. A pre-execution governance layer that intercepts MCP tool calls before they run.

### Numbers

| Metric | Value |
|--------|-------|
| MCP tools | 56 |
| Tests | 834 |
| Avg validation latency | 0.164ms |
| P95 latency | 0.368ms |
| Circuit breaker throughput | 6,173 ops/sec |
| Hold queue throughput | 55,556 holds/sec |
| Memory delta under load | Negative (GC reclaims during stress) |
| Version | 0.4.1 |
| Package | `@chrbailey/promptspeak-mcp-server` |
| License | MIT |

### 6-Stage Pipeline

```
Request
  |
  v
[1] Circuit Breaker -----> BLOCKED (if agent halted)
  |
  v
[2] Validation ----------> REJECTED (if frame invalid)
  |
  v
[3] Drift Detection -----> WARNING (if behavior drifting)
  |
  v
[4] Hold Check ----------> HELD (if human approval needed)
  |
  v
[5] Security Scan -------> BLOCKED/HELD (if vulnerability found)
  |
  v
[6] Execute
```

Order is load-bearing. Circuit breaker is first so halted agents cannot even reach validation.

### Security Enforcement

Write actions (`write_file`, `edit_file`, `create_file`, `patch_file`) are scanned:

| Severity | Action | Examples |
|----------|--------|----------|
| CRITICAL | **Block** | SQL injection, hardcoded secrets |
| HIGH | **Hold** | Security TODOs, logging secrets, insecure defaults |
| MEDIUM | **Warn** | Empty catch blocks, hedging comments, disabled tests |
| LOW/INFO | **Log** | Destructive DB/filesystem operations |

### Safety Annotations

All 56 tools carry safety annotations per the MCP spec:

- **30** read-only (safe to call without side effects)
- **24** destructive (modify state, require governance checks)
- **2** additive (create new resources)

### Infrastructure

- **Transport**: Streamable HTTP at `/mcp`, stateless per-request
- **Server**: Hono HTTP server on port 3000
- **Persistence**: SQLite for holds, decisions, audit log, circuit breaker state
- **HTTPS**: Live at `https://promptspeak.admin-as-a-service.com/mcp` via Cloudflare Tunnel (tunnel ID `401f738a`) to Mac Mini
- **Connectors**: Submission to Anthropic completed 2026-03-21, review pending

### Symbol Frame Syntax

Frames are 2-12 symbols encoding intent. Mode must be first.

Structure: `[Mode][Domain][Constraint?][Action][Entity?]`

Example: `⊕◊▶β` = "strict financial execute secondary-agent"

---

## Layer 4: Intelligence (Dossier Research)

A structured research loop that produces verified intelligence reports.

### Contract: RLC.DOSSIER.SIGNAL.001

- **Subject**: AI Signal Curation
- **Sources**: 10 required
- **Dimensions**: 6 analysis dimensions
- **Result**: CONVERGED-EARLY after 3 cycles + 1 ad hoc Cycle 4

### Pipeline (8 Phases)

```
[1] Source identification
  |
[2] Evidence collection (WebSearch + WebFetch + Firecrawl)
  |
[3] Evidence validation (source quality, recency, relevance)
  |
[4] Corroboration counting (cross-evidence topic-tag overlap)
  |
[5] Tier promotion (6-tier system, hash-based dedup)
  |
[6] Synthesis (pattern detection across verified evidence)
  |
[7] Context pack generation (output/signal-curation/context/pack.md)
  |
[8] Injection into /brief and /os skills
```

### Evidence Store

- **Database**: `data/evidence.db`
- **Methods**: 13 evidence management methods
- **Tier system**: 6-tier promotion based on confidence and corroboration
- **Total evidence**: 158 items (84 verified, 70 working, 4 raw)
- **Dedup**: Hash-based (source + content)

### Key Findings (Cycle 4)

1. Pentagon-AI governance crisis (constitutional dimension)
2. V-JEPA benchmarks confirming world models are real
3. Consciousness liability (contradictory legal signals)
4. Agentic AI trending toward ambient integration

### Open Questions (Event-Dependent)

6 questions tracked for weekly monitoring -- each depends on a real-world event (court ruling, NDAA June deadline, Kalinowski testimony, V-JEPA NLP extension, consciousness study replication, Pentagon in-house AI decision).

---

## Layer 5: Collection

### Lex Scraper

- **Sources**: 7 Chinese AI news/research sources
- **Schedule**: 4x daily (00:00, 06:00, 12:00, 18:00)
- **Runtime**: Lex venv Python 3.11 (`/Volumes/OWC drive/Dev/lex/.venv/bin/python3`)
- **launchd plist**: `com.ahgen.lex-scrape` -- ACTIVE

### Gmail / Calendar MCP

- **Gmail**: Claude AI Gmail MCP -- authenticated and healthy
- **Calendar**: Claude AI Google Calendar MCP -- authenticated
- **Status**: Functional but not yet wired into pipeline-check automation (see system-broken.md)

### Firecrawl

- Web scraping for dossier research
- Used during evidence collection phases

---

## Layer 6: Automation

Seven launchd jobs manage the daily rhythm.

| Plist | Schedule | Status | Purpose |
|-------|----------|--------|---------|
| `com.promptspeak.ops-center` | Always-on | ACTIVE | PromptSpeak HTTP server on :3000 |
| `com.ahgen.lex-scrape` | 4x daily | ACTIVE | Chinese AI source scraping |
| `com.erp-access.ahgen-brief` | 8am daily | LOADED | Morning intelligence brief |
| `com.erp-access.ahgen-summary` | 6pm daily | LOADED | End-of-day summary |
| `com.erp-access.ahgen-pipeline` | Every 15min | UNLOADED | CRM pipeline check (fixed, not reloaded) |
| `com.dossier.weekly-monitor` | Sundays 8pm | STAGED | Weekly open-question monitor |

### Always-On Server

The PromptSpeak ops center (`com.promptspeak.ops-center`) runs continuously, serving:

- MCP protocol over streamable HTTP on port 3000
- Cloudflare Tunnel for HTTPS access
- SQLite-backed hold queue, audit log, and circuit breaker state

### Daily Rhythm

```
00:00  Lex scrape (cycle 1/4)
06:00  Lex scrape (cycle 2/4)
08:00  Morning brief (ahgen-brief)
12:00  Lex scrape (cycle 3/4)
15:00  Pipeline check (when loaded, every 15min)
18:00  Lex scrape (cycle 4/4) + Evening summary (ahgen-summary)
20:00  Weekly monitor (Sundays only, when loaded)
```

---

## Layer 7: Skills

Registered skills that compose across all layers. 24 total, key ones:

| Skill | Sources | Purpose |
|-------|---------|---------|
| `/os` | ALL layers | Full system status -- memory, knowledge, governance, automation, calendar, email |
| `/brief` | Dossier + knowledge + calendar + email | Morning intelligence briefing |
| `/approve` | PromptSpeak hold queue | Review and approve/reject held operations |
| `/prospect` | CRM + knowledge | Prospect research and scoring |
| `/pipeline` | CRM + Gmail | Pipeline status and follow-up actions |
| `/dossier-loop` | Dossier research engine | Run full research cycle |
| `/red-team` | Governance + security scanner | Adversarial testing of governance rules |

### How /os Works

The `/os` skill is the system's self-awareness command. It pulls from:

1. **Memory**: CLAUDE.md + MEMORY.md status
2. **Knowledge**: Recent insights, domain distribution, quality metrics
3. **Governance**: Hold queue length, circuit breaker states, recent audit entries
4. **Automation**: launchd job status, last-run times
5. **Calendar**: Today's events, upcoming meetings
6. **Email**: Unread count, flagged items, recent threads
7. **Collection**: Lex scraper last run, evidence store stats

---

## Layer 8: Output

### Dashboard

- HTML dashboard with governance metrics, hold queue status, system health
- Generated by dashboard-refresh script and `/os` skill

### GitHub Presence

- Repository: `chrbailey/promptspeak-mcp-server`
- Badges: test count, coverage, version, license
- SECURITY.md with vulnerability reporting policy
- 834 tests passing in CI
- Issue templates for bug reports and feature requests

### Playground

- Interactive governance demo at `/docs/playground/`
- Demonstrates symbol frame parsing, validation, security scanning
- Seeded with example scenarios

### Articles

- Technical articles explaining governance concepts
- Published alongside the repository

---

## Data Flow Diagrams

### 1. Session Lifecycle

```
User opens terminal
        |
        v
Claude Code starts session
        |
        v
knowledge-read hook fires -------> knowledge.db (FTS5 query)
        |                                   |
        v                                   v
CLAUDE.md loaded (instructions)     Top insights injected
        |
        v
MEMORY.md loaded (state)
        |
        v
MCP plugins connected: promptspeak, touchgrass, knowledge-store
        |
        v
[Session active -- all layers available]
        |
        v
Session ends
        |
        v
knowledge-write hook fires -------> 3-pass extraction
        |                                   |
        v                                   v
MEMORY.md updated if needed         New insights -> knowledge.db
```

### 2. Governance Pipeline (per tool call)

```
Incoming MCP tool call
        |
        v
+---[Circuit Breaker]---+
|   Agent halted?        |
|   YES -> BLOCK         |
|   NO  -> continue      |
+------------------------+
        |
        v
+---[Frame Validation]--+
|   Valid structure?     |
|   Valid semantics?     |
|   NO -> REJECT         |
|   YES -> continue      |
+------------------------+
        |
        v
+---[Drift Detection]---+
|   Behavior drifting?   |
|   YES -> WARN + log    |
|   NO  -> continue      |
+------------------------+
        |
        v
+---[Hold Check]---------+
|   Needs human approval? |
|   YES -> HOLD (queue)   |
|   NO  -> continue       |
+--------------------------+
        |
        v
+---[Security Scan]------+
|   Write action?         |
|   CRITICAL -> BLOCK     |
|   HIGH -> HOLD          |
|   MEDIUM -> WARN        |
|   LOW -> LOG            |
+--------------------------+
        |
        v
    EXECUTE
```

### 3. Intelligence Loop (Dossier)

```
Contract defined (sources, dimensions, convergence criteria)
        |
        v
+---> Cycle N
|         |
|         v
|     Source identification
|         |
|         v
|     Evidence collection (WebSearch, WebFetch, Firecrawl)
|         |
|         v
|     Validation + corroboration counting
|         |
|         v
|     Tier promotion (6 tiers)
|         |
|         v
|     Convergence check
|         |
|     NOT CONVERGED -> loop back
|         |
|     CONVERGED
|         v
|     Context pack generation
|         |
|         v
|     Inject into /brief and /os
|
+--- (max 5 cycles or CONVERGED-EARLY)
```

### 4. Daily Automation

```
                    Mac Mini (always on)
                           |
          +----------------+----------------+
          |                |                |
    [launchd]        [Cloudflare]     [Claude Code]
          |            Tunnel              |
          v                |               v
    Scheduled jobs         v          Interactive
          |           HTTPS :443       sessions
          |                |               |
          v                v               v
    +----------+    +-----------+    +-----------+
    | lex-scrape|    | ops-center|    | /os /brief|
    | brief     |    | port 3000 |    | /approve  |
    | summary   |    | SQLite DB |    | skills    |
    +----------+    +-----------+    +-----------+
          |                |               |
          v                v               v
    knowledge.db    holds + audit     MEMORY.md
    evidence.db     circuit state     knowledge.db
```

---

## Metrics Table

| Component | Metric | Value | Source |
|-----------|--------|-------|--------|
| Governance | MCP tools | 56 | package.json tool registrations |
| Governance | Tests | 834 | `npm test` |
| Governance | Avg latency | 0.164ms | stress test suite |
| Governance | P95 latency | 0.368ms | stress test suite |
| Governance | Circuit breaker ops/sec | 6,173 | stress test suite |
| Governance | Hold queue ops/sec | 55,556 | stress test suite |
| Governance | Memory delta under load | Negative | stress test (GC reclaims) |
| Knowledge | Total insights | 1,201 | knowledge_stats |
| Knowledge | Domains | 18 | knowledge_stats |
| Knowledge | Storage engine | SQLite FTS5 + WAL | knowledge.db |
| Dossier | Evidence items | 158 | evidence.db |
| Dossier | Verified | 84 | evidence.db |
| Dossier | Research cycles | 4 (converged early) | contract log |
| Collection | Lex sources | 7 | lex-scrape config |
| Collection | Scrape frequency | 4x daily | launchd plist |
| Automation | launchd jobs | 6 defined, 4 active | launchctl list |
| Skills | Registered | 24 | skill registry |
| Output | Safety annotations | 56/56 tools | MCP tool definitions |
| Infrastructure | Server | Hono + better-sqlite3 | package.json |
| Infrastructure | Transport | Streamable HTTP | /mcp endpoint |
| Infrastructure | HTTPS | Cloudflare Tunnel | tunnel 401f738a |
| Memory | CLAUDE.md (global) | ~77 lines | ~/.claude/CLAUDE.md |
| Memory | CLAUDE.md (project) | ~121 lines | mcp-server/CLAUDE.md |
| Memory | MEMORY.md | ~69 lines active | project memory |
