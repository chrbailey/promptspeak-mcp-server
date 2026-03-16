# PromptSpeak Strategic Research Report
**March 14, 2026 — ERP Access, Inc.**

---

## The Bottom Line

PromptSpeak occupies a genuinely unique position in a $492M market (Gartner, 2026) growing to $1B+ by 2030. No other tool — open source or commercial — combines pre-execution governance, MCP-native architecture, hold queues with approval workflows, and operation-level interception. The competitive landscape is crowded with post-execution tools (observability, evaluation, content filtering), but the pre-execution governance niche is empty.

The timing is exceptional: regulatory deadlines (EU AI Act Aug 2026, Colorado Jun 2026, federal procurement rules active now) are creating a governance panic window through Q3 2026. Platform players are acquiring governance companies at significant multiples (Cisco bought Robust Intelligence for $400M, OpenAI bought Promptfoo for $86M — March 9, 2026).

---

## What PromptSpeak Actually Has

### Verified Strengths

| Capability | Status | Competitive Significance |
|-----------|--------|------------------------|
| 9-stage pre-execution pipeline | Real, tested | No competitor has this depth |
| 45 MCP tools | Confirmed | Largest MCP governance tool surface |
| Hold queue + approval workflows | Working | Only tool generating continuous evidence chains |
| Circuit breaker (deterministic kill switch) | Proven at scale (1,000 concurrent) | Zero false passes under stress |
| Adaptive threshold modulation | Novel (epistemic vs aleatoric uncertainty) | Academic-grade, no competitor has this |
| Progressive autonomy trust state machine | Implemented, tested | 4-level ladder with asymmetric dynamics |
| 0.103ms latency / 6,977 ops/sec | Real (from stress tests) | Negligible overhead claim is verified |
| Security scanning (10 patterns) | Working | Basic but functional |
| Symbol Registry (SQLite-persisted) | Working | Unique entity tracking with versioning |

### Honest Gaps

| Gap | Impact | Fix Effort |
|-----|--------|-----------|
| All operational state in-memory | Server restart wipes holds, drift, circuit breakers | Medium — add SQLite persistence |
| Stage 6 is simulated | PromptSpeak doesn't proxy tool calls (sidecar, not proxy) | Actually correct architecture — document better |
| Legal domain holds unwired | Fully implemented but never called in pipeline | Low — wire shouldHoldLegal() into gatekeeper |
| Security gate doesn't create real holds | ps_security_gate returns "held" but doesn't use HoldManager | Low — connect the plumbing |
| No HTTP transport | stdio-only, limits deployment options | Medium — hono dependency exists unused |
| Pinecone dead dependency | Bloat in package.json | Trivial — remove it |
| README says 658 tests / 21 files | Actually 15 test files on disk | Trivial — update README |

---

## Competitive Landscape

### Tier 1: Well-Funded Specialists

| Competitor | Funding | What They Do | Pre/Post | Threat |
|-----------|---------|-------------|----------|--------|
| Galileo | $68M | Hallucination firewall + evaluation | Post (output validation) | Low |
| Arthur AI | $63M | Agent discovery + inventory | Post (monitoring) | Low |
| Credo AI | $41M | Policy/compliance governance | Pre (policy, not operations) | Medium — closest |
| Patronus AI | $40M | LLM evaluation/testing | Pre-deployment (not runtime) | Low |
| Lakera | $30M | Prompt injection blocking | Runtime security only | Low |

### Tier 2: Platform Players

| Platform | Capability | Threat |
|----------|-----------|--------|
| AWS Bedrock Guardrails | Content filtering, PII redaction, automated reasoning | Medium — platform advantage |
| Cisco AI Defense | Network-level AI traffic control (was Robust Intelligence, $400M) | Low — different altitude |
| IBM watsonx.governance | Lifecycle governance | Low — IBM ecosystem lock |
| OneTrust | AI asset inventory, regulatory tracking | Low — GRC focus |

### Tier 3: MCP Gateways (Emerging)

| Gateway | Focus | Gap PromptSpeak Fills |
|---------|-------|----------------------|
| Lasso Security | Real-time threat detection | No governance logic |
| Harmonic Security | MCP traffic discovery/policy | No hold queues or approval workflows |
| Operant AI | Governed agent deployment | No pre-execution pipeline |
| Solo.io Agent Gateway | Agent-to-agent communication (Envoy) | Infrastructure, not governance |

