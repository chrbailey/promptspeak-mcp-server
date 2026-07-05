import { describe, it, expect } from 'vitest';
import { HandshakeProtocol, type HandshakeCapabilities } from '../../../src/handshake/protocol.js';

const caps: HandshakeCapabilities = {
  version: '0.2',
  verbCount: 36,
  status: 'active',
  namespaces: ['ps:core'],
};

describe('Handshake HMAC challenge–response', () => {
  it('verifies a correct proof for an issued challenge', () => {
    const verifier = new HandshakeProtocol({ ...caps }, { secret: 'shared-secret' });
    const prover = new HandshakeProtocol({ ...caps }, { secret: 'shared-secret' });

    const challenge = verifier.issueChallenge();
    expect(challenge.nonce).toMatch(/^[0-9a-f]{32}$/);

    const mac = prover.proveChallenge(challenge.nonce);
    expect(verifier.verifyChallenge(challenge.nonce, mac)).toEqual({ verified: true });
  });

  it('rejects a proof computed with the wrong secret', () => {
    const verifier = new HandshakeProtocol({ ...caps }, { secret: 'right' });
    const attacker = new HandshakeProtocol({ ...caps }, { secret: 'wrong' });

    const { nonce } = verifier.issueChallenge();
    const result = verifier.verifyChallenge(nonce, attacker.proveChallenge(nonce));
    expect(result.verified).toBe(false);
    expect(result.reason).toBe('MAC mismatch');
  });

  it('rejects unknown / replayed nonces (single-use)', () => {
    const p = new HandshakeProtocol({ ...caps }, { secret: 's' });
    const { nonce } = p.issueChallenge();
    const mac = p.proveChallenge(nonce);

    expect(p.verifyChallenge(nonce, mac).verified).toBe(true);
    // Second attempt with same nonce must fail (consumed).
    const replay = p.verifyChallenge(nonce, mac);
    expect(replay.verified).toBe(false);
    expect(replay.reason).toContain('Unknown');
  });

  it('rejects expired challenges', () => {
    const p = new HandshakeProtocol({ ...caps }, { secret: 's', challengeTtlMs: -1 });
    const { nonce } = p.issueChallenge();
    const result = p.verifyChallenge(nonce, p.proveChallenge(nonce));
    expect(result.verified).toBe(false);
    expect(result.reason).toBe('Challenge expired');
  });

  it('rejects malformed MACs without throwing', () => {
    const p = new HandshakeProtocol({ ...caps }, { secret: 's' });
    const { nonce } = p.issueChallenge();
    const result = p.verifyChallenge(nonce, 'not-hex-!!');
    expect(result.verified).toBe(false);
  });

  it('reports ephemeral vs configured secret', () => {
    expect(new HandshakeProtocol({ ...caps }).hasSharedSecret()).toBe(false);
    expect(new HandshakeProtocol({ ...caps }, { secret: 'x' }).hasSharedSecret()).toBe(true);
  });

  it('preserves the existing version-check / echo behavior', () => {
    const p = new HandshakeProtocol({ ...caps }, { secret: 's' });
    expect(p.respond('::check{ps:version}').echo).toBe('ps:0.2 |verbs:36 |status:active');
  });
});
