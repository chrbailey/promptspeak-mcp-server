import { describe, it, expect, beforeEach } from 'vitest';
import { HandshakeProtocol, type HandshakeCapabilities } from '../../../src/handshake/protocol.js';
import {
  setHandshakeProtocol,
  ps_handshake_initiate,
  ps_handshake_respond,
  ps_capability_get,
} from '../../../src/tools/ps_handshake.js';

describe('Handshake Protocol', () => {
  let protocol: HandshakeProtocol;
  const caps: HandshakeCapabilities = {
    version: '0.2',
    verbCount: 36,
    status: 'active',
    namespaces: ['ps:core', 'ps:gov'],
  };

  beforeEach(() => {
    protocol = new HandshakeProtocol({ ...caps });
    setHandshakeProtocol(protocol);
  });

  describe('HandshakeProtocol class', () => {
    it('should generate probe expression', () => {
      const { probe, expected } = protocol.initiate();
      expect(probe).toBe('::validate{ps:probe} > ::respond{ps:echo}');
      expect(expected).toContain('Validate');
      expect(expected).toContain('then');
      expect(expected).toContain('Respond');
    });

    it('should respond to version check', () => {
      const response = protocol.respond('::check{ps:version}');
      expect(response.success).toBe(true);
      expect(response.echo).toBe('ps:0.2 |verbs:36 |status:active');
      expect(response.capabilities).toBeDefined();
    });

    it('should respond to valid probe expression', () => {
      const response = protocol.respond('::validate{ps:probe} > ::respond{ps:echo}');
      expect(response.success).toBe(true);
      expect(response.echo).toBe('::validate{ps:probe} > ::respond{ps:echo}');
      expect(response.expanded).toContain('Validate');
    });

    it('should respond to arbitrary valid expression', () => {
      const response = protocol.respond('::analyze{document}[security]');
      expect(response.success).toBe(true);
      expect(response.expanded).toBe('Analyze document focusing on security');
    });

    it('should gracefully handle malformed input', () => {
      const response = protocol.respond('not valid promptspeak');
      expect(response.success).toBe(false);
      expect(response.error).toContain('Parse failed');
      // Still includes capabilities for discovery
      expect(response.capabilities).toBeDefined();
    });

    it('should return capabilities', () => {
      const result = protocol.getCapabilities();
      expect(result.version).toBe('0.2');
      expect(result.verbCount).toBe(36);
      expect(result.namespaces).toEqual(['ps:core', 'ps:gov']);
    });

    it('should allow capability updates', () => {
      protocol.updateCapabilities({ verbCount: 42 });
      expect(protocol.getCapabilities().verbCount).toBe(42);
    });
  });

  describe('MCP Tool Handlers', () => {
    it('ps_handshake_initiate should return probe and instructions', () => {
      const result = ps_handshake_initiate();
      expect(result.success).toBe(true);
      expect(result.probe).toBeDefined();
      expect(result.expected).toBeDefined();
      expect(result.instructions).toContain('Send');
    });

    it('ps_handshake_respond should handle version check', () => {
      const result = ps_handshake_respond({ input: '::check{ps:version}' });
      expect(result.success).toBe(true);
      expect(result.echo).toContain('ps:0.2');
    });

    it('ps_handshake_respond should handle probe', () => {
      const result = ps_handshake_respond({ input: '::analyze{doc}' });
      expect(result.success).toBe(true);
      expect(result.expanded).toBe('Analyze doc');
    });

    it('ps_handshake_respond should handle invalid input', () => {
      const result = ps_handshake_respond({ input: '???invalid' });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('ps_capability_get should return capabilities', () => {
      const result = ps_capability_get();
      expect(result.success).toBe(true);
      expect(result.capabilities.version).toBe('0.2');
      expect(result.capabilities.verbCount).toBe(36);
    });
  });
});
