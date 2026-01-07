#!/usr/bin/env npx tsx
/**
 * NAICS Opportunity Monitor Runner
 *
 * Searches SAM.gov for opportunities matching NAICS codes:
 * - 541715: R&D in Physical, Engineering, and Life Sciences
 * - 511210: Software Publishers
 * - 541512: Computer Systems Design Services
 * - 541519: Other Computer Related Services
 * - 541511: Custom Computer Programming Services
 *
 * Run manually:
 *   npx tsx run-naics-monitor.ts
 *
 * Schedule with cron (6:00 AM daily):
 *   0 6 * * * cd /path/to/mcp-server && npx tsx run-naics-monitor.ts >> logs/monitor.log 2>&1
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { runMonitor, DEFAULT_CONFIG, type MonitorConfig } from './src/scheduler/naics-monitor.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG: MonitorConfig = {
  ...DEFAULT_CONFIG,

  // NAICS codes to monitor
  naicsCodes: ['541715', '511210', '541512', '541519', '541511'],

  // Email notification
  email: {
    enabled: true,
    to: 'SAM@erp-access.com',
    from: 'noreply@promptspeak.ai',
    // Add SMTP settings in .env for automatic sending:
    // SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : undefined,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
  },

  // File notification (for Claude Code integration)
  fileNotification: {
    enabled: true,
    path: './data/notifications/sam-alerts.json',
  },

  // Webhook (for custom integrations)
  webhook: {
    enabled: !!process.env.WEBHOOK_URL,
    url: process.env.WEBHOOK_URL || '',
    headers: process.env.WEBHOOK_HEADERS ? JSON.parse(process.env.WEBHOOK_HEADERS) : {},
  },

  // Slack notifications
  slack: {
    enabled: !!process.env.SLACK_WEBHOOK_URL,
    webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
    channel: process.env.SLACK_CHANNEL,
  },

  // Discord notifications
  discord: {
    enabled: !!process.env.DISCORD_WEBHOOK_URL,
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
  },

  // Only notify about new opportunities (not previously seen)
  onlyNew: true,

  // Where to store seen opportunity IDs
  seenOpportunitiesPath: './data/cache/seen-opportunities.json',

  // Look back 7 days for opportunities
  lookbackDays: 7,
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║           SAM.gov NAICS Opportunity Monitor                               ║');
  console.log('║           Email: SAM@erp-access.com                                       ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  // Ensure data directories exist
  const dirs = ['./data/notifications', './data/cache', './logs'];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Check API key
  if (!process.env.SAM_API_KEY) {
    console.error('❌ SAM_API_KEY not configured in .env');
    console.error('   Get your key from: https://sam.gov/profile/details');
    process.exit(1);
  }

  try {
    const result = await runMonitor(CONFIG);

    // Write summary to log
    const logEntry = {
      timestamp: result.runTime,
      totalFound: result.totalFound,
      newOpportunities: result.newOpportunities.length,
      sdvosb: result.bySetAside.sdvosb.length,
      smallBusiness: result.bySetAside.smallBusiness.length,
      open: result.bySetAside.open.length,
      notifications: result.notifications,
    };

    const logPath = './logs/monitor-history.jsonl';
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');

    console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
    console.log('║           Monitor Complete                                                ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
    console.log(`\n📊 Summary: ${result.newOpportunities.length} new, ${result.bySetAside.sdvosb.length} SDVOSB`);
    console.log(`📁 Alerts saved to: ./data/notifications/sam-alerts.json`);
    console.log(`📧 Email queued to: SAM@erp-access.com\n`);

  } catch (error) {
    console.error('❌ Monitor failed:', error);
    process.exit(1);
  }
}

main();
