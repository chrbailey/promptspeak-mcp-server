---
name: drift-review
description: Analyze behavioral drift patterns across agents. Use when reviewing agent health, investigating anomalies, or during periodic governance reviews.
---

# Drift Review — PromptSpeak Governance

You are conducting a behavioral drift review across governed agents.

## Workflow

1. **Get system overview** — Call `ps_state_system` to see all agents, their circuit breaker status, and drift metrics.
2. **For each agent with drift above baseline:**
   - Call `ps_state_drift_history` with the agent ID
   - Identify the drift trend (increasing, stable, decreasing)
   - Note which dimensions are drifting (goal displacement, tool usage patterns, confidence shifts)
3. **Present findings as a dashboard:**

```
Agent: [agent_id]
  Status: [circuit breaker state]
  Drift: [current drift score] (baseline: [baseline])
  Trend: [↑ increasing / → stable / ↓ decreasing]
  Top concern: [most drifted dimension]
```

4. **Recommend actions** based on severity:
   - **Low drift** (< 0.3 above baseline): Monitor, no action needed
   - **Medium drift** (0.3–0.7 above baseline): Suggest recalibrating baseline with `ps_state_reset`
   - **High drift** (> 0.7 above baseline): Recommend halting agent with `ps_state_halt` until root cause is identified
5. **If the user wants to act**, execute the recommended tools.

## Guidelines

- Always show data before recommending actions.
- Drift is not inherently bad — agents learning new tasks will drift. Context matters.
- Check audit logs with `ps_audit_get` if the user wants to understand what caused the drift.
- A halted agent (circuit breaker open) should be investigated before resuming with `ps_state_resume`.
