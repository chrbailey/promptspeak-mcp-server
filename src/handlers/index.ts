/**
 * ===============================================================================
 * HANDLERS MODULE
 * ===============================================================================
 *
 * Exports the tool dispatcher and related utilities for MCP tool handling.
 */

export {
  dispatchTool,
  isToolRegistered,
  getRegisteredTools,
  getToolCount,
  getToolsByCategory,
} from './tool-dispatcher.js';

// Recon tools
export {
  handleReconTool,
  handleReconCreate,
  handleReconProcess,
  handleReconStatus,
  handleReconComplete,
  reconToolDefinitions,
  getActiveMissions,
  getActiveMissionCount,
  isMissionActive,
  getStoredSymbol,
  clearAllMissions,
} from './recon-tools.js';
