/**
 * OpenAPI Spec Routes
 *
 * Serves the OpenAPI specification for CustomGPT and other API consumers.
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

const router = Router();

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the OpenAPI spec (relative to project root)
const specPath = path.resolve(__dirname, '../../../openapi.yaml');

/**
 * GET /openapi.yaml
 * Serve the OpenAPI specification in YAML format
 */
router.get('/openapi.yaml', (req: Request, res: Response) => {
  try {
    const spec = fs.readFileSync(specPath, 'utf-8');

    // Replace placeholder URL with actual host if available
    const host = req.get('host');
    const protocol = req.protocol;
    let finalSpec = spec;

    if (host && !host.includes('localhost')) {
      finalSpec = spec.replace(
        'https://your-domain.com',
        `${protocol}://${host}`
      );
    }

    res.setHeader('Content-Type', 'text/yaml');
    res.send(finalSpec);
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to load OpenAPI specification',
    });
  }
});

/**
 * GET /openapi.json
 * Serve the OpenAPI specification in JSON format
 */
router.get('/openapi.json', (req: Request, res: Response) => {
  try {
    const spec = fs.readFileSync(specPath, 'utf-8');
    const jsonSpec = YAML.parse(spec);

    // Replace placeholder URL with actual host if available
    const host = req.get('host');
    const protocol = req.protocol;

    if (host && !host.includes('localhost')) {
      jsonSpec.servers[0].url = `${protocol}://${host}`;
    }

    res.json(jsonSpec);
  } catch (error) {
    console.error('OpenAPI JSON error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to load OpenAPI specification',
    });
  }
});

/**
 * GET /.well-known/openapi.yaml
 * Standard well-known location for OpenAPI spec discovery
 */
router.get('/.well-known/openapi.yaml', (req: Request, res: Response) => {
  res.redirect('/openapi.yaml');
});

export default router;
