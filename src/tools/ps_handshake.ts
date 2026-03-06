/**
 * Handshake MCP Tool Handlers
 *
 * ps_handshake_initiate — Start handshake (returns probe expression)
 * ps_handshake_respond  — Handle incoming handshake probe
 * ps_capability_get     — Report server capabilities
 */

import { HandshakeProtocol, type HandshakeCapabilities, type HandshakeResponse } from '../handshake/index.js';

// Module-level singleton set during server init
let protocol: HandshakeProtocol | undefined;

export function setHandshakeProtocol(p: HandshakeProtocol): void {
  protocol = p;
}

export function getHandshakeProtocol(): HandshakeProtocol | undefined {
  return protocol;
}

function requireProtocol(): HandshakeProtocol {
  if (!protocol) {
    // Create a default protocol if not initialized via server init
    protocol = new HandshakeProtocol({
      version: '0.2',
      verbCount: 0,
      status: 'active',
      namespaces: ['ps:core'],
    });
  }
  return protocol;
}

export interface InitiateResult {
  success: boolean;
  probe: string;
  expected: string;
  instructions: string;
}

export interface RespondRequest {
  input: string;
}

export function ps_handshake_initiate(): InitiateResult {
  const p = requireProtocol();
  const { probe, expected } = p.initiate();
  return {
    success: true,
    probe,
    expected,
    instructions: 'Send the probe expression to the remote agent. If they return a valid parse/expansion, they support PromptSpeak.',
  };
}

export function ps_handshake_respond(args: RespondRequest): HandshakeResponse {
  const p = requireProtocol();
  return p.respond(args.input);
}

export function ps_capability_get(): { success: boolean; capabilities: HandshakeCapabilities } {
  const p = requireProtocol();
  return {
    success: true,
    capabilities: p.getCapabilities(),
  };
}
