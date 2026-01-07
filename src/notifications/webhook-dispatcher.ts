/**
 * Multi-Agent Data Intelligence Framework (MADIF) - Webhook Dispatcher
 *
 * Sends agent approval requests and notifications to external channels
 * (Slack, Discord, Email, custom webhooks).
 */

import type {
  AgentApprovalWebhookPayload,
  WebhookChannel,
  WebhookChannelType,
  AgentProposal,
  RiskLevel,
} from '../agents/types.js';
import { recordAgentAuditEvent } from '../agents/database.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

interface WebhookConfig {
  /** Base URL for approval/reject callbacks */
  callbackBaseUrl: string;
  /** Default timeout for webhook calls in ms */
  timeoutMs: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Base backoff delay in ms */
  retryBackoffMs: number;
  /** Channels configuration */
  channels: WebhookChannel[];
}

const DEFAULT_CONFIG: WebhookConfig = {
  callbackBaseUrl: process.env.WEBHOOK_CALLBACK_URL || 'http://localhost:3000',
  timeoutMs: 10000,
  maxRetries: 3,
  retryBackoffMs: 1000,
  channels: [],
};

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOK DISPATCHER
// ═══════════════════════════════════════════════════════════════════════════════

export class WebhookDispatcher {
  private config: WebhookConfig;
  private channels: Map<string, WebhookChannel> = new Map();

  constructor(config: Partial<WebhookConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Index channels by ID
    for (const channel of this.config.channels) {
      this.channels.set(channel.name, channel);
    }
  }

  /**
   * Register a new notification channel.
   */
  registerChannel(channel: WebhookChannel): void {
    this.channels.set(channel.name, channel);

    recordAgentAuditEvent({
      eventType: 'WEBHOOK_CHANNEL_REGISTERED',
      details: {
        channelName: channel.name,
        channelType: channel.type,
        enabled: channel.enabled,
      },
    });
  }

  /**
   * Remove a notification channel.
   */
  removeChannel(name: string): boolean {
    return this.channels.delete(name);
  }

  /**
   * Get all registered channels.
   */
  getChannels(): WebhookChannel[] {
    return Array.from(this.channels.values());
  }

  /**
   * Get enabled channels.
   */
  getEnabledChannels(): WebhookChannel[] {
    return Array.from(this.channels.values()).filter(c => c.enabled);
  }

  /**
   * Send agent approval request to all enabled channels.
   */
  async sendApprovalRequest(proposal: AgentProposal): Promise<{
    sent: string[];
    failed: string[];
  }> {
    const payload = this.buildApprovalPayload(proposal);
    const enabledChannels = this.getEnabledChannels();

    const results = await Promise.allSettled(
      enabledChannels.map(channel => this.sendToChannel(channel, payload))
    );

    const sent: string[] = [];
    const failed: string[] = [];

    results.forEach((result, index) => {
      const channelName = enabledChannels[index].name;
      if (result.status === 'fulfilled' && result.value) {
        sent.push(channelName);
      } else {
        failed.push(channelName);
      }
    });

    recordAgentAuditEvent({
      eventType: 'APPROVAL_NOTIFICATION_SENT',
      proposalId: proposal.proposalId,
      details: {
        sent,
        failed,
        totalChannels: enabledChannels.length,
      },
    });

    return { sent, failed };
  }

  /**
   * Build the approval payload from a proposal.
   */
  private buildApprovalPayload(proposal: AgentProposal): AgentApprovalWebhookPayload {
    const def = proposal.agentDefinition;

    return {
      type: 'agent_approval_request',
      proposalId: proposal.proposalId,
      agent: {
        name: def.name,
        purpose: def.purpose,
        riskLevel: def.riskLevel,
        riskScore: proposal.riskAssessment.overallRiskScore,
      },
      dataSources: def.dataSources.map(s => s.name),
      estimatedResources: {
        apiCalls: `~${proposal.resourceEstimate.apiCalls.typical}`,
        timeout: `${Math.round(def.resourceLimits.timeoutMs / 60000)} minutes`,
      },
      expiresAt: proposal.expiresAt,
      approveUrl: `${this.config.callbackBaseUrl}/api/v1/agents/approve/${proposal.proposalId}`,
      rejectUrl: `${this.config.callbackBaseUrl}/api/v1/agents/reject/${proposal.proposalId}`,
    };
  }

