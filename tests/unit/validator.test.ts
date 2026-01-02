/**
 * Unit Tests: Frame Validator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FrameValidator } from '../../src/gatekeeper/validator.js';
import { DynamicResolver } from '../../src/gatekeeper/resolver.js';

describe('FrameValidator', () => {
  let validator: FrameValidator;
  let resolver: DynamicResolver;

  beforeEach(() => {
    validator = new FrameValidator();
    resolver = new DynamicResolver();
  });

  describe('structural validation', () => {
    it('should pass valid frame structure', () => {
      const parsed = resolver.parseFrame('⊕◊▶');
      const report = validator.validateStructural(parsed!);

      expect(report.valid).toBe(true);
      expect(report.errors).toHaveLength(0);
    });

    it('should fail frame that is too short', () => {
      const parsed = resolver.parseFrame('⊕');
      const report = validator.validateStructural(parsed!);

      expect(report.valid).toBe(false);
      expect(report.errors.some(e => e.code.includes('LENGTH'))).toBe(true);
    });

    it('should fail frame that is too long', () => {
      const parsed = resolver.parseFrame('⊕↑↓⟳◊⌘⛔⚠✓✗▶◀▲β');
      const report = validator.validateStructural(parsed!);

      expect(report.valid).toBe(false);
      expect(report.errors.some(e => e.code.includes('LENGTH'))).toBe(true);
    });

    it('should detect mode not first', () => {
      // Create a parsed frame with mode not first (simulated)
      const parsed = {
        raw: '◊⊕▶',
        symbols: [
          { symbol: '◊', category: 'domains' as const, definition: { name: 'financial', description: '' } },
          { symbol: '⊕', category: 'modes' as const, definition: { name: 'strict', description: '' } },
          { symbol: '▶', category: 'actions' as const, definition: { name: 'execute', description: '' } }
        ],
        mode: '⊕',
        modifiers: [],
        domain: '◊',
        source: null,
        constraints: [],
        action: '▶',
        entity: null,
        metadata: {}
      };

      const report = validator.validateStructural(parsed);

      expect(report.warnings.some(w => w.code === 'SEQUENCE_MODE_NOT_FIRST')).toBe(true);
    });
  });

  describe('semantic validation', () => {
    it('should detect mode conflicts', () => {
      // Strict + Flexible conflict
      const parsed = {
        raw: '⊕⊖◊▶',
        symbols: [
          { symbol: '⊕', category: 'modes' as const, definition: { name: 'strict', description: '' } },
          { symbol: '⊖', category: 'modes' as const, definition: { name: 'flexible', description: '' } },
          { symbol: '◊', category: 'domains' as const, definition: { name: 'financial', description: '' } },
          { symbol: '▶', category: 'actions' as const, definition: { name: 'execute', description: '' } }
        ],
        mode: '⊕',
        modifiers: [],
        domain: '◊',
        source: null,
        constraints: [],
        action: '▶',
        entity: null,
        metadata: {}
      };

      const report = validator.validateSemantic(parsed);

      expect(report.errors.some(e => e.code === 'MODE_CONFLICT_STRICT_FLEXIBLE')).toBe(true);
    });

    it('should detect priority conflicts', () => {
      const parsed = {
        raw: '⊕↑↓◊▶',
        symbols: [
          { symbol: '⊕', category: 'modes' as const, definition: { name: 'strict', description: '' } },
          { symbol: '↑', category: 'modifiers' as const, definition: { name: 'high_priority', description: '' } },
          { symbol: '↓', category: 'modifiers' as const, definition: { name: 'low_priority', description: '' } },
          { symbol: '◊', category: 'domains' as const, definition: { name: 'financial', description: '' } },
          { symbol: '▶', category: 'actions' as const, definition: { name: 'execute', description: '' } }
        ],
        mode: '⊕',
        modifiers: ['↑', '↓'],
        domain: '◊',
        source: null,
        constraints: [],
        action: '▶',
        entity: null,
        metadata: {}
      };

      const report = validator.validateSemantic(parsed);

      expect(report.errors.some(e => e.code === 'PRIORITY_CONFLICT')).toBe(true);
    });

    it('should detect exploratory mode with execute action', () => {
      const parsed = {
        raw: '⊗◊▶',
        symbols: [
          { symbol: '⊗', category: 'modes' as const, definition: { name: 'exploratory', description: '' } },
          { symbol: '◊', category: 'domains' as const, definition: { name: 'financial', description: '' } },
          { symbol: '▶', category: 'actions' as const, definition: { name: 'execute', description: '' } }
        ],
        mode: '⊗',
        modifiers: [],
        domain: '◊',
        source: null,
        constraints: [],
        action: '▶',
        entity: null,
        metadata: {}
      };

      const report = validator.validateSemantic(parsed);

      expect(report.errors.some(e => e.code === 'MODE_CONFLICT_EXPLORE_EXECUTE')).toBe(true);
    });

    it('should warn about missing domain for actions', () => {
      const parsed = {
        raw: '⊕▶',
        symbols: [
          { symbol: '⊕', category: 'modes' as const, definition: { name: 'strict', description: '' } },
          { symbol: '▶', category: 'actions' as const, definition: { name: 'execute', description: '' } }
        ],
        mode: '⊕',
        modifiers: [],
        domain: null,
        source: null,
        constraints: [],
        action: '▶',
        entity: null,
        metadata: {}
      };

      const report = validator.validateSemantic(parsed);

      expect(report.warnings.some(w => w.code === 'ACTION_MISSING_DOMAIN')).toBe(true);
    });
  });

  describe('chain validation', () => {
    it('should pass valid delegation chain', () => {
      const parent = resolver.parseFrame('⊕◊▼α');
      const child = resolver.parseFrame('⊕◊▶β');

      const report = validator.validateChain(child!, parent);

      expect(report.valid).toBe(true);
    });

    it('should detect mode strength weakening', () => {
      const parent = resolver.parseFrame('⊕◊▼α');  // Strict
      const child = resolver.parseFrame('⊖◊▶β');   // Flexible (weaker)

      const report = validator.validateChain(child!, parent);

      expect(report.errors.some(e => e.code === 'MODE_STRENGTH_WEAKENED')).toBe(true);
    });

    it('should detect missing forbidden inheritance', () => {
      const parent = {
        raw: '⊕◊⛔▼α',
        symbols: [
          { symbol: '⊕', category: 'modes' as const, definition: { name: 'strict', description: '' } },
          { symbol: '◊', category: 'domains' as const, definition: { name: 'financial', description: '' } },
          { symbol: '⛔', category: 'constraints' as const, definition: { name: 'forbidden', description: '' } },
          { symbol: '▼', category: 'actions' as const, definition: { name: 'delegate', description: '' } },
          { symbol: 'α', category: 'entities' as const, definition: { name: 'primary', description: '' } }
        ],
        mode: '⊕',
        modifiers: [],
        domain: '◊',
        source: null,
        constraints: ['⛔'],
        action: '▼',
        entity: 'α',
        metadata: {}
      };

      const child = resolver.parseFrame('⊕◊▶β');  // Missing ⛔

      const report = validator.validateChain(child!, parent);

      expect(report.errors.some(e => e.code === 'FORBIDDEN_NOT_INHERITED')).toBe(true);
    });

    it('should warn about domain change', () => {
      const parent = resolver.parseFrame('⊕◊▼α');  // Financial
      const child = resolver.parseFrame('⊕◈▶β');   // Legal (different domain)

      const report = validator.validateChain(child!, parent);

      expect(report.warnings.some(w => w.code === 'DOMAIN_CHANGED')).toBe(true);
    });
  });

  describe('full validation', () => {
    it('should run all validation phases', () => {
      const parsed = resolver.parseFrame('⊕◊▶β');
      const report = validator.validate(parsed!);

      expect(report.metadata).toBeDefined();
      expect(report.metadata.validatedAt).toBeDefined();
    });

    it('should include chain validation when parent provided', () => {
      const parent = resolver.parseFrame('⊕◊▼α');
      const child = resolver.parseFrame('⊕◊▶β');

      const report = validator.validate(child!, parent);

      expect(report.metadata.validationLevel).toBe('full');
    });
  });
});
