# Ahgen OS -- What's Broken, Fragile, or Missing (March 2026)

A brutally honest audit of the system. For each item: what's wrong, why it matters, estimated effort to fix, and priority.

---

## Critical (Blocks Daily Use)

### 1. Calendar/Email Not Configured

- **What**: touchgrass MCP returns `not_configured` for calendar and email context. The Google Calendar and Gmail MCPs are authenticated and healthy, but touchgrass doesn't pull from them.
- **Why it matters**: `/os` skips its most useful sections -- upcoming meetings, unread emails, flagged threads. The morning `/brief` lacks the calendar awareness that makes it actionable.
- **Effort**: Medium. Need to wire touchgrass `get_calendar_context` and `get_email_summary` to the Claude AI Gmail/Calendar MCPs, or configure the touchgrass plugin to use them as data sources.
- **Priority**: P0 -- this is the single biggest gap in daily utility.

### 2. Pipeline-Check Unloaded

- **What**: The `com.erp-access.ahgen-pipeline` plist was fixed (MCP tools added to `--allowedTools`) but never reloaded into launchd. It sits in a corrected state on disk, doing nothing.
- **Why it matters**: CRM pipeline automation is completely idle. No 15-minute checks, no follow-up alerts, no prospect updates. The entire sales automation layer is dark.
- **Effort**: Low. One `launchctl load` command after verifying the plist. The fix is already applied.
- **Priority**: P0 -- literally one command to restore a major capability.

### 3. Docker/Browser MCP Down

- **What**: The MCP_DOCKER server for browser automation (screenshots, web form interaction, Puppeteer) is not running. Docker is either not started or the container is not built.
- **Why it matters**: Cannot automate web forms, take screenshots for verification, or interact with browser-based workflows. This blocked the Connectors submission (had to do it manually) and blocks any future web automation tasks.
- **Effort**: Medium. Need to verify Docker Desktop is running, rebuild the container if needed, and test the MCP connection.
- **Priority**: P0 -- blocks an entire category of automation.

---

## High (Degrades Quality)

### 4. Tier 3 Knowledge Crept Back

- **What**: 86 insights at tier 3 (low quality) despite previous cleanup efforts. The write hook's quality gate isn't blocking tier 3 entries effectively.
- **Why it matters**: Low-quality insights dilute the knowledge store. When FTS5 retrieves them, they consume context budget without providing value. The reinforcement loop (auto-upvote on retrieval) makes this worse over time.
- **Effort**: Medium. Need to tighten the Haiku quality gate threshold in `knowledge-write.py`, then batch-review and purge existing tier 3 entries.
- **Priority**: P1 -- quality degradation compounds over time.

### 5. 20 Insights with Null Project

- **What**: 20 knowledge entries have `null` as their project tag. The transcript path parsing in the write hook is fragile -- when the path format changes or a session starts from an unexpected directory, the project extraction fails silently.
- **Why it matters**: These insights are orphaned from domain filtering. They may be retrieved in wrong contexts or missed entirely when filtering by project.
- **Effort**: Low. Fix the path parser to handle edge cases, then backfill the 20 null entries by inspecting their content.
- **Priority**: P1 -- data integrity issue with a simple fix.

### 6. Haiku Costs Untracked

- **What**: Every session end triggers a Claude Haiku API call for the knowledge extraction pass. There is no tracking of how many calls are made, what they cost, or whether the extraction is producing value proportional to cost.
- **Why it matters**: Invisible recurring cost with no ROI measurement. Could be $0.50/day or $5/day -- nobody knows.
- **Effort**: Low. Add a cost-per-call log entry in the write hook. Aggregate in a weekly report.
- **Priority**: P1 -- financial blind spot.

### 7. No Knowledge Quality Dashboard

