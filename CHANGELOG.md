# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Async tool executor path** (`AsyncToolExecutor` + `gatekeeper.executeAsync()`). Runs the identical governance pipeline as `execute()` but awaits a registered async executor at STEP 6, for tools that do genuine async work (network/file I/O). Registered via `new Gatekeeper(eviction, { asyncExecutor })` or `setAsyncExecutor(...)`; falls back to the sync executor, then simulation, so callers can always `await`. Rejections are recorded as failed executions. `ps_execute` now routes through `executeAsync` so the async path is reachable end-to-end (identical results when no executor is registered). The pipeline was refactored into shared `prepareExecution` (STEP 1–5) / `finalizeExecution` (STEP 7–9) helpers so the sync and async paths cannot drift apart.
- **Pluggable tool executor** (`ToolExecutor`). The gatekeeper's STEP 6 now runs a registered executor instead of the built-in simulation when one is provided via `new Gatekeeper(eviction, { executor })` or `gatekeeper.setExecutor(...)`. Defaults to simulation (safe, unchanged behavior). Executor exceptions are recorded as failed executions rather than crashing the pipeline.
- **Pluggable, content-aware embeddings** (`EmbeddingProvider` seam in `src/utils/embedding-provider.ts`). Drift embeddings now incorporate behavioral content (tool arguments + results), so drift reflects what an agent actually did — not just the frame's symbol glyphs. The default provider is deterministic and local (no network, no model dependency), preserving validation latency; a real semantic model can be injected via `setEmbeddingProvider()`. Frame-only operations remain byte-identical to prior behavior (backward compatible).
- **Authenticated handshake** (HMAC-SHA256 challenge–response): `issueChallenge()` / `proveChallenge()` / `verifyChallenge()` with single-use, expiring nonces and constant-time comparison. Secret sourced from `PROMPTSPEAK_HANDSHAKE_SECRET` (falls back to an ephemeral per-process key). Existing version-check/echo behavior is unchanged.

### Changed

- `DriftDetectionEngine.recordOperation()` and `ContinuousMonitor.recordOperation()` accept an optional `OperationContext` (args/result) carrying behavioral signal. `ps_execute` and the gatekeeper thread this through automatically.

### Security

- Tripwire injection and selection now use crypto-backed randomness (`crypto.randomInt`) instead of `Math.random`, removing predictability for an adversary who knows the injection rate.

## [0.4.0] - 2026-03-14

### Security

- 18 new CRITICAL injection detection patterns covering 31 red team bypass vectors (invisible characters, homoglyphs, RTL overrides, ANSI escapes, multi-encoding chains, and more)
- 4 new SUSPICIOUS patterns for table cell injection, code block manipulation, emoji sequences, and system tag spoofing
- HTML entity decoding in `normalizeUnicode` prevents encoding-based evasion (ENC-009)
- Confidence threshold floors in `ps_confidence_set` prevent governance bypass via artificially low confidence values (DAT-006)

### Added

- Hono dependency for future Streamable HTTP transport support

### Changed

- `server.json` updated with `title` field for MCP Registry v0.3.0 listing compatibility

## [0.3.0] - 2025-12-15

Initial public release on npm and GitHub.

- 45 MCP tools for pre-execution governance
- Deterministic blocking, human-in-the-loop holds, behavioral drift detection
- 658 tests passing
- Published to npm as `promptspeak-mcp-server`

[0.4.0]: https://github.com/chrbailey/promptspeak-mcp-server/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/chrbailey/promptspeak-mcp-server/releases/tag/v0.3.0
