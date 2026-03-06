/**
 * PromptSpeak Verification Handshake Protocol
 *
 * Two-step verification (spec Section 5.2):
 * 1. ::check{ps:version} -> respond with ps:0.2 |verbs:N |status:active
 * 2. ::validate{ps:probe} > ::respond{ps:echo} -> parse, validate, echo
 *
 * Enables agents to verify PromptSpeak capability before issuing commands.
 */

import { parse, ParseError } from '../grammar/parser.js';
import { expand } from '../grammar/expander.js';

export interface HandshakeCapabilities {
  version: string;
  verbCount: number;
  status: 'active' | 'degraded' | 'offline';
  namespaces: string[];
}

export interface HandshakeResponse {
  success: boolean;
  echo?: string;
  expanded?: string;
  capabilities?: HandshakeCapabilities;
  error?: string;
}

export class HandshakeProtocol {
  private capabilities: HandshakeCapabilities;

  constructor(capabilities: HandshakeCapabilities) {
    this.capabilities = capabilities;
  }

  /**
   * Generate the probe expression for step 2 of the handshake.
   * The caller sends this to the remote agent to verify it can parse PromptSpeak.
   */
  initiate(): { probe: string; expected: string } {
    const probe = '::validate{ps:probe} > ::respond{ps:echo}';
    const expected = expand(parse(probe));
    return { probe, expected };
  }

  /**
   * Handle an incoming handshake probe or version check.
   * Returns a well-formed response or graceful fallback.
   */
  respond(input: string): HandshakeResponse {
    const trimmed = input.trim();

    // Step 1: Version check
    if (trimmed === '::check{ps:version}') {
      return {
        success: true,
        echo: `ps:${this.capabilities.version} |verbs:${this.capabilities.verbCount} |status:${this.capabilities.status}`,
        capabilities: this.capabilities,
      };
    }

    // Step 2: Parse and echo
    try {
      const ast = parse(trimmed);
      const expanded = expand(ast);
      return {
        success: true,
        echo: trimmed,
        expanded,
        capabilities: this.capabilities,
      };
    } catch (error) {
      // Graceful fallback for malformed input
      return {
        success: false,
        error: error instanceof ParseError
          ? `Parse failed: ${error.message}`
          : `Handshake error: ${error instanceof Error ? error.message : String(error)}`,
        capabilities: this.capabilities,
      };
    }
  }

  /**
   * Report this server's capabilities.
   */
  getCapabilities(): HandshakeCapabilities {
    return { ...this.capabilities };
  }

  /**
   * Update capabilities (e.g., after seeding new verbs).
   */
  updateCapabilities(partial: Partial<HandshakeCapabilities>): void {
    Object.assign(this.capabilities, partial);
  }
}
