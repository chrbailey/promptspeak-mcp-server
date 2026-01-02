/**
 * API Key Management
 *
 * Handles API key generation, validation, and storage.
 * Keys are stored hashed in SQLite with bcrypt.
 */

import * as crypto from 'crypto';
import bcrypt from 'bcrypt';
import { getDatabase } from '../symbols/database.js';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ApiKeyInfo {
  id: number;
  keyPrefix: string;
  userId: string;
  name: string | null;
  scopes: string[];
  rateLimitTier: 'free' | 'pro' | 'enterprise';
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revoked: boolean;
}

export interface CreateApiKeyRequest {
  userId: string;
  name?: string;
  scopes?: string[];
  rateLimitTier?: 'free' | 'pro' | 'enterprise';
  expiresInDays?: number;
}

export interface CreateApiKeyResult {
  key: string;  // Only returned once at creation time
  keyPrefix: string;
  keyInfo: ApiKeyInfo;
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

let initialized = false;

export function initializeApiKeyTable(): void {
  if (initialized) return;

  const db = getDatabase();

  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_hash TEXT UNIQUE NOT NULL,
      key_prefix TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT,
      scopes TEXT NOT NULL DEFAULT '["read","write"]',
      rate_limit_tier TEXT DEFAULT 'free',
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      expires_at TEXT,
      revoked_at TEXT,

      CONSTRAINT valid_prefix CHECK (key_prefix LIKE 'ps_%')
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
  `);

  initialized = true;
}

// ═══════════════════════════════════════════════════════════════════════════
// KEY GENERATION
// ═══════════════════════════════════════════════════════════════════════════

function generateApiKey(environment: 'live' | 'test' = 'live'): string {
  const prefix = `ps_${environment}_`;
  const randomBytes = crypto.randomBytes(24);
  const key = randomBytes.toString('base64url');
  return `${prefix}${key}`;
}

export async function createApiKey(request: CreateApiKeyRequest): Promise<CreateApiKeyResult> {
  initializeApiKeyTable();

  const db = getDatabase();
  const key = generateApiKey('live');
  const keyPrefix = key.substring(0, 16);

  // Hash the key for storage
  const saltRounds = 12;
  const keyHash = await bcrypt.hash(key, saltRounds);

  const scopes = request.scopes || ['read', 'write'];
  const rateLimitTier = request.rateLimitTier || 'free';
  const createdAt = new Date().toISOString();

  let expiresAt: string | null = null;
  if (request.expiresInDays) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + request.expiresInDays);
    expiresAt = expiryDate.toISOString();
  }

  const stmt = db.prepare(`
    INSERT INTO api_keys (key_hash, key_prefix, user_id, name, scopes, rate_limit_tier, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    keyHash,
    keyPrefix,
    request.userId,
    request.name || null,
    JSON.stringify(scopes),
    rateLimitTier,
    createdAt,
    expiresAt
  );

  const keyInfo: ApiKeyInfo = {
    id: result.lastInsertRowid as number,
    keyPrefix,
    userId: request.userId,
    name: request.name || null,
    scopes,
    rateLimitTier,
    createdAt,
    lastUsedAt: null,
    expiresAt,
    revoked: false,
  };

  return {
    key,  // Return the plaintext key only at creation
    keyPrefix,
    keyInfo,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// KEY VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export async function validateApiKey(apiKey: string): Promise<ApiKeyInfo | null> {
  initializeApiKeyTable();

  const db = getDatabase();
  const keyPrefix = apiKey.substring(0, 16);

  // Find keys with matching prefix (there may be multiple if prefix collision)
  const stmt = db.prepare(`
    SELECT id, key_hash, key_prefix, user_id, name, scopes, rate_limit_tier,
           created_at, last_used_at, expires_at, revoked_at
    FROM api_keys
    WHERE key_prefix = ? AND revoked_at IS NULL
  `);

  const rows = stmt.all(keyPrefix) as Array<{
    id: number;
    key_hash: string;
    key_prefix: string;
    user_id: string;
    name: string | null;
    scopes: string;
    rate_limit_tier: string;
    created_at: string;
    last_used_at: string | null;
    expires_at: string | null;
    revoked_at: string | null;
  }>;

  if (rows.length === 0) {
    return null;
  }

  // Check each potential match with bcrypt
  for (const row of rows) {
    const isValid = await bcrypt.compare(apiKey, row.key_hash);
    if (isValid) {
      // Update last used timestamp
      const updateStmt = db.prepare(`
        UPDATE api_keys SET last_used_at = ? WHERE id = ?
      `);
      updateStmt.run(new Date().toISOString(), row.id);

      return {
        id: row.id,
        keyPrefix: row.key_prefix,
        userId: row.user_id,
        name: row.name,
        scopes: JSON.parse(row.scopes),
        rateLimitTier: row.rate_limit_tier as 'free' | 'pro' | 'enterprise',
        createdAt: row.created_at,
        lastUsedAt: new Date().toISOString(),
        expiresAt: row.expires_at,
        revoked: false,
      };
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// KEY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export function listApiKeys(userId: string): ApiKeyInfo[] {
  initializeApiKeyTable();

  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, key_prefix, user_id, name, scopes, rate_limit_tier,
           created_at, last_used_at, expires_at, revoked_at
    FROM api_keys
    WHERE user_id = ?
    ORDER BY created_at DESC
  `);

  const rows = stmt.all(userId) as Array<{
    id: number;
    key_prefix: string;
    user_id: string;
    name: string | null;
    scopes: string;
    rate_limit_tier: string;
    created_at: string;
    last_used_at: string | null;
    expires_at: string | null;
    revoked_at: string | null;
  }>;

  return rows.map(row => ({
    id: row.id,
    keyPrefix: row.key_prefix,
    userId: row.user_id,
    name: row.name,
    scopes: JSON.parse(row.scopes),
    rateLimitTier: row.rate_limit_tier as 'free' | 'pro' | 'enterprise',
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revoked: row.revoked_at !== null,
  }));
}

export function revokeApiKey(keyId: number, userId: string): boolean {
  initializeApiKeyTable();

  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE api_keys
    SET revoked_at = ?
    WHERE id = ? AND user_id = ? AND revoked_at IS NULL
  `);

  const result = stmt.run(new Date().toISOString(), keyId, userId);
  return result.changes > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// BOOTSTRAP: Create default API key for development
// ═══════════════════════════════════════════════════════════════════════════

export async function ensureDefaultApiKey(): Promise<string | null> {
  initializeApiKeyTable();

  const db = getDatabase();

  // Check if any keys exist for the default user
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM api_keys WHERE user_id = 'default'
  `);
  const result = stmt.get() as { count: number };

  if (result.count === 0) {
    // Create a default API key for development
    const keyResult = await createApiKey({
      userId: 'default',
      name: 'Default Development Key',
      scopes: ['read', 'write', 'delete', 'import', 'admin'],
      rateLimitTier: 'enterprise',
    });

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║ DEFAULT API KEY CREATED (save this - shown only once!)         ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║ Key: ${keyResult.key}`);
    console.log('╚════════════════════════════════════════════════════════════════╝');

    return keyResult.key;
  }

  return null;
}
