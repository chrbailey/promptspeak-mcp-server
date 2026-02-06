/**
 * NAICS-Based Opportunity Monitor
 *
 * Searches SAM.gov for opportunities matching specific NAICS codes
 * and sends notifications via email, webhook, and file-based alerts.
 *
 * NAICS Codes Monitored:
 * - 541715: R&D in Physical, Engineering, and Life Sciences
 * - 511210: Software Publishers
 * - 541512: Computer Systems Design Services
 * - 541519: Other Computer Related Services
 * - 541511: Custom Computer Programming Services
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
// government module removed
type SAMOpportunity = Record<string, unknown>;
import { createLogger } from '../core/logging/index.js';

const logger = createLogger('NAICSMonitor');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

export interface MonitorConfig {
  /** NAICS codes to monitor */
  naicsCodes: string[];

  /** Email notification settings */
  email?: {
    enabled: boolean;
    to: string;
    from?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPass?: string;
  };

  /** Webhook notification settings */
  webhook?: {
    enabled: boolean;
    url: string;
    headers?: Record<string, string>;
  };

  /** File-based notification (for Claude Code) */
  fileNotification?: {
    enabled: boolean;
    path: string;
  };

  /** Slack notification */
  slack?: {
    enabled: boolean;
    webhookUrl: string;
    channel?: string;
  };

  /** Discord notification */
  discord?: {
    enabled: boolean;
    webhookUrl: string;
  };

  /** Only show new opportunities (not seen before) */
  onlyNew: boolean;

  /** Path to store seen opportunity IDs */
  seenOpportunitiesPath: string;

  /** Days to look back for opportunities */
  lookbackDays: number;
}

export const DEFAULT_CONFIG: MonitorConfig = {
  naicsCodes: ['541715', '511210', '541512', '541519', '541511'],
  email: {
    enabled: true,
    to: 'SAM@erp-access.com',
    from: 'noreply@promptspeak.ai',
  },
  fileNotification: {
    enabled: true,
    path: './data/notifications/sam-alerts.json',
  },
  onlyNew: true,
  seenOpportunitiesPath: './data/cache/seen-opportunities.json',
  lookbackDays: 7,
};

// NAICS Code descriptions for reference
export const NAICS_DESCRIPTIONS: Record<string, string> = {
  '541715': 'Research and Development in Physical, Engineering, and Life Sciences',
  '511210': 'Software Publishers',
  '541512': 'Computer Systems Design Services',
  '541519': 'Other Computer Related Services',
  '541511': 'Custom Computer Programming Services',
};

// ═══════════════════════════════════════════════════════════════════════════════
// SEEN OPPORTUNITIES TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

interface SeenOpportunities {
  lastRun: string;
  noticeIds: string[];
}

function loadSeenOpportunities(filePath: string): Set<string> {
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as SeenOpportunities;
      return new Set(data.noticeIds);
    }
  } catch (error) {
    logger.warn('Could not load seen opportunities, starting fresh', undefined, error instanceof Error ? error : undefined);
  }
  return new Set();
}

function saveSeenOpportunities(filePath: string, seen: Set<string>): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const data: SeenOpportunities = {
    lastRun: new Date().toISOString(),
    noticeIds: Array.from(seen),
  };

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPPORTUNITY SEARCH
// ═══════════════════════════════════════════════════════════════════════════════

export interface MonitorResult {
  runTime: string;
  naicsCodes: string[];
  totalFound: number;
  newOpportunities: SAMOpportunity[];
  allOpportunities: SAMOpportunity[];
  byNaics: Record<string, SAMOpportunity[]>;
  bySetAside: {
    sdvosb: SAMOpportunity[];
    smallBusiness: SAMOpportunity[];
    open: SAMOpportunity[];
  };
  notifications: {
    email: boolean;
    file: boolean;
    webhook: boolean;
    slack: boolean;
    discord: boolean;
  };
}

