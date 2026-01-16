#!/usr/bin/env tsx
/**
 * Market Intelligence Platform Monitor
 *
 * CLI tool for monitoring and managing the swarm intelligence system.
 *
 * Usage:
 *   tsx scripts/intel-monitor.ts [command] [options]
 *
 * Commands:
 *   status        - Show overall platform status
 *   observations  - List recent observations
 *   alerts        - List pending alerts
 *   opportunities - List high-confidence opportunities
 *   sellers       - List seller profiles
 *   approve       - Approve a pending probe
 *   reject        - Reject a pending probe
 *   indexes       - Check Pinecone index status
 *   help          - Show this help message
 */

import {
  queryObservations,
  getPendingAlerts,
  getAlert,
  updateAlertStatus,
  listSellersByRisk,
  getSellerProfile,
  getSwarmDatabase,
} from '../src/swarm/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CLI COLORS
// ═══════════════════════════════════════════════════════════════════════════════

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

function colorize(text: string, ...colorCodes: string[]): string {
  return colorCodes.join('') + text + colors.reset;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORMATTERS
// ═══════════════════════════════════════════════════════════════════════════════

function formatSeverity(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return colorize('CRITICAL', colors.bgRed, colors.white, colors.bright);
    case 'HIGH': return colorize('HIGH', colors.red, colors.bright);
    case 'MEDIUM': return colorize('MEDIUM', colors.yellow);
    case 'LOW': return colorize('LOW', colors.dim);
    default: return severity;
  }
}

function formatMarketCondition(condition: string): string {
  switch (condition) {
    case 'UNDERPRICED': return colorize('UNDERPRICED', colors.green, colors.bright);
    case 'FAIR': return colorize('FAIR', colors.yellow);
    case 'OVERPRICED': return colorize('OVERPRICED', colors.red);
    default: return condition;
  }
}

function formatAction(action: string): string {
  switch (action) {
    case 'BID': return colorize('BID', colors.green, colors.bright);
    case 'OFFER': return colorize('OFFER', colors.cyan, colors.bright);
    case 'WATCH': return colorize('WATCH', colors.yellow);
    case 'SKIP': return colorize('SKIP', colors.dim);
    default: return action;
  }
}

function formatPrice(price: number): string {
  return colorize(`$${price.toFixed(2)}`, colors.green);
}

function formatPercent(pct: number | undefined): string {
  if (pct === undefined) return '-';
  const color = pct >= 20 ? colors.green : pct >= 10 ? colors.yellow : colors.dim;
  return colorize(`${pct.toFixed(0)}%`, color);
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);

  if (mins < 60) return colorize(`${mins}m ago`, colors.dim);
  if (hours < 24) return colorize(`${hours}h ago`, colors.dim);
  return colorize(date.toLocaleDateString(), colors.dim);
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMANDS
// ═══════════════════════════════════════════════════════════════════════════════

function showHelp(): void {
  console.log(`
${colorize('Market Intelligence Platform Monitor', colors.cyan, colors.bright)}
${'═'.repeat(50)}

${colorize('Usage:', colors.bright)}
  tsx scripts/intel-monitor.ts [command] [options]

${colorize('Commands:', colors.bright)}
  ${colorize('status', colors.cyan)}          Show overall platform status
  ${colorize('observations', colors.cyan)}    List recent observations
  ${colorize('alerts', colors.cyan)}          List pending alerts
  ${colorize('opportunities', colors.cyan)}   List high-confidence opportunities
  ${colorize('sellers', colors.cyan)}         List seller profiles
  ${colorize('seller', colors.cyan)} <id>     Get specific seller profile
  ${colorize('approve', colors.cyan)} <id>    Approve a pending probe
  ${colorize('reject', colors.cyan)} <id>     Reject a pending probe
  ${colorize('indexes', colors.cyan)}         Check Pinecone index status
  ${colorize('help', colors.cyan)}            Show this help message

${colorize('Options:', colors.bright)}
  --limit <n>        Limit results (default: 20)
  --swarm <id>       Filter by swarm ID
  --min-conf <n>     Minimum confidence (0-1)

${colorize('Examples:', colors.bright)}
  tsx scripts/intel-monitor.ts status
  tsx scripts/intel-monitor.ts opportunities --min-conf 0.8
  tsx scripts/intel-monitor.ts approve alert_123456
  `);
}

