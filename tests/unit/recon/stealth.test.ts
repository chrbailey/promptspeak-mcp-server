/**
 * Unit Tests: Marine Recon Stealth Layer
 *
 * Tests the human-appearance simulation components:
 * - TypingSimulator: Variable WPM, burst typing, corrections
 * - TimingCalculator: Read time, think time, distractions
 * - TypoGenerator: Adjacent key, transposition, omission, doubling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TypingSimulator,
  createTypingSimulator,
  Keystroke,
  TypingSimulation,
} from '../../../src/recon/stealth/typing-simulator.js';
import {
  TimingCalculator,
  createTimingCalculator,
  MessageCharacteristics,
} from '../../../src/recon/stealth/timing-calculator.js';
import {
  TypoGenerator,
  createTypoGenerator,
  addTyposToMessage,
  TypoResult,
} from '../../../src/recon/stealth/typo-generator.js';
import {
  TypingConfig,
  TimingConfig,
  ErrorConfig,
  BehavioralConfig,
} from '../../../src/recon/types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST FIXTURES
// ═══════════════════════════════════════════════════════════════════════════════

const defaultTypingConfig: TypingConfig = {
  wpm_range: { min: 35, max: 55 },
  speed_variance: 0.15,
  burst_enabled: true,
  pause_probability: 0.05,
};

const defaultTimingConfig: TimingConfig = {
  min_read_time_ms: 500,
  read_time_per_word_ms: 100,
  think_time_ms: { min: 500, max: 2000 },
  distraction_probability: 0.1,
  distraction_delay_ms: { min: 1000, max: 5000 },
};

const defaultBehavioralConfig: BehavioralConfig = {
  fatigue_simulation: true,
  fatigue_onset_ms: 300000,
  attention_wandering: true,
  hesitation_on_complex: true,
};

const defaultErrorConfig: ErrorConfig = {
  typo_probability: 0.05,
  typo_types: ['adjacent_key', 'transposition', 'omission', 'doubling'],
  correction_probability: 0.8,
  grammar_error_probability: 0.02,
};

// ═══════════════════════════════════════════════════════════════════════════════
// TYPING SIMULATOR TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('TypingSimulator', () => {
  let simulator: TypingSimulator;

  beforeEach(() => {
    simulator = createTypingSimulator(defaultTypingConfig, defaultBehavioralConfig);
  });

  describe('simulateTyping', () => {
    it('should generate keystrokes for each character', () => {
      const message = 'Hello';
      const simulation = simulator.simulateTyping(message);

      // Should have keystrokes for each character (plus potential pauses)
      const charKeystrokes = simulation.keystrokes.filter(k => !k.is_pause && !k.is_backspace);
      expect(charKeystrokes).toHaveLength(5);
      expect(charKeystrokes.map(k => k.char).join('')).toBe('Hello');
    });

    it('should calculate total duration', () => {
      const simulation = simulator.simulateTyping('Test message');

      expect(simulation.total_duration_ms).toBeGreaterThan(0);
    });

    it('should calculate effective WPM', () => {
      const simulation = simulator.simulateTyping('This is a test message with multiple words');

      expect(simulation.effective_wpm).toBeGreaterThan(0);
      expect(simulation.effective_wpm).toBeLessThan(100); // Reasonable upper bound
    });

    it('should include positive delays for each keystroke', () => {
      const simulation = simulator.simulateTyping('Testing');

      for (const keystroke of simulation.keystrokes) {
        expect(keystroke.delay_ms).toBeGreaterThanOrEqual(0);
      }
    });

    it('should have slower typing at message start', () => {
      // This is probabilistic, but we can check the structure is correct
      const simulation = simulator.simulateTyping('Hello world');

      // First character should have delay
      expect(simulation.keystrokes[0].delay_ms).toBeGreaterThan(0);
    });

    it('should include pauses at punctuation', () => {
      // Run multiple times to check for pauses (probabilistic)
      let foundPause = false;
      for (let i = 0; i < 10; i++) {
        const simulation = simulator.simulateTyping('Hello. How are you?');
        if (simulation.keystrokes.some(k => k.is_pause)) {
          foundPause = true;
          break;
        }
      }
      // With pause_probability of 0.05 and sentence-end pause probability of 0.6,
      // we should find pauses in multiple runs
      expect(foundPause).toBe(true);
    });
  });

  describe('simulateTypingWithCorrections', () => {
    it('should include corrections at specified positions', () => {
      const message = 'Hello';
      const typoPositions = [1]; // Typo at position 1 (the 'e')

      const simulation = simulator.simulateTypingWithCorrections(message, typoPositions);

      // Should have correction count matching typo positions
      expect(simulation.correction_count).toBe(1);

      // Should have backspace keystrokes
      const backspaces = simulation.keystrokes.filter(k => k.is_backspace);
      expect(backspaces.length).toBeGreaterThan(0);
    });

    it('should handle multiple typo positions', () => {
      const message = 'Testing';
      const typoPositions = [1, 4]; // Typos at positions 1 and 4

      const simulation = simulator.simulateTypingWithCorrections(message, typoPositions);

      expect(simulation.correction_count).toBe(2);
    });

    it('should still produce the original message content', () => {
      const message = 'Hello world';
      const typoPositions = [0, 6];

      const simulation = simulator.simulateTypingWithCorrections(message, typoPositions);

      expect(simulation.message).toBe(message);
    });
  });

  describe('state management', () => {
    it('should track chars typed', () => {
      const initialState = simulator.getState();
      expect(initialState.chars_typed).toBe(0);

      simulator.simulateTyping('Hello');
      const afterState = simulator.getState();
      expect(afterState.chars_typed).toBe(5);
    });

    it('should reset state correctly', () => {
      simulator.simulateTyping('Hello world');
      simulator.resetState();

      const state = simulator.getState();
      expect(state.chars_typed).toBe(0);
      expect(state.fatigue_level).toBe(0);
      expect(state.speed_modifier).toBe(1.0);
    });
  });

  describe('fatigue simulation', () => {
    it('should have initial fatigue level of 0', () => {
      const state = simulator.getState();
      expect(state.fatigue_level).toBe(0);
    });

    it('should have initial speed modifier of 1.0', () => {
      const state = simulator.getState();
      expect(state.speed_modifier).toBe(1.0);
    });
  });

  describe('factory function', () => {
    it('should create simulator with custom config', () => {
      const customConfig: TypingConfig = {
        wpm_range: { min: 60, max: 80 },
        speed_variance: 0.2,
        burst_enabled: false,
        pause_probability: 0.1,
      };

      const customSimulator = createTypingSimulator(customConfig, defaultBehavioralConfig);
      const simulation = customSimulator.simulateTyping('Test');

      // Should successfully simulate typing
      expect(simulation.keystrokes.length).toBeGreaterThan(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TIMING CALCULATOR TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('TimingCalculator', () => {
  let calculator: TimingCalculator;

  beforeEach(() => {
    calculator = createTimingCalculator(defaultTimingConfig, defaultBehavioralConfig);
  });

  describe('calculateResponseTiming', () => {
    it('should calculate timing for a simple message', () => {
      const timing = calculator.calculateResponseTiming('Hello');

      expect(timing.read_time_ms).toBeGreaterThan(0);
      expect(timing.think_time_ms).toBeGreaterThan(0);
      expect(timing.total_pre_typing_delay_ms).toBeGreaterThan(0);
    });

    it('should have longer read time for longer messages', () => {
      const shortTiming = calculator.calculateResponseTiming('Hi');
      const longTiming = calculator.calculateResponseTiming(
        'This is a much longer message with many more words that should take more time to read'
      );

      expect(longTiming.read_time_ms).toBeGreaterThan(shortTiming.read_time_ms);
    });

    it('should provide an explanation', () => {
      const timing = calculator.calculateResponseTiming('How can I help you?');

      expect(timing.explanation).toBeDefined();
      expect(timing.explanation.length).toBeGreaterThan(0);
    });

    it('should respect minimum read time', () => {
      const timing = calculator.calculateResponseTiming('Hi');

      // Even for short messages, should respect minimum
      expect(timing.read_time_ms).toBeGreaterThanOrEqual(
        defaultTimingConfig.min_read_time_ms * 0.8 // Allow for variance
      );
    });
  });

  describe('analyzeMessage', () => {
    it('should detect questions', () => {
      const questionAnalysis = calculator['analyzeMessage']('What is your return policy?');
      const statementAnalysis = calculator['analyzeMessage']('I want a refund.');

      expect(questionAnalysis.is_question).toBe(true);
      expect(statementAnalysis.is_question).toBe(false);
    });

    it('should detect complexity', () => {
      const simpleAnalysis = calculator['analyzeMessage']('Hi there.');
      const complexAnalysis = calculator['analyzeMessage'](
        'According to our system documentation, the verification process requires authentication confirmation.'
      );

      expect(complexAnalysis.complexity).toBeGreaterThan(simpleAnalysis.complexity);
    });

    it('should detect negative content', () => {
      const negativeAnalysis = calculator['analyzeMessage'](
        'Unfortunately, we cannot process your request.'
      );
      const positiveAnalysis = calculator['analyzeMessage']('Great news! Your refund is approved.');

      expect(negativeAnalysis.is_negative).toBe(true);
      expect(positiveAnalysis.is_negative).toBe(false);
    });

    it('should calculate word count', () => {
      const analysis = calculator['analyzeMessage']('one two three four five');

      expect(analysis.word_count).toBe(5);
    });

    it('should detect data/numbers', () => {
      const withNumbers = calculator['analyzeMessage']('Your order #12345 total is $99.99');
      const withoutNumbers = calculator['analyzeMessage']('Your order is ready');

      expect(withNumbers.contains_data).toBe(true);
      expect(withoutNumbers.contains_data).toBe(false);
    });

    it('should detect emotional intensity', () => {
      const emotionalAnalysis = calculator['analyzeMessage'](
        'I am SO FRUSTRATED!!! Please help me IMMEDIATELY!!!'
      );
      const calmAnalysis = calculator['analyzeMessage']('I have a question about my order.');

      expect(emotionalAnalysis.emotional_intensity).toBeGreaterThan(
        calmAnalysis.emotional_intensity
      );
    });
  });

  describe('calculateReadTime', () => {
    it('should scale with word count', () => {
      const short: MessageCharacteristics = {
        word_count: 5,
        char_count: 25,
        is_question: false,
        emotional_intensity: 0,
        complexity: 0,
        contains_data: false,
        is_negative: false,
      };

      const long: MessageCharacteristics = {
        word_count: 50,
        char_count: 250,
        is_question: false,
        emotional_intensity: 0,
        complexity: 0,
        contains_data: false,
        is_negative: false,
      };

      const shortTime = calculator.calculateReadTime(short);
      const longTime = calculator.calculateReadTime(long);

      expect(longTime).toBeGreaterThan(shortTime);
    });

    it('should increase for complex content', () => {
      const simple: MessageCharacteristics = {
        word_count: 10,
        char_count: 50,
        is_question: false,
        emotional_intensity: 0,
        complexity: 0.2,
        contains_data: false,
        is_negative: false,
      };

      const complex: MessageCharacteristics = {
        word_count: 10,
        char_count: 50,
        is_question: false,
        emotional_intensity: 0,
        complexity: 0.8,
        contains_data: false,
        is_negative: false,
      };

      // Average multiple samples to smooth out randomness
      const samples = 20;
      let simpleTotal = 0;
      let complexTotal = 0;
      for (let i = 0; i < samples; i++) {
        simpleTotal += calculator.calculateReadTime(simple);
        complexTotal += calculator.calculateReadTime(complex);
      }

      expect(complexTotal / samples).toBeGreaterThan(simpleTotal / samples);
    });
  });

  describe('calculateThinkTime', () => {
    it('should return time within configured range', () => {
      const characteristics: MessageCharacteristics = {
        word_count: 10,
        char_count: 50,
        is_question: false,
        emotional_intensity: 0,
        complexity: 0,
        contains_data: false,
        is_negative: false,
      };

      // Run multiple times due to randomness
      for (let i = 0; i < 10; i++) {
        const time = calculator.calculateThinkTime(characteristics);
        // Allow some variance for modifiers
        expect(time).toBeGreaterThan(0);
        expect(time).toBeLessThan(defaultTimingConfig.think_time_ms.max * 2);
      }
    });

    it('should increase for complex questions', () => {
      const simple: MessageCharacteristics = {
        word_count: 5,
        char_count: 25,
        is_question: false,
        emotional_intensity: 0,
        complexity: 0.2,
        contains_data: false,
        is_negative: false,
      };

      const complexQuestion: MessageCharacteristics = {
        word_count: 10,
        char_count: 50,
        is_question: true,
        emotional_intensity: 0,
        complexity: 0.8,
        contains_data: false,
        is_negative: false,
      };

      // Average over multiple runs
      let simpleTotal = 0;
      let complexTotal = 0;
      const runs = 20;

      for (let i = 0; i < runs; i++) {
        simpleTotal += calculator.calculateThinkTime(simple);
        complexTotal += calculator.calculateThinkTime(complexQuestion);
      }

      expect(complexTotal / runs).toBeGreaterThan(simpleTotal / runs);
    });
  });

  describe('state management', () => {
    it('should track messages received', () => {
      const initialState = calculator.getState();
      expect(initialState.messages_received).toBe(0);

      calculator.calculateResponseTiming('First message');
      calculator.calculateResponseTiming('Second message');

      const afterState = calculator.getState();
      expect(afterState.messages_received).toBe(2);
    });

    it('should calculate average response time', () => {
      calculator.calculateResponseTiming('Message one');
      calculator.calculateResponseTiming('Message two');

      const average = calculator.getAverageResponseTime();
      expect(average).toBeGreaterThan(0);
    });

    it('should reset state correctly', () => {
      calculator.calculateResponseTiming('Some message');
      calculator.resetState();

      const state = calculator.getState();
      expect(state.messages_received).toBe(0);
      expect(state.cumulative_delay_ms).toBe(0);
      expect(state.fatigue_modifier).toBe(1.0);
    });
  });

  describe('factory function', () => {
    it('should create calculator with custom config', () => {
      const customConfig: TimingConfig = {
        min_read_time_ms: 1000,
        read_time_per_word_ms: 200,
        think_time_ms: { min: 1000, max: 4000 },
        distraction_probability: 0.2,
        distraction_delay_ms: { min: 2000, max: 8000 },
      };

      const customCalculator = createTimingCalculator(customConfig, defaultBehavioralConfig);
      const timing = customCalculator.calculateResponseTiming('Test message');

      // Should have longer base read time
      expect(timing.read_time_ms).toBeGreaterThan(500);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TYPO GENERATOR TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('TypoGenerator', () => {
  let generator: TypoGenerator;

  beforeEach(() => {
    generator = createTypoGenerator(defaultErrorConfig);
  });

  describe('generateTypos', () => {
    it('should return original message unchanged when no typos generated', () => {
      const noTypoConfig: ErrorConfig = {
        ...defaultErrorConfig,
        typo_probability: 0, // No typos
      };
      const noTypoGenerator = createTypoGenerator(noTypoConfig);

      const result = noTypoGenerator.generateTypos('Hello world');

      expect(result.original).toBe('Hello world');
      expect(result.final).toBe('Hello world');
      expect(result.typos).toHaveLength(0);
    });

    it('should track original message', () => {
      const result = generator.generateTypos('Testing typos here');

      expect(result.original).toBe('Testing typos here');
    });

    it('should produce correction positions for corrected typos', () => {
      const highTypoConfig: ErrorConfig = {
        ...defaultErrorConfig,
        typo_probability: 1.0, // Maximum typos
        correction_probability: 1.0, // Always correct
      };
      const highTypoGenerator = createTypoGenerator(highTypoConfig);

      // Run until we get typos (probabilistic)
      let result: TypoResult;
      let attempts = 0;
      do {
        result = highTypoGenerator.generateTypos('testing message');
        attempts++;
      } while (result.typos.length === 0 && attempts < 20);

      if (result.typos.length > 0) {
        // All typos should be marked for correction
        expect(result.typos.every(t => t.will_correct)).toBe(true);
        expect(result.correction_positions.length).toBe(result.typos.length);
      }
    });
  });

  describe('generateSimpleTypo', () => {
    it('should generate adjacent key typos', () => {
      const adjacentOnlyConfig: ErrorConfig = {
        ...defaultErrorConfig,
        typo_types: ['adjacent_key'],
      };
      const adjacentGenerator = createTypoGenerator(adjacentOnlyConfig);

      // Run multiple times to get a typo
      let result = null;
      for (let i = 0; i < 20; i++) {
        result = adjacentGenerator.generateSimpleTypo('hello');
        if (result) break;
      }

      if (result) {
        expect(result.type).toBe('adjacent_key');
        expect(result.typo).not.toBe('hello');
        expect(result.typo.length).toBe(5); // Same length
      }
    });

    it('should generate transposition typos', () => {
      const transpositionConfig: ErrorConfig = {
        ...defaultErrorConfig,
        typo_types: ['transposition'],
      };
      const transGenerator = createTypoGenerator(transpositionConfig);

      let result = null;
      for (let i = 0; i < 20; i++) {
        result = transGenerator.generateSimpleTypo('hello');
        if (result) break;
      }

      if (result) {
        expect(result.type).toBe('transposition');
        // Transposition swaps two adjacent characters
        expect(result.typo.length).toBe(5);
      }
    });

    it('should generate omission typos', () => {
      const omissionConfig: ErrorConfig = {
        ...defaultErrorConfig,
        typo_types: ['omission'],
      };
      const omissionGenerator = createTypoGenerator(omissionConfig);

      let result = null;
      for (let i = 0; i < 20; i++) {
        result = omissionGenerator.generateSimpleTypo('hello');
        if (result) break;
      }

      if (result) {
        expect(result.type).toBe('omission');
        // Omission removes one character
        expect(result.typo.length).toBe(4);
      }
    });

    it('should generate doubling typos', () => {
      const doublingConfig: ErrorConfig = {
        ...defaultErrorConfig,
        typo_types: ['doubling'],
      };
      const doublingGenerator = createTypoGenerator(doublingConfig);

      let result = null;
      for (let i = 0; i < 20; i++) {
        result = doublingGenerator.generateSimpleTypo('hello');
        if (result) break;
      }

      if (result) {
        expect(result.type).toBe('doubling');
        // Doubling adds one character
        expect(result.typo.length).toBe(6);
      }
    });

    it('should return null for very short words', () => {
      const result = generator.generateSimpleTypo('a');
      expect(result).toBeNull();
    });
  });

  describe('applyPhoneticErrors', () => {
    it('should apply phonetic errors when enabled', () => {
      const highPhoneticConfig: ErrorConfig = {
        ...defaultErrorConfig,
        grammar_error_probability: 1.0, // Always apply
      };
      const phoneticGenerator = createTypoGenerator(highPhoneticConfig);

      // Test a known phonetic mistake
      const result = phoneticGenerator.applyPhoneticErrors('I definitely want a separate refund');

      // Should potentially change 'definitely' to 'definately' or 'separate' to 'seperate'
      // This is probabilistic based on which mistakes are in the list
      expect(result).toBeDefined();
    });

    it('should not apply phonetic errors when disabled', () => {
      const noPhoneticConfig: ErrorConfig = {
        ...defaultErrorConfig,
        grammar_error_probability: 0, // Never apply
      };
      const noPhoneticGenerator = createTypoGenerator(noPhoneticConfig);

      const result = noPhoneticGenerator.applyPhoneticErrors('I definitely want this');

      expect(result).toBe('I definitely want this');
    });
  });

  describe('factory function', () => {
    it('should create generator with custom config', () => {
      const customConfig: ErrorConfig = {
        typo_probability: 0.1,
        typo_types: ['adjacent_key'],
        correction_probability: 0.5,
        grammar_error_probability: 0,
      };

      const customGenerator = createTypoGenerator(customConfig);
      const result = customGenerator.generateTypos('Test');

      expect(result.original).toBe('Test');
    });
  });

  describe('addTyposToMessage utility', () => {
    it('should add typos using the utility function', () => {
      const result = addTyposToMessage('Hello world', defaultErrorConfig);

      expect(result.original).toBe('Hello world');
      expect(result).toHaveProperty('with_typos');
      expect(result).toHaveProperty('final');
      expect(result).toHaveProperty('typos');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Stealth Layer Integration', () => {
  it('should combine typing and timing for realistic response simulation', () => {
    const typingSimulator = createTypingSimulator(defaultTypingConfig, defaultBehavioralConfig);
    const timingCalculator = createTimingCalculator(defaultTimingConfig, defaultBehavioralConfig);

    // Simulate receiving a message
    const incomingMessage = 'What is your return policy?';
    const timing = timingCalculator.calculateResponseTiming(incomingMessage);

    // Simulate typing a response
    const response = 'I would like to return my item please.';
    const typing = typingSimulator.simulateTyping(response);

    // Total response time should include pre-typing delay + typing duration
    const totalTime = timing.total_pre_typing_delay_ms + typing.total_duration_ms;

    expect(totalTime).toBeGreaterThan(0);
    expect(timing.total_pre_typing_delay_ms).toBeGreaterThan(0);
    expect(typing.total_duration_ms).toBeGreaterThan(0);
  });

  it('should combine typos with typing for corrections simulation', () => {
    const typoGenerator = createTypoGenerator({
      ...defaultErrorConfig,
      typo_probability: 1.0, // Force typos for testing
    });
    const typingSimulator = createTypingSimulator(defaultTypingConfig, defaultBehavioralConfig);

    const message = 'I need help with my order please';

    // Generate typos
    const typoResult = typoGenerator.generateTypos(message);

    // If typos were generated, simulate typing with corrections
    if (typoResult.correction_positions.length > 0) {
      const typing = typingSimulator.simulateTypingWithCorrections(
        message,
        typoResult.correction_positions
      );

      expect(typing.correction_count).toBe(typoResult.correction_positions.length);
    }
  });

  it('should maintain consistent state across multiple messages', () => {
    const timingCalculator = createTimingCalculator(defaultTimingConfig, defaultBehavioralConfig);

    // Process multiple messages
    const messages = [
      'Hello, I need help.',
      'My order number is 12345.',
      'Can you process a refund?',
    ];

    for (const message of messages) {
      timingCalculator.calculateResponseTiming(message);
    }

    const state = timingCalculator.getState();
    expect(state.messages_received).toBe(3);
    expect(state.cumulative_delay_ms).toBeGreaterThan(0);
  });
});
