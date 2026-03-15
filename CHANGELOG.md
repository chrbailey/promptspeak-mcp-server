# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
