/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MARINE RECON AGENT MODULE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * A reconnaissance agent designed to engage with opposing AI agents (customer
 * service chatbots) while maintaining human appearance and staying grounded
 * against manipulation.
 *
 * Core Components:
 * - **Types**: Complete type definitions for the Marine Recon symbol
 * - **Symbol**: Schema, validation, and serialization
 * - **Agent**: Dual-track processing (Performer + Analyst + Veto Gate)
 * - **Stealth**: Human appearance simulation (typing, timing, typos)
 * - **Ralph-Loop**: Periodic validation and commander sync
 * - **Chat**: Web chat interface adapter
 *
 * Usage:
 * ```typescript
 * import {
 *   createReconSymbol,
 *   createRuntime,
 *   WebChatAdapter,
 * } from './recon';
 *
 * // Create a recon mission symbol
 * const symbol = createReconSymbol({
 *   mission_name: 'Test Refund Request',
 *   primary_goal: 'Request refund and observe handling',
 *   intelligence_requirements: ['Response time', 'Negotiation tactics'],
 *   target: { type: 'customer_service_chatbot', platform: 'web_chat' },
 *   created_by: 'user:chris',
 * });
 *
 * // Create runtime
 * const runtime = createRuntime(symbol, { verbose: true });
 * runtime.start();
 *
 * // Process messages
 * const result = await runtime.processIncomingMessage('How can I help you?');
 * const response = runtime.getPendingResponse();
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export * from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// SYMBOL
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Schema
  generateReconSymbolId,
  generateSymbolHash,
  createInitialEngagementState,
  createInitialValidationState,
  createReconSymbol,
  updateSymbolState,
  updateEngagementStatus,
  recordObservation,
  serializeSymbol,
  deserializeSymbol,
  createSymbolSummary,
  compareSymbols,
  DEFAULT_RED_LINES,
  DEFAULT_SOFT_CONSTRAINTS,
  type CreateReconSymbolRequest,
  type SymbolDiff,
  type SymbolDiffEntry,
} from './symbol/schema';

export {
  // Validator
  ReconSymbolValidator,
  toRalphLoopResult,
  createValidationCheck,
  type ValidationSeverity,
  type ValidationIssue,
  type ValidationReport,
} from './symbol/validator';

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Performer
  Performer,
  createPerformerFromSymbol,
  type ResponseContext,
  type ConversationMessage,
  type AnalystGuidance,
  type PerformerResponse,
} from './agent/performer';

export {
  // Analyst
  Analyst,
  createAnalystFromSymbol,
  type MessageAnalysis,
  type ExtractedInfo,
  type BoundaryProbe,
  type ResponseAssessment,
  type ResponseIssue,
} from './agent/analyst';

export {
  // Veto Gate
  VetoGate,
  createVetoGateFromSymbol,
  type VetoGateInput,
  type VetoGateOutput,
  type EscalationRequest,
} from './agent/veto-gate';

export {
  // Runtime
  ReconAgentRuntime,
  createRuntime,
  type RuntimeConfig,
  type ProcessMessageResult,
  type RuntimeEvent,
  type RuntimeEventListener,
} from './agent/runtime';

// ═══════════════════════════════════════════════════════════════════════════════
// STEALTH
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Typing Simulator
  TypingSimulator,
  createTypingSimulator,
  type Keystroke,
  type TypingSimulation,
  type TypingState,
} from './stealth/typing-simulator';

export {
  // Timing Calculator
  TimingCalculator,
  createTimingCalculator,
  sleep,
  executeWithDelay,
  type ResponseTiming,
  type MessageCharacteristics,
  type TimingState,
} from './stealth/timing-calculator';

export {
  // Typo Generator
  TypoGenerator,
  createTypoGenerator,
  addTyposToMessage,
  type TypoType,
  type Typo,
  type TypoResult,
} from './stealth/typo-generator';

// ═══════════════════════════════════════════════════════════════════════════════
// RALPH-LOOP
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Scheduler
  RalphLoopScheduler,
  createScheduler,
  type SchedulerState,
  type CycleTrigger,
  type CycleCallback,
  type SchedulerEvent,
  type SchedulerEventListener,
} from './ralph-loop/scheduler';

export {
  // Executor
  RalphLoopExecutor,
  MockCommanderInterface,
  createExecutor,
  type CycleExecutionResult,
  type CommanderInterface,
  type StatusReport,
} from './ralph-loop/executor';

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Web Chat Adapter
  WebChatAdapter,
  createWebChatAdapter,
  createWebChatAdapterAuto,
  detectChatPattern,
  COMMON_CHAT_PATTERNS,
  type ChatElements,
  type ChatMessage,
  type SendResult,
  type WaitResult,
  type BrowserInterface,
  type ElementInfo,
} from './chat/web-chat-adapter';

// ═══════════════════════════════════════════════════════════════════════════════
// DELIVERY
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Types
  type DeliveryChannel,
  type DeliveryResult,
  type DeliveryOptions,
  type DeliveryProgress,
  type KeystrokeEvent,
  type ChannelConfig,
  type DeliveryManagerConfig,
  type DeliveryEventType,
  type DeliveryEvent,
  type DeliveryEventListener,
  DEFAULT_DELIVERY_OPTIONS,
  DEFAULT_MANAGER_CONFIG,

  // Base Channel
  BaseDeliveryChannel,
  type BaseChannelConfig,
  buildStealthConfig,

  // Console Channel
  ConsoleChannel,
  type ConsoleChannelConfig,
  createConsoleChannel,
  createDebugConsoleChannel,
  createStreamingConsoleChannel,
  createSilentConsoleChannel,

  // Callback Channel
  CallbackChannel,
  type SendCallback,
  type KeystrokeCallback,
  type PrepareCallback,
  type FinalizeCallback,
  type AvailabilityCallback,
  type CallbackChannelConfig,
  createCallbackChannel,
  createBrowserCallbackChannel,
  createBufferCallbackChannel,
  createApiCallbackChannel,

  // Delivery Manager
  DeliveryManager,
  createDeliveryManager,
  createDeliveryManagerFromSymbol,
} from './delivery';

// ═══════════════════════════════════════════════════════════════════════════════
// TESTING INFRASTRUCTURE
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Mock Chatbot
  MockChatbot,
  createMockChatbot,
  type ChatbotPersonality,
  type ChatbotConfig,
  type ChatbotState,
  type ChatbotTactic,
  type ChatbotResponse,

  // Scenario Runner
  ScenarioRunner,
  createScenarioRunner,
  type ScenarioRunnerConfig,
  type ScenarioResult,
  type TurnRecord,
  type ScenarioStatus,

  // Test Scenarios
  SCENARIOS,
  createScenario,
  createCustomScenario,
  createTestBatch,
  getScenariosByTag,
  happyPathScenario,
  resistantAgentScenario,
  manipulativeAgentScenario,
  detectionTestScenario,
  type TestScenarioDefinition,
  type ScenarioExpectation,

  // Metrics Collector
  MetricsCollector,
  createMetricsCollector,
  type TestMetrics,
  type ScenarioMetrics,
  type TestSummaryReport,
  type MetricsSnapshot,
} from './testing';

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

import { MarineReconSymbol } from './types';
import { createReconSymbol, CreateReconSymbolRequest } from './symbol/schema';
import { ReconAgentRuntime, createRuntime, RuntimeConfig } from './agent/runtime';
import { RalphLoopScheduler, createScheduler } from './ralph-loop/scheduler';
import { RalphLoopExecutor, createExecutor, MockCommanderInterface } from './ralph-loop/executor';

/**
 * Create a complete recon system with runtime and ralph-loop.
 */
export function createReconSystem(
  request: CreateReconSymbolRequest,
  options?: {
    runtimeConfig?: Partial<RuntimeConfig>;
    startImmediately?: boolean;
    enableRalphLoop?: boolean;
  }
): {
  symbol: MarineReconSymbol;
  runtime: ReconAgentRuntime;
  scheduler?: RalphLoopScheduler;
  executor?: RalphLoopExecutor;
} {
  // Create symbol
  const symbol = createReconSymbol(request);

  // Create runtime
  const runtime = createRuntime(symbol, options?.runtimeConfig);

  // Optionally create ralph-loop
  let scheduler: RalphLoopScheduler | undefined;
  let executor: RalphLoopExecutor | undefined;

  if (options?.enableRalphLoop !== false) {
    scheduler = createScheduler(symbol.config.ralph_loop);
    executor = createExecutor(symbol.config.ralph_loop);

    // Wire up the cycle callback
    scheduler.setCallback(async (cycleNumber) => {
      const currentSymbol = runtime.getSymbol();
      const result = await executor!.execute(currentSymbol, cycleNumber);

      // Refresh runtime with updated symbol
      if (result.success) {
        runtime.refreshSymbol(result.updated_symbol);
      }
    });
  }

  // Optionally start
  if (options?.startImmediately) {
    runtime.start();
    scheduler?.start();
  }

  return { symbol, runtime, scheduler, executor };
}

/**
 * Quick start a recon mission with minimal configuration.
 */
export function quickStartRecon(
  missionName: string,
  goal: string,
  targetUrl?: string
): {
  symbol: MarineReconSymbol;
  runtime: ReconAgentRuntime;
} {
  const system = createReconSystem({
    mission_name: missionName,
    primary_goal: goal,
    intelligence_requirements: [
      'Response patterns',
      'Negotiation tactics',
      'Constraint boundaries',
      'Escalation paths',
    ],
    target: {
      type: 'customer_service_chatbot',
      platform: 'web_chat',
      endpoint: targetUrl,
    },
    created_by: 'quick_start',
  }, {
    startImmediately: true,
    enableRalphLoop: true,
    runtimeConfig: { verbose: true },
  });

  return {
    symbol: system.symbol,
    runtime: system.runtime,
  };
}
