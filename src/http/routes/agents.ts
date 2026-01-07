/**
 * Agent Approval HTTP Routes
 *
 * Provides one-click approval/rejection endpoints for agent proposals.
 * These are the callback URLs sent in webhook notifications (Slack, Discord, Email).
 */

import { Router, Request, Response } from 'express';
import {
  getProposalManager,
  isAgentSystemInitialized,
} from '../../agents/integration.js';
import { recordAgentAuditEvent } from '../../agents/database.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface ApprovalResponse {
  success: boolean;
  proposalId: string;
  action: 'approved' | 'rejected';
  message: string;
  instanceId?: string;
  timestamp: string;
}

interface ErrorResponse {
  success: false;
  error: string;
  message: string;
  proposalId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if agent system is initialized before handling requests.
 */
function requireAgentSystem(req: Request, res: Response, next: Function) {
  if (!isAgentSystemInitialized()) {
    const error: ErrorResponse = {
      success: false,
      error: 'Agent system not initialized',
      message: 'The MADIF agent system is not yet initialized. Please try again later.',
    };
    return res.status(503).json(error);
  }
  next();
}

// Apply middleware to all routes
router.use(requireAgentSystem);

// ═══════════════════════════════════════════════════════════════════════════════
// APPROVAL ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/agents/approve/:proposalId
 *
 * One-click approval from webhook notifications.
 * Supports browser redirect for user feedback.
 */
router.get('/approve/:proposalId', async (req: Request, res: Response) => {
  const { proposalId } = req.params;
  const { redirect, reason } = req.query;

  try {
    const proposalManager = getProposalManager();
    const proposal = proposalManager.getProposal(proposalId);

    if (!proposal) {
      const error: ErrorResponse = {
        success: false,
        error: 'Proposal not found',
        message: `No proposal found with ID: ${proposalId}`,
        proposalId,
      };

      if (redirect) {
        return res.redirect(`${redirect}?error=not_found&proposalId=${proposalId}`);
      }
      return res.status(404).json(error);
    }

    if (proposal.state !== 'pending') {
      const error: ErrorResponse = {
        success: false,
        error: 'Proposal not pending',
        message: `Proposal is already ${proposal.state}`,
        proposalId,
      };

      if (redirect) {
        return res.redirect(`${redirect}?error=already_${proposal.state}&proposalId=${proposalId}`);
      }
      return res.status(400).json(error);
    }

    // Approve the proposal
    const instance = await proposalManager.approveProposal(
      proposalId,
      'webhook-callback',
      (reason as string) || 'Approved via one-click webhook'
    );

    recordAgentAuditEvent({
      eventType: 'PROPOSAL_APPROVED_VIA_WEBHOOK',
      proposalId,
      agentId: proposal.agentDefinition.agentId,
      instanceId: instance?.instanceId,
      details: {
        source: 'http_callback',
        userAgent: req.headers['user-agent'],
      },
    });

    const response: ApprovalResponse = {
      success: true,
      proposalId,
      action: 'approved',
      message: instance
        ? `Agent approved and spawned: ${instance.instanceId}`
        : 'Agent approved (spawn pending)',
      instanceId: instance?.instanceId,
      timestamp: new Date().toISOString(),
    };

    if (redirect) {
      return res.redirect(`${redirect}?success=approved&proposalId=${proposalId}&instanceId=${instance?.instanceId || ''}`);
    }

    // For browser access, return HTML page
    if (req.headers.accept?.includes('text/html')) {
      return res.send(buildSuccessHtml('approved', proposal.agentDefinition.name, instance?.instanceId));
    }

    return res.json(response);
  } catch (error) {
    const errorResponse: ErrorResponse = {
      success: false,
      error: 'Approval failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      proposalId,
    };

    if (req.query.redirect) {
      return res.redirect(`${req.query.redirect}?error=failed&message=${encodeURIComponent(errorResponse.message)}`);
    }

    return res.status(500).json(errorResponse);
  }
});

/**
 * POST /api/v1/agents/approve/:proposalId
 *
 * API-style approval with optional modifications.
 */
router.post('/approve/:proposalId', async (req: Request, res: Response) => {
  const { proposalId } = req.params;
  const { reason, modifications } = req.body;

  try {
    const proposalManager = getProposalManager();
    const proposal = proposalManager.getProposal(proposalId);

    if (!proposal) {
      return res.status(404).json({
        success: false,
        error: 'Proposal not found',
        message: `No proposal found with ID: ${proposalId}`,
      });
    }

    if (proposal.state !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Proposal not pending',
        message: `Proposal is already ${proposal.state}`,
      });
    }

    const instance = await proposalManager.approveProposal(
      proposalId,
      'api-caller',
      reason || 'Approved via API',
      modifications
    );

    recordAgentAuditEvent({
      eventType: 'PROPOSAL_APPROVED_VIA_API',
      proposalId,
      agentId: proposal.agentDefinition.agentId,
      instanceId: instance?.instanceId,
      details: {
        hadModifications: !!modifications,
        reason,
      },
    });

    const response: ApprovalResponse = {
      success: true,
      proposalId,
      action: 'approved',
      message: instance
        ? `Agent approved and spawned: ${instance.instanceId}`
        : 'Agent approved (spawn pending)',
      instanceId: instance?.instanceId,
      timestamp: new Date().toISOString(),
    };

    return res.json(response);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Approval failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// REJECTION ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/agents/reject/:proposalId
 *
 * One-click rejection from webhook notifications.
 */
router.get('/reject/:proposalId', async (req: Request, res: Response) => {
  const { proposalId } = req.params;
  const { redirect, reason } = req.query;

  try {
    const proposalManager = getProposalManager();
    const proposal = proposalManager.getProposal(proposalId);

    if (!proposal) {
      const error: ErrorResponse = {
        success: false,
        error: 'Proposal not found',
        message: `No proposal found with ID: ${proposalId}`,
        proposalId,
      };

      if (redirect) {
        return res.redirect(`${redirect}?error=not_found&proposalId=${proposalId}`);
      }
      return res.status(404).json(error);
    }

    if (proposal.state !== 'pending') {
      const error: ErrorResponse = {
        success: false,
        error: 'Proposal not pending',
        message: `Proposal is already ${proposal.state}`,
        proposalId,
      };

      if (redirect) {
        return res.redirect(`${redirect}?error=already_${proposal.state}&proposalId=${proposalId}`);
      }
      return res.status(400).json(error);
    }

    // Reject the proposal
    proposalManager.rejectProposal(
      proposalId,
      'webhook-callback',
      (reason as string) || 'Rejected via one-click webhook'
    );

    recordAgentAuditEvent({
      eventType: 'PROPOSAL_REJECTED_VIA_WEBHOOK',
      proposalId,
      agentId: proposal.agentDefinition.agentId,
      details: {
        source: 'http_callback',
        reason: reason || 'Rejected via one-click webhook',
        userAgent: req.headers['user-agent'],
      },
    });

    const response: ApprovalResponse = {
      success: true,
      proposalId,
      action: 'rejected',
      message: 'Agent proposal rejected',
      timestamp: new Date().toISOString(),
    };

    if (redirect) {
      return res.redirect(`${redirect}?success=rejected&proposalId=${proposalId}`);
    }

    // For browser access, return HTML page
    if (req.headers.accept?.includes('text/html')) {
      return res.send(buildSuccessHtml('rejected', proposal.agentDefinition.name));
    }

    return res.json(response);
  } catch (error) {
    const errorResponse: ErrorResponse = {
      success: false,
      error: 'Rejection failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      proposalId,
    };

    if (req.query.redirect) {
      return res.redirect(`${req.query.redirect}?error=failed&message=${encodeURIComponent(errorResponse.message)}`);
    }

    return res.status(500).json(errorResponse);
  }
});

/**
 * POST /api/v1/agents/reject/:proposalId
 *
 * API-style rejection.
 */
router.post('/reject/:proposalId', async (req: Request, res: Response) => {
  const { proposalId } = req.params;
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({
      success: false,
      error: 'Reason required',
      message: 'A reason is required when rejecting via API',
    });
  }

  try {
    const proposalManager = getProposalManager();
    const proposal = proposalManager.getProposal(proposalId);

    if (!proposal) {
      return res.status(404).json({
        success: false,
        error: 'Proposal not found',
        message: `No proposal found with ID: ${proposalId}`,
      });
    }

    if (proposal.state !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Proposal not pending',
        message: `Proposal is already ${proposal.state}`,
      });
    }

    proposalManager.rejectProposal(proposalId, 'api-caller', reason);

    recordAgentAuditEvent({
      eventType: 'PROPOSAL_REJECTED_VIA_API',
      proposalId,
      agentId: proposal.agentDefinition.agentId,
      details: { reason },
    });

    const response: ApprovalResponse = {
      success: true,
      proposalId,
      action: 'rejected',
      message: 'Agent proposal rejected',
      timestamp: new Date().toISOString(),
    };

    return res.json(response);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Rejection failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROPOSAL DETAILS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/agents/proposals/:proposalId
 *
 * Get details of a proposal.
 */
router.get('/proposals/:proposalId', async (req: Request, res: Response) => {
  const { proposalId } = req.params;

  try {
    const proposalManager = getProposalManager();
    const proposal = proposalManager.getProposal(proposalId);

    if (!proposal) {
      return res.status(404).json({
        success: false,
        error: 'Proposal not found',
        message: `No proposal found with ID: ${proposalId}`,
      });
    }

    return res.json({
      success: true,
      proposal: {
        proposalId: proposal.proposalId,
        state: proposal.state,
        agent: {
          name: proposal.agentDefinition.name,
          purpose: proposal.agentDefinition.purpose,
          riskLevel: proposal.agentDefinition.riskLevel,
        },
        riskAssessment: {
          overallScore: proposal.riskAssessment.overallRiskScore,
          concerns: proposal.riskAssessment.concerns,
          recommendedApprovalLevel: proposal.riskAssessment.recommendedApprovalLevel,
        },
        resourceEstimate: proposal.resourceEstimate,
        dataSources: proposal.agentDefinition.dataSources.map(s => s.name),
        createdAt: proposal.createdAt,
        expiresAt: proposal.expiresAt,
        decision: proposal.decision,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to get proposal',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/agents/proposals
 *
 * List proposals with optional filtering.
 */
router.get('/proposals', async (req: Request, res: Response) => {
  const { state, campaignId, limit } = req.query;

  try {
    const proposalManager = getProposalManager();
    const proposals = proposalManager.listProposals({
      state: state === 'all' ? undefined : (state as any),
      campaignId: campaignId as string,
      limit: limit ? parseInt(limit as string, 10) : 20,
    });

    return res.json({
      success: true,
      count: proposals.length,
      proposals: proposals.map(p => ({
        proposalId: p.proposalId,
        state: p.state,
        agentName: p.agentDefinition.name,
        riskLevel: p.agentDefinition.riskLevel,
        riskScore: p.riskAssessment.overallRiskScore,
        createdAt: p.createdAt,
        expiresAt: p.expiresAt,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to list proposals',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// HTML TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build success HTML page for browser access.
 */
function buildSuccessHtml(action: 'approved' | 'rejected', agentName: string, instanceId?: string): string {
  const isApproved = action === 'approved';
  const color = isApproved ? '#22c55e' : '#ef4444';
  const icon = isApproved ? '&#10004;' : '&#10006;';
  const title = isApproved ? 'Agent Approved' : 'Agent Rejected';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - PromptSpeak</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.1);
      max-width: 400px;
      width: 100%;
      padding: 40px;
      text-align: center;
    }
    .icon {
      width: 80px;
      height: 80px;
      background: ${color};
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      font-size: 40px;
      color: white;
    }
    h1 {
      color: #1a1a1a;
      font-size: 24px;
      margin-bottom: 12px;
    }
    p {
      color: #666;
      font-size: 16px;
      line-height: 1.5;
    }
    .agent-name {
      font-weight: 600;
      color: #333;
    }
    .instance-id {
      background: #f0f0f0;
      border-radius: 6px;
      padding: 8px 16px;
      font-family: monospace;
      font-size: 14px;
      margin-top: 16px;
      display: inline-block;
    }
    .footer {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid #eee;
      font-size: 13px;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>
      Agent <span class="agent-name">${escapeHtml(agentName)}</span> has been ${action}.
    </p>
    ${instanceId ? `<div class="instance-id">${escapeHtml(instanceId)}</div>` : ''}
    <div class="footer">
      PromptSpeak MCP Server
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

export default router;
