/**
 * Request Logging Middleware
 *
 * Logs incoming requests and outgoing responses with timing information.
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from '../config.js';

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const config = getConfig();
  const startTime = Date.now();

  // Generate or use existing request ID
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-Id', requestId);

  // Log request
  if (config.logging.level === 'debug') {
    console.log(`[${new Date().toISOString()}] --> ${req.method} ${req.path}`, {
      requestId,
      query: req.query,
      headers: {
        'content-type': req.headers['content-type'],
        'x-api-key': req.headers['x-api-key'] ? '[REDACTED]' : undefined,
        'x-lens': req.headers['x-lens'],
      },
    });
  }

  // Capture response
  const originalSend = res.send;
  res.send = function (body) {
    const duration = Date.now() - startTime;

    // Log response
    const logLevel = res.statusCode >= 500 ? 'error' :
                     res.statusCode >= 400 ? 'warn' : 'info';

    if (config.logging.level === 'debug' || logLevel !== 'info') {
      console.log(`[${new Date().toISOString()}] <-- ${req.method} ${req.path} ${res.statusCode} ${duration}ms`, {
        requestId,
        statusCode: res.statusCode,
        duration,
      });
    }

    return originalSend.call(this, body);
  };

  next();
}