function showStatus(): void {
  console.log(`\n${colorize('MARKET INTELLIGENCE PLATFORM STATUS', colors.cyan, colors.bright)}`);
  console.log('═'.repeat(50));

  // Get database stats
  const db = getSwarmDatabase();

  // Count observations
  const obsCount = db.prepare('SELECT COUNT(*) as count FROM observations').get() as { count: number };
  const recentObs = db.prepare(
    "SELECT COUNT(*) as count FROM observations WHERE timestamp > datetime('now', '-1 hour')"
  ).get() as { count: number };

  // Count alerts
  const pendingAlerts = db.prepare(
    "SELECT COUNT(*) as count FROM alerts WHERE status = 'PENDING'"
  ).get() as { count: number };
  const totalAlerts = db.prepare('SELECT COUNT(*) as count FROM alerts').get() as { count: number };

  // Count sellers
  const sellerCount = db.prepare('SELECT COUNT(*) as count FROM seller_profiles').get() as { count: number };

  // Recent activity
  const recentActivity = queryObservations({ limit: 5 });

  console.log(`\n${colorize('Database Statistics:', colors.bright)}`);
  console.log(`  Total Observations:  ${colorize(obsCount.count.toString(), colors.cyan)}`);
  console.log(`  Last Hour:           ${colorize(recentObs.count.toString(), colors.green)}`);
  console.log(`  Pending Alerts:      ${colorize(pendingAlerts.count.toString(), pendingAlerts.count > 0 ? colors.yellow : colors.dim)}`);
  console.log(`  Total Alerts:        ${colorize(totalAlerts.count.toString(), colors.cyan)}`);
  console.log(`  Seller Profiles:     ${colorize(sellerCount.count.toString(), colors.cyan)}`);

  // Market condition breakdown
  const conditions = db.prepare(`
    SELECT market_condition, COUNT(*) as count
    FROM observations
    GROUP BY market_condition
  `).all() as Array<{ market_condition: string; count: number }>;

  if (conditions.length > 0) {
    console.log(`\n${colorize('Market Conditions:', colors.bright)}`);
    for (const c of conditions) {
      console.log(`  ${formatMarketCondition(c.market_condition).padEnd(20)} ${c.count}`);
    }
  }

  // Recent activity
  if (recentActivity.length > 0) {
    console.log(`\n${colorize('Recent Activity:', colors.bright)}`);
    for (const obs of recentActivity) {
      console.log(
        `  ${formatTimestamp(obs.timestamp)} ${formatAction(obs.recommendedAction)} ` +
        `${obs.itemTitle?.substring(0, 30) || 'Unknown'}... ` +
        `${formatPrice(obs.currentPrice)}`
      );
    }
  }

  console.log();
}

function showObservations(limit: number, swarmId?: string, minConf?: number): void {
  console.log(`\n${colorize('RECENT OBSERVATIONS', colors.cyan, colors.bright)}`);
  console.log('═'.repeat(80));

  const observations = queryObservations({
    swarmId,
    minConfidence: minConf,
    limit,
  });

  if (observations.length === 0) {
    console.log(colorize('No observations found.', colors.dim));
    return;
  }

  for (const obs of observations) {
    console.log(`
${colorize(obs.observationId.substring(0, 12), colors.dim)} ${formatTimestamp(obs.timestamp)}
  ${colorize('Item:', colors.bright)} ${obs.itemTitle?.substring(0, 50) || 'Unknown'}
  ${colorize('Price:', colors.bright)} ${formatPrice(obs.currentPrice)} ${obs.marketAverage ? `(Market: ${formatPrice(obs.marketAverage)})` : ''}
  ${colorize('Discount:', colors.bright)} ${formatPercent(obs.discountPercent)}  ${colorize('Condition:', colors.bright)} ${formatMarketCondition(obs.marketCondition)}
  ${colorize('Action:', colors.bright)} ${formatAction(obs.recommendedAction)} ${obs.recommendedAmount ? `@ ${formatPrice(obs.recommendedAmount)}` : ''}
  ${colorize('Confidence:', colors.bright)} ${(obs.confidenceScore * 100).toFixed(0)}%
`);
  }

  console.log(colorize(`\nShowing ${observations.length} observations`, colors.dim));
}

function showAlerts(swarmId?: string): void {
  console.log(`\n${colorize('PENDING ALERTS', colors.cyan, colors.bright)}`);
  console.log('═'.repeat(80));

  if (!swarmId) {
    // Get all pending alerts
    const db = getSwarmDatabase();
    const alerts = db.prepare(`
      SELECT * FROM alerts WHERE status = 'PENDING' ORDER BY created_at DESC LIMIT 50
    `).all() as any[];

    if (alerts.length === 0) {
      console.log(colorize('No pending alerts.', colors.dim));
      return;
    }

    for (const alert of alerts) {
      console.log(`
${colorize(alert.alert_id.substring(0, 12), colors.yellow, colors.bright)} ${formatSeverity(alert.severity)}
  ${colorize('Type:', colors.bright)} ${alert.alert_type}
  ${colorize('Listing:', colors.bright)} ${alert.listing_id}
  ${colorize('Action:', colors.bright)} ${formatAction(alert.recommended_action)} @ ${formatPrice(alert.recommended_amount || 0)}
  ${colorize('Value:', colors.bright)} ${formatPrice(alert.estimated_value)}
  ${colorize('Confidence:', colors.bright)} ${(alert.confidence * 100).toFixed(0)}%
  ${colorize('Summary:', colors.bright)} ${alert.summary?.substring(0, 60)}...
  ${colorize('Deadline:', colors.bright)} ${alert.approval_deadline || 'None'}
`);
    }

    console.log(colorize(`\nShowing ${alerts.length} pending alerts`, colors.dim));
    console.log(colorize(`Use: tsx scripts/intel-monitor.ts approve <alert_id>`, colors.dim));
  } else {
    const alerts = getPendingAlerts(swarmId);
    // ... similar display logic
    console.log(`Found ${alerts.length} alerts for swarm ${swarmId}`);
  }
}

