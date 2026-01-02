# Scheduled Retest Results

**Run Date:** 2026-01-01T14:00:03.431Z
**Completed:** 2026-01-01T14:00:27.808Z
**Duration:** 24.4 seconds

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | 12 |
| Matched Expectations | 6/12 (50%) |
| API Errors | 6 |
| Real Citations Verified | 0/6 |
| Fake Citations Rejected | 3/3 |
| Privilege Detection | 2/2 |

## Detailed Results

| Test | Score | Hold | Matched | Duration |
|------|-------|------|---------|----------|
| Brown v. Board (SCOTUS) | 0% | YES | ❌ | 231ms |
| Miranda v. Arizona (SCOTUS) | 0% | YES | ❌ | 133ms |
| Marbury v. Madison (SCOTUS) | 0% | YES | ❌ | 226ms |
| NYT v. Sullivan (SCOTUS) | 0% | YES | ❌ | 201ms |
| Citizens United (SCOTUS) | 0% | YES | ❌ | 140ms |
| Celotex v. Catrett (SCOTUS) | 0% | YES | ❌ | 136ms |
| Fabricated Case 1 | 0% | YES | ✅ | 135ms |
| Fabricated Case 2 | 0% | YES | ✅ | 143ms |
| Fabricated Case 3 | 0% | YES | ✅ | 144ms |
| Privileged Content | 100% | YES | ✅ | 1ms |
| Work Product | 100% | YES | ✅ | 0ms |
| Mixed Real/Fake | 0% | YES | ✅ | 831ms |

## Interpretation

⚠️ **6 tests may have been affected by API errors.** If CourtListener returned 403 errors, real citations may appear unverified.

❌ **Citation verification may not be working.** Check API token and quota status.

---
*Report generated automatically by scheduled-retest.ts*