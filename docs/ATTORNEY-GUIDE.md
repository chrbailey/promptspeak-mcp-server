# Legal Review Tool - Attorney Quick Start Guide

## What This Tool Does

This tool reviews AI-generated or AI-assisted legal documents before you file them. It helps you:

1. **Verify Citations** - Flags citations that couldn't be verified in public databases
2. **Detect Privilege Risks** - Catches "privileged" or "work product" content before it goes to opposing counsel
3. **Identify Fabrication** - Uses pattern analysis to flag potentially AI-hallucinated content
4. **Create Audit Trail** - Documents your review for Rule 5.3 compliance

---

## Quick Start (2 minutes)

### Step 1: Install

Run this command in Terminal (Mac) or Command Prompt (Windows):

```bash
./install-legal-review.sh
```

### Step 2: Restart Claude Desktop

Quit and reopen Claude Desktop to load the tool.

### Step 3: Use It

In Claude Desktop, try:

```
Please review this motion for summary judgment before I file it:

[paste your motion text here]
```

Or if you have a file:

```
/legal-review motion.md --to-court
```

---

## Understanding the Output

### Citation Check

```
✅ 411 U.S. 792 — Verified in CourtListener
⚠️ 892 F.3d 1105 — NOT VERIFIED (check Westlaw/Lexis)
❌ 999 F.3d 999 — FORMAT ERROR: Future date
```

- **Verified**: Citation found in free CourtListener database
- **Not Verified**: Couldn't find - DOES NOT mean it doesn't exist!
- **Format Error**: Citation format appears wrong

### Privilege Risk

```
Privilege Risk: HIGH

⚠️ Privilege indicator found: "ATTORNEY WORK PRODUCT"
   Location: Section IV.B, Pretext Analysis
   Recommendation: Remove or redact before sending to opposing counsel
```

### Fabrication Risk

```
Fabrication Risk: MEDIUM

⚠️ Semantic entropy: 45%
⚠️ 2 citations could not be verified
   Recommendation: Double-check all factual claims
```

---

## Destination Modes

Different filing destinations trigger different levels of scrutiny:

| Destination | Command | What It Does |
|-------------|---------|--------------|
| **Court Filing** | `--to-court` | Maximum scrutiny. Flags ALL unverified citations. |
| **Client** | `--to-client` | Moderate scrutiny. Focuses on accuracy. |
| **Opposing Counsel** | `--to-opposing` | Maximum privilege detection. STOPS if privilege found. |
| **Internal** | `--internal` | Minimal scrutiny. For drafts only. |

### Examples

```
/legal-review motion.md --to-court
/legal-review memo.md --to-client
/legal-review discovery-response.md --to-opposing
/legal-review draft.md --internal
```

---

## Important Limitations

### This Tool CANNOT:

- **Verify that cases exist** - Use Westlaw, Lexis, or official court records
- **Check if cases are still good law** - Use Shepard's or KeyCite
- **Confirm quoted holdings are accurate** - Read the actual opinion
- **Validate your legal arguments** - That's your job

### This Tool CAN:

- Flag citations for you to manually verify
- Catch obvious format errors (impossible dates, wrong reporters)
- Detect privilege indicators before you accidentally waive privilege
- Create a compliance audit trail

---

## Bar Compliance Notes

This tool supports compliance with:

| Rule | How It Helps |
|------|--------------|
| **Rule 3.3** (Candor) | Flags unverified citations that you should check before filing |
| **Rule 1.6** (Confidentiality) | Detects privilege indicators before you send to opposing counsel |
| **Rule 5.3** (Supervision) | Creates timestamped audit trail of AI content review |

**Remember**: The tool is an assistant, not a replacement for professional judgment.

---

## Getting Real Citation Verification

By default, the tool uses format checking only. For actual database lookups:

### Step 1: Create a CourtListener Account

1. Go to [CourtListener.com](https://www.courtlistener.com)
2. Click **Sign Up** and create an account
3. **Enable 2FA** (required for API tokens as of 2025)

### Step 2: Get Your API Token

1. Sign in and go to [your API settings](https://www.courtlistener.com/profile/api/)
2. Generate a new **Granular Token** (valid for 90 days)
3. Copy the token

### Step 3: Configure the Tool

In Claude Desktop, tell Claude:

```
Please configure my CourtListener API token: [paste your token here]
```

Or use the direct command:

```
/legal-config set courtListenerApiToken YOUR_TOKEN_HERE
```

The token is saved securely to `~/.legal-review/.courtlistener-token` and will persist across sessions.

### What This Enables

- Real-time case lookups in 400M+ documents
- Case name verification
- Court and date validation
- 5,000 requests/day (free tier)

---

## Common Questions

### "It flagged a citation as unverified, but I know the case exists"

The free CourtListener database doesn't have every case. "Not verified" just means we couldn't find it in our free database. Always verify through Westlaw/Lexis.

### "It missed something important"

This is a safety net, not a guarantee. It catches common issues but cannot replace careful attorney review.

### "Can I use this for all my documents?"

Yes! The more you use it, the better your compliance audit trail.

### "Is my content sent anywhere?"

- Document content is processed locally
- CourtListener lookups send only the citation text, not your document
- Nothing is stored after the review completes

---

## Getting Help

- **Email**: support@promptspeak.com
- **Documentation**: https://docs.promptspeak.com/legal-review
- **Issues**: https://github.com/promptspeak/legal-review/issues

---

## Workflow Recommendation

```
┌─────────────────────────────────────┐
│   1. Draft with AI assistance       │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│   2. /legal-review --to-court       │
│      (Run pre-flight checks)        │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│   3. Complete the checklist         │
│      [ ] Verify citations           │
│      [ ] Remove privilege content   │
│      [ ] Double-check facts         │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│   4. File with confidence           │
│      (Audit trail documented)       │
└─────────────────────────────────────┘
```

---

*This tool was created to help attorneys safely use AI in their practice while maintaining professional responsibility standards.*
