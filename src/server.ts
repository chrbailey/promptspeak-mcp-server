#!/usr/bin/env node
/**
 * PromptSpeak MCP Server
 *
 * Model Context Protocol server that provides:
 * - Frame validation (ps_validate)
 * - Governed execution (ps_execute)
 * - Delegation management (ps_delegate)
 * - State and drift monitoring (ps_state)
 * - Operator control plane (ps_config_*, ps_confidence_*)
 * - Market intelligence resources (swarm://intelligence/*)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { buildToolRegistry } from './tools/index.js';
import { dispatchTool } from './handlers/index.js';
import { initializeServer, createLogger } from './server-init.js';
import { getIntelligenceResourceRegistry } from './swarm/index.js';

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

  // Initialize intelligence resource registry
  const resourceRegistry = getIntelligenceResourceRegistry();
  logger.info('Intelligence resource registry initialized');

  // Create MCP server
  const server = new Server(
    {
      name: 'promptspeak-mcp-server',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {},
        resources: {},
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

  // Handle list resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const resources = resourceRegistry.listResources();
    return {
      resources: resources.map(r => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType,
      })),
    };
  });

  // Handle read resource
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const content = resourceRegistry.readResource(request.params.uri);

    if (!content) {
      throw new Error(`Resource not found: ${request.params.uri}`);
    }

    return {
      contents: [
        {
          uri: content.uri,
          mimeType: content.mimeType,
          text: content.text,
        },
      ],
    };
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
