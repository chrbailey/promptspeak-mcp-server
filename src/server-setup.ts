/**
 * MCP Server Factory
 *
 * Creates fully configured MCP Server instances.
 * Shared by stdio (server.ts) and HTTP (http-server.ts) transports.
 *
 * - ensureSubsystems(): call once at startup to initialize singletons
 * - createMcpServer(): creates a new Server instance (cheap after first call)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { buildToolRegistry } from './tools/index.js';
import { dispatchTool } from './handlers/index.js';
import { initializeServer } from './server-init.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

let _initialized = false;
let _tools: Tool[] | null = null;

/**
 * Initialize subsystems once. Safe to call multiple times (no-ops after first).
 */
export async function ensureSubsystems(): Promise<void> {
  if (_initialized) return;
  await initializeServer();
  _tools = buildToolRegistry();
  _initialized = true;
}

/**
 * Create a new MCP Server instance. Subsystems must be initialized first.
 * Lightweight — just wires handlers to shared singletons.
 */
export async function createMcpServer(): Promise<Server> {
  await ensureSubsystems();

  const server = new Server(
    { name: 'promptspeak-mcp-server', version: '0.4.1' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: _tools! }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return dispatchTool(request.params.name, request.params.arguments ?? {});
  });

  return server;
}