function showOpportunities(limit: number, minConf: number): void {
  console.log(`\n${colorize('HIGH-CONFIDENCE OPPORTUNITIES', colors.green, colors.bright)}`);
  console.log('═'.repeat(80));

  const observations = queryObservations({
    minConfidence: minConf,
    limit,
  });

  const opportunities = observations.filter(
    obs => ['BID', 'OFFER'].includes(obs.recommendedAction)
  );

  if (opportunities.length === 0) {
    console.log(colorize('No opportunities found matching criteria.', colors.dim));
    return;
  }

  console.log(`\n${'ID'.padEnd(14)} ${'Price'.padEnd(10)} ${'Discount'.padEnd(10)} ${'Action'.padEnd(8)} ${'Conf'.padEnd(6)} ${'Item'}`);
  console.log('-'.repeat(80));

  for (const opp of opportunities) {
    console.log(
      `${colorize(opp.observationId.substring(0, 12), colors.dim).padEnd(14)} ` +
      `${formatPrice(opp.currentPrice).padEnd(18)} ` +
      `${formatPercent(opp.discountPercent).padEnd(18)} ` +
      `${formatAction(opp.recommendedAction).padEnd(16)} ` +
      `${colorize((opp.confidenceScore * 100).toFixed(0) + '%', colors.cyan).padEnd(14)} ` +
      `${opp.itemTitle?.substring(0, 25) || 'Unknown'}`
    );
  }

  console.log(colorize(`\nShowing ${opportunities.length} opportunities (min confidence: ${(minConf * 100).toFixed(0)}%)`, colors.dim));
}

function showSellers(): void {
  console.log(`\n${colorize('SELLER PROFILES', colors.cyan, colors.bright)}`);
  console.log('═'.repeat(80));

  const sellers = listSellersByRisk();

  if (sellers.length === 0) {
    console.log(colorize('No seller profiles found.', colors.dim));
    return;
  }

  console.log(`\n${'Seller ID'.padEnd(20)} ${'Risk'.padEnd(10)} ${'Style'.padEnd(15)} ${'Interactions'.padEnd(15)} ${'Success'}`);
  console.log('-'.repeat(80));

  for (const seller of sellers) {
    const riskColor = seller.riskLevel === 'HIGH' ? colors.red :
                      seller.riskLevel === 'MEDIUM' ? colors.yellow : colors.green;
    console.log(
      `${seller.sellerId.substring(0, 18).padEnd(20)} ` +
      `${colorize(seller.riskLevel, riskColor).padEnd(18)} ` +
      `${seller.negotiationStyle.padEnd(15)} ` +
      `${seller.totalInteractions.toString().padEnd(15)} ` +
      `${seller.successfulAcquisitions}`
    );
  }

  console.log(colorize(`\nShowing ${sellers.length} sellers`, colors.dim));
}

function showSellerProfile(sellerId: string): void {
  const profile = getSellerProfile(sellerId);

  if (!profile) {
    console.log(colorize(`Seller not found: ${sellerId}`, colors.red));
    return;
  }

  console.log(`\n${colorize('SELLER PROFILE', colors.cyan, colors.bright)}`);
  console.log('═'.repeat(50));
  console.log(`
  ${colorize('Seller ID:', colors.bright)} ${profile.sellerId}
  ${colorize('Feedback:', colors.bright)} ${profile.feedbackScore || 'N/A'} (${profile.feedbackPercent?.toFixed(1) || 'N/A'}% positive)

  ${colorize('Interaction History:', colors.bright)}
    Total Interactions:      ${profile.totalInteractions}
    Successful Acquisitions: ${profile.successfulAcquisitions}
    Avg Discount Achieved:   ${profile.avgDiscountAchieved?.toFixed(1) || 'N/A'}%

  ${colorize('Behavior Analysis:', colors.bright)}
    Negotiation Style:       ${profile.negotiationStyle}
    Best Offer Acceptance:   ${profile.bestOfferAcceptanceRate ? (profile.bestOfferAcceptanceRate * 100).toFixed(0) + '%' : 'N/A'}
    Risk Level:              ${colorize(profile.riskLevel, profile.riskLevel === 'HIGH' ? colors.red : colors.green)}

  ${colorize('Timestamps:', colors.bright)}
    First Seen:    ${profile.firstSeenAt}
    Last Updated:  ${profile.lastUpdatedAt}
`);
}

