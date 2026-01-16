/**
 * Target Criteria Unit Tests
 *
 * Tests for gold/silver precious metals target criteria configuration.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_TARGET_CRITERIA } from '../../../src/swarm/types.js';

describe('DEFAULT_TARGET_CRITERIA', () => {
  describe('structure validation', () => {
    it('should have a valid searchQuery', () => {
      expect(DEFAULT_TARGET_CRITERIA.searchQuery).toBeDefined();
      expect(typeof DEFAULT_TARGET_CRITERIA.searchQuery).toBe('string');
      expect(DEFAULT_TARGET_CRITERIA.searchQuery!.length).toBeGreaterThan(0);
    });

    it('should have searchTerms array with precious metals keywords', () => {
      expect(DEFAULT_TARGET_CRITERIA.searchTerms).toBeDefined();
      expect(Array.isArray(DEFAULT_TARGET_CRITERIA.searchTerms)).toBe(true);
      expect(DEFAULT_TARGET_CRITERIA.searchTerms!.length).toBeGreaterThan(0);
    });

    it('should include gold-related search terms', () => {
      const terms = DEFAULT_TARGET_CRITERIA.searchTerms!;
      const hasGold = terms.some(term => term.toLowerCase().includes('gold'));
      expect(hasGold).toBe(true);
    });

    it('should include silver-related search terms', () => {
      const terms = DEFAULT_TARGET_CRITERIA.searchTerms!;
      const hasSilver = terms.some(term => term.toLowerCase().includes('silver'));
      expect(hasSilver).toBe(true);
    });

    it('should have additionalQueries for expanded coverage', () => {
      expect(DEFAULT_TARGET_CRITERIA.additionalQueries).toBeDefined();
      expect(Array.isArray(DEFAULT_TARGET_CRITERIA.additionalQueries)).toBe(true);
      expect(DEFAULT_TARGET_CRITERIA.additionalQueries!.length).toBeGreaterThan(0);
    });
  });

  describe('price range configuration', () => {
    it('should have minimum price appropriate for silver', () => {
      // Small silver pieces start around $25
      expect(DEFAULT_TARGET_CRITERIA.minPrice).toBeDefined();
      expect(DEFAULT_TARGET_CRITERIA.minPrice).toBeGreaterThanOrEqual(20);
      expect(DEFAULT_TARGET_CRITERIA.minPrice).toBeLessThanOrEqual(50);
    });

    it('should have maximum price appropriate for gold', () => {
      // 1oz gold bars are around $2000-3000
      expect(DEFAULT_TARGET_CRITERIA.maxPrice).toBeDefined();
      expect(DEFAULT_TARGET_CRITERIA.maxPrice).toBeGreaterThanOrEqual(2000);
      expect(DEFAULT_TARGET_CRITERIA.maxPrice).toBeLessThanOrEqual(5000);
    });

    it('should have consistent priceRange object', () => {
      expect(DEFAULT_TARGET_CRITERIA.priceRange).toBeDefined();
      expect(DEFAULT_TARGET_CRITERIA.priceRange!.min).toBe(DEFAULT_TARGET_CRITERIA.minPrice);
      expect(DEFAULT_TARGET_CRITERIA.priceRange!.max).toBe(DEFAULT_TARGET_CRITERIA.maxPrice);
    });

    it('should have minPrice less than maxPrice', () => {
      expect(DEFAULT_TARGET_CRITERIA.minPrice).toBeLessThan(DEFAULT_TARGET_CRITERIA.maxPrice!);
    });
  });

  describe('condition requirements', () => {
    it('should prioritize pristine conditions for precious metals', () => {
      expect(DEFAULT_TARGET_CRITERIA.conditions).toBeDefined();
      expect(Array.isArray(DEFAULT_TARGET_CRITERIA.conditions)).toBe(true);

      const conditions = DEFAULT_TARGET_CRITERIA.conditions as string[];
      expect(conditions).toContain('NEW');
      expect(conditions).toContain('LIKE_NEW');
    });

    it('should not include poor conditions by default', () => {
      const conditions = DEFAULT_TARGET_CRITERIA.conditions as string[];
      // Precious metals shouldn't be in poor condition
      expect(conditions).not.toContain('ACCEPTABLE');
      expect(conditions).not.toContain('FOR_PARTS');
    });
  });

  describe('seller trust requirements', () => {
    it('should have high minimum seller feedback for precious metals', () => {
      // Precious metals require high trust sellers
      expect(DEFAULT_TARGET_CRITERIA.minSellerFeedback).toBeDefined();
      expect(DEFAULT_TARGET_CRITERIA.minSellerFeedback).toBeGreaterThanOrEqual(95);
    });

    it('should require 98%+ feedback for high-value transactions', () => {
      // Given the value of gold, 98%+ is appropriate
      expect(DEFAULT_TARGET_CRITERIA.minSellerFeedback).toBeGreaterThanOrEqual(98);
    });
  });

  describe('listing format support', () => {
    it('should support auction listings', () => {
      expect(DEFAULT_TARGET_CRITERIA.listingFormats).toContain('AUCTION');
    });

    it('should support fixed price listings', () => {
      expect(DEFAULT_TARGET_CRITERIA.listingFormats).toContain('FIXED_PRICE');
    });

    it('should support best offer negotiations', () => {
      expect(DEFAULT_TARGET_CRITERIA.listingFormats).toContain('BEST_OFFER');
    });
  });

  describe('shipping restrictions', () => {
    it('should restrict to US shipping for compliance', () => {
      expect(DEFAULT_TARGET_CRITERIA.shipToLocations).toBeDefined();
      expect(DEFAULT_TARGET_CRITERIA.shipToLocations).toContain('US');
    });
  });
});

describe('Precious Metals Search Terms', () => {
  const allTerms = [
    ...DEFAULT_TARGET_CRITERIA.searchTerms!,
    ...DEFAULT_TARGET_CRITERIA.additionalQueries!,
  ];

  describe('gold coverage', () => {
    it('should include gold bars', () => {
      const hasGoldBars = allTerms.some(t =>
        t.toLowerCase().includes('gold') && t.toLowerCase().includes('bar')
      );
      expect(hasGoldBars).toBe(true);
    });

    it('should include gold coins', () => {
      const hasGoldCoins = allTerms.some(t =>
        t.toLowerCase().includes('gold') &&
        (t.toLowerCase().includes('coin') || t.toLowerCase().includes('eagle') || t.toLowerCase().includes('maple'))
      );
      expect(hasGoldCoins).toBe(true);
    });

    it('should include gold bullion/rounds', () => {
      const hasGoldBullion = allTerms.some(t =>
        t.toLowerCase().includes('gold') &&
        (t.toLowerCase().includes('bullion') || t.toLowerCase().includes('round'))
      );
      expect(hasGoldBullion).toBe(true);
    });
  });

  describe('silver coverage', () => {
    it('should include silver bars', () => {
      const hasSilverBars = allTerms.some(t =>
        t.toLowerCase().includes('silver') && t.toLowerCase().includes('bar')
      );
      expect(hasSilverBars).toBe(true);
    });

    it('should include silver coins/eagles', () => {
      const hasSilverCoins = allTerms.some(t =>
        t.toLowerCase().includes('silver') &&
        (t.toLowerCase().includes('coin') || t.toLowerCase().includes('eagle') || t.toLowerCase().includes('round'))
      );
      expect(hasSilverCoins).toBe(true);
    });

    it('should include junk silver', () => {
      const hasJunkSilver = allTerms.some(t =>
        t.toLowerCase().includes('junk') && t.toLowerCase().includes('silver')
      );
      expect(hasJunkSilver).toBe(true);
    });
  });
});
