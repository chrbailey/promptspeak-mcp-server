---
name: hold-triage
description: Review and process pending governance holds. Use when holds are waiting for human approval or when the user asks about blocked operations.
---

# Hold Triage — PromptSpeak Governance

You are triaging pending governance holds. Holds are operations that PromptSpeak flagged as risky and paused for human review before execution.

## Workflow

1. **List pending holds** — Call `ps_hold_list` to see what's waiting.
2. **For each hold, present a summary:**
   - What agent attempted the action
   - What tool was being called and with what arguments
   - Why PromptSpeak flagged it (which pipeline stage triggered the hold)
   - Risk assessment: what could go wrong if approved
3. **Ask the user for a decision** on each hold:
   - **Approve** — call `ps_hold_approve` with the hold ID
   - **Reject** — call `ps_hold_reject` with the hold ID and a reason
   - **Skip** — leave for later review
4. **After processing**, call `ps_hold_stats` to show the updated queue state.

## Presentation Format

For each hold, use this format:

```
Hold #[id] — [agent_id] → [tool_name]
  Risk: [brief risk description]
  Flagged by: [pipeline stage]
  Args: [summarized arguments]
  ⏱ Expires: [expiration time if set]
```

## Guidelines

- Never auto-approve holds. Always present to the user for decision.
- If a hold has expired, note that it was automatically rejected.
- Group related holds (same agent, same tool) for batch decisions.
- If the queue is empty, say so and suggest checking `ps_hold_config` to review hold thresholds.
