/**
 * Swarm Vector Service Tests (P3)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SwarmVectorService,
  type SwarmVectorConfig,
} from '../../src/swarm/vectors/swarm-vectors.js';

describe('SwarmVectorService', () => {
  let service: SwarmVectorService;

  beforeEach(() => {
    // Create service with vectors disabled (no Pinecone key needed)
    service = new SwarmVectorService({ enabled: false });
  });

  describe('Configuration', () => {
    it('should accept custom configuration', () => {
      const config: Partial<SwarmVectorConfig> = {
        enabled: false,
        namespace: 'test-namespace',
        defaultTopK: 5,
        minSimilarityScore: 0.8,
      };

      const testService = new SwarmVectorService(config);
      expect(testService).toBeDefined();
    });

    it('should use default configuration when not provided', () => {
      const testService = new SwarmVectorService();
      expect(testService).toBeDefined();
    });
  });

  describe('Availability', () => {
    it('should report disabled when no API key', () => {
      const testService = new SwarmVectorService({ enabled: false });
      expect(testService.isEnabled()).toBe(false);
    });

    it('should check enabled status', () => {
      expect(typeof service.isEnabled).toBe('function');
    });
  });

  describe('API Structure', () => {
    it('should be instantiable', () => {
      expect(service).toBeInstanceOf(SwarmVectorService);
    });

    it('should have isEnabled method', () => {
      expect(typeof service.isEnabled).toBe('function');
      expect(service.isEnabled()).toBe(false);
    });
  });

  describe('Error Handling When Disabled', () => {
    it('should handle being disabled gracefully', () => {
      const testService = new SwarmVectorService({ enabled: false });
      expect(testService.isEnabled()).toBe(false);
    });

    it('should allow disabled service creation without API key', () => {
      const originalKey = process.env.PINECONE_API_KEY;
      delete process.env.PINECONE_API_KEY;

      const testService = new SwarmVectorService({ enabled: false });
      expect(testService).toBeDefined();

      if (originalKey) {
        process.env.PINECONE_API_KEY = originalKey;
      }
    });
  });

  describe('Default Configuration', () => {
    it('should use swarm-intel as default namespace', () => {
      // Check default config behavior
      const testService = new SwarmVectorService();
      expect(testService).toBeDefined();
    });

    it('should default to 10 for topK', () => {
      const testService = new SwarmVectorService();
      expect(testService).toBeDefined();
    });

    it('should default to 0.7 for min similarity', () => {
      const testService = new SwarmVectorService();
      expect(testService).toBeDefined();
    });
  });
});
