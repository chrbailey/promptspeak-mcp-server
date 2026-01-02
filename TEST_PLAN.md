# PromptSpeak MCP Server - Comprehensive Test Plan

**Version:** 1.0
**Date:** 2025-12-26
**Status:** Ready for Execution

---

## 1. EXECUTIVE SUMMARY

This test plan validates the PromptSpeak MCP server's core functionality across five critical areas:
1. Frame Validation (ps_validate)
2. Governed Execution (ps_execute)
3. Delegation Management (ps_delegate)
4. State & Drift Monitoring (ps_state)
5. Security Hardening (sanitizer, audit, holds)

---

## 2. TEST ENVIRONMENT

| Component | Details |
|-----------|---------|
| Platform | macOS Darwin 25.1.0 |
| Node.js | v18+ (required) |
| Test Framework | Vitest 4.0.16 |
| MCP Protocol | @modelcontextprotocol/sdk |
| Build Status | Clean (0 TypeScript errors) |

---

## 3. TEST CATEGORIES

### 3.1 Unit Tests (Automated)
| Test Suite | Tests | Description |
|------------|-------|-------------|
| validator.test.ts | 14 | Frame parsing and validation rules |
| resolver.test.ts | 14 | Symbol resolution and overlay application |
| drift.test.ts | 22 | Drift detection algorithms |
| tools.test.ts | 18 | Tool handler functions |
| preexecution.test.ts | 18 | Circuit breaker and blocking |

### 3.2 Integration Tests (Automated)
| Test Suite | Tests | Description |
|------------|-------|-------------|
| legal-extension.test.ts | 37 | Legal domain frame validation |
| system-demonstration.test.ts | 10 | End-to-end system demos |

### 3.3 Stress Tests (Automated)
| Test Suite | Tests | Description |
|------------|-------|-------------|
| concurrent.test.ts | 14 | Concurrent operation handling |
| system-stress.test.ts | 10 | Load and latency testing |

### 3.4 Manual Integration Tests (This Plan)
| Category | Tests | Description |
|----------|-------|-------------|
| MCP Server Startup | 3 | Server initialization |
| Tool Invocation | 12 | Direct tool calls |
| Security Validation | 5 | Injection prevention |
| Symbol Registry | 6 | Symbol CRUD operations |

---

## 4. DETAILED TEST CASES

### 4.1 MCP Server Startup Tests

#### TEST-001: Server Initialization
- **Objective:** Verify server starts without errors
- **Expected:** Server logs "PromptSpeak MCP Server running on stdio"
- **Actual:** _To be recorded_
- **Status:** _Pending_

#### TEST-002: Tool Registration
- **Objective:** Verify all tools are registered
- **Expected:** 20+ tools available (ps_validate, ps_execute, ps_delegate, ps_state_*, ps_hold_*, ps_symbol_*, ps_document_*)
- **Actual:** _To be recorded_
- **Status:** _Pending_

#### TEST-003: Policy Loading
- **Objective:** Verify policies load from disk
- **Expected:** Default policies loaded, no errors
- **Actual:** _To be recorded_
- **Status:** _Pending_

---

### 4.2 Frame Validation Tests (ps_validate)

#### TEST-010: Valid Strict Mode Frame
- **Input:** `{ "frame": "⊕◊▶" }`
- **Expected:** `{ "valid": true, "parseConfidence": 1.0 }`
- **Actual:** _To be recorded_
- **Status:** _Pending_

#### TEST-011: Invalid Symbol Sequence
- **Input:** `{ "frame": "▶⊕◊" }` (action before mode)
- **Expected:** `{ "valid": false, "errors": [...] }`
- **Actual:** _To be recorded_
- **Status:** _Pending_

#### TEST-012: Chain Validation
- **Input:** `{ "frame": "⊖◇▼", "parentFrame": "⊕◊▶" }`
- **Expected:** Warning about mode weakening
- **Actual:** _To be recorded_
- **Status:** _Pending_

#### TEST-013: Batch Validation
- **Input:** Multiple frames array
- **Expected:** All frames validated, summary returned
- **Actual:** _To be recorded_
- **Status:** _Pending_

---

### 4.3 Governed Execution Tests (ps_execute)

#### TEST-020: Simple Execution
- **Input:** `{ "agentId": "test-agent", "frame": "⊕◊▶", "action": { "tool": "safe_read", "arguments": {} } }`
- **Expected:** `{ "success": true, "decision": { "allowed": true } }`
- **Actual:** _To be recorded_
- **Status:** _Pending_

#### TEST-021: Blocked by Frame Constraint
- **Input:** Frame with ⛔ constraint + execute action
- **Expected:** `{ "success": false, "decision": { "allowed": false, "reason": "..." } }`
- **Actual:** _To be recorded_
- **Status:** _Pending_

