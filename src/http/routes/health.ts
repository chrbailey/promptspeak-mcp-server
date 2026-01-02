/**
 * Health Check Routes
 *
 * Provides health and readiness endpoints for monitoring and load balancers.
 */

import { Router, Request, Response } from 'express';
import { getDatabase } from '../../symbols/database.js';
import { getConfig } from '../config.js';

const router = Router();

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: {
      status: 'ok' | 'error';
      latencyMs?: number;
      error?: string;
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

router.get('/', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const config = getConfig();

  const response: HealthResponse = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime(),
    checks: {
      database: {
        status: 'ok',
      },
    },
  };

  // Check database connectivity
  try {
    const dbStart = Date.now();
    const db = getDatabase();
    const result = db.prepare('SELECT 1 as test').get() as { test: number };

    if (result.test !== 1) {
      throw new Error('Database query returned unexpected result');
    }

    response.checks.database.latencyMs = Date.now() - dbStart;
  } catch (error) {
    response.status = 'unhealthy';
    response.checks.database.status = 'error';
    response.checks.database.error = error instanceof Error ? error.message : 'Unknown error';
  }

  const statusCode = response.status === 'healthy' ? 200 :
                     response.status === 'degraded' ? 200 : 503;

  res.status(statusCode).json(response);
});

// ═══════════════════════════════════════════════════════════════════════════
// READINESS CHECK (for Kubernetes/container orchestration)
// ═══════════════════════════════════════════════════════════════════════════

router.get('/ready', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare('SELECT 1').get();
    res.status(200).json({ ready: true });
  } catch (error) {
    res.status(503).json({ ready: false, error: 'Database not ready' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LIVENESS CHECK (for Kubernetes)
// ═══════════════════════════════════════════════════════════════════════════

router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({ alive: true, uptime: process.uptime() });
});

export default router;
