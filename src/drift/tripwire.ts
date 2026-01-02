// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK MCP SERVER - TRIPWIRE INJECTION
// ═══════════════════════════════════════════════════════════════════════════
// Tripwires are test cases injected to detect silent drift.
// The agent doesn't know which operations are tripwires.
// ═══════════════════════════════════════════════════════════════════════════

import type { TripwireResult, ParsedFrame } from '../types/index.js';
import { generateTripwireId } from '../utils/hash.js';

// Predefined tripwire test cases
interface TripwireTestCase {
  frame: string;
  type: 'valid' | 'invalid';
  expectedOutcome: 'accept' | 'reject';
  description: string;
}

const VALID_TRIPWIRES: TripwireTestCase[] = [
  {
    frame: '⊕◊▶β',
    type: 'valid',
    expectedOutcome: 'accept',
    description: 'Standard strict financial execute - should accept',
  },
  {
    frame: '⊘◆○γ',
    type: 'valid',
    expectedOutcome: 'accept',
    description: 'Neutral operational propose - should accept',
  },
  {
    frame: '⊕◈⛔▼α',
    type: 'valid',
    expectedOutcome: 'accept',
    description: 'Strict legal forbidden delegate - valid frame structure',
  },
  {
    frame: '⊖◇▶ω',
    type: 'valid',
    expectedOutcome: 'accept',
    description: 'Flexible technical execute terminal - should accept',
  },
];

const INVALID_TRIPWIRES: TripwireTestCase[] = [
  {
    frame: '⊕⊖◊▶',
    type: 'invalid',
    expectedOutcome: 'reject',
    description: 'Mode conflict (strict + flexible) - should reject',
  },
  {
    frame: '▶',
    type: 'invalid',
    expectedOutcome: 'reject',
    description: 'Single symbol, below minimum length - should reject',
  },
  {
    frame: '⊕⊕◊▶',
    type: 'invalid',
    expectedOutcome: 'reject',
    description: 'Duplicate mode - should reject',
  },
  {
    frame: '⊕◊◊▶',
    type: 'invalid',
    expectedOutcome: 'reject',
    description: 'Duplicate domain - should reject',
  },
];

export class TripwireInjector {
  private results: TripwireResult[] = [];
  private enabled: boolean = true;
  private injectionRate: number = 0.05; // 5% of operations are tripwires

  /**
   * Enable or disable tripwire injection.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Set the injection rate (0-1).
   */
  setInjectionRate(rate: number): void {
    this.injectionRate = Math.max(0, Math.min(1, rate));
  }

  /**
   * Check if tripwire should be injected based on rate.
   */
  shouldInject(): boolean {
    if (!this.enabled) return false;
    return Math.random() < this.injectionRate;
  }

  /**
   * Get a random tripwire test case.
   */
  getRandomTripwire(): TripwireTestCase {
    // 50% chance of valid, 50% chance of invalid
    const pool = Math.random() < 0.5 ? VALID_TRIPWIRES : INVALID_TRIPWIRES;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * Get a specific tripwire type.
   */
  getTripwire(type: 'valid' | 'invalid'): TripwireTestCase {
    const pool = type === 'valid' ? VALID_TRIPWIRES : INVALID_TRIPWIRES;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * Inject a tripwire and record the result.
   */
  inject(
    agentId: string,
    validateFn: (frame: string) => boolean
  ): TripwireResult {
    const tripwire = this.getRandomTripwire();
    return this.executeTest(agentId, tripwire, validateFn);
  }

  /**
   * Inject a specific tripwire type.
   */
  injectSpecific(
    agentId: string,
    type: 'valid' | 'invalid',
    validateFn: (frame: string) => boolean
  ): TripwireResult {
    const tripwire = this.getTripwire(type);
    return this.executeTest(agentId, tripwire, validateFn);
  }

  /**
   * Execute a tripwire test.
   */
  private executeTest(
    agentId: string,
    tripwire: TripwireTestCase,
    validateFn: (frame: string) => boolean
  ): TripwireResult {
    const accepted = validateFn(tripwire.frame);
    const actualOutcome: 'accept' | 'reject' = accepted ? 'accept' : 'reject';
    const passed = actualOutcome === tripwire.expectedOutcome;

    const result: TripwireResult = {
      tripwireId: generateTripwireId(),
      type: tripwire.type,
      frame: tripwire.frame,
      expectedOutcome: tripwire.expectedOutcome,
      actualOutcome,
      passed,
      agentId,
      timestamp: Date.now(),
    };

    this.results.push(result);

    // Keep only last 10000 results
    if (this.results.length > 10000) {
      this.results = this.results.slice(-10000);
    }

    return result;
  }

  /**
   * Run all tripwire tests for an agent.
   */
  runAllTests(
    agentId: string,
    validateFn: (frame: string) => boolean
  ): { passed: number; failed: number; results: TripwireResult[] } {
    const results: TripwireResult[] = [];

    for (const tripwire of [...VALID_TRIPWIRES, ...INVALID_TRIPWIRES]) {
      results.push(this.executeTest(agentId, tripwire, validateFn));
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    return { passed, failed, results };
  }

  /**
   * Get results for an agent.
   */
  getAgentResults(agentId: string, limit: number = 100): TripwireResult[] {
    return this.results
      .filter(r => r.agentId === agentId)
      .slice(-limit);
  }

  /**
   * Get all results.
   */
  getAllResults(limit: number = 100): TripwireResult[] {
    return this.results.slice(-limit);
  }

  /**
   * Get failure rate for an agent.
   */
  getFailureRate(agentId: string): number {
    const agentResults = this.results.filter(r => r.agentId === agentId);
    if (agentResults.length === 0) return 0;

    const failures = agentResults.filter(r => !r.passed).length;
    return failures / agentResults.length;
  }

  /**
   * Clear results.
   */
  clearResults(): void {
    this.results = [];
  }

  /**
   * Get tripwire statistics.
   */
  getStats(): {
    totalTests: number;
    passed: number;
    failed: number;
    validTripwiresPassed: number;
    invalidTripwiresRejected: number;
  } {
    const validResults = this.results.filter(r => r.type === 'valid');
    const invalidResults = this.results.filter(r => r.type === 'invalid');

    return {
      totalTests: this.results.length,
      passed: this.results.filter(r => r.passed).length,
      failed: this.results.filter(r => !r.passed).length,
      validTripwiresPassed: validResults.filter(r => r.passed).length,
      invalidTripwiresRejected: invalidResults.filter(r => r.passed).length,
    };
  }
}

// Singleton instance
export const tripwireInjector = new TripwireInjector();