### The Empty Niche

No competitor combines all four:
1. Pre-execution (acts before the AI operation runs)
2. MCP-native (built for agent-tool protocol)
3. Operation-level (governs what tools do, not what models say)
4. Evidence-generating (hold queues create auditable approval chains)

### Acquisition Signal

Three governance/security acquisitions in 12 months:
- Robust Intelligence → Cisco ($400M, Sep 2024)
- Prompt Security → SentinelOne (Aug 2025)
- Promptfoo → OpenAI ($86M, Mar 9, 2026)

---

## Market Demand

### Size

| Source | 2026 | 2030 | CAGR |
|--------|------|------|------|
| Gartner | $492M | >$1B | — |
| Grand View Research | — | $1.4B | 35.7% |
| Forrester | — | $15.8B (broad) | 30% |
| MarketsandMarkets | — | $5.8B (2029) | 45.2% |

### Regulatory Deadlines

| Deadline | What |
|----------|------|
| Now | OMB M-25-22 procurement rules for federal AI |
| June 30, 2026 | Colorado AI Act takes effect |
| August 2, 2026 | EU AI Act high-risk requirements (7% revenue penalties) |
| Ongoing | 1,700+ federal AI use cases need governance, 227 safety-impacting |

### Buyer Profile

- Primary: CIO/CISO (76.7% of AI decisions are C-suite)
- Triggers: regulatory deadline (most predictable), incident (40%), board mandate, audit finding
- Hottest verticals: financial services, healthcare, government/federal, defense
- Price points: $50K-$500K+ ACV (enterprise custom)

### The Evidence Gap

Current tools create policies but not enforcement evidence. Specific gaps:
- No continuous evidence generation
- No proof of who authorized what AI operation
- 79% lack formal agent security policies
- 98% deploying agentic AI, frameworks haven't caught up

PromptSpeak's hold queue directly generates the continuous evidence regulators demand.

---

## Next Steps

### Immediate (This Month)
1. Fix production gaps (persistence, wire legal holds, connect security gate, remove dead deps)
2. Position as "Governance Intelligence for MCP"
3. Respond to PR #2019 merge on awesome-mcp-servers

### Short-Term (30 Days)
4. Write positioning article for Dev.to / HN / LinkedIn
5. Add HTTP transport (hono dependency exists)
6. Submit to Anthropic Connectors Directory

### Medium-Term (60-90 Days)
7. Build federal buyer demo (FSIS RFI case study)
8. Partner with MCP Gateway companies
9. Consider acquisition positioning

---

## Sources

- [Gartner: AI Regulations Fuel Billion-Dollar Governance Market](https://www.gartner.com/en/newsroom/press-releases/2026-02-17-gartner-global-ai-regulations-fuel-billion-dollar-market-for-ai-governance-platforms)
- [Forrester Wave: AI Governance Solutions Q3 2025](https://www.forrester.com/report/the-forrester-wave-tm-ai-governance-solutions-q3-2025/RES184849)
- [AnalyticsWeek: The Truth Layer Crisis](https://analyticsweek.com/truth-layer-crisis-ai-governance-intelligence-2026/)
- [IAPP AI Governance Vendor Report 2026](https://iapp.org/resources/article/ai-governance-vendor-report)
- [OpenAI Acquires Promptfoo ($86M)](https://www.cnbc.com/2026/03/09/open-ai-cybersecurity-promptfoo-ai-agents.html)
- [Cisco Acquires Robust Intelligence ($400M)](https://www.calcalistech.com/ctechnews/article/rjgsb5npa)
- [AI Governance Evidence Gap](https://internetworkdefense.com/ai-governance-controls-briefing-2026-03-06-evidence-gap/)
- [Linux Foundation AAIF / MCP Standard](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation)
- [MCP Gateways Landscape](https://www.integrate.io/blog/best-mcp-gateways-and-ai-agent-security-tools/)
- [OMB M-24-10](https://www.whitehouse.gov/wp-content/uploads/2024/03/M-24-10-Advancing-Governance-Innovation-and-Risk-Management-for-Agency-Use-of-Artificial-Intelligence.pdf)
- [EU AI Act Timeline](https://artificialintelligenceact.eu/implementation-timeline/)
- [Colorado AI Act](https://www.schellman.com/blog/ai-services/what-you-need-to-know-about-the-colorado-ai-act)
