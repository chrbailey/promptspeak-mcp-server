# Legal Document Review Skill

## Description
Reviews legal documents for citation issues, privilege risks, and fabrication indicators.
Produces an attorney-friendly checklist suitable for malpractice risk management.

**For use by attorneys reviewing AI-generated or AI-assisted legal content.**

## Usage
```
/legal-review [document path or paste content]
```

## Examples
- `/legal-review motion.md` - Review a motion file
- `/legal-review` - Review content from clipboard or most recent file
- `/legal-review --to-court` - Review for court filing (strictest checks)
- `/legal-review --to-client` - Review for client communication
- `/legal-review --internal` - Review for internal use only

## What This Skill Does

### Citation Verification
- Extracts all legal citations from the document
- Validates citation format (Bluebook compliance)
- Checks citations against CourtListener database (free, public)
- Flags unverified citations for manual Westlaw/Lexis check

### Privilege Detection
- Scans for attorney-client privilege indicators
- Detects work product doctrine markers
- Escalates if destination is opposing counsel or public

### Fabrication Risk
- Estimates semantic entropy (hallucination risk)
- Flags suspicious citation patterns
- Identifies potentially fabricated case names

### Output
Produces a structured checklist with:
- ✅ Items that passed verification
- ⚠️ Items requiring attorney review
- ❌ Items that should be corrected before filing

## Workflow

```
   Draft Brief/Motion
          │
          ▼
   /legal-review --to-court
          │
          ▼
   ┌──────────────────────────────────────┐
   │ LEGAL REVIEW CHECKLIST               │
   │                                      │
   │ Citations (3 found):                 │
   │   ✅ 347 U.S. 483 - Verified        │
   │   ⚠️ 500 F.3d 123 - Not in DB       │
   │   ❌ 999 F.3d 999 - Future date!    │
   │                                      │
   │ Privilege Risk: LOW                  │
   │   No privilege indicators found      │
   │                                      │
   │ Fabrication Risk: MEDIUM             │
   │   1 unverified citation              │
   │                                      │
   │ ─────────────────────────────────────│
   │ REQUIRED ACTIONS:                    │
   │ [ ] Verify 500 F.3d 123 in Westlaw   │
   │ [ ] Remove or correct 999 F.3d 999   │
   └──────────────────────────────────────┘
          │
          ▼
   Attorney completes checklist
          │
          ▼
   File with court
```

## Limitations

**THIS SKILL CANNOT:**
- Verify that cited cases actually exist (use Westlaw/Lexis)
- Confirm quoted holdings are accurate
- Check if cases have been overruled (use Shepard's/KeyCite)
- Validate legal arguments

**THIS SKILL CAN:**
- Flag citations for human verification
- Detect obvious format errors
- Catch future dates and impossible citations
- Identify privilege waiver risks

## Bar Compliance Notes

This tool supports compliance with:
- **Rule 3.3** (Candor toward tribunal) - Flags unverified citations
- **Rule 1.6** (Confidentiality) - Detects privilege indicators
- **Rule 5.3** (Supervision) - Creates audit trail of AI review

All output should be reviewed by a licensed attorney before filing.
