#!/usr/bin/env node
/**
 * PromptSpeak MCP Server
 *
 * Pre-execution governance for AI agents via Model Context Protocol.
 * - Frame validation (ps_validate)
 * - Governed execution (ps_execute)
 * - Delegation management (ps_delegate)
 * - State and drift monitoring (ps_state)
 * - Operator control plane (ps_config_*, ps_confidence_*)
 * - Symbol registry (ps_symbol_*)
 * - Human-in-the-loop holds (ps_hold_*)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { buildToolRegistry } from './tools/index.js';
import { dispatchTool } from './handlers/index.js';
import { initializeServer, createLogger } from './server-init.js';
const logger = createLogger('Server');

// ============================================================================
// SERVER SETUP
// ============================================================================

async function main() {
  // Initialize all server subsystems
  const initResult = await initializeServer();

  // Log initialization results
  if (initResult.success) {
    logger.info('Server initialization complete');
  } else {
    logger.warn('Server initialized with errors', {
      errors: initResult.errors,
      policyLoader: initResult.subsystems.policyLoader.initialized,
      symbolManager: initResult.subsystems.symbolManager.initialized,
    });
  }

  // Build tool registry
  const TOOLS = buildToolRegistry();
  logger.info('Tool registry built', { toolCount: TOOLS.length });

  // Create MCP server
  const server = new Server(
    {
      name: 'promptspeak-mcp-server',
      version: '0.2.0'
    },
    {
      capabilities: {
        tools: {},
      }
    }
  );

  // Handle list tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Handle tool calls - uses dispatcher
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return dispatchTool(request.params.name, request.params.arguments ?? {});
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('PromptSpeak MCP Server running on stdio');
}

main().catch((error) => {
  logger.error('Server failed to start', error instanceof Error ? error : undefined);
  process.exit(1);
});
