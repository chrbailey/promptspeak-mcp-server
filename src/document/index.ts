/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DOCUMENT PROCESSING MODULE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Main entry point for the document processing agent.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// Types
export * from './types.js';

// Parser
export { DocumentParser, getDocumentParser } from './parser.js';

// Extractor
export { SymbolExtractor, getSymbolExtractor, resetSymbolExtractor } from './extractor.js';

// Merger
export { SymbolMerger, getSymbolMerger, resetSymbolMerger } from './merger.js';

// Agent
export { DocumentProcessingAgent, getDocumentAgent, resetDocumentAgent } from './agent.js';

// MCP Tools
export { documentToolDefinitions, handleDocumentTool } from './tools.js';
