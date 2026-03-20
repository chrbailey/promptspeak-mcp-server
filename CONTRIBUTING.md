# Contributing

## Quick Start

```bash
git clone https://github.com/chrbailey/promptspeak-mcp-server.git
cd promptspeak-mcp-server
npm install
npm test        # 829 tests, ~1s
npx tsc --noEmit
npm run build
```

## Rules

- **Every tool needs tests.** No exceptions.
- **Don't weaken validation to make tests pass.** Fix the test or the code.
- **Don't reorder the pipeline.** Circuit breaker -> validation -> drift -> hold -> security scan -> execute.
- **Don't add modules without discussion.** Codebase was cut from 82K to 16K lines for a reason.
- **Conventional commits.** `feat:`, `fix:`, `docs:`, `test:`, `chore:`.

## Security

All PRs are scanned for sensitive logging patterns. Violations block merge. Use `createSecureLogger` for any module handling sensitive data. See [docs/SECURITY_LOGGING.md](docs/SECURITY_LOGGING.md).

**Report vulnerabilities:** See [SECURITY.md](SECURITY.md). Do not open public issues.

## Pull Requests

1. Branch from `main`
2. Add tests for new functionality
3. Pass: `npm test`, `npx tsc --noEmit`, `npm run lint`
4. Open PR with clear description of what and why

## Architecture

```
src/
├── core/           # Logging, errors, result pattern
├── gatekeeper/     # 6-stage interceptor pipeline (load-bearing)
├── grammar/        # Frame parser, lexer, AST, expander
├── handlers/       # MCP tool dispatcher
├── tools/          # 56 tool implementations (11 categories)
├── persistence/    # SQLite governance storage
├── http-server.ts  # Hono + Streamable HTTP MCP
└── types/          # Zod schemas
```

## License

Contributions are licensed under MIT.
