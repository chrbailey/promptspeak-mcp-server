/**
 * ===============================================================================
 * DEPENDENCY INJECTION CONTAINER
 * ===============================================================================
 *
 * Provides dependency injection support for the multi-agent module.
 * Enables testability by allowing mock injection while maintaining
 * backward compatibility with existing singleton exports.
 *
 * Usage:
 *   // Production: use default singletons
 *   import { intentManager, agentRegistry, missionManager } from './multi_agent';
 *
 *   // Testing: create container with mocks
 *   const container = createMultiAgentContainer({
 *     intentManager: mockIntentManager,
 *     agentRegistry: mockAgentRegistry,
 *   });
 *
 * ===============================================================================
 */

// Import classes for creating new instances
import { IntentManager, intentManager as singletonIntentManager } from './intent-manager.js';
import { AgentRegistry, agentRegistry as singletonAgentRegistry } from './agent-registry.js';
import { MissionManager, missionManager as singletonMissionManager } from './mission.js';

// Re-export types for use elsewhere
export type { IntentManager, AgentRegistry, MissionManager };

// -------------------------------------------------------------------------------
// DEPENDENCY INTERFACES
// -------------------------------------------------------------------------------

/**
 * Dependencies that can be injected into AgentRegistry.
 */
export interface AgentRegistryDeps {
  intentManager?: IntentManager;
}

/**
 * Dependencies that can be injected into MissionManager.
 */
export interface MissionManagerDeps {
  intentManager?: IntentManager;
  agentRegistry?: AgentRegistry;
}

// -------------------------------------------------------------------------------
// CONTAINER INTERFACE
// -------------------------------------------------------------------------------

/**
 * Dependency injection container for multi-agent module.
 * Holds references to all core managers.
 */
export interface MultiAgentContainer {
  intentManager: IntentManager;
  agentRegistry: AgentRegistry;
  missionManager: MissionManager;
}

// -------------------------------------------------------------------------------
// CONTAINER FACTORY
// -------------------------------------------------------------------------------

/**
 * Create a new multi-agent container with optional dependency overrides.
 *
 * This factory creates fresh instances of all managers, wired together
 * with proper dependency injection. Use this for:
 * - Testing with mock dependencies
 * - Creating isolated instances for parallel operations
 * - Custom configurations
 *
 * @param overrides - Optional partial container to override specific managers
 * @returns A fully wired MultiAgentContainer
 *
 * @example
 * // Create container with mock intent manager for testing
 * const container = createMultiAgentContainer({
 *   intentManager: mockIntentManager,
 * });
 *
 * @example
 * // Create completely fresh isolated container
 * const container = createMultiAgentContainer();
 */
export function createMultiAgentContainer(
  overrides?: Partial<MultiAgentContainer>
): MultiAgentContainer {
  // Create intent manager (has no dependencies)
  const intentManager =
    overrides?.intentManager ?? new IntentManager();

  // Create agent registry with intent manager dependency
  const agentRegistry =
    overrides?.agentRegistry ?? new AgentRegistry({ intentManager });

  // Create mission manager with both dependencies
  const missionManager =
    overrides?.missionManager ?? new MissionManager({ intentManager, agentRegistry });

  return {
    intentManager,
    agentRegistry,
    missionManager,
  };
}

// -------------------------------------------------------------------------------
// DEFAULT SINGLETON CONTAINER
// -------------------------------------------------------------------------------

// Note: The default container uses the existing singletons for backward compatibility.
// It is lazily initialized on first access to avoid circular dependency issues.

let _container: MultiAgentContainer | null = null;

/**
 * Get the default singleton container.
 * Uses the existing singleton instances for backward compatibility.
 */
export function getDefaultContainer(): MultiAgentContainer {
  if (!_container) {
    _container = {
      intentManager: singletonIntentManager,
      agentRegistry: singletonAgentRegistry,
      missionManager: singletonMissionManager,
    };
  }
  return _container;
}

/**
 * Default singleton container.
 * Provides access to the shared singleton instances.
 *
 * For most production code, prefer using the individual singleton exports
 * (intentManager, agentRegistry, missionManager) directly.
 *
 * This container is primarily useful when you need to pass all dependencies
 * together or for consistency with the DI pattern.
 */
export const container: MultiAgentContainer = new Proxy({} as MultiAgentContainer, {
  get(_target, prop: keyof MultiAgentContainer) {
    return getDefaultContainer()[prop];
  },
});
