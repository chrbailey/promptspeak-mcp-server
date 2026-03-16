/**
 * MCP Server Factory
 *
 * Creates a fully configured MCP Server instance.
 * Shared by stdio (server.ts) and HTTP (http-server.ts) transports.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { buildToolRegistry } from './tools/index.js';
import { dispatchTool } from './handlers/index.js';
import { initializeServer } from './server-init.js';

export async function createMcpServer(): Promise<Server> {
  // Initialize subsystems (policies, symbols, governance DB)
  await initializeServer();

  // Build tool registry
  const TOOLS = buildToolRegistry();

  // Create MCP server
  const server = new Server(
    { name: 'promptspeak-mcp-server', version: '0.4.0' },
    { capabilities: { tools: {} } }
  );

  // Register handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return dispatchTool(request.params.name, request.params.arguments ?? {});
  });

  return server;
}