async function approveProbe(alertId: string, notes?: string): Promise<void> {
  const alert = getAlert(alertId);

  if (!alert) {
    console.log(colorize(`Alert not found: ${alertId}`, colors.red));
    return;
  }

  if (alert.status !== 'PENDING') {
    console.log(colorize(`Alert is not pending (status: ${alert.status})`, colors.yellow));
    return;
  }

  console.log(`\n${colorize('APPROVING PROBE', colors.green, colors.bright)}`);
  console.log('═'.repeat(50));
  console.log(`
  ${colorize('Alert ID:', colors.bright)} ${alert.alertId}
  ${colorize('Type:', colors.bright)} ${alert.alertType}
  ${colorize('Action:', colors.bright)} ${formatAction(alert.recommendedAction)} @ ${formatPrice(alert.recommendedAmount || 0)}
  ${colorize('Listing:', colors.bright)} ${alert.listingId}
  `);

  const updated = updateAlertStatus(alertId, 'APPROVED', 'cli-monitor', notes || 'Approved via CLI');

  if (updated) {
    console.log(colorize('Probe APPROVED successfully!', colors.green, colors.bright));
    console.log(colorize('The swarm will execute the recommended action.', colors.dim));
  } else {
    console.log(colorize('Failed to approve probe.', colors.red));
  }
}

async function rejectProbe(alertId: string, reason?: string): Promise<void> {
  const alert = getAlert(alertId);

  if (!alert) {
    console.log(colorize(`Alert not found: ${alertId}`, colors.red));
    return;
  }

  if (alert.status !== 'PENDING') {
    console.log(colorize(`Alert is not pending (status: ${alert.status})`, colors.yellow));
    return;
  }

  const updated = updateAlertStatus(alertId, 'REJECTED', 'cli-monitor', reason || 'Rejected via CLI');

  if (updated) {
    console.log(colorize('Probe REJECTED.', colors.yellow));
    console.log(colorize('Logged for learning, no action taken.', colors.dim));
  } else {
    console.log(colorize('Failed to reject probe.', colors.red));
  }
}

function showIndexes(): void {
  console.log(`\n${colorize('PINECONE INDEXES', colors.cyan, colors.bright)}`);
  console.log('═'.repeat(50));
  console.log(`
  ${colorize('listings-intel', colors.green)}   Listing similarity search
  ${colorize('price-intel', colors.green)}      Price pattern analysis
  ${colorize('seller-intel', colors.green)}     Seller behavior profiles

  ${colorize('Configuration:', colors.bright)}
    Model:     llama-text-embed-v2
    Dimension: 1024
    Metric:    cosine

  ${colorize('Note:', colors.dim)} Use Pinecone MCP tools or console for detailed stats.
  `);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  // Parse options
  const options: Record<string, string> = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        options[key] = value;
        i++;
      }
    } else if (!args[i].startsWith('-')) {
      options['_arg'] = args[i];
    }
  }

  const limit = parseInt(options['limit'] || '20', 10);
  const swarmId = options['swarm'];
  const minConf = parseFloat(options['min-conf'] || '0.7');

  switch (command) {
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;

    case 'status':
      showStatus();
      break;

    case 'observations':
    case 'obs':
      showObservations(limit, swarmId, minConf);
      break;

    case 'alerts':
      showAlerts(swarmId);
      break;

    case 'opportunities':
    case 'opps':
      showOpportunities(limit, minConf);
      break;

    case 'sellers':
      showSellers();
      break;

    case 'seller':
      if (options['_arg']) {
        showSellerProfile(options['_arg']);
      } else {
        console.log(colorize('Usage: intel-monitor.ts seller <seller_id>', colors.yellow));
      }
      break;

    case 'approve':
      if (options['_arg']) {
        await approveProbe(options['_arg'], options['notes']);
      } else {
        console.log(colorize('Usage: intel-monitor.ts approve <alert_id>', colors.yellow));
      }
      break;

    case 'reject':
      if (options['_arg']) {
        await rejectProbe(options['_arg'], options['reason']);
      } else {
        console.log(colorize('Usage: intel-monitor.ts reject <alert_id> --reason "..."', colors.yellow));
      }
      break;

    case 'indexes':
      showIndexes();
      break;

    default:
      console.log(colorize(`Unknown command: ${command}`, colors.red));
      showHelp();
  }
}

main().catch(console.error);
