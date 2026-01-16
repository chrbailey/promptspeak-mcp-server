/**
 * Webhook Alert Hook
 *
 * Sends webhook notifications when high-value observations occur.
 * Integrates with Slack, Discord, email services, or custom endpoints.
 */

import type { Observation, AlertSeverity } from '../types.js';
import { createHook, type ObservationHook } from './observation-hooks.js';

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOK CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

export interface WebhookConfig {
  /** Webhook endpoint URL */
  url: string;
  /** Optional authorization header */
  authHeader?: string;
  /** Minimum severity to trigger webhook */
  minSeverity?: AlertSeverity;
  /** Whether to batch notifications */
  batchNotifications?: boolean;
  /** Batch interval in ms (default: 30000) */
  batchIntervalMs?: number;
  /** Custom formatter */
  formatter?: (observation: Observation) => unknown;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOK HOOK FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a webhook alert hook.
 */
export function createWebhookAlertHook(config: WebhookConfig): ObservationHook {
  const pendingNotifications: Observation[] = [];
  let batchTimer: NodeJS.Timeout | null = null;

  const sendWebhook = async (payload: unknown): Promise<void> => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (config.authHeader) {
        headers['Authorization'] = config.authHeader;
      }

      const response = await fetch(config.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(`[WEBHOOK] Failed to send: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('[WEBHOOK] Error sending notification:', error);
    }
  };

  const formatObservation = (obs: Observation): unknown => {
    if (config.formatter) {
      return config.formatter(obs);
    }

    // Default format (Slack-compatible)
    return {
      text: `🎯 *${obs.observationType}*`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${obs.itemTitle || 'Unknown Item'}*\n` +
              `Price: $${obs.currentPrice?.toFixed(2)}\n` +
              `Confidence: ${(obs.confidenceScore * 100).toFixed(0)}%\n` +
              `Condition: ${obs.marketCondition}\n` +
              `Action: ${obs.recommendedAction}` +
              (obs.recommendedAmount ? ` @ $${obs.recommendedAmount.toFixed(2)}` : ''),
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Listing: ${obs.listingId} | Agent: ${obs.agentId}`,
            },
          ],
        },
      ],
    };
  };

  const flushBatch = async (): Promise<void> => {
    if (pendingNotifications.length === 0) return;

    const batch = [...pendingNotifications];
    pendingNotifications.length = 0;

    const payload = {
      text: `📦 Batch Alert: ${batch.length} observations`,
      attachments: batch.map(obs => ({
        color: getSeverityColor(determineSeverity(obs)),
        text: `${obs.observationType}: ${obs.itemTitle?.substring(0, 50)} @ $${obs.currentPrice}`,
      })),
    };

    await sendWebhook(payload);
  };

  return createHook()
    .id(`webhook-${sanitizeUrl(config.url)}`)
    .name('Webhook Alert')
    .priority(50) // Medium priority
    .forTypes('OPPORTUNITY_IDENTIFIED', 'PROBE_REQUESTED', 'ALERT_TRIGGERED')
    .minConfidence(0.7) // Only high-confidence observations
    .handler(async (observation: Observation) => {
      const severity = determineSeverity(observation);

      // Check minimum severity
      if (config.minSeverity && !meetsSeverityThreshold(severity, config.minSeverity)) {
        return;
      }

      if (config.batchNotifications) {
        pendingNotifications.push(observation);

        // Set up batch timer if not already running
        if (!batchTimer) {
          batchTimer = setTimeout(async () => {
            await flushBatch();
            batchTimer = null;
          }, config.batchIntervalMs ?? 30000);
        }
      } else {
        // Send immediately
        await sendWebhook(formatObservation(observation));
      }
    })
    .cleanup(async () => {
      // Flush any pending notifications
      if (batchTimer) {
        clearTimeout(batchTimer);
        batchTimer = null;
      }
      await flushBatch();
    })
    .build();
}

/**
 * Create a Slack-specific webhook hook.
 */
export function createSlackAlertHook(webhookUrl: string): ObservationHook {
  return createWebhookAlertHook({
    url: webhookUrl,
    batchNotifications: true,
    batchIntervalMs: 60000, // 1 minute batches
    formatter: (obs) => ({
      text: `🎯 Market Intelligence Alert`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${getEmoji(obs.observationType)} ${obs.observationType.replace(/_/g, ' ')}`,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Item:*\n${obs.itemTitle?.substring(0, 50) || 'Unknown'}` },
            { type: 'mrkdwn', text: `*Price:*\n$${obs.currentPrice?.toFixed(2)}` },
            { type: 'mrkdwn', text: `*Confidence:*\n${(obs.confidenceScore * 100).toFixed(0)}%` },
            { type: 'mrkdwn', text: `*Condition:*\n${obs.marketCondition}` },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Recommendation:* ${obs.recommendedAction}` +
              (obs.recommendedAmount ? ` @ $${obs.recommendedAmount.toFixed(2)}` : ''),
          },
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `Agent: \`${obs.agentId}\` | Listing: \`${obs.listingId}\`` },
          ],
        },
        { type: 'divider' },
      ],
    }),
  });
}

