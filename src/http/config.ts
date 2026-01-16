/**
 * HTTP Server Configuration
 *
 * Environment-based configuration for the PromptSpeak REST API.
 * Supports both API key and OAuth 2.0 authentication methods.
 */

import {
  getEnv,
  getEnvOptional,
  getEnvNumber,
  getEnvBoolean,
  getEnvList,
  getEnvEnum,
} from '../core/config/index.js';

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

// Default CORS origins include OpenAI domains
const DEFAULT_CORS_ORIGINS = [
  'https://chat.openai.com',
  'https://chatgpt.com',
  'http://localhost:3000',
  'http://localhost:5173',
];

export function loadConfig(): HttpConfig {
  const nodeEnv = getEnvEnum(
    'NODE_ENV',
    ['development', 'production', 'test'] as const,
    'development'
  );

  const corsOrigins = getEnvList('CORS_ORIGINS', DEFAULT_CORS_ORIGINS);

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
