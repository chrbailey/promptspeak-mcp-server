/**
 * Symbol Routes
 *
 * REST API endpoints for symbol CRUD operations.
 * Maps MCP tools to HTTP endpoints for CustomGPT Actions.
 *
 * Endpoint Mapping:
 * - POST   /api/v1/symbols          → ps_symbol_create
 * - GET    /api/v1/symbols/:id      → ps_symbol_get
 * - PATCH  /api/v1/symbols/:id      → ps_symbol_update
 * - DELETE /api/v1/symbols/:id      → ps_symbol_delete
 * - GET    /api/v1/symbols          → ps_symbol_list
 * - POST   /api/v1/symbols/import   → ps_symbol_import
 * - GET    /api/v1/symbols/stats    → ps_symbol_stats
 * - GET    /api/v1/symbols/:id/format → ps_symbol_format
 */

import { Router, Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest, requireScopes } from '../middleware/auth.js';
import { getSymbolService } from '../services/symbol.service.js';
import { BadRequestError, ValidationError } from '../middleware/error-handler.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function validateSymbolId(symbolId: string): void {
  if (!symbolId || typeof symbolId !== 'string') {
    throw new BadRequestError('Symbol ID is required');
  }
  if (!symbolId.startsWith('Ξ.')) {
    throw new ValidationError('Symbol ID must start with "Ξ."');
  }
}

function validateCreateRequest(body: any): void {
  const required = ['symbolId', 'who', 'what', 'why', 'where', 'when', 'commanders_intent', 'requirements'];
  const missing = required.filter(field => !body[field]);

  if (missing.length > 0) {
    throw new ValidationError(`Missing required fields: ${missing.join(', ')}`);
  }

  validateSymbolId(body.symbolId);

  if (!Array.isArray(body.requirements)) {
    throw new ValidationError('requirements must be an array');
  }

  if (body.how && typeof body.how !== 'object') {
    throw new ValidationError('how must be an object with focus and constraints arrays');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/symbols/stats
 * Get registry statistics
 */
router.get('/stats', requireScopes('read'), async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const service = getSymbolService();
    const stats = await service.getStats();

    res.json({
      success: true,
      registry_stats: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/symbols/import
 * Bulk import symbols
 */
router.post('/import', requireScopes('import'), async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const service = getSymbolService();

    const { source, data, category, id_prefix, transform, defaults } = req.body;

    if (!source || !data || !category || !id_prefix) {
      throw new BadRequestError('Missing required fields: source, data, category, id_prefix');
    }

    const result = await service.import(user.userId, {
      source,
      data,
      category,
      id_prefix,
      transform,
      defaults,
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/symbols
 * List symbols with optional filtering
 */
router.get('/', requireScopes('read'), async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const service = getSymbolService();

    const result = await service.list(user.userId, {
      category: req.query.category as string,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      createdAfter: req.query.created_after as string,
      createdBefore: req.query.created_before as string,
      search: req.query.search as string,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/symbols
 * Create a new symbol
 */
router.post('/', requireScopes('write'), async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const service = getSymbolService();

    validateCreateRequest(req.body);

    const result = await service.create(user.userId, req.body);

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/symbols/:symbolId
 * Get a symbol by ID
 * Note: symbolId can contain dots (e.g., Ξ.NVDA.Q3FY25), so we use a regex pattern
 */
router.get('/:symbolId', requireScopes('read'), async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const service = getSymbolService();
    const symbolId = decodeURIComponent(req.params.symbolId);

    // Check if this is a format request
    if (symbolId.endsWith('/format')) {
      const actualSymbolId = symbolId.replace(/\/format$/, '');
      validateSymbolId(actualSymbolId);

      const format = (req.query.format as 'full' | 'compact' | 'requirements_only') || 'full';
      const result = await service.format(user.userId, actualSymbolId, format);

      return res.json({
        success: true,
        symbolId: actualSymbolId,
        format,
        ...result,
      });
    }

    validateSymbolId(symbolId);

    const result = await service.get(user.userId, symbolId, {
      version: req.query.version ? parseInt(req.query.version as string, 10) : undefined,
      includeChangelog: req.query.include_changelog === 'true',
    });

    // Add lens enforcement metadata if lens is active
    const lens = (req as AuthenticatedRequest).activeLens;
    if (lens) {
      (result as any).lens = lens;
      (result as any).enforcement = {
        applied: true,
        // In Phase 2, we'll add actual field filtering here
      };
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/symbols/:symbolId
 * Update a symbol
 */
router.patch('/:symbolId', requireScopes('write'), async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const service = getSymbolService();
    const symbolId = decodeURIComponent(req.params.symbolId);

    validateSymbolId(symbolId);

    const { changes, change_description } = req.body;

    if (!changes || typeof changes !== 'object') {
      throw new BadRequestError('changes object is required');
    }

    if (!change_description || typeof change_description !== 'string') {
      throw new BadRequestError('change_description is required');
    }

    const result = await service.update(user.userId, symbolId, changes, change_description);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/symbols/:symbolId
 * Delete a symbol
 */
router.delete('/:symbolId', requireScopes('delete'), async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const service = getSymbolService();
    const symbolId = decodeURIComponent(req.params.symbolId);

    validateSymbolId(symbolId);

    const reason = req.query.reason as string || 'Deleted via API';

    const result = await service.delete(user.userId, symbolId, reason);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