/**
 * Create a Discord-specific webhook hook.
 */
export function createDiscordAlertHook(webhookUrl: string): ObservationHook {
  return createWebhookAlertHook({
    url: webhookUrl,
    batchNotifications: false, // Discord handles better with individual messages
    formatter: (obs) => ({
      embeds: [
        {
          title: `${getEmoji(obs.observationType)} ${obs.observationType.replace(/_/g, ' ')}`,
          color: getDiscordColor(determineSeverity(obs)),
          fields: [
            { name: 'Item', value: obs.itemTitle?.substring(0, 100) || 'Unknown', inline: false },
            { name: 'Price', value: `$${obs.currentPrice?.toFixed(2)}`, inline: true },
            { name: 'Confidence', value: `${(obs.confidenceScore * 100).toFixed(0)}%`, inline: true },
            { name: 'Market', value: obs.marketCondition, inline: true },
            { name: 'Recommendation', value: `${obs.recommendedAction}${obs.recommendedAmount ? ` @ $${obs.recommendedAmount.toFixed(2)}` : ''}`, inline: false },
          ],
          footer: { text: `Agent: ${obs.agentId}` },
          timestamp: obs.timestamp,
        },
      ],
    }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function determineSeverity(obs: Observation): AlertSeverity {
  // High confidence opportunities are critical
  if (obs.observationType === 'OPPORTUNITY_IDENTIFIED' && obs.confidenceScore >= 0.9) {
    return 'CRITICAL';
  }
  if (obs.observationType === 'OPPORTUNITY_IDENTIFIED' && obs.confidenceScore >= 0.8) {
    return 'HIGH';
  }
  if (obs.observationType === 'PROBE_REQUESTED') {
    return 'MEDIUM';
  }
  if (obs.observationType === 'ALERT_TRIGGERED') {
    return 'HIGH';
  }
  return 'LOW';
}

function meetsSeverityThreshold(actual: AlertSeverity, minimum: AlertSeverity): boolean {
  const levels: AlertSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  return levels.indexOf(actual) >= levels.indexOf(minimum);
}

function getSeverityColor(severity: AlertSeverity): string {
  const colors: Record<AlertSeverity, string> = {
    LOW: '#36a64f',      // Green
    MEDIUM: '#daa038',   // Yellow
    HIGH: '#cc4444',     // Red
    CRITICAL: '#cc0000', // Dark red
  };
  return colors[severity];
}

function getDiscordColor(severity: AlertSeverity): number {
  const colors: Record<AlertSeverity, number> = {
    LOW: 0x36a64f,
    MEDIUM: 0xdaa038,
    HIGH: 0xcc4444,
    CRITICAL: 0xcc0000,
  };
  return colors[severity];
}

function getEmoji(type: string): string {
  const emojis: Record<string, string> = {
    LISTING_DISCOVERED: '🔍',
    PRICE_OBSERVED: '💰',
    MARKET_CONDITION_DETECTED: '📊',
    OPPORTUNITY_IDENTIFIED: '🎯',
    SELLER_BEHAVIOR_OBSERVED: '👤',
    PROBE_REQUESTED: '⏳',
    PROBE_EXECUTED: '✅',
    ALERT_TRIGGERED: '🚨',
  };
  return emojis[type] || '📌';
}

function sanitizeUrl(url: string): string {
  // Create a safe ID from URL
  return url.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 20);
}
