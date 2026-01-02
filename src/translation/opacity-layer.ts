// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK TRANSLATION LAYER - OPACITY LAYER
// ═══════════════════════════════════════════════════════════════════════════
// Manages opaque token encryption and resolution.
// Supports database-backed persistence with in-memory fallback.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  OpacityResolveRequest,
  OpacityResolveResponse,
  OpacityEncryptRequest,
  OpacityEncryptResponse,
  Extracted5WH,
  OpaqueExtracted5WH,
} from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE INTEGRATION (lazy loaded to avoid circular deps)
// ─────────────────────────────────────────────────────────────────────────────

let databaseModule: typeof import('../symbols/database.js') | null = null;

async function getDatabase() {
  if (!databaseModule) {
    try {
      databaseModule = await import('../symbols/database.js');
    } catch {
      return null;
    }
  }
  try {
    return databaseModule.getDatabase();
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OPACITY LAYER CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class OpacityLayer {
  private tokenCounter: number = 10000;
  private memoryCache: Map<string, string> = new Map(); // token -> plaintext
  private reverseCache: Map<string, string> = new Map(); // plaintext -> token
  private initialized: boolean = false;

  /**
   * Initialize the opacity layer, loading counter from database if available.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const db = await getDatabase();
    if (db) {
      try {
        const maxId = db.getMaxOpaqueId();
        this.tokenCounter = Math.max(this.tokenCounter, maxId);

        // Clean up expired tokens
        const cleaned = db.cleanupExpiredOpaqueTokens();
        if (cleaned > 0) {
          console.log(`[OpacityLayer] Cleaned up ${cleaned} expired tokens`);
        }
      } catch (error) {
        console.warn('[OpacityLayer] Failed to initialize from database:', error);
      }
    }

    this.initialized = true;
  }

  /**
   * Generate the next opaque token.
   */
  private generateToken(): string {
    this.tokenCounter++;
    return `::${this.tokenCounter.toString().padStart(5, '0')}`;
  }

  /**
   * Encrypt a single string value to an opaque token.
   */
  async encrypt(
    plaintext: string,
    options?: {
      symbolId?: string;
      fieldName?: string;
      expiresAt?: string;
    }
  ): Promise<string> {
    await this.initialize();

    // Skip empty strings
    if (!plaintext || plaintext.trim() === '') {
      return plaintext;
    }

    // Check if already encrypted (return existing token)
    const existing = this.reverseCache.get(plaintext);
    if (existing) {
      return existing;
    }

    // Generate new token
    const token = this.generateToken();

    // Store in memory cache
    this.memoryCache.set(token, plaintext);
    this.reverseCache.set(plaintext, token);

    // Persist to database if available
    const db = await getDatabase();
    if (db) {
      try {
        db.insertOpaqueToken({
          token,
          plaintext,
          symbolId: options?.symbolId,
          fieldName: options?.fieldName,
          expiresAt: options?.expiresAt,
        });
      } catch (error) {
        console.warn('[OpacityLayer] Failed to persist token:', error);
      }
    }

    return token;
  }

  /**
   * Encrypt an array of strings.
   */
  async encryptArray(
    values: string[],
    options?: { symbolId?: string; fieldPrefix?: string }
  ): Promise<string[]> {
    const results: string[] = [];
    for (let i = 0; i < values.length; i++) {
      const token = await this.encrypt(values[i], {
        symbolId: options?.symbolId,
        fieldName: options?.fieldPrefix ? `${options.fieldPrefix}[${i}]` : undefined,
      });
      results.push(token);
    }
    return results;
  }

  /**
   * Decrypt a single opaque token back to plaintext.
   */
  async decrypt(token: string): Promise<string | null> {
    await this.initialize();

    // Check if it's not a token
    if (!token.startsWith('::')) {
      return token;
    }

    // Check memory cache first
    const cached = this.memoryCache.get(token);
    if (cached !== undefined) {
      return cached;
    }

    // Try database
    const db = await getDatabase();
    if (db) {
      try {
        const row = db.getOpaqueToken(token);
        if (row) {
          // Update memory cache
          this.memoryCache.set(token, row.plaintext);
          this.reverseCache.set(row.plaintext, token);
          return row.plaintext;
        }
      } catch (error) {
        console.warn('[OpacityLayer] Failed to retrieve token:', error);
      }
    }

    return null;
  }

  /**
   * Decrypt multiple tokens at once.
   */
  async decryptMultiple(tokens: string[]): Promise<Record<string, string>> {
    await this.initialize();

    const resolved: Record<string, string> = {};
    const uncached: string[] = [];

    // Check memory cache first
    for (const token of tokens) {
      if (!token.startsWith('::')) {
        resolved[token] = token;
        continue;
      }

      const cached = this.memoryCache.get(token);
      if (cached !== undefined) {
        resolved[token] = cached;
      } else {
        uncached.push(token);
      }
    }

    // Batch fetch uncached tokens from database
    if (uncached.length > 0) {
      const db = await getDatabase();
      if (db) {
        try {
          const dbResolved = db.resolveOpaqueTokens(uncached);
          for (const [token, plaintext] of Object.entries(dbResolved)) {
            resolved[token] = plaintext;
            this.memoryCache.set(token, plaintext);
            this.reverseCache.set(plaintext, token);
          }
        } catch (error) {
          console.warn('[OpacityLayer] Failed to batch resolve tokens:', error);
        }
      }
    }

    return resolved;
  }

  /**
   * Apply opacity to extracted 5W+H content.
   */
  async applyOpacity(
    extracted: Extracted5WH,
    symbolId?: string
  ): Promise<OpaqueExtracted5WH> {
    return {
      who: await this.encrypt(extracted.who, { symbolId, fieldName: 'who' }),
      what: await this.encrypt(extracted.what, { symbolId, fieldName: 'what' }),
      why: await this.encrypt(extracted.why, { symbolId, fieldName: 'why' }),
      where: await this.encrypt(extracted.where, { symbolId, fieldName: 'where' }),
      when: await this.encrypt(extracted.when, { symbolId, fieldName: 'when' }),
      how: {
        focus: await this.encryptArray(extracted.how.focus, {
          symbolId,
          fieldPrefix: 'how.focus',
        }),
        constraints: await this.encryptArray(extracted.how.constraints, {
          symbolId,
          fieldPrefix: 'how.constraints',
        }),
        output_format: extracted.how.output_format
          ? await this.encrypt(extracted.how.output_format, { symbolId, fieldName: 'how.output_format' })
          : undefined,
      },
      commanders_intent: await this.encrypt(extracted.commanders_intent, {
        symbolId,
        fieldName: 'commanders_intent',
      }),
      requirements: await this.encryptArray(extracted.requirements, {
        symbolId,
        fieldPrefix: 'requirements',
      }),
      anti_requirements: extracted.anti_requirements
        ? await this.encryptArray(extracted.anti_requirements, {
            symbolId,
            fieldPrefix: 'anti_requirements',
          })
        : undefined,
      key_terms: await this.encryptArray(extracted.key_terms, {
        symbolId,
        fieldPrefix: 'key_terms',
      }),
    };
  }

  /**
   * Remove opacity from extracted 5W+H content (decrypt all tokens).
   */
  async removeOpacity(opaque: OpaqueExtracted5WH): Promise<Extracted5WH> {
    const decryptArray = async (arr: string[]): Promise<string[]> => {
      const results: string[] = [];
      for (const token of arr) {
        const plain = await this.decrypt(token);
        results.push(plain || token);
      }
      return results;
    };

    return {
      who: (await this.decrypt(opaque.who)) || opaque.who,
      what: (await this.decrypt(opaque.what)) || opaque.what,
      why: (await this.decrypt(opaque.why)) || opaque.why,
      where: (await this.decrypt(opaque.where)) || opaque.where,
      when: (await this.decrypt(opaque.when)) || opaque.when,
      how: {
        focus: await decryptArray(opaque.how.focus),
        constraints: await decryptArray(opaque.how.constraints),
        output_format: opaque.how.output_format
          ? (await this.decrypt(opaque.how.output_format)) || opaque.how.output_format
          : undefined,
      },
      commanders_intent: (await this.decrypt(opaque.commanders_intent)) || opaque.commanders_intent,
      requirements: await decryptArray(opaque.requirements),
      anti_requirements: opaque.anti_requirements
        ? await decryptArray(opaque.anti_requirements)
        : undefined,
      key_terms: await decryptArray(opaque.key_terms),
    };
  }

  /**
   * Handle opacity resolve request (for MCP tool).
   */
  async resolve(request: OpacityResolveRequest): Promise<OpacityResolveResponse> {
    try {
      const resolved = await this.decryptMultiple(request.tokens);
      const unresolved = request.tokens.filter(t => !(t in resolved));

      return {
        success: true,
        resolved,
        unresolved,
      };
    } catch (error) {
      return {
        success: false,
        resolved: {},
        unresolved: request.tokens,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Handle opacity encrypt request (for MCP tool).
   */
  async encryptContent(request: OpacityEncryptRequest): Promise<OpacityEncryptResponse> {
    try {
      const encrypted: Record<string, unknown> = {};
      const tokenMap: Record<string, string> = {};

      const processValue = async (
        value: unknown,
        path: string
      ): Promise<unknown> => {
        if (typeof value === 'string') {
          const token = await this.encrypt(value, {
            symbolId: request.symbolId,
            fieldName: path,
          });
          tokenMap[token] = path;
          return token;
        }

        if (Array.isArray(value)) {
          const results: unknown[] = [];
          for (let i = 0; i < value.length; i++) {
            results.push(await processValue(value[i], `${path}[${i}]`));
          }
          return results;
        }

        if (value && typeof value === 'object') {
          const result: Record<string, unknown> = {};
          for (const [key, val] of Object.entries(value)) {
            result[key] = await processValue(val, path ? `${path}.${key}` : key);
          }
          return result;
        }

        return value;
      };

      for (const [key, value] of Object.entries(request.content)) {
        encrypted[key] = await processValue(value, key);
      }

      return {
        success: true,
        encrypted,
        tokenMap,
      };
    } catch (error) {
      return {
        success: false,
        encrypted: {},
        tokenMap: {},
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get statistics about the opacity layer.
   */
  async getStats(): Promise<{
    memoryCacheSize: number;
    databaseStats: {
      totalTokens: number;
      totalAccesses: number;
      tokensWithSymbol: number;
      expiredTokens: number;
    } | null;
    tokenCounter: number;
  }> {
    await this.initialize();

    let databaseStats = null;
    const db = await getDatabase();
    if (db) {
      try {
        databaseStats = db.getOpaqueStats();
      } catch {
        // Database not available
      }
    }

    return {
      memoryCacheSize: this.memoryCache.size,
      databaseStats,
      tokenCounter: this.tokenCounter,
    };
  }

  /**
   * Clear memory cache (useful for testing).
   */
  clearCache(): void {
    this.memoryCache.clear();
    this.reverseCache.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON INSTANCE
// ─────────────────────────────────────────────────────────────────────────────

export const opacityLayer = new OpacityLayer();

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encrypt a value to an opaque token.
 */
export async function encrypt(plaintext: string, symbolId?: string): Promise<string> {
  return opacityLayer.encrypt(plaintext, { symbolId });
}

/**
 * Decrypt an opaque token.
 */
export async function decrypt(token: string): Promise<string | null> {
  return opacityLayer.decrypt(token);
}

/**
 * Resolve multiple tokens at once.
 */
export async function resolveTokens(tokens: string[]): Promise<Record<string, string>> {
  return opacityLayer.decryptMultiple(tokens);
}

/**
 * Apply opacity to 5W+H content.
 */
export async function applyOpacity(
  extracted: Extracted5WH,
  symbolId?: string
): Promise<OpaqueExtracted5WH> {
  return opacityLayer.applyOpacity(extracted, symbolId);
}

/**
 * Remove opacity from 5W+H content.
 */
export async function removeOpacity(opaque: OpaqueExtracted5WH): Promise<Extracted5WH> {
  return opacityLayer.removeOpacity(opaque);
}
