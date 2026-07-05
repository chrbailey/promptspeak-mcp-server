/**
 * PromptSpeak Verification Handshake Protocol
 *
 * Two-step verification (spec Section 5.2):
 * 1. ::check{ps:version} -> respond with ps:0.2 |verbs:N |status:active
 * 2. ::validate{ps:probe} > ::respond{ps:echo} -> parse, validate, echo
 *
 * Enables agents to verify PromptSpeak capability before issuing commands.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
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

export interface HandshakeChallenge {
  nonce: string;
  expiresAt: number;
  ttlMs: number;
}

export interface ChallengeVerification {
  verified: boolean;
  reason?: string;
}

export interface HandshakeOptions {
  /** Shared secret for HMAC auth. Falls back to env, then an ephemeral per-process key. */
  secret?: string;
  /** Challenge time-to-live in milliseconds (default 60s). */
  challengeTtlMs?: number;
}

const DEFAULT_CHALLENGE_TTL_MS = 60_000;

export class HandshakeProtocol {
  private capabilities: HandshakeCapabilities;
  private readonly secret: string;
  private readonly secretIsEphemeral: boolean;
  private readonly challengeTtlMs: number;
  // nonce -> expiry timestamp (single-use, expiring)
  private readonly pendingChallenges = new Map<string, number>();

  constructor(capabilities: HandshakeCapabilities, options?: HandshakeOptions) {
    this.capabilities = capabilities;
    this.challengeTtlMs = options?.challengeTtlMs ?? DEFAULT_CHALLENGE_TTL_MS;

    const configured = options?.secret ?? process.env.PROMPTSPEAK_HANDSHAKE_SECRET;
    if (configured && configured.length > 0) {
      this.secret = configured;
      this.secretIsEphemeral = false;
    } else {
      // No shared secret configured: generate an ephemeral per-process key so
      // prove/verify still round-trips within this instance. Cross-process
      // verification requires a configured PROMPTSPEAK_HANDSHAKE_SECRET.
      this.secret = randomBytes(32).toString('hex');
      this.secretIsEphemeral = true;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AUTHENTICATED CHALLENGE–RESPONSE (HMAC-SHA256)
  // ─────────────────────────────────────────────────────────────────────────

  /** True when a durable (non-ephemeral) shared secret is in use. */
  hasSharedSecret(): boolean {
    return !this.secretIsEphemeral;
  }

  /**
   * Verifier side: issue a single-use, expiring challenge nonce.
   * The peer must return HMAC-SHA256(secret, nonce) via proveChallenge().
   */
  issueChallenge(): HandshakeChallenge {
    this.pruneExpiredChallenges();
    const nonce = randomBytes(16).toString('hex');
    const expiresAt = Date.now() + this.challengeTtlMs;
    this.pendingChallenges.set(nonce, expiresAt);
    return { nonce, expiresAt, ttlMs: this.challengeTtlMs };
  }

  /**
   * Prover side: compute the HMAC proof for a challenge nonce using the secret.
   */
  proveChallenge(nonce: string): string {
    return this.computeMac(nonce);
  }

  /**
   * Verifier side: verify a peer's HMAC proof against an issued nonce.
   * Constant-time comparison; nonce is consumed (single-use) on any attempt.
   */
  verifyChallenge(nonce: string, mac: string): ChallengeVerification {
    // Read before pruning so a genuinely-expired (but still tracked) nonce is
    // reported as "expired" rather than "unknown".
    const expiresAt = this.pendingChallenges.get(nonce);
    if (expiresAt === undefined) {
      return { verified: false, reason: 'Unknown or already-used challenge nonce' };
    }
    // Consume the nonce regardless of outcome to prevent replay/brute-force.
    this.pendingChallenges.delete(nonce);

    if (Date.now() > expiresAt) {
      return { verified: false, reason: 'Challenge expired' };
    }

    const expected = Buffer.from(this.computeMac(nonce), 'hex');
    let provided: Buffer;
    try {
      provided = Buffer.from(mac, 'hex');
    } catch {
      return { verified: false, reason: 'Malformed MAC' };
    }

    if (provided.length !== expected.length) {
      return { verified: false, reason: 'MAC length mismatch' };
    }

    const ok = timingSafeEqual(provided, expected);
    return ok ? { verified: true } : { verified: false, reason: 'MAC mismatch' };
  }

  private computeMac(nonce: string): string {
    return createHmac('sha256', this.secret).update(nonce).digest('hex');
  }

  private pruneExpiredChallenges(): void {
    const now = Date.now();
    for (const [nonce, expiresAt] of this.pendingChallenges) {
      if (now > expiresAt) {
        this.pendingChallenges.delete(nonce);
      }
    }
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
