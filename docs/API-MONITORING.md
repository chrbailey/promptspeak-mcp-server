# CourtListener API Monitoring Infrastructure

**Last Updated:** January 3, 2026
**Status:** Production Ready

---

## Overview

The Legal MVP includes automated monitoring of the CourtListener API to ensure citation verification remains operational. The system:

1. **Checks API health** every hour
2. **Tracks historical status** in a JSON file
3. **Auto-runs test suite** when API recovers from downtime
4. **Sends macOS notifications** on status changes

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `./retest-manager.sh status` | View current API status and job info |
| `./retest-manager.sh run` | Run full test suite immediately |
| `./retest-manager.sh monitor` | Check API status once |
| `./retest-manager.sh start` | Start hourly monitoring |
| `./retest-manager.sh stop` | Stop all scheduled jobs |
| `./retest-manager.sh results` | View latest test results |
| `./retest-manager.sh logs` | View execution logs |
| `./retest-manager.sh history` | View API check history |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MONITORING SYSTEM                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐     ┌───────────────────┐     ┌────────────────┐ │
│  │   launchd    │────▶│ monitor-court-    │────▶│ CourtListener  │ │
│  │ (hourly @:00)│     │ listener.ts       │     │ API v4         │ │
│  └──────────────┘     └───────────────────┘     └────────────────┘ │
│                              │                                      │
│                              ▼                                      │
│                   ┌───────────────────┐                             │
│                   │ api-monitor-      │                             │
│                   │ status.json       │                             │
│                   └───────────────────┘                             │
│                              │                                      │
│           ┌──────────────────┼──────────────────┐                   │
│           ▼                  ▼                  ▼                   │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │
│  │ macOS          │  │ scheduled-     │  │ logs/          │        │
│  │ Notification   │  │ retest.ts      │  │ monitor_*.log  │        │
│  │ (on recovery)  │  │ (auto-trigger) │  │                │        │
│  └────────────────┘  └────────────────┘  └────────────────┘        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Files

### Core Scripts

| File | Purpose |
|------|---------|
| `retest-manager.sh` | Main control script for all operations |
| `monitor-courtlistener.ts` | Hourly API health check |
| `scheduled-retest.ts` | 12-test comprehensive test suite |

### Data Files

| File | Purpose |
|------|---------|
| `logs/api-monitor-status.json` | Current status + history (last 50 checks) |
| `scheduled-retest-results.json` | Latest test results in JSON |
| `scheduled-retest-report.md` | Human-readable test report |

### LaunchAgent Plists

| File | Schedule |
|------|----------|
| `com.promptspeak.api-monitor.plist` | Every hour at :00 |

Location: `~/Library/LaunchAgents/`

---

## Status File Format

The `logs/api-monitor-status.json` file tracks:

```json
{
  "lastCheck": "2026-01-03T06:21:51.202Z",
  "lastStatus": 200,
  "consecutiveFailures": 0,
  "apiBackOnline": true,
  "testsTriggered": true,
  "history": [
    {
      "time": "2026-01-03T06:21:51.202Z",
      "status": 200,
      "message": "OK - 3353 courts in database"
    }
    // ... last 50 entries
  ]
}
```

---

## Test Suite Coverage

The `scheduled-retest.ts` runs 12 tests in 4 categories:

### 1. Real SCOTUS Citations (6 tests)
| Case | Citation | Era |
|------|----------|-----|
| Brown v. Board | 347 U.S. 483 | Modern |
| Miranda v. Arizona | 384 U.S. 436 | Modern |
| Marbury v. Madison | 5 U.S. 137 | Historical (1803) |
| NYT v. Sullivan | 376 U.S. 254 | Modern |
| Citizens United | 558 U.S. 310 | Modern |
| Celotex v. Catrett | 477 U.S. 317 | Modern |

**Expected:** All verified (100% score, hold=false)

### 2. Fabricated Citations (3 tests)
- Smith v. Jones, 999 U.S. 123 (2020)
- Doe v. United States, 888 F.3d 777 (9th Cir. 2022)
- Fake v. Fabricated, 42 F.4th 999 (5th Cir. 2023)

**Expected:** All rejected (0% score, hold=true)

### 3. Privilege Detection (2 tests)
- Attorney-client privileged content
- Work product protected content

**Expected:** Detected and held (hold=true)

### 4. Mixed Content (1 test)
- Contains both real and fabricated citations

**Expected:** Partial verification (50% score, hold=true)

---

## Setup

### Starting Monitoring

```bash
# Navigate to project directory
cd "/Users/christopherbailey/Promptspeak LLM-LLM Symbolic Language/mcp-server"

# Start hourly monitoring
./retest-manager.sh start

# Verify it's running
./retest-manager.sh status
```

### Stopping Monitoring

```bash
./retest-manager.sh stop
```

### Manual Testing

```bash
# Run a single API check
./retest-manager.sh monitor

# Run full test suite
./retest-manager.sh run
```

---

## Interpreting Results

### Healthy Status
```
🔄 API MONITOR:
   ✅ Running (checks every hour at :00)

   🟢 CourtListener API: ONLINE
   📊 Consecutive failures: 0
   🕐 Last check: 2026-01-03T06:21:51.202Z
```

### API Down
```
🔄 API MONITOR:
   ✅ Running (checks every hour at :00)

   🔴 CourtListener API: DOWN (status: 502)
   📊 Consecutive failures: 3
   🕐 Last check: 2026-01-01T12:00:00.962Z
```

When the API recovers, the system automatically:
1. Sends a macOS notification
2. Runs the full test suite
3. Updates the status file

---

## Troubleshooting

### Monitor Not Running

```bash
# Check if plist is loaded
launchctl list | grep promptspeak

# Reload the plist
./retest-manager.sh stop
./retest-manager.sh start
```

### High Failure Count

If `consecutiveFailures` is high (>5):

1. Check CourtListener status: https://www.courtlistener.com/api/
2. Check network connectivity
3. Review logs: `./retest-manager.sh logs`

### Test Failures

If tests are failing:

1. Check API status first: `./retest-manager.sh monitor`
2. Run tests manually with verbose output: `npx tsx scheduled-retest.ts`
3. Check for rate limiting (403 errors)

---

## Historical Citation Support

The system supports pre-1875 Supreme Court citations by automatically trying nominative reporter formats:

| U.S. Volume | Reporter | Years |
|-------------|----------|-------|
| 1-4 | Dallas | 1790-1800 |
| 5-13 | Cranch | 1801-1815 |
| 14-25 | Wheaton | 1816-1827 |
| 26-41 | Peters | 1828-1842 |
| 42-65 | Howard | 1843-1860 |
| 66-67 | Black | 1861-1862 |
| 68-90 | Wallace | 1863-1874 |

**Example:** "5 U.S. 137" (Marbury v. Madison) is automatically retried as "1 Cranch 137"

---

## Current Test Results

**Last Run:** See `./retest-manager.sh results`

| Metric | Target | Status |
|--------|--------|--------|
| Real Citations Verified | 6/6 | ✅ |
| Fake Citations Rejected | 3/3 | ✅ |
| Privilege Detection | 2/2 | ✅ |
| Overall Pass Rate | 100% | ✅ |

---

## Maintenance

### Weekly Tasks
- Review `./retest-manager.sh history` for patterns
- Clear old logs if needed: `rm logs/monitor_*.log`

### After System Updates
- Verify monitor is still running: `./retest-manager.sh status`
- Run manual test: `./retest-manager.sh run`

---

*Documentation generated for PromptSpeak Legal MVP v1.0*