  /**
   * Send payload to a specific channel.
   */
  private async sendToChannel(
    channel: WebhookChannel,
    payload: AgentApprovalWebhookPayload
  ): Promise<boolean> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        switch (channel.type) {
          case 'slack':
            await this.sendToSlack(channel, payload);
            return true;
          case 'discord':
            await this.sendToDiscord(channel, payload);
            return true;
          case 'email':
            await this.sendEmail(channel, payload);
            return true;
          case 'custom':
            await this.sendToCustomWebhook(channel, payload);
            return true;
          default:
            throw new Error(`Unknown channel type: ${channel.type}`);
        }
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryBackoffMs * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      }
    }

    console.error(`Failed to send to channel ${channel.name} after ${this.config.maxRetries} attempts:`, lastError);
    return false;
  }

  /**
   * Send to Slack webhook.
   */
  private async sendToSlack(
    channel: WebhookChannel,
    payload: AgentApprovalWebhookPayload
  ): Promise<void> {
    if (!channel.webhookUrl) {
      throw new Error('Slack channel missing webhookUrl');
    }

    const riskEmoji = this.getRiskEmoji(payload.agent.riskLevel);
    const riskColor = this.getRiskColor(payload.agent.riskLevel);

    const slackPayload = {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${riskEmoji} Agent Approval Request`,
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Agent:*\n${payload.agent.name}`,
            },
            {
              type: 'mrkdwn',
              text: `*Risk Level:*\n${payload.agent.riskLevel.toUpperCase()} (${(payload.agent.riskScore * 100).toFixed(0)}%)`,
            },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Purpose:*\n${payload.agent.purpose}`,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Data Sources:*\n${payload.dataSources.join(', ')}`,
            },
            {
              type: 'mrkdwn',
              text: `*Est. API Calls:*\n${payload.estimatedResources.apiCalls}`,
            },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Expires:* ${new Date(payload.expiresAt).toLocaleString()}`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Approve',
                emoji: true,
              },
              style: 'primary',
              url: payload.approveUrl,
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Reject',
                emoji: true,
              },
              style: 'danger',
              url: payload.rejectUrl,
            },
          ],
        },
      ],
      attachments: [
        {
          color: riskColor,
          text: `Proposal ID: ${payload.proposalId}`,
        },
      ],
    };

    const response = await fetch(channel.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackPayload),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Send to Discord webhook.
   */
  private async sendToDiscord(
    channel: WebhookChannel,
    payload: AgentApprovalWebhookPayload
  ): Promise<void> {
    if (!channel.webhookUrl) {
      throw new Error('Discord channel missing webhookUrl');
    }

    const riskEmoji = this.getRiskEmoji(payload.agent.riskLevel);
    const riskColor = this.getRiskColorDecimal(payload.agent.riskLevel);

    const discordPayload = {
      embeds: [
        {
          title: `${riskEmoji} Agent Approval Request`,
          description: payload.agent.purpose,
          color: riskColor,
          fields: [
            {
              name: 'Agent',
              value: payload.agent.name,
              inline: true,
            },
            {
              name: 'Risk Level',
              value: `${payload.agent.riskLevel.toUpperCase()} (${(payload.agent.riskScore * 100).toFixed(0)}%)`,
              inline: true,
            },
            {
              name: 'Data Sources',
              value: payload.dataSources.join(', ') || 'None',
              inline: false,
            },
            {
              name: 'Est. Resources',
              value: `API Calls: ${payload.estimatedResources.apiCalls}\nTimeout: ${payload.estimatedResources.timeout}`,
              inline: true,
            },
            {
              name: 'Expires',
              value: new Date(payload.expiresAt).toLocaleString(),
              inline: true,
            },
          ],
          footer: {
            text: `Proposal ID: ${payload.proposalId}`,
          },
          timestamp: new Date().toISOString(),
        },
      ],
      components: [
        {
          type: 1, // Action row
          components: [
            {
              type: 2, // Button
              style: 5, // Link
              label: 'Approve',
              url: payload.approveUrl,
            },
            {
              type: 2,
              style: 5,
              label: 'Reject',
              url: payload.rejectUrl,
            },
          ],
        },
      ],
    };

    const response = await fetch(channel.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordPayload),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Discord webhook failed: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Send email notification.
   */
  private async sendEmail(
    channel: WebhookChannel,
    payload: AgentApprovalWebhookPayload
  ): Promise<void> {
    if (!channel.email) {
      throw new Error('Email channel missing email configuration');
    }

    // Build HTML email
    const riskColor = this.getRiskColor(payload.agent.riskLevel);
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${riskColor}; color: white; padding: 15px; border-radius: 8px 8px 0 0; }
          .content { background: #f5f5f5; padding: 20px; border-radius: 0 0 8px 8px; }
          .field { margin-bottom: 15px; }
          .label { font-weight: bold; color: #333; }
          .value { color: #666; }
          .buttons { margin-top: 20px; }
          .button { display: inline-block; padding: 12px 24px; margin-right: 10px; border-radius: 6px; text-decoration: none; font-weight: bold; }
          .approve { background: #22c55e; color: white; }
          .reject { background: #ef4444; color: white; }
          .footer { margin-top: 20px; font-size: 12px; color: #999; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>Agent Approval Request</h2>
            <p>${payload.agent.name}</p>
          </div>
          <div class="content">
            <div class="field">
              <div class="label">Purpose</div>
              <div class="value">${payload.agent.purpose}</div>
            </div>
            <div class="field">
              <div class="label">Risk Level</div>
              <div class="value">${payload.agent.riskLevel.toUpperCase()} (${(payload.agent.riskScore * 100).toFixed(0)}%)</div>
            </div>
            <div class="field">
              <div class="label">Data Sources</div>
              <div class="value">${payload.dataSources.join(', ') || 'None'}</div>
            </div>
            <div class="field">
              <div class="label">Estimated Resources</div>
              <div class="value">API Calls: ${payload.estimatedResources.apiCalls} | Timeout: ${payload.estimatedResources.timeout}</div>
            </div>
            <div class="field">
              <div class="label">Expires</div>
              <div class="value">${new Date(payload.expiresAt).toLocaleString()}</div>
            </div>
            <div class="buttons">
              <a href="${payload.approveUrl}" class="button approve">Approve</a>
              <a href="${payload.rejectUrl}" class="button reject">Reject</a>
            </div>
            <div class="footer">
              Proposal ID: ${payload.proposalId}
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // If SendGrid API key is available, use it
    const sendgridKey = process.env.SENDGRID_API_KEY;
    if (sendgridKey) {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendgridKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: channel.email.to.map(email => ({ email })) }],
          from: { email: channel.email.from },
          subject: `[Action Required] Agent Approval: ${payload.agent.name}`,
          content: [{ type: 'text/html', value: html }],
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`SendGrid failed: ${response.status} ${response.statusText}`);
      }
    } else {
      // Log email for debugging (SMTP not implemented)
      console.log('EMAIL NOTIFICATION (SMTP not configured):');
      console.log(`To: ${channel.email.to.join(', ')}`);
      console.log(`Subject: [Action Required] Agent Approval: ${payload.agent.name}`);
      console.log(`Approve: ${payload.approveUrl}`);
      console.log(`Reject: ${payload.rejectUrl}`);
    }
  }

  /**
   * Send to custom webhook.
   */
  private async sendToCustomWebhook(
    channel: WebhookChannel,
    payload: AgentApprovalWebhookPayload
  ): Promise<void> {
    if (!channel.webhookUrl) {
      throw new Error('Custom channel missing webhookUrl');
    }

    const response = await fetch(channel.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Custom webhook failed: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Get emoji for risk level.
   */
  private getRiskEmoji(riskLevel: RiskLevel): string {
    const emojis: Record<RiskLevel, string> = {
      low: '🟢',
      medium: '🟡',
      high: '🟠',
      critical: '🔴',
    };
    return emojis[riskLevel] || '⚪';
  }

  /**
   * Get hex color for risk level.
   */
  private getRiskColor(riskLevel: RiskLevel): string {
    const colors: Record<RiskLevel, string> = {
      low: '#22c55e',
      medium: '#eab308',
      high: '#f97316',
      critical: '#ef4444',
    };
    return colors[riskLevel] || '#6b7280';
  }

  /**
   * Get decimal color for Discord.
   */
  private getRiskColorDecimal(riskLevel: RiskLevel): number {
    const colors: Record<RiskLevel, number> = {
      low: 0x22c55e,
      medium: 0xeab308,
      high: 0xf97316,
      critical: 0xef4444,
    };
    return colors[riskLevel] || 0x6b7280;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let dispatcherInstance: WebhookDispatcher | null = null;

/**
 * Initialize the webhook dispatcher.
 */
export function initializeWebhookDispatcher(config?: Partial<WebhookConfig>): WebhookDispatcher {
  if (!dispatcherInstance) {
    dispatcherInstance = new WebhookDispatcher(config);
  }
  return dispatcherInstance;
}

/**
 * Get the webhook dispatcher instance.
 */
export function getWebhookDispatcher(): WebhookDispatcher {
  if (!dispatcherInstance) {
    dispatcherInstance = new WebhookDispatcher();
  }
  return dispatcherInstance;
}

/**
 * Configure from environment variables.
 */
export function configureFromEnv(): void {
  const dispatcher = getWebhookDispatcher();

  // Slack
  const slackUrl = process.env.SLACK_WEBHOOK_URL;
  if (slackUrl) {
    dispatcher.registerChannel({
      type: 'slack',
      name: 'slack-default',
      enabled: true,
      webhookUrl: slackUrl,
    });
  }

  // Discord
  const discordUrl = process.env.DISCORD_WEBHOOK_URL;
  if (discordUrl) {
    dispatcher.registerChannel({
      type: 'discord',
      name: 'discord-default',
      enabled: true,
      webhookUrl: discordUrl,
    });
  }

  // Email
  const emailTo = process.env.NOTIFICATION_EMAIL_TO;
  const emailFrom = process.env.NOTIFICATION_EMAIL_FROM || 'noreply@example.com';
  if (emailTo) {
    dispatcher.registerChannel({
      type: 'email',
      name: 'email-default',
      enabled: true,
      email: {
        to: emailTo.split(',').map(e => e.trim()),
        from: emailFrom,
      },
    });
  }
}
