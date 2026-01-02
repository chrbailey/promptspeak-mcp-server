#!/usr/bin/env npx tsx
// =============================================================================
// COURTLISTENER API MONITOR
// =============================================================================
// Checks CourtListener API status hourly. When API is back online,
// automatically runs the full test suite and sends notification.
// =============================================================================

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { homedir } from 'os';

const SCRIPT_DIR = '/Users/christopherbailey/Promptspeak LLM-LLM Symbolic Language/mcp-server';
const STATUS_FILE = join(SCRIPT_DIR, 'logs', 'api-monitor-status.json');
const TOKEN_FILE = join(homedir(), '.legal-review', '.courtlistener-token');

interface MonitorStatus {
  lastCheck: string;
  lastStatus: number;
  consecutiveFailures: number;
  apiBackOnline: boolean;
  testsTriggered: boolean;
  history: Array<{ time: string; status: number; message: string }>;
}

function loadStatus(): MonitorStatus {
  if (existsSync(STATUS_FILE)) {
    try {
      return JSON.parse(readFileSync(STATUS_FILE, 'utf-8'));
    } catch {
      // Corrupted file, start fresh
    }
  }
  return {
    lastCheck: '',
    lastStatus: 0,
    consecutiveFailures: 0,
    apiBackOnline: false,
    testsTriggered: false,
    history: [],
  };
}

function saveStatus(status: MonitorStatus): void {
  // Keep only last 48 entries (48 hours of hourly checks)
  if (status.history.length > 48) {
    status.history = status.history.slice(-48);
  }
  writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
}

function notify(title: string, message: string): void {
  try {
    execSync(`osascript -e 'display notification "${message}" with title "${title}"'`, { stdio: 'ignore' });
  } catch {
    // Notification failed, not critical
  }
}

async function checkApiStatus(): Promise<{ status: number; message: string }> {
  // Read token
  let token = '';
  if (existsSync(TOKEN_FILE)) {
    token = readFileSync(TOKEN_FILE, 'utf-8').trim();
  }

  if (!token) {
    return { status: 0, message: 'No API token configured' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch('https://www.courtlistener.com/api/rest/v4/courts/?page_size=1', {
      headers: {
        'Authorization': `Token ${token}`,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      return {
        status: response.status,
        message: `OK - ${data.count} courts in database`
      };
    } else {
      return {
        status: response.status,
        message: `Error: ${response.status} ${response.statusText}`
      };
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { status: 0, message: 'Request timeout (10s)' };
    }
    return { status: 0, message: `Network error: ${error}` };
  }
}

async function runTests(): Promise<boolean> {
  console.log('🚀 API is back online! Running full test suite...\n');

  try {
    // Run the scheduled retest script
    execSync('npx tsx scheduled-retest.ts', {
      cwd: SCRIPT_DIR,
      stdio: 'inherit',
    });
    return true;
  } catch (error) {
    console.error('Test execution failed:', error);
    return false;
  }
}

async function main(): Promise<void> {
  const now = new Date();
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║           COURTLISTENER API MONITOR                           ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(`Check time: ${now.toISOString()}`);
  console.log('');

  const status = loadStatus();
  const { status: httpStatus, message } = await checkApiStatus();

  // Log this check
  status.history.push({
    time: now.toISOString(),
    status: httpStatus,
    message,
  });
  status.lastCheck = now.toISOString();
  status.lastStatus = httpStatus;

  console.log(`API Status: ${httpStatus} - ${message}`);

  if (httpStatus === 200) {
    console.log('✅ CourtListener API is ONLINE');

    // Was it previously down?
    if (status.consecutiveFailures > 0 || !status.apiBackOnline) {
      console.log(`\n🎉 API recovered after ${status.consecutiveFailures} failed checks!`);
      notify('CourtListener API ✅', 'API is back online! Running tests...');

      status.apiBackOnline = true;
      status.consecutiveFailures = 0;

      // Run tests if not already triggered
      if (!status.testsTriggered) {
        saveStatus(status); // Save before running tests

        const success = await runTests();
        status.testsTriggered = true;

        if (success) {
          notify('Legal MVP Tests ✅', 'Test suite completed! Check scheduled-retest-report.md');
        } else {
          notify('Legal MVP Tests ⚠️', 'Tests completed with issues. Check logs.');
        }
      } else {
        console.log('ℹ️  Tests already triggered in previous check');
      }
    } else {
      console.log('ℹ️  API has been online - tests already completed');
    }

    status.consecutiveFailures = 0;

  } else {
    console.log(`❌ CourtListener API is DOWN or unreachable`);
    status.consecutiveFailures++;
    status.apiBackOnline = false;

    // Reset testsTriggered so we run tests when it comes back
    status.testsTriggered = false;

    if (status.consecutiveFailures === 1) {
      notify('CourtListener API ⚠️', `API returned ${httpStatus}. Monitoring...`);
    } else if (status.consecutiveFailures % 6 === 0) {
      // Notify every 6 hours of downtime
      const hours = status.consecutiveFailures;
      notify('CourtListener API ❌', `Still down after ${hours} hours`);
    }

    console.log(`Consecutive failures: ${status.consecutiveFailures}`);
  }

  // Show recent history
  console.log('\nRecent History (last 6 checks):');
  console.log('─'.repeat(60));
  const recentHistory = status.history.slice(-6);
  for (const entry of recentHistory) {
    const icon = entry.status === 200 ? '✅' : '❌';
    const time = new Date(entry.time).toLocaleTimeString();
    console.log(`  ${icon} ${time}: ${entry.status} - ${entry.message.slice(0, 40)}`);
  }

  saveStatus(status);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`Next check in ~1 hour`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Monitor error:', err);
  process.exit(1);
});
