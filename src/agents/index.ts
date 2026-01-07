/**
 * Multi-Agent Data Intelligence Framework (MADIF)
 *
 * Main module exports for the agent orchestration system.
 */

// Types
export * from './types.js';

// Database
export {
  initializeAgentDatabase,
  getAgentDatabase,
  closeAgentDatabase,
  createCampaign,
  getCampaign,
  updateCampaign,
  listCampaigns,
  createAgentDefinition,
  getAgentDefinition,
  listAgentDefinitions,
  createAgentInstance,
  getAgentInstance,
  updateAgentInstance,
  listAgentInstances,
  createDataSource,
  getDataSource,
  updateDataSourceUsage,
  recordAgentAuditEvent,
  queryAgentAuditLog,
} from './database.js';

// Registry
export {
  AgentRegistry,
  initializeAgentRegistry,
  getAgentRegistry,
} from './registry.js';

// Proposal Manager
export {
  AgentProposalManager,
  initializeProposalManager,
  getProposalManager,
  setHoldManager,
} from './proposal-manager.js';

// Templates
export {
  getTemplateForSourceType,
  getAllTemplates,
  getTemplateById,
  TemplateRegistry,
  RestApiConsumerTemplate,
  WebScraperTemplate,
  GitHubScannerTemplate,
  HuggingFaceLoaderTemplate,
  DocumentProcessorTemplate,
  FeedMonitorTemplate,
  GraphQLApiTemplate,
  SoapServiceTemplate,
  DatabaseQueryTemplate,
} from './templates/index.js';

// Integration (connects MADIF to PromptSpeak MCP server)
export {
  initializeAgentSystem,
  isAgentSystemInitialized,
  getHoldManagerAdapter,
} from './integration.js';

// MCP Tools
export {
  orchestrationToolDefinitions,
  handleOrchestrationTool,
} from './tools.js';
