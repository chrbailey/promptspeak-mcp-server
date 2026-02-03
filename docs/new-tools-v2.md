# PromptSpeak v2.0 New Tools Reference

This document covers the new MCP tools added in v2.0.0.

## Verification Tools

### ps_verify_cross_llm

Verify a PromptSpeak symbol using multiple LLM providers for consensus validation.

**Input:**
```json
{
  "symbol_id": "XI.INTENT.MISSION_001",
  "symbol_type": "INTENT",
  "symbol_data": {
    "objective": "Analyze competitor pricing",
    "constraints": ["Public data only"]
  }
}
```

**Output:**
```json
{
  "verified": true,
  "confidence_score": 0.92,
  "consensus": { "count": 3, "total": 3 },
  "needs_human_review": false,
  "discrepancies": [],
  "provider_results": [
    { "provider": "anthropic", "model": "claude-3", "confidence": 0.95 },
    { "provider": "openai", "model": "gpt-4", "confidence": 0.90 },
    { "provider": "google", "model": "gemini-pro", "confidence": 0.91 }
  ]
}
```

**Required Environment Variables:**
- `ANTHROPIC_API_KEY` - For Anthropic provider
- `OPENAI_API_KEY` - For OpenAI provider
- `GOOGLE_API_KEY` - For Google provider

At least one provider must be configured.

### ps_verify_status

Get the status of cross-LLM verification (available providers).

**Input:** None required

**Output:**
```json
{
  "available": true,
  "providers": ["anthropic", "openai"],
  "message": "Cross-LLM verification available with 2 provider(s)"
}
```

---

## Legal Calendar Tools

### ps_legal_extract_deadlines

Extract legal deadlines from document text using pattern matching and FRCP rules.

**Input:**
```json
{
  "content": "Defendant shall respond within 21 days...",
  "court_rules": "frcp",
  "base_date": "2026-01-30",
  "case_number": "2:26-cv-00123"
}
```

**Output:**
```json
{
  "deadlines": [
    {
      "description": "Response to Complaint",
      "due_date": "2026-02-20T00:00:00.000Z",
      "priority": "high",
      "type": "filing",
      "confidence": 0.95
    }
  ],
  "count": 1,
  "warnings": []
}
```

### ps_legal_generate_ical

Generate iCalendar (.ics) file from extracted deadlines.

**Input:**
```json
{
  "deadlines": [
    { "description": "Motion deadline", "due_date": "2026-02-15" }
  ],
  "calendar_name": "Case 123 Deadlines",
  "timezone": "America/New_York"
}
```

**Output:**
```json
{
  "ical_content": "BEGIN:VCALENDAR\n...",
  "event_count": 1,
  "calendar_name": "Case 123 Deadlines"
}
```

### ps_legal_deadline_summary

Get a formatted summary of legal deadlines with priorities.

**Input:**
```json
{
  "content": "..legal document text...",
  "format": "markdown",
  "days_ahead": 30
}
```

### ps_legal_extract_and_export

Extract deadlines and generate iCal in one operation.

**Input:**
```json
{
  "content": "...legal document...",
  "calendar_name": "My Case Deadlines"
}
```

---

## Commander's Intent Tools (Multi-Agent)

### ps_mission_create

Create a mission with Commander's Intent.

**Input:**
```json
{
  "objective": "Analyze market pricing",
  "end_state": { "success": ["report_complete"] },
  "constraints": ["Use public data only"],
  "red_lines": ["No accessing private systems"],
  "autonomy_level": "guided"
}
```

### ps_mission_status

Get mission status and agent information.

### ps_mission_complete

Mark a mission as complete.

### ps_agent_register

Register an agent for a mission.

### ps_agent_heartbeat

Agent heartbeat/status update.

### ps_intent_consult

Consult intent for decision guidance when facing ambiguity.

---

## Swarm Intelligence

The swarm module provides bidding strategies and market intelligence for eBay operations.

### Running the Demo

```bash
cd mcp-server
npx tsx src/swarm/demo/swarm-demo.ts --agents=5 --budget=500
```

### Bidding Strategies

- **SNIPER** - Wait until final moments, bid at maximum
- **EARLY_AGGRESSIVE** - Bid early to discourage competition
- **NEGOTIATOR** - Focus on Best Offer listings
- **PASSIVE** - Wait for good deals, never bid above threshold
- **HYBRID** - Combine strategies based on market conditions

---

## Configuration

### OAuth Setup

Set the following environment variables:

```bash
OAUTH_ENABLED=true
OAUTH_JWT_SECRET=your-secret-key-min-32-chars
OAUTH_JWT_EXPIRY=1h
OAUTH_ISSUER=your-app-name
```

### eBay Mode

```bash
# Sandbox mode (default, safe for testing)
EBAY_SANDBOX=true

# Production mode (requires full credentials)
EBAY_SANDBOX=false
EBAY_PROD_APP_ID=...
EBAY_PROD_CERT_ID=...
```

### Pinecone Integration

```bash
PINECONE_API_KEY=your-key
SWARM_VECTOR_NAMESPACE=swarm-intel
```

### Cross-LLM Verification

```bash
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
```