export async function runMonitor(config: MonitorConfig = DEFAULT_CONFIG): Promise<MonitorResult> {
  // government module removed - this monitor is non-functional
  throw new Error('SAM.gov government module has been removed');

  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  SAM.gov NAICS Opportunity Monitor');
  console.log('  Run Time:', new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  // Calculate date range
  const today = new Date();
  const lookbackDate = new Date(today);
  lookbackDate.setDate(lookbackDate.getDate() - config.lookbackDays);

  const postedFrom = formatDate(lookbackDate);
  const postedTo = formatDate(today);

  console.log(`📅 Date Range: ${postedFrom} to ${postedTo}`);
  console.log(`🏷️  NAICS Codes: ${config.naicsCodes.join(', ')}\n`);

  // Load previously seen opportunities
  const seenOpportunities = loadSeenOpportunities(config.seenOpportunitiesPath);
  console.log(`📋 Previously seen: ${seenOpportunities.size} opportunities\n`);

  // Search for each NAICS code
  const allOpportunities = new Map<string, SAMOpportunity>();
  const byNaics: Record<string, SAMOpportunity[]> = {};

  for (const naicsCode of config.naicsCodes) {
    console.log(`🔍 Searching NAICS ${naicsCode} (${NAICS_DESCRIPTIONS[naicsCode] || 'Unknown'})...`);

    try {
      const results = await adapter.searchOpportunities({
        naicsCodes: [naicsCode],
        postedFrom,
        postedTo,
        activeOnly: true,
        limit: 100,
      });

      // SAM.gov API returns fuzzy matches - filter client-side to exact NAICS match
      const filteredResults = results.opportunitiesData.filter(
        opp => opp.naicsCode === naicsCode || opp.naicsCodes?.includes(naicsCode)
      );

      byNaics[naicsCode] = filteredResults;

      for (const opp of filteredResults) {
        allOpportunities.set(opp.noticeId, opp);
      }

      console.log(`   API returned: ${results.totalRecords} | Exact match: ${filteredResults.length}\n`);

      // Rate limit delay
      await delay(1100);
    } catch (error) {
      logger.error(`Error searching NAICS ${naicsCode}`, error instanceof Error ? error : undefined);
      byNaics[naicsCode] = [];
    }
  }

  // Filter to new opportunities only
  const newOpportunities: SAMOpportunity[] = [];
  for (const opp of allOpportunities.values()) {
    if (!seenOpportunities.has(opp.noticeId)) {
      newOpportunities.push(opp);
      seenOpportunities.add(opp.noticeId);
    }
  }

  // Categorize by set-aside type
  const bySetAside = {
    sdvosb: [] as SAMOpportunity[],
    smallBusiness: [] as SAMOpportunity[],
    open: [] as SAMOpportunity[],
  };

  for (const opp of newOpportunities) {
    const setAside = (opp.typeOfSetAsideDescription || '').toLowerCase();
    if (setAside.includes('disabled veteran')) {
      bySetAside.sdvosb.push(opp);
    } else if (setAside.includes('small business')) {
      bySetAside.smallBusiness.push(opp);
    } else {
      bySetAside.open.push(opp);
    }
  }

  // Save updated seen opportunities
  saveSeenOpportunities(config.seenOpportunitiesPath, seenOpportunities);

  // Print summary
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
  console.log(`📊 Total Unique Opportunities: ${allOpportunities.size}`);
  console.log(`🆕 New Opportunities: ${newOpportunities.length}`);
  console.log(`⭐ SDVOSB Set-Aside: ${bySetAside.sdvosb.length}`);
  console.log(`🏢 Small Business Set-Aside: ${bySetAside.smallBusiness.length}`);
  console.log(`📂 Open/Other: ${bySetAside.open.length}\n`);

  // Build result
  const result: MonitorResult = {
    runTime: new Date().toISOString(),
    naicsCodes: config.naicsCodes,
    totalFound: allOpportunities.size,
    newOpportunities,
    allOpportunities: Array.from(allOpportunities.values()),
    byNaics,
    bySetAside,
    notifications: {
      email: false,
      file: false,
      webhook: false,
      slack: false,
      discord: false,
    },
  };

  // Send notifications if there are new opportunities
  if (newOpportunities.length > 0) {
    console.log('─────────────────────────────────────────────────────────────────────────────');
    console.log('  SENDING NOTIFICATIONS');
    console.log('─────────────────────────────────────────────────────────────────────────────\n');

    // File notification (for Claude Code)
    if (config.fileNotification?.enabled) {
      result.notifications.file = await sendFileNotification(config.fileNotification.path, result);
    }

    // Email notification
    if (config.email?.enabled) {
      result.notifications.email = await sendEmailNotification(config.email, result);
    }

    // Webhook notification
    if (config.webhook?.enabled) {
      result.notifications.webhook = await sendWebhookNotification(config.webhook, result);
    }

    // Slack notification
    if (config.slack?.enabled) {
      result.notifications.slack = await sendSlackNotification(config.slack, result);
    }

    // Discord notification
    if (config.discord?.enabled) {
      result.notifications.discord = await sendDiscordNotification(config.discord, result);
    }
  } else {
    console.log('ℹ️  No new opportunities to notify about.\n');
  }

  // Print new opportunities
  if (newOpportunities.length > 0) {
    console.log('\n─────────────────────────────────────────────────────────────────────────────');
    console.log('  NEW OPPORTUNITIES');
    console.log('─────────────────────────────────────────────────────────────────────────────\n');

    for (const opp of newOpportunities) {
      printOpportunity(opp);
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

async function sendFileNotification(filePath: string, result: MonitorResult): Promise<boolean> {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const notification = {
      type: 'sam_opportunity_alert',
      timestamp: result.runTime,
      summary: {
        newCount: result.newOpportunities.length,
        sdvosbCount: result.bySetAside.sdvosb.length,
        smallBusinessCount: result.bySetAside.smallBusiness.length,
      },
      opportunities: result.newOpportunities.map(opp => ({
        noticeId: opp.noticeId,
        title: opp.title,
        agency: [opp.department, opp.subTier].filter(Boolean).join(' > '),
        type: opp.type,
        setAside: opp.typeOfSetAsideDescription || 'Open',
        postedDate: opp.postedDate,
        responseDeadline: opp.responseDeadLine,
        naicsCode: opp.naicsCode,
        link: opp.uiLink,
      })),
    };

    fs.writeFileSync(filePath, JSON.stringify(notification, null, 2));
    logger.info(`File notification written: ${filePath}`);
    return true;
  } catch (error) {
    logger.error('File notification failed', error instanceof Error ? error : undefined);
    return false;
  }
}

async function sendEmailNotification(
  config: NonNullable<MonitorConfig['email']>,
  result: MonitorResult
): Promise<boolean> {
  try {
    // Build email content
    const subject = `[SAM.gov Alert] ${result.newOpportunities.length} New Opportunities - ${result.bySetAside.sdvosb.length} SDVOSB`;

    let htmlBody = `
      <h2>SAM.gov Opportunity Alert</h2>
      <p><strong>Run Time:</strong> ${new Date(result.runTime).toLocaleString()}</p>
      <p><strong>NAICS Codes:</strong> ${result.naicsCodes.join(', ')}</p>

      <h3>Summary</h3>
      <ul>
        <li>🆕 New Opportunities: ${result.newOpportunities.length}</li>
        <li>⭐ SDVOSB Set-Aside: ${result.bySetAside.sdvosb.length}</li>
        <li>🏢 Small Business: ${result.bySetAside.smallBusiness.length}</li>
        <li>📂 Open/Other: ${result.bySetAside.open.length}</li>
      </ul>
    `;

    // Add SDVOSB opportunities first (priority)
    if (result.bySetAside.sdvosb.length > 0) {
      htmlBody += `<h3>⭐ SDVOSB Opportunities</h3>`;
      for (const opp of result.bySetAside.sdvosb) {
        htmlBody += formatOpportunityHtml(opp);
      }
    }

    // Add other small business
    if (result.bySetAside.smallBusiness.length > 0) {
      htmlBody += `<h3>🏢 Small Business Opportunities</h3>`;
      for (const opp of result.bySetAside.smallBusiness) {
        htmlBody += formatOpportunityHtml(opp);
      }
    }

    // Add open opportunities
    if (result.bySetAside.open.length > 0) {
      htmlBody += `<h3>📂 Open Opportunities</h3>`;
      for (const opp of result.bySetAside.open) {
        htmlBody += formatOpportunityHtml(opp);
      }
    }

    // Check if we have SMTP configuration
    if (config.smtpHost && config.smtpUser && config.smtpPass) {
      // Use nodemailer if configured
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort || 587,
        secure: config.smtpPort === 465,
        auth: {
          user: config.smtpUser,
          pass: config.smtpPass,
        },
      });

      await transporter.sendMail({
        from: config.from || 'noreply@promptspeak.ai',
        to: config.to,
        subject,
        html: htmlBody,
      });

      logger.info(`Email sent to: ${config.to}`);
      return true;
    } else {
      // Save email to file for manual sending or external pickup
      const emailPath = './data/notifications/pending-email.json';
      const dir = path.dirname(emailPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(emailPath, JSON.stringify({
        to: config.to,
        from: config.from || 'noreply@promptspeak.ai',
        subject,
        html: htmlBody,
        timestamp: result.runTime,
      }, null, 2));

      logger.info(`Email prepared for: ${config.to} (saved to ${emailPath})`);
      logger.info('Configure SMTP settings in .env to send automatically');
      return true;
    }
  } catch (error) {
    logger.error('Email notification failed', error instanceof Error ? error : undefined);
    return false;
  }
}

async function sendWebhookNotification(
  config: NonNullable<MonitorConfig['webhook']>,
  result: MonitorResult
): Promise<boolean> {
  try {
    const payload = {
      type: 'sam_opportunity_alert',
      timestamp: result.runTime,
      summary: {
        newCount: result.newOpportunities.length,
        sdvosbCount: result.bySetAside.sdvosb.length,
        smallBusinessCount: result.bySetAside.smallBusiness.length,
        openCount: result.bySetAside.open.length,
      },
      naicsCodes: result.naicsCodes,
      opportunities: result.newOpportunities,
    };

    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      logger.info(`Webhook notification sent to: ${config.url}`);
      return true;
    } else {
      logger.error(`Webhook failed: ${response.status} ${response.statusText}`);
      return false;
    }
  } catch (error) {
    logger.error('Webhook notification failed', error instanceof Error ? error : undefined);
    return false;
  }
}

async function sendSlackNotification(
  config: NonNullable<MonitorConfig['slack']>,
  result: MonitorResult
): Promise<boolean> {
  try {
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🏛️ SAM.gov Alert: ${result.newOpportunities.length} New Opportunities`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*⭐ SDVOSB:* ${result.bySetAside.sdvosb.length}` },
          { type: 'mrkdwn', text: `*🏢 Small Biz:* ${result.bySetAside.smallBusiness.length}` },
          { type: 'mrkdwn', text: `*📂 Open:* ${result.bySetAside.open.length}` },
          { type: 'mrkdwn', text: `*🏷️ NAICS:* ${result.naicsCodes.join(', ')}` },
        ],
      },
      { type: 'divider' },
    ];

    // Add top opportunities
    const topOpps = result.newOpportunities.slice(0, 5);
    for (const opp of topOpps) {
      const badge = getSetAsideBadge(opp.typeOfSetAsideDescription);
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${badge} *<${opp.uiLink}|${opp.title}>*\n` +
                `_${opp.department || 'Agency N/A'}_ | Due: ${opp.responseDeadLine || 'See solicitation'}`,
        },
      } as any);
    }

    if (result.newOpportunities.length > 5) {
      blocks.push({
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `_...and ${result.newOpportunities.length - 5} more opportunities_` },
        ],
      } as any);
    }

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: config.channel,
        blocks,
      }),
    });

    if (response.ok) {
      logger.info('Slack notification sent');
      return true;
    } else {
      logger.error(`Slack failed: ${response.status}`);
      return false;
    }
  } catch (error) {
    logger.error('Slack notification failed', error instanceof Error ? error : undefined);
    return false;
  }
}

async function sendDiscordNotification(
  config: NonNullable<MonitorConfig['discord']>,
  result: MonitorResult
): Promise<boolean> {
  try {
    const embeds = [
      {
        title: `🏛️ SAM.gov Alert: ${result.newOpportunities.length} New Opportunities`,
        url: undefined as string | undefined,
        color: 0x0066cc,
        fields: [
          { name: '⭐ SDVOSB', value: String(result.bySetAside.sdvosb.length), inline: true },
          { name: '🏢 Small Business', value: String(result.bySetAside.smallBusiness.length), inline: true },
          { name: '📂 Open', value: String(result.bySetAside.open.length), inline: true },
          { name: '🏷️ NAICS Codes', value: result.naicsCodes.join(', '), inline: false },
        ],
        timestamp: result.runTime,
      },
    ];

    // Add top opportunities as additional embeds
    const topOpps = result.newOpportunities.slice(0, 3);
    for (const opp of topOpps) {
      const isSDVOSB = (opp.typeOfSetAsideDescription || '').toLowerCase().includes('disabled veteran');
      embeds.push({
        title: opp.title,
        url: opp.uiLink,
        color: isSDVOSB ? 0xffd700 : 0x0066cc,
        fields: [
          { name: 'Agency', value: opp.department || 'N/A', inline: true },
          { name: 'Due Date', value: opp.responseDeadLine || 'See solicitation', inline: true },
          { name: 'Set-Aside', value: opp.typeOfSetAsideDescription || 'Open', inline: true },
        ],
        timestamp: undefined as any,
      });
    }

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds }),
    });

    if (response.ok) {
      logger.info('Discord notification sent');
      return true;
    } else {
      logger.error(`Discord failed: ${response.status}`);
      return false;
    }
  } catch (error) {
    logger.error('Discord notification failed', error instanceof Error ? error : undefined);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getSetAsideBadge(setAside?: string): string {
  const desc = (setAside || '').toLowerCase();
  if (desc.includes('disabled veteran')) return '⭐';
  if (desc.includes('small business')) return '🏢';
  return '📂';
}

function printOpportunity(opp: SAMOpportunity): void {
  const badge = getSetAsideBadge(opp.typeOfSetAsideDescription);
  const setAside = opp.typeOfSetAsideDescription || 'Open';

  console.log('┌──────────────────────────────────────────────────────────────────────────');
  console.log('│', badge, opp.title);
  console.log('├──────────────────────────────────────────────────────────────────────────');
  console.log('│ Notice ID:    ', opp.noticeId);
  console.log('│ Type:         ', opp.type);
  console.log('│ Set-Aside:    ', setAside);
  console.log('│ Agency:       ', [opp.department, opp.subTier].filter(Boolean).join(' > ') || 'See details');
  console.log('│ Posted:       ', opp.postedDate);
  console.log('│ Response Due: ', opp.responseDeadLine || 'See solicitation');
  console.log('│ NAICS:        ', opp.naicsCode || 'N/A');
  console.log('│ Link:         ', opp.uiLink);
  console.log('└──────────────────────────────────────────────────────────────────────────\n');
}

function formatOpportunityHtml(opp: SAMOpportunity): string {
  const badge = getSetAsideBadge(opp.typeOfSetAsideDescription);
  return `
    <div style="border: 1px solid #ddd; padding: 10px; margin: 10px 0; border-radius: 5px;">
      <h4>${badge} <a href="${opp.uiLink}">${opp.title}</a></h4>
      <table style="font-size: 14px;">
        <tr><td><strong>Notice ID:</strong></td><td>${opp.noticeId}</td></tr>
        <tr><td><strong>Agency:</strong></td><td>${[opp.department, opp.subTier].filter(Boolean).join(' > ') || 'See details'}</td></tr>
        <tr><td><strong>Set-Aside:</strong></td><td>${opp.typeOfSetAsideDescription || 'Open'}</td></tr>
        <tr><td><strong>Posted:</strong></td><td>${opp.postedDate}</td></tr>
        <tr><td><strong>Response Due:</strong></td><td>${opp.responseDeadLine || 'See solicitation'}</td></tr>
        <tr><td><strong>NAICS:</strong></td><td>${opp.naicsCode || 'N/A'}</td></tr>
      </table>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { runMonitor as run };
