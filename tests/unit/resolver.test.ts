/**
 * Unit Tests: Dynamic Resolver
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DynamicResolver } from '../../src/gatekeeper/resolver.js';

describe('DynamicResolver', () => {
  let resolver: DynamicResolver;

  beforeEach(() => {
    resolver = new DynamicResolver();
  });

  describe('parseFrame', () => {
    it('should parse a simple frame', () => {
      const result = resolver.parseFrame('⊕◊▶');

      expect(result).not.toBeNull();
      expect(result!.mode).toBe('⊕');
      expect(result!.domain).toBe('◊');
      expect(result!.action).toBe('▶');
    });

    it('should parse frame with all components', () => {
      const result = resolver.parseFrame('⊕↑◊⌘✓▶β');

      expect(result).not.toBeNull();
      expect(result!.mode).toBe('⊕');
      expect(result!.modifiers).toContain('↑');
      expect(result!.domain).toBe('◊');
      expect(result!.source).toBe('⌘');
      expect(result!.constraints).toContain('✓');
      expect(result!.action).toBe('▶');
      expect(result!.entity).toBe('β');
    });

    it('should handle flexible mode', () => {
      const result = resolver.parseFrame('⊖◇○');

      expect(result).not.toBeNull();
      expect(result!.mode).toBe('⊖');
    });

    it('should handle forbidden mode', () => {
      const result = resolver.parseFrame('⊗◆▲');

      expect(result).not.toBeNull();
      expect(result!.mode).toBe('⊗');
    });

    it('should handle neutral mode', () => {
      const result = resolver.parseFrame('⊘◐●');

      expect(result).not.toBeNull();
      expect(result!.mode).toBe('⊘');
    });

    it('should handle multiple modifiers', () => {
      const result = resolver.parseFrame('⊕↑⟳◊▶');

      expect(result).not.toBeNull();
      expect(result!.modifiers).toContain('↑');
      expect(result!.modifiers).toContain('⟳');
    });

    it('should handle multiple constraints', () => {
      const result = resolver.parseFrame('⊕◊⛔⚠▶');

      expect(result).not.toBeNull();
      expect(result!.constraints).toContain('⛔');
      expect(result!.constraints).toContain('⚠');
    });

    it('should preserve raw frame', () => {
      const frame = '⊕◊▶β';
      const result = resolver.parseFrame(frame);

      expect(result!.raw).toBe(frame);
    });
  });

  describe('resolveFrame', () => {
    it('should resolve symbols to definitions', () => {
      const parsed = resolver.parseFrame('⊕◊▶');
      const resolved = resolver.resolveFrame(parsed!);

      expect(resolved.modeDefinition).toBeDefined();
      expect(resolved.modeDefinition!.name).toBe('strict');
      expect(resolved.domainDefinition).toBeDefined();
      expect(resolved.domainDefinition!.name).toBe('financial');
    });

    it('should include parse confidence', () => {
      const parsed = resolver.parseFrame('⊕◊▶');
      const resolved = resolver.resolveFrame(parsed!);

      expect(resolved.parseConfidence).toBeGreaterThan(0);
      expect(resolved.parseConfidence).toBeLessThanOrEqual(1);
    });

    it('should build tool bindings', () => {
      const parsed = resolver.parseFrame('⊕◊▶');
      const resolved = resolver.resolveFrame(parsed!);

      expect(resolved.allowedTools).toBeDefined();
      expect(resolved.blockedTools).toBeDefined();
    });
  });

  describe('overlay handling', () => {
    it('should apply symbol overrides from overlay', () => {
      resolver.setOverlay({
        id: 'test',
        name: 'Test Overlay',
        priority: 100,
        symbolOverrides: {
          '⊕': { meaning: 'ultra-strict', blocked: false }
        }
      });

      const parsed = resolver.parseFrame('⊕◊▶');
      const resolved = resolver.resolveFrame(parsed!);

      expect(resolved.overlayApplied).toBe(true);
    });

    it('should block symbols when overlay specifies', () => {
      resolver.setOverlay({
        id: 'test',
        name: 'Test Overlay',
        priority: 100,
        symbolOverrides: {
          '⊖': { meaning: 'disabled', blocked: true }
        }
      });

      const parsed = resolver.parseFrame('⊖◊▶');
      const resolved = resolver.resolveFrame(parsed!);

      expect(resolved.blockedSymbols).toContain('⊖');
    });

    it('should clear overlay correctly', () => {
      resolver.setOverlay({
        id: 'test',
        name: 'Test Overlay',
        priority: 100,
        symbolOverrides: {}
      });

      expect(resolver.getOverlay()).not.toBeNull();

      resolver.setOverlay(null);

      expect(resolver.getOverlay()).toBeNull();
    });
  });
});
