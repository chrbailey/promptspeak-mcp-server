# Legal Review Quick Reference Card

## Basic Commands

| Command | Description |
|---------|-------------|
| `/legal-review [file]` | Review a document |
| `/legal-review --to-court` | Court filing (strictest) |
| `/legal-review --to-opposing` | Opposing counsel (privilege alerts) |
| `/legal-review --to-client` | Client communication |
| `/legal-review --internal` | Internal draft (lenient) |

## Output Symbols

| Symbol | Meaning |
|--------|---------|
| ✅ | Passed - No action needed |
| ⚠️ | Warning - Review recommended |
| ❌ | Error - Fix before filing |
| 🛑 | STOP - Do not proceed without review |

## Risk Levels

| Level | Action Required |
|-------|----------------|
| LOW | Proceed after standard review |
| MEDIUM | Double-check flagged items |
| HIGH | Senior review recommended |
| CRITICAL | STOP - Supervising attorney must approve |

## Bar Rule Support

- **Rule 3.3**: Unverified citations flagged
- **Rule 1.6**: Privilege indicators detected
- **Rule 5.3**: Review timestamped for audit trail

## Remember

```
⚠️  This tool CANNOT verify cases exist.
    Always check Westlaw/Lexis before filing.
```

---

*Print this card and keep it at your desk.*
