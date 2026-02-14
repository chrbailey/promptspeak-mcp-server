---
name: governance-setup
description: Configure PromptSpeak governance for a new project. Use when first setting up PromptSpeak or when the user wants to customize governance policies.
---

# Governance Setup — PromptSpeak

You are helping the user configure PromptSpeak governance for their project.

## Workflow

1. **Assess the project context** — Ask the user:
   - What kind of agents will be governed? (coding assistants, data pipelines, customer-facing bots)
   - What's the risk tolerance? (strict/regulated vs permissive/experimental)
   - Are there specific tools or operations that must always require human approval?

2. **Map answers to a governance profile**, then let the user override specifics:

   | Profile | When to use | Confidence | Holds | Drift | Post-Audit |
   |---------|-------------|-----------|-------|-------|------------|
   | **Lockdown** | Regulated domains (legal, financial, healthcare), production with PII | 0.95 | All tool calls held for approval | ON, halt at 0.3 | ON |
   | **Standard** | Production coding assistants, internal tools, CI pipelines | 0.7 | Destructive ops only (deletes, deployments, external API writes) | ON, halt at 0.6 | ON |
   | **Exploratory** | Sandboxes, prototyping, hackathons, trusted single-user agents | 0.3 | None (log only) | OFF | OFF |

   Present all three profiles with the table above. Recommend **Standard** unless the user's answers clearly indicate otherwise. After the user picks a profile, ask: "Any overrides? For example, specific tools that should always require approval, or a different drift threshold."

   Apply overrides on top of the chosen profile before proceeding to step 3.

3. **Apply configuration** using PromptSpeak tools:
   - Set confidence thresholds with `ps_confidence_bulk_set`
   - Configure hold behavior with `ps_hold_config`
   - Set feature flags with `ps_feature_set`
   - Register policy overlays with `ps_config_set` and `ps_config_activate`

4. **Verify** — Run `ps_execute_dry_run` with a sample frame to confirm the pipeline behaves as expected.

5. **Export** — Call `ps_config_export` so the user can save their configuration.
