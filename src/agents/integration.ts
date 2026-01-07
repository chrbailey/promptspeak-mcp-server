/**
 * Multi-Agent Data Intelligence Framework (MADIF) - Integration Layer
 *
 * Connects the MADIF agent system to the PromptSpeak MCP server:
 * - Links ProposalManager to HoldManager for approval workflow
 * - Configures WebhookDispatcher from environment variables
 * - Initializes all agent system components in correct order
 */

import { HoldManager, holdManager } from '../gatekeeper/hold-manager.js';
import {
  initializeAgentDatabase,
  getAgentDatabase,
} from './database.js';
import {
  initializeAgentRegistry,
  getAgentRegistry,
} from './registry.js';
import {
  initializeProposalManager,
  getProposalManager,
  setHoldManager,
} from './proposal-manager.js';
import {
  initializeWebhookDispatcher,
  getWebhookDispatcher,
  configureFromEnv,
} from '../notifications/webhook-dispatcher.js';
import { createLogger } from '../core/logging/index.js';

const logger = createLogger('MADIFIntegration');

// ═══════════════════════════════════════════════════════════════════════════════
// HOLD MANAGER ADAPTER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Adapter to bridge the HoldManager interface expected by ProposalManager
 * with the actual HoldManager implementation in gatekeeper/hold-manager.ts
 */
function createHoldManagerAdapter(manager: HoldManager) {
  return {
    createHold(
      request: {
        agentId: string;
        frame: string;
        tool: string;
        arguments: Record<string, unknown>;
      },
      reason: string,
      severity: 'low' | 'medium' | 'high' | 'critical',
      metadata: Record<string, unknown>
    ) {
      // Convert to the ExecuteRequest format expected by HoldManager
      const executeRequest = {
        agentId: request.agentId,
        frame: request.frame,
        tool: request.tool,
        arguments: request.arguments,
      };

      // Create the hold using the real HoldManager
      const hold = manager.createHold(
        executeRequest,
        reason as any, // HoldReason type
        severity,
        metadata
      );

      // Return in the format expected by ProposalManager
      return {
        holdId: hold.holdId,
        agentId: hold.agentId,
        frame: hold.frame,
        tool: hold.tool,
        arguments: hold.arguments,
        reason: hold.reason,
        severity: hold.severity,
        metadata: hold.evidence,
        createdAt: new Date(hold.createdAt).toISOString(),
        expiresAt: hold.expiresAt === Infinity
          ? undefined
          : new Date(hold.expiresAt).toISOString(),
      };
    },

    getHold(holdId: string) {
      const hold = manager.getHold(holdId);
      if (!hold) return null;

      return {
        holdId: hold.holdId,
        agentId: hold.agentId,
        frame: hold.frame,
        tool: hold.tool,
        arguments: hold.arguments,
        reason: hold.reason,
        severity: hold.severity,
        metadata: hold.evidence,
        createdAt: new Date(hold.createdAt).toISOString(),
        expiresAt: hold.expiresAt === Infinity
          ? undefined
          : new Date(hold.expiresAt).toISOString(),
      };
    },

    approveHold(holdId: string, approvedBy: string, reason?: string): boolean {
      const decision = manager.approveHold(holdId, 'human', reason || 'Approved');
      return decision !== null;
    },

    rejectHold(holdId: string, rejectedBy: string, reason: string): boolean {
      const decision = manager.rejectHold(holdId, 'human', reason);
      return decision !== null;
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

let initialized = false;

/**
 * Initialize the MADIF agent system and connect it to the MCP server.
 *
 * This function:
 * 1. Initializes the agent database (SQLite)
 * 2. Initializes the agent registry
 * 3. Initializes the proposal manager
 * 4. Connects proposal manager to the hold manager for approvals
 * 5. Configures webhook dispatcher from environment variables
 *
 * Should be called once during server startup.
 */
export async function initializeAgentSystem(options?: {
  dbPath?: string;
  webhookCallbackUrl?: string;
}): Promise<{
  database: ReturnType<typeof getAgentDatabase>;
  registry: ReturnType<typeof getAgentRegistry>;
  proposalManager: ReturnType<typeof getProposalManager>;
  webhookDispatcher: ReturnType<typeof getWebhookDispatcher>;
}> {
  if (initialized) {
    return {
      database: getAgentDatabase(),
      registry: getAgentRegistry(),
      proposalManager: getProposalManager(),
      webhookDispatcher: getWebhookDispatcher(),
    };
  }

  logger.info('Initializing MADIF agent system...');

  // 1. Initialize database
  const database = initializeAgentDatabase(options?.dbPath);
  logger.info('  - Agent database initialized');

  // 2. Initialize registry (loads definitions and instances from DB)
  const registry = initializeAgentRegistry();
  logger.info('  - Agent registry initialized');

  // 3. Initialize proposal manager
  const proposalManager = initializeProposalManager();
  logger.info('  - Proposal manager initialized');

  // 4. Connect proposal manager to hold manager
  const holdAdapter = createHoldManagerAdapter(holdManager);
  setHoldManager(holdAdapter);
  logger.info('  - Connected to hold manager');

  // 5. Configure webhook dispatcher from environment
  const webhookDispatcher = initializeWebhookDispatcher({
    callbackBaseUrl: options?.webhookCallbackUrl || process.env.WEBHOOK_CALLBACK_URL || 'http://localhost:3000',
  });
  configureFromEnv();
  logger.info('  - Webhook dispatcher configured');

  // 6. Set up hold manager callbacks for notifications
  holdManager.setOnHoldCreated((hold) => {
    // Log agent-related holds
    if (hold.reason === 'agent_spawn_approval' || hold.reason === 'agent_resource_exceeded') {
      logger.info(`Hold created: ${hold.holdId} (${hold.reason})`);
    }
  });

  holdManager.setOnHoldDecided((decision) => {
    // Log agent-related decisions
    const hold = holdManager.getHold(decision.holdId);
    if (hold && (hold.reason === 'agent_spawn_approval' || hold.reason === 'agent_resource_exceeded')) {
      logger.info(`Hold decided: ${decision.holdId} -> ${decision.state}`);
    }
  });

  initialized = true;
  logger.info('MADIF agent system ready');

  return {
    database,
    registry,
    proposalManager,
    webhookDispatcher,
  };
}

/**
 * Check if the agent system is initialized.
 */
export function isAgentSystemInitialized(): boolean {
  return initialized;
}

/**
 * Get the hold manager adapter for direct access if needed.
 */
export function getHoldManagerAdapter() {
  return createHoldManagerAdapter(holdManager);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

// Re-export commonly used functions for convenience
export {
  getAgentDatabase,
  getAgentRegistry,
  getProposalManager,
  getWebhookDispatcher,
};