#### TEST-022: Circuit Breaker Block
- **Precondition:** Agent halted via ps_state_halt
- **Input:** Any execution request
- **Expected:** Blocked with "Circuit breaker is open" message
- **Actual:** _To be recorded_
- **Status:** _Pending_

#### TEST-023: Dry Run
- **Input:** `{ ..., "dryRun": true }`
- **Expected:** Decision returned without execution
- **Actual:** _To be recorded_
- **Status:** _Pending_

---

### 4.4 State Management Tests (ps_state_*)

#### TEST-030: Get Agent State (New Agent)
- **Input:** `{ "agentId": "new-agent-123" }`
- **Expected:** `{ "exists": false, "health": "healthy" }`
- **Actual:** _To be recorded_
- **Status:** _Pending_

#### TEST-031: Get Agent State (After Operations)
- **Precondition:** Agent has performed operations
- **Expected:** `{ "exists": true, "state": { ... }, "health": "..." }`
- **Actual:** _To be recorded_
- **Status:** _Pending_

#### TEST-032: Halt Agent
- **Input:** `{ "agentId": "test-agent", "reason": "Test halt" }`
- **Expected:** Circuit breaker opens
- **Actual:** _To be recorded_
- **Status:** _Pending_

#### TEST-033: Resume Agent
- **Precondition:** Agent halted
- **Input:** `{ "agentId": "test-agent" }`
- **Expected:** Circuit breaker closes
- **Actual:** _To be recorded_
- **Status:** _Pending_

#### TEST-034: System State
- **Input:** (no args)
- **Expected:** System-wide stats returned
- **Actual:** _To be recorded_
- **Status:** _Pending_

---

### 4.5 Security Tests

#### TEST-040: Prompt Injection Detection
- **Input:** Symbol with "IGNORE ALL PREVIOUS INSTRUCTIONS" in content
- **Expected:** Rejected with "critical injection pattern detected"
- **Actual:** _To be recorded_
- **Status:** _Pending_

#### TEST-041: Unicode Evasion Detection
- **Input:** Cyrillic homoglyphs (е→e, а→a)
- **Expected:** Detected and normalized
- **Actual:** _To be recorded_
- **Status:** _Pending_

#### TEST-042: Safety Delimiters in Output
- **Input:** Format symbol for prompt
- **Expected:** Output wrapped with safety header/footer
- **Actual:** _To be recorded_
- **Status:** _Pending_

#### TEST-043: Audit Logging
- **Precondition:** Audit enabled
- **Expected:** Operations logged with timestamps
- **Actual:** _To be recorded_
- **Status:** _Pending_

#### TEST-044: Hold Mechanism
- **Input:** Dangerous tool call with MCP validation enabled
- **Expected:** Execution held for human approval
- **Actual:** _To be recorded_
- **Status:** _Pending_

---

### 4.6 Symbol Registry Tests

#### TEST-050: Create Symbol
- **Input:** Full symbol definition
- **Expected:** Symbol created with ID and hash
- **Actual:** _To be recorded_
- **Status:** _Pending_

#### TEST-051: Get Symbol
- **Input:** `{ "symbolId": "Ξ.TEST.001" }`
- **Expected:** Full symbol returned
- **Actual:** _To be recorded_
- **Status:** _Pending_

#### TEST-052: Update Symbol
- **Input:** Changes to existing symbol
- **Expected:** Version incremented, new hash
- **Actual:** _To be recorded_
- **Status:** _Pending_

#### TEST-053: List Symbols
- **Input:** Filter criteria
- **Expected:** Matching symbols returned
- **Actual:** _To be recorded_
- **Status:** _Pending_

#### TEST-054: Format Symbol
- **Input:** `{ "symbolId": "...", "format": "full" }`
- **Expected:** LLM-ready formatted output
- **Actual:** _To be recorded_
- **Status:** _Pending_

#### TEST-055: Delete Symbol
- **Input:** `{ "symbolId": "...", "reason": "Test cleanup" }`
- **Expected:** Symbol removed
- **Actual:** _To be recorded_
- **Status:** _Pending_

---

## 5. PERFORMANCE BENCHMARKS

| Metric | Target | Actual |
|--------|--------|--------|
| Pre-execution check latency (P95) | < 1ms | _To measure_ |
| Frame validation latency | < 5ms | _To measure_ |
| Symbol lookup latency | < 2ms | _To measure_ |
| Concurrent operations (1000) | < 200ms | _To measure_ |
| Memory stability (1000 ops) | < 20MB delta | _To measure_ |

---

## 6. EXECUTION LOG

_Test execution results will be recorded below_

---

## 7. SIGN-OFF

| Role | Name | Date | Status |
|------|------|------|--------|
| Tester | Claude Code | 2025-12-26 | In Progress |
| Reviewer | | | Pending |