- **What**: No way to visualize knowledge store health -- tier distribution, domain coverage gaps, stale insights, retrieval hit rates, vote distributions.
- **Why it matters**: Without visibility, quality problems (like #4 and #5) go undetected until they visibly degrade output. The knowledge store is the system's long-term memory; it needs monitoring like any production database.
- **Effort**: Medium. Build a simple HTML report (similar to the governance dashboard) pulling from `knowledge_stats` and direct SQLite queries.
- **Priority**: P1 -- observability gap.

---

## Medium (Tech Debt)

### 8. Connectors Form Submission Incomplete

- **What**: The Anthropic Connectors submission form was submitted 2026-03-21, but required manual effort because Browser MCP was down. If resubmission or follow-up is needed, the same manual bottleneck applies.
- **Why it matters**: Any future Anthropic integration steps that require web form interaction will be blocked until Browser MCP is restored (see #3).
- **Effort**: Resolved by fixing #3 (Docker/Browser MCP).
- **Priority**: P2 -- dependent on #3.

### 9. Weekly Monitor Not Loaded

- **What**: The `com.dossier.weekly-monitor` plist is staged in `~/.claude/staging/` but never loaded into launchd. The 6 event-dependent open questions from the dossier research are not being tracked automatically.
- **Why it matters**: The intelligence loop's value decays without monitoring. Court rulings, NDAA deadlines, and testimony events could happen without the system noticing.
- **Effort**: Low. Move from staging to active, `launchctl load`, verify it fires on Sundays.
- **Priority**: P2 -- time-sensitive intelligence going stale.

### 10. Dead Database Columns

- **What**: `valid_to` and `action_target` columns in governance SQLite tables are 0% populated. They were added speculatively and never wired to any logic.
- **Why it matters**: Schema clutter. Anyone reading the codebase (or an agent inspecting the DB) will waste time trying to understand columns that do nothing.
- **Effort**: Low. Migration to drop columns, update any TypeScript interfaces that reference them.
- **Priority**: P2 -- cosmetic but creates confusion.

### 11. Dashboard Overwrite Conflict

- **What**: Both the `/os` skill and `dashboard-refresh.py` write to the same dashboard HTML file. If both run concurrently (e.g., user runs `/os` while the 10-minute refresh fires), one overwrites the other.
- **Why it matters**: Intermittent dashboard corruption or stale data. Not catastrophic but confusing when it happens.
- **Effort**: Low. Use a lock file, or have `/os` write to a different output path than the automated refresh.
- **Priority**: P2 -- race condition, low frequency.

### 12. Two Lex-Scrape Plists

- **What**: An old `com.erpaccess.lex-scrape` plist (from the ERP Access era) still exists alongside the current `com.ahgen.lex-scrape`. The old one errors on every trigger because its paths are stale.
- **Why it matters**: Noise in system logs. Every failed trigger generates error output that clutters log review.
- **Effort**: Trivial. `launchctl unload` the old plist and delete it.
- **Priority**: P2 -- cleanup.

---

## Low (Nice-to-Have)

### 13. No Automated Hook Testing

- **What**: The knowledge-read and knowledge-write hooks have no test suite. Changes are verified manually by running a session and checking the output.
- **Why it matters**: Hooks are load-bearing infrastructure. A broken hook silently disables knowledge injection or extraction -- the system still runs but loses its long-term memory capability without any error.
- **Effort**: Medium. Write pytest suite that mocks session context and verifies hook output against expected knowledge.db state.
- **Priority**: P3 -- safety net for critical infrastructure.

### 14. No Knowledge Backup Strategy

- **What**: `knowledge.db` (1,201 insights) exists only on the OWC drive. No backup, no replication, no export schedule.
- **Why it matters**: If the OWC drive fails or the file corrupts, months of accumulated knowledge are gone. SQLite WAL mode protects against crash corruption but not hardware failure.
- **Effort**: Low. Cron job to copy to a second location (iCloud, another drive, or a git-tracked export).
- **Priority**: P3 -- disaster recovery.

### 15. No Cost Tracking

- **What**: No aggregate view of API costs -- Haiku calls from hooks, Claude Code session costs, MCP tool invocations, Firecrawl usage.
- **Why it matters**: Running an AI OS has non-trivial costs. Without tracking, budget surprises are inevitable.
- **Effort**: Medium. Centralized cost log aggregating from multiple sources.
- **Priority**: P3 -- financial hygiene.

### 16. Playground Not Linked from README

- **What**: The interactive governance playground (`/docs/playground/`) exists and works but is not linked from the project README or any navigation.
- **Why it matters**: The playground is the best demo of PromptSpeak's capabilities. Visitors to the GitHub repo won't find it.
- **Effort**: Trivial. Add a link in the README.
- **Priority**: P3 -- discoverability.

---

## Architectural Risks

### 17. OWC Drive Single Dependency

- **What**: The entire system -- code, knowledge.db, evidence.db, scripts, data -- lives on a single external OWC drive mounted at `/Volumes/OWC drive/`. Every session starts with a mount check. If the drive is unmounted, disconnected, or fails, everything stops.
- **Why it matters**: Single point of failure for the entire OS. No graceful degradation -- the system doesn't fall back to a reduced mode, it simply fails.
- **Effort**: High. Would require restructuring paths, setting up replication, or migrating critical data to the internal drive with the OWC as secondary.
- **Priority**: Risk -- low probability, catastrophic impact.

### 18. Single Machine, No Redundancy

- **What**: Everything runs on one Mac Mini. No failover, no hot standby, no cloud backup runtime.
- **Why it matters**: Hardware failure, macOS update gone wrong, or power outage takes the entire system offline -- including the always-on PromptSpeak server and all launchd automation.
- **Effort**: High. Would require cloud deployment of at least the PromptSpeak server and a sync strategy for SQLite databases.
- **Priority**: Risk -- acceptable for a personal system, dangerous if others depend on the HTTPS endpoint.

### 19. Hook Fragility

- **What**: Session hooks (knowledge-read, knowledge-write) run as Python scripts invoked by Claude Code. A broken hook -- syntax error, missing dependency, changed API -- silently disables its capability. No error surfaces to the user.
- **Why it matters**: The system appears to work normally while silently losing long-term memory accumulation or retrieval. This has happened before and was only caught by manual inspection.
- **Effort**: Medium. Add health checks: hook writes a heartbeat timestamp, a monitor checks recency.
- **Priority**: Risk -- silent failure is the worst kind.

### 20. Context Budget Pressure

- **What**: Knowledge injection (session-start hook) competes with CLAUDE.md (~77 + ~121 lines) and MEMORY.md (~69 lines) for context window budget. As knowledge.db grows, more relevant insights are available, but the context window is fixed.
- **Why it matters**: Eventually, injecting more knowledge means either truncating instructions/memory or missing relevant insights. The system has no mechanism to prioritize under pressure -- it just fills until it can't.
- **Effort**: High. Requires a context budget allocator that dynamically balances instructions, state, and knowledge based on task type.
- **Priority**: Risk -- slow-building, will become critical as knowledge.db passes ~2,000 entries.
