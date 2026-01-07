/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * INTENT MANAGER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages Commander's Intent symbols - creation, retrieval, consultation.
 * This is the core of the multi-agent decision-making system.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createHash } from 'crypto';
import type {
  IntentSymbol,
  CreateIntentRequest,
  CreateIntentResponse,
  IntentConsultationRequest,
  IntentConsultationResult,
  IntentBinding,
  BindAgentRequest,
  BindAgentResponse,
  Constraint,
} from './intent-types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// INTENT MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Manages Commander's Intent lifecycle.
 */
export class IntentManager {
  private intents: Map<string, IntentSymbol> = new Map();
  private bindings: Map<string, IntentBinding> = new Map();
  private bindingsByAgent: Map<string, string> = new Map(); // agent_id -> binding_id

  // ─────────────────────────────────────────────────────────────────────────────
  // INTENT LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a new Commander's Intent.
   */
  async createIntent(request: CreateIntentRequest): Promise<CreateIntentResponse> {
    try {
      // Generate symbol ID
      const symbolId = `Ξ.I.${request.mission_id}`;

      // Check for existing
      if (this.intents.has(symbolId)) {
        return {
          success: false,
          error: `Intent already exists: ${symbolId}`,
        };
      }

      // Build the Intent
      const now = new Date().toISOString();
      const intent: IntentSymbol = {
        symbol_id: symbolId,
        symbol_type: 'INTENT',
        mission_id: request.mission_id,
        version: 1,
        intent_hash: '', // Will be computed below
        objective: request.objective,
        end_state: request.end_state,
        constraints: request.constraints || [],
        red_lines: request.red_lines,
        autonomy_level: request.autonomy_level,
        success_criteria: request.success_criteria || [],
        failure_modes: request.failure_modes || [],
        priority_order: request.priority_order,
        acceptable_tradeoffs: request.acceptable_tradeoffs,
        context: request.context,
        created_at: now,
        created_by: request.created_by,
        expires_at: request.expires_at,
        namespace: request.namespace,
        tags: request.tags,
      };

      // Compute hash (for integrity and drift detection)
      intent.intent_hash = this.computeIntentHash(intent);

      // Store
      this.intents.set(symbolId, intent);

      return {
        success: true,
        intent_id: symbolId,
        intent_hash: intent.intent_hash,
        version: intent.version,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get an Intent by ID.
   */
  getIntent(intentId: string): IntentSymbol | undefined {
    return this.intents.get(intentId);
  }

  /**
   * List all Intents, optionally filtered by namespace.
   */
  listIntents(namespace?: string): IntentSymbol[] {
    const all = Array.from(this.intents.values());
    if (namespace) {
      return all.filter(i => i.namespace === namespace);
    }
    return all;
  }

  /**
   * Update an Intent (creates new version).
   */
  async updateIntent(
    intentId: string,
    updates: Partial<CreateIntentRequest>
  ): Promise<CreateIntentResponse> {
    const existing = this.intents.get(intentId);
    if (!existing) {
      return { success: false, error: `Intent not found: ${intentId}` };
    }

    // Create updated Intent
    const updated: IntentSymbol = {
      ...existing,
      ...updates,
      version: existing.version + 1,
      updated_at: new Date().toISOString(),
      intent_hash: '', // Will recompute
    };

    // Preserve immutables
    updated.symbol_id = existing.symbol_id;
    updated.symbol_type = 'INTENT';
    updated.mission_id = existing.mission_id;
    updated.created_at = existing.created_at;
    updated.created_by = existing.created_by;

    // Recompute hash
    updated.intent_hash = this.computeIntentHash(updated);

    // Store
    this.intents.set(intentId, updated);

    return {
      success: true,
      intent_id: intentId,
      intent_hash: updated.intent_hash,
      version: updated.version,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AGENT BINDING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Bind an agent to an Intent.
   */
  async bindAgent(request: BindAgentRequest): Promise<BindAgentResponse> {
    try {
      const intent = this.intents.get(request.intent_id);
      if (!intent) {
        return { success: false, error: `Intent not found: ${request.intent_id}` };
      }

      // Check for existing binding
      const existingBindingId = this.bindingsByAgent.get(request.agent_id);
      if (existingBindingId) {
        const existingBinding = this.bindings.get(existingBindingId);
        if (existingBinding && existingBinding.status === 'active') {
          return {
            success: false,
            error: `Agent ${request.agent_id} already bound to ${existingBinding.intent_id}`,
          };
        }
      }

      // Create binding
      const bindingId = `B.${request.agent_id}.${Date.now()}`;
      const binding: IntentBinding = {
        binding_id: bindingId,
        agent_id: request.agent_id,
        intent_id: request.intent_id,
        bound_intent_hash: intent.intent_hash,
        bound_at: new Date().toISOString(),
        bound_by: request.bound_by,
        scope_restrictions: request.scope_restrictions,
        status: 'active',
      };

      // Store
      this.bindings.set(bindingId, binding);
      this.bindingsByAgent.set(request.agent_id, bindingId);

      return {
        success: true,
        binding_id: bindingId,
        bound_intent_hash: intent.intent_hash,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get binding for an agent.
   */
  getAgentBinding(agentId: string): IntentBinding | undefined {
    const bindingId = this.bindingsByAgent.get(agentId);
    if (!bindingId) return undefined;
    return this.bindings.get(bindingId);
  }

  /**
   * Unbind an agent from its Intent.
   */
  unbindAgent(agentId: string): boolean {
    const bindingId = this.bindingsByAgent.get(agentId);
    if (!bindingId) return false;

    const binding = this.bindings.get(bindingId);
    if (binding) {
      binding.status = 'revoked';
    }

    this.bindingsByAgent.delete(agentId);
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // INTENT CONSULTATION (The Heart of Commander's Intent)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Consult Commander's Intent for a decision.
   * This is how agents decide what to do when uncertain.
   *
   * The consultation process:
   * 1. Check red lines (absolute prohibitions)
   * 2. Evaluate constraints
   * 3. Assess if action advances objective
   * 4. Consider autonomy level
   * 5. Return recommendation with reasoning
   */
  async consultIntent(request: IntentConsultationRequest): Promise<IntentConsultationResult> {
    const intent = this.intents.get(request.intent_id);
    if (!intent) {
      return {
        recommendation: 'abort',
        confidence: 1.0,
        reasoning: [`Intent not found: ${request.intent_id}`],
        constraints_evaluated: [],
        red_line_violation: false,
        advances_objective: false,
      };
    }

    const reasoning: string[] = [];
    const constraintsEvaluated: IntentConsultationResult['constraints_evaluated'] = [];
    let redLineViolation = false;
    let violatedRedLine: string | undefined;
    let recommendation: IntentConsultationResult['recommendation'] = 'proceed';

    // ─────────────────────────────────────────────────────────────────────────
    // 1. CHECK RED LINES (Absolute prohibitions - never cross)
    // ─────────────────────────────────────────────────────────────────────────
    for (const redLine of intent.red_lines) {
      const violated = this.checkRedLineViolation(request.situation, request.options, redLine);
      if (violated) {
        redLineViolation = true;
        violatedRedLine = redLine;
        recommendation = 'abort';
        reasoning.push(`RED LINE VIOLATED: "${redLine}"`);
        break;
      }
    }

    if (redLineViolation) {
      return {
        recommendation: 'abort',
        confidence: 1.0,
        reasoning,
        constraints_evaluated: [],
        red_line_violation: true,
        violated_red_line: violatedRedLine,
        advances_objective: false,
      };
    }

    reasoning.push('No red lines violated');

    // ─────────────────────────────────────────────────────────────────────────
    // 2. EVALUATE CONSTRAINTS
    // ─────────────────────────────────────────────────────────────────────────
    let criticalConstraintFailed = false;
    let requiredConstraintFailed = false;

    for (const constraint of intent.constraints) {
      const result = this.evaluateConstraint(constraint, request.situation, request.options);
      constraintsEvaluated.push({
        constraint_id: constraint.id,
        passed: result.passed,
        notes: result.notes,
      });

      if (!result.passed) {
        reasoning.push(`Constraint ${constraint.id} (${constraint.severity}): ${result.notes}`);

        if (constraint.severity === 'critical') {
          criticalConstraintFailed = true;
          if (constraint.on_violation === 'terminate') {
            recommendation = 'abort';
          } else if (constraint.on_violation === 'escalate') {
            recommendation = 'escalate';
          } else if (constraint.on_violation === 'block') {
            recommendation = 'escalate';
          }
        } else if (constraint.severity === 'required') {
          requiredConstraintFailed = true;
          if (recommendation === 'proceed') {
            recommendation = 'proceed_with_caution';
          }
        }
        // Advisory constraints just add notes
      } else {
        reasoning.push(`Constraint ${constraint.id}: PASSED`);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. ASSESS OBJECTIVE ADVANCEMENT
    // ─────────────────────────────────────────────────────────────────────────
    const advancesObjective = this.assessObjectiveAdvancement(
      intent.objective,
      request.situation,
      request.options
    );

    if (advancesObjective) {
      reasoning.push(`Action advances objective: "${intent.objective}"`);
    } else {
      reasoning.push(`Action may not directly advance objective`);
      if (recommendation === 'proceed') {
        recommendation = 'proceed_with_caution';
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. CONSIDER AUTONOMY LEVEL
    // ─────────────────────────────────────────────────────────────────────────
    switch (intent.autonomy_level) {
      case 'strict':
        // Strict mode: escalate anything uncertain
        if (recommendation === 'proceed_with_caution') {
          recommendation = 'escalate';
          reasoning.push('Strict mode: uncertain actions require escalation');
        }
        break;

      case 'guided':
        // Guided mode: default behavior
        break;

      case 'autonomous':
        // Autonomous mode: proceed unless blocked
        if (recommendation === 'proceed_with_caution' && !criticalConstraintFailed) {
          recommendation = 'proceed';
          reasoning.push('Autonomous mode: proceeding with caution warnings');
        }
        break;

      case 'exploratory':
        // Exploratory mode: allow novel approaches
        if (recommendation === 'escalate' && !criticalConstraintFailed && !redLineViolation) {
          recommendation = 'proceed_with_caution';
          reasoning.push('Exploratory mode: allowing novel approach');
        }
        break;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. CALCULATE CONFIDENCE
    // ─────────────────────────────────────────────────────────────────────────
    let confidence = 1.0;
    if (criticalConstraintFailed) confidence -= 0.4;
    if (requiredConstraintFailed) confidence -= 0.2;
    if (!advancesObjective) confidence -= 0.2;
    confidence = Math.max(0.1, confidence);

    // ─────────────────────────────────────────────────────────────────────────
    // 6. GENERATE ALTERNATIVES (if blocked)
    // ─────────────────────────────────────────────────────────────────────────
    let alternatives: string[] | undefined;
    if (recommendation === 'escalate' || recommendation === 'abort') {
      alternatives = this.generateAlternatives(intent, request);
    }

    return {
      recommendation,
      confidence,
      reasoning,
      constraints_evaluated: constraintsEvaluated,
      red_line_violation: redLineViolation,
      violated_red_line: violatedRedLine,
      advances_objective: advancesObjective,
      alternatives,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPER METHODS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Compute SHA-256 hash of Intent for integrity verification.
   */
  private computeIntentHash(intent: IntentSymbol): string {
    const hashInput = JSON.stringify({
      objective: intent.objective,
      end_state: intent.end_state,
      constraints: intent.constraints,
      red_lines: intent.red_lines,
      autonomy_level: intent.autonomy_level,
    });

    return createHash('sha256').update(hashInput).digest('hex').substring(0, 16);
  }

  /**
   * Check if an action would violate a red line.
   * This is a simple keyword-based check; could be enhanced with LLM.
   */
  private checkRedLineViolation(
    situation: string,
    options: IntentConsultationRequest['options'],
    redLine: string
  ): boolean {
    const combined = `${situation} ${options.map(o => o.description).join(' ')}`.toLowerCase();
    const redLineTerms = redLine.toLowerCase().split(/\s+/);

    // Check for negative indicators
    const negativePatterns = [
      'access non-public',
      'contact competitor',
      'share confidential',
      'bypass security',
      'modify production',
      'delete without backup',
    ];

    for (const pattern of negativePatterns) {
      if (redLine.toLowerCase().includes(pattern.split(' ')[1]) && combined.includes(pattern.split(' ')[0])) {
        return true;
      }
    }

    // Simple term matching (can be enhanced)
    const matchCount = redLineTerms.filter(term => combined.includes(term)).length;
    return matchCount > redLineTerms.length * 0.7;
  }

  /**
   * Evaluate a constraint against the current situation.
   */
  private evaluateConstraint(
    constraint: Constraint,
    situation: string,
    options: IntentConsultationRequest['options']
  ): { passed: boolean; notes: string } {
    // If there's a machine-checkable condition, evaluate it
    if (constraint.condition) {
      // Future: parse and evaluate condition
      // For now, assume passed unless obviously violated
    }

    // Simple heuristic evaluation
    const combined = `${situation} ${options.map(o => o.description).join(' ')}`.toLowerCase();
    const constraintTerms = constraint.description.toLowerCase();

    // Check for violation indicators
    if (constraintTerms.includes('only') || constraintTerms.includes('must not')) {
      // This is a restrictive constraint
      // Check if the action seems to violate it
      const violationIndicators = ['bypass', 'skip', 'ignore', 'without'];
      for (const indicator of violationIndicators) {
        if (combined.includes(indicator)) {
          return {
            passed: false,
            notes: `Possible violation: action contains "${indicator}"`,
          };
        }
      }
    }

    return { passed: true, notes: 'Constraint appears satisfied' };
  }

  /**
   * Assess whether an action advances the mission objective.
   */
  private assessObjectiveAdvancement(
    objective: string,
    situation: string,
    options: IntentConsultationRequest['options']
  ): boolean {
    const objectiveTerms = objective.toLowerCase().split(/\s+/);
    const combined = `${situation} ${options.map(o => o.description).join(' ')}`.toLowerCase();

    // Count how many objective terms appear in the action context
    const matchCount = objectiveTerms.filter(term =>
      term.length > 3 && combined.includes(term)
    ).length;

    return matchCount >= 2 || matchCount >= objectiveTerms.length * 0.3;
  }

  /**
   * Generate alternative actions when the primary is blocked.
   */
  private generateAlternatives(
    intent: IntentSymbol,
    request: IntentConsultationRequest
  ): string[] {
    const alternatives: string[] = [];

    // Suggest escalation
    alternatives.push('Escalate to coordinator for guidance');

    // Suggest waiting
    if (intent.autonomy_level !== 'strict') {
      alternatives.push('Wait for additional context before proceeding');
    }

    // Suggest modification
    alternatives.push('Modify approach to avoid constraint violations');

    // If there are acceptable tradeoffs, suggest using them
    if (intent.acceptable_tradeoffs && intent.acceptable_tradeoffs.length > 0) {
      alternatives.push(`Consider tradeoff: ${intent.acceptable_tradeoffs[0]}`);
    }

    return alternatives;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

export const intentManager = new IntentManager();

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const createIntent = (request: CreateIntentRequest) => intentManager.createIntent(request);
export const getIntent = (id: string) => intentManager.getIntent(id);
export const bindAgent = (request: BindAgentRequest) => intentManager.bindAgent(request);
export const consultIntent = (request: IntentConsultationRequest) => intentManager.consultIntent(request);
