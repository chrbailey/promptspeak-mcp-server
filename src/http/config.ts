/**
 * HTTP Server Configuration
 *
 * Environment-based configuration for the PromptSpeak REST API.
 * Supports both API key and OAuth 2.0 authentication methods.
 */

export interface HttpConfig {
  // Server
  port: number;
  host: string;
  nodeEnv: 'development' | 'production' | 'test';

  // Database
  dbPath: string;

  // Authentication
  auth: {
    apiKeyHeader: string;
    apiKeyPrefix: string;
    apiKeySalt: string;
    jwtSecret: string;
    jwtExpiry: string;
  };

  // OAuth (optional)
  oauth: {
    enabled: boolean;
    issuer: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };

  // Rate Limiting
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };

  // CORS
  cors: {
    origins: string[];
    credentials: boolean;
  };

  // Logging
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    path: string;
  };
}

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvOptional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid number for environment variable: ${key}`);
  }
  return parsed;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

export function loadConfig(): HttpConfig {
  const nodeEnv = getEnvOptional('NODE_ENV', 'development') as HttpConfig['nodeEnv'];

  // Default CORS origins include OpenAI domains
  const defaultCorsOrigins = [
    'https://chat.openai.com',
    'https://chatgpt.com',
    'http://localhost:3000',
    'http://localhost:5173'
  ];

  const corsOriginsEnv = process.env.CORS_ORIGINS;
  const corsOrigins = corsOriginsEnv
    ? corsOriginsEnv.split(',').map(s => s.trim())
    : defaultCorsOrigins;

  return {
    port: getEnvNumber('PORT', 3000),
    host: getEnvOptional('HOST', '0.0.0.0'),
    nodeEnv,

    dbPath: getEnvOptional('DB_PATH', './data/symbols/promptspeak.db'),

    auth: {
      apiKeyHeader: getEnvOptional('API_KEY_HEADER', 'X-API-Key'),
      apiKeyPrefix: getEnvOptional('API_KEY_PREFIX', 'ps_'),
      apiKeySalt: getEnvOptional('API_KEY_SALT', 'promptspeak-default-salt-change-in-production'),
      jwtSecret: getEnvOptional('JWT_SECRET', 'promptspeak-jwt-secret-change-in-production'),
      jwtExpiry: getEnvOptional('JWT_EXPIRY', '1h'),
    },

    oauth: {
      enabled: getEnvBoolean('OAUTH_ENABLED', false),
      issuer: getEnvOptional('OAUTH_ISSUER', ''),
      clientId: getEnvOptional('OAUTH_CLIENT_ID', ''),
      clientSecret: getEnvOptional('OAUTH_CLIENT_SECRET', ''),
      redirectUri: getEnvOptional('OAUTH_REDIRECT_URI', ''),
    },

    rateLimit: {
      windowMs: getEnvNumber('RATE_LIMIT_WINDOW_MS', 60000),
      maxRequests: getEnvNumber('RATE_LIMIT_MAX_REQUESTS', 100),
    },

    cors: {
      origins: corsOrigins,
      credentials: getEnvBoolean('CORS_CREDENTIALS', true),
    },

    logging: {
      level: getEnvOptional('LOG_LEVEL', 'info') as HttpConfig['logging']['level'],
      path: getEnvOptional('LOG_PATH', './data/logs'),
    },
  };
}

// Singleton config instance
let configInstance: HttpConfig | null = null;

export function getConfig(): HttpConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

export function resetConfig(): void {
  configInstance = null;
}
