/**
 * Court Listener Batch Parser Tests (P4)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CourtListenerBatchParser,
  getBatchParser,
  createBatchParser,
  generateCaseSymbol,
  generateCourtSymbol,
  generateOpinionSymbol,
  type BatchConfig,
  type Court,
  type Opinion,
  type Docket,
} from '../../src/legal/batch-parser.js';

describe('CourtListenerBatchParser', () => {
  describe('generateCaseSymbol', () => {
    it('should generate valid case symbol', () => {
      const symbol = generateCaseSymbol(
        'Smith v. Jones',
        '123 F.3d 456',
        'ca9',
        '2024-01-15',
        'https://courtlistener.com/case/123'
      );

      expect(symbol.symbolId).toMatch(/^XI\.LEGAL\.CASE\./);
      expect(symbol.symbolType).toBe('CASE');
      expect(symbol.name).toBe('Smith v. Jones');
      expect(symbol.citation).toBe('123 F.3d 456');
      expect(symbol.court).toBe('ca9');
    });

    it('should sanitize case names in symbol ID', () => {
      const symbol = generateCaseSymbol(
        'O\'Malley & Sons, Inc. v. Smith (2024)',
        '456 U.S. 789',
        'scotus'
      );

      expect(symbol.symbolId).not.toContain('\'');
      expect(symbol.symbolId).not.toContain('&');
      expect(symbol.symbolId).not.toContain(',');
    });

    it('should include metadata', () => {
      const symbol = generateCaseSymbol('Test Case', 'cite', 'court');

      expect(symbol.metadata.source).toBe('courtlistener');
      expect(symbol.metadata.extractedAt).toBeDefined();
    });
  });

  describe('generateCourtSymbol', () => {
    const sampleCourt: Court = {
      id: 'ca9',
      resource_uri: '/api/rest/v4/courts/ca9/',
      full_name: 'United States Court of Appeals for the Ninth Circuit',
      short_name: '9th Cir.',
      position: 9,
      in_use: true,
      has_opinion_scraper: true,
      has_oral_argument_scraper: false,
      url: 'https://www.ca9.uscourts.gov/',
      jurisdiction: 'F',
      citation_string: '9th Cir.',
    };

    it('should generate valid court symbol', () => {
      const symbol = generateCourtSymbol(sampleCourt);

      expect(symbol.symbolId).toBe('XI.LEGAL.COURT.CA9');
      expect(symbol.symbolType).toBe('COURT');
      expect(symbol.name).toBe(sampleCourt.full_name);
      expect(symbol.jurisdiction).toBe('F');
    });

    it('should include court metadata', () => {
      const symbol = generateCourtSymbol(sampleCourt);

      expect(symbol.metadata.shortName).toBe('9th Cir.');
      expect(symbol.metadata.position).toBe(9);
      expect(symbol.metadata.inUse).toBe(true);
    });
  });

  describe('generateOpinionSymbol', () => {
    const sampleOpinion: Opinion = {
      id: 12345,
      absolute_url: '/opinion/12345/smith-v-jones/',
      cluster_id: 67890,
      author_str: 'Smith, J.',
      per_curiam: false,
      type: 'lead',
      sha1: 'abc123',
      page_count: 15,
      date_created: '2024-01-15T10:00:00Z',
      date_modified: '2024-01-15T10:00:00Z',
    };

    it('should generate valid opinion symbol', () => {
      const symbol = generateOpinionSymbol(sampleOpinion, 'Smith v. Jones');

      expect(symbol.symbolId).toBe('XI.LEGAL.OPINION.12345');
      expect(symbol.symbolType).toBe('OPINION');
      expect(symbol.name).toBe('Smith v. Jones');
    });

    it('should use default name when not provided', () => {
      const symbol = generateOpinionSymbol(sampleOpinion);

      expect(symbol.name).toBe('Opinion 12345');
    });

    it('should include opinion metadata', () => {
      const symbol = generateOpinionSymbol(sampleOpinion);

      expect(symbol.metadata.author).toBe('Smith, J.');
      expect(symbol.metadata.perCuriam).toBe(false);
      expect(symbol.metadata.type).toBe('lead');
    });
  });

  describe('Batch Parser Configuration', () => {
    it('should use default config values', () => {
      const parser = createBatchParser();
      expect(parser).toBeDefined();
    });

    it('should accept custom config', () => {
      const config: Partial<BatchConfig> = {
        maxRequestsPerMinute: 30,
        batchSize: 5,
        maxRetries: 5,
      };

      const parser = createBatchParser(config);
      expect(parser).toBeDefined();
    });

    it('should use env token if available', () => {
      const originalToken = process.env.COURTLISTENER_API_TOKEN;
      process.env.COURTLISTENER_API_TOKEN = 'test-token';

      const parser = createBatchParser();
      expect(parser).toBeDefined();

      process.env.COURTLISTENER_API_TOKEN = originalToken;
    });
  });

  describe('Singleton Management', () => {
    it('should return same instance from getBatchParser', () => {
      const p1 = getBatchParser();
      const p2 = getBatchParser();
      expect(p1).toBe(p2);
    });
  });

  describe('Abort Functionality', () => {
    it('should have abort method', () => {
      const parser = createBatchParser();
      expect(typeof parser.abort).toBe('function');
    });

    it('should not throw when aborting without active operation', () => {
      const parser = createBatchParser();
      expect(() => parser.abort()).not.toThrow();
    });
  });

  describe('Async Generators (Mock)', () => {
    it('should export fetchOpinions generator', () => {
      const parser = createBatchParser();
      expect(typeof parser.fetchOpinions).toBe('function');
    });

    it('should export fetchDockets generator', () => {
      const parser = createBatchParser();
      expect(typeof parser.fetchDockets).toBe('function');
    });

    it('should export parseDocketsToSymbols generator', () => {
      const parser = createBatchParser();
      expect(typeof parser.parseDocketsToSymbols).toBe('function');
    });

    it('should export parseOpinionsToSymbols generator', () => {
      const parser = createBatchParser();
      expect(typeof parser.parseOpinionsToSymbols).toBe('function');
    });
  });
});
