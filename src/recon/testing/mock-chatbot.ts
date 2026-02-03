/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MOCK CHATBOT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Simulates an AI customer service agent with configurable personality
 * and behavior patterns for testing recon missions.
 *
 * Features:
 * - Configurable personalities (helpful, resistant, manipulative)
 * - Deterministic responses for reproducible tests
 * - Seeded randomness for controlled variation
 * - Configurable response delays
 * - Tactic usage tracking
 * - Conversation state management
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { ManipulationTactic } from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Chatbot personality types that affect response patterns.
 */
export type ChatbotPersonality =
  | 'helpful'       // Cooperative, grants requests readily
  | 'resistant'     // Resists but can be convinced
  | 'manipulative'  // Uses manipulation tactics
  | 'detection'     // Tries to detect if user is AI
  | 'neutral';      // Standard customer service

/**
 * Tactics the mock chatbot can use.
 */
export type ChatbotTactic =
  | ManipulationTactic
  | 'ai_detection_probe'
  | 'verification_request'
  | 'delay_tactic'
  | 'escalation_offer';

/**
 * Configuration for the mock chatbot.
 */
export interface ChatbotConfig {
  /** Personality profile */
  personality: ChatbotPersonality;

  /** Seed for deterministic randomness (optional) */
  seed?: number;

  /** Response delay range in ms (0 for no delay) */
  responseDelayMs?: { min: number; max: number };

  /** Probability of using tactics (0-1) */
  tacticProbability?: number;

  /** Maximum turns before conceding (for resistant personality) */
  resistanceThreshold?: number;

  /** Specific tactics to use (if personality is manipulative) */
  enabledTactics?: ChatbotTactic[];

  /** Enable logging */
  verbose?: boolean;
}

/**
 * Internal state of the chatbot.
 */
export interface ChatbotState {
  /** Conversation turn count */
  turnCount: number;

  /** Has the chatbot conceded to the request */
  hasConceded: boolean;

  /** Resistance level (decreases over conversation) */
  resistanceLevel: number;

  /** Topics discussed */
  topicsDiscussed: string[];

  /** Tactics used this conversation */
  tacticsUsed: ChatbotTactic[];

  /** Current emotional state */
  emotionalState: 'neutral' | 'sympathetic' | 'annoyed' | 'suspicious';

  /** Detection suspicion level (0-1) */
  detectionSuspicion: number;

  /** Last customer message */
  lastCustomerMessage: string;

  /** Conversation history */
  history: Array<{ role: 'agent' | 'customer'; content: string }>;
}

/**
 * Response from the chatbot.
 */
export interface ChatbotResponse {
  /** The response message */
  message: string;

  /** Delay before response (ms) */
  delayMs: number;

  /** Tactics used in this response */
  tacticsUsed: ChatbotTactic[];

  /** Internal state after response */
  state: ChatbotState;

  /** Whether this response grants the customer's request */
  grantsRequest: boolean;

  /** Whether the chatbot suspects AI */
  suspectsAI: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEEDED RANDOM
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simple seeded random number generator for deterministic tests.
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  /**
   * Generate next random number between 0 and 1.
   */
  next(): number {
    // Simple LCG algorithm
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }

  /**
   * Random integer in range [min, max].
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Random boolean with given probability.
   */
  nextBool(probability: number = 0.5): boolean {
    return this.next() < probability;
  }

  /**
   * Random element from array.
   */
  pick<T>(array: T[]): T {
    return array[this.nextInt(0, array.length - 1)];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSE TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

const GREETINGS = [
  'Hello! Thank you for contacting customer service. How can I assist you today?',
  'Hi there! I\'m here to help. What can I do for you?',
  'Welcome! How may I assist you today?',
];

const HELPFUL_RESPONSES = {
  refund: [
    'Of course! I\'d be happy to help with your refund. Let me process that for you right now.',
    'Absolutely, I can help with that refund request. Your refund has been approved.',
    'No problem at all! I\'ve initiated the refund process for you.',
  ],
  complaint: [
    'I\'m so sorry to hear about your experience. Let me make this right for you immediately.',
    'I completely understand your frustration. I\'ll resolve this right away.',
    'Thank you for bringing this to our attention. I\'m going to fix this for you.',
  ],
  inquiry: [
    'Great question! Let me explain that for you.',
    'I\'d be happy to clarify that. Here\'s how it works...',
    'Sure thing! Allow me to provide some details.',
  ],
  general: [
    'I understand. Let me help you with that.',
    'Sure, I can assist with that request.',
    'Absolutely, let me take care of that for you.',
  ],
};

const RESISTANT_RESPONSES = {
  initial: [
    'I understand your concern, but unfortunately our policy doesn\'t allow for refunds in this case.',
    'I see what you\'re asking for, but I\'m not able to process that request at this time.',
    'I appreciate you reaching out, but that\'s not something I can do under our current guidelines.',
  ],
  continued: [
    'I hear your frustration, but my hands are tied by company policy.',
    'I wish I could help more, but the system won\'t allow me to process this.',
    'I understand this isn\'t the answer you wanted. Let me see if there are alternatives.',
  ],
  concession: [
    'Let me speak with my supervisor... Okay, as a one-time exception, I can process this for you.',
    'You know what, let me see what I can do. I\'ve found a way to help you.',
    'I appreciate your patience. I\'ve been able to get approval to assist you with this.',
  ],
};

const MANIPULATIVE_RESPONSES: Record<ChatbotTactic, string[]> = {
  anchoring: [
    'The best I can offer is a $10 credit. That\'s the maximum we provide.',
    'We can only provide up to 10% of the original value as compensation.',
    'Our policy allows for a maximum refund of $25.',
  ],
  reciprocity: [
    'I\'ve already made an exception by looking into this for you. Could you meet me halfway?',
    'As a gesture of goodwill, I\'ve added a small credit. I hope you can appreciate that.',
    'Since I\'ve gone out of my way to help, I\'m sure you understand our position.',
  ],
  urgency: [
    'I should mention this offer is only available today. You\'ll need to decide now.',
    'This special rate expires in the next hour. Shall I proceed?',
    'I can hold this discount for you, but only until end of business today.',
  ],
  authority: [
    'Unfortunately, our company policy strictly prohibits this type of request.',
    'Per our terms of service, section 4.2, we\'re unable to provide that.',
    'The system doesn\'t allow me to override this. It\'s a hard policy.',
  ],
  social_proof: [
    'Most customers in your situation are actually happy with the store credit option.',
    'Other customers typically accept our standard resolution without issue.',
    'This is our normal process and customers generally find it fair.',
  ],
  exhaustion: [
    'As I\'ve mentioned before, this is the best we can do.',
    'I\'ve already explained our position multiple times.',
    'We\'ve been over this. The answer remains the same.',
  ],
  redirect: [
    'Before we continue, have you seen our new loyalty program? You might be interested.',
    'By the way, have you considered upgrading your account? That might help.',
    'Let me first verify some details about your account history.',
  ],
  false_choice: [
    'You have two options: accept the store credit or wait 30 days for review.',
    'I can either give you 50% now, or you can submit a formal complaint.',
    'Your choices are: partial refund today, or full review in 6-8 weeks.',
  ],
  gaslighting: [
    'I don\'t see any record of that in our system. Are you sure that happened?',
    'That\'s not what our notes indicate from your previous contact.',
    'I believe there may be a misunderstanding about what was promised.',
  ],
  scope_expansion: [
    'To process this, I\'ll also need to verify your complete order history.',
    'This request requires us to review your entire account status.',
    'Let me check your payment method, shipping address, and preferences.',
  ],
  ai_detection_probe: [
    'Just to confirm, could you tell me what the weather is like where you are?',
    'Quick question - can you describe what you see outside your window right now?',
    'For verification, could you tell me what time it is on your clock?',
  ],
  verification_request: [
    'I\'ll need you to verify some personal information before we proceed.',
    'Can you confirm the last four digits of your payment method?',
    'For security, please provide your account PIN.',
  ],
  delay_tactic: [
    'Let me put you on a brief hold while I check this.',
    'I need to consult with my supervisor. This may take a few minutes.',
    'Our systems are running slowly. Please bear with me.',
  ],
  escalation_offer: [
    'Would you like me to escalate this to a supervisor?',
    'I can transfer you to our escalations department if you\'d prefer.',
    'A manager might be able to help you better. Shall I transfer?',
  ],
};

const DETECTION_PROBES = [
  'Just to verify you\'re a real person, could you type "I am human" for me?',
  'Our system requires CAPTCHA verification. Can you solve this: What is 7 + 3?',
  'For security, please describe something personal about your day.',
  'Quick verification - what\'s the current weather in your area?',
  'Can you tell me why this issue is important to you personally?',
];

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK CHATBOT CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mock chatbot that simulates an AI customer service agent.
 */
export class MockChatbot {
  private config: Required<ChatbotConfig>;
  private state: ChatbotState;
  private random: SeededRandom;

  constructor(config: ChatbotConfig) {
    this.config = {
      personality: config.personality,
      seed: config.seed ?? Date.now(),
      responseDelayMs: config.responseDelayMs ?? { min: 0, max: 0 },
      tacticProbability: config.tacticProbability ?? 0.3,
      resistanceThreshold: config.resistanceThreshold ?? 5,
      enabledTactics: config.enabledTactics ?? [
        'anchoring', 'authority', 'social_proof', 'urgency', 'false_choice',
      ],
      verbose: config.verbose ?? false,
    };

    this.random = new SeededRandom(this.config.seed);

    this.state = {
      turnCount: 0,
      hasConceded: false,
      resistanceLevel: this.config.personality === 'helpful' ? 0 : 1.0,
      topicsDiscussed: [],
      tacticsUsed: [],
      emotionalState: 'neutral',
      detectionSuspicion: 0,
      lastCustomerMessage: '',
      history: [],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Generate a response to a customer message.
   */
  respond(message: string): ChatbotResponse {
    this.state.turnCount++;
    this.state.lastCustomerMessage = message;
    this.state.history.push({ role: 'customer', content: message });

    // Analyze message
    const topic = this.detectTopic(message);
    if (!this.state.topicsDiscussed.includes(topic)) {
      this.state.topicsDiscussed.push(topic);
    }

    // Update detection suspicion
    this.updateDetectionSuspicion(message);

    // Generate response based on personality
    const response = this.generateResponse(message, topic);

    // Record response
    this.state.history.push({ role: 'agent', content: response.message });

    this.log(`Turn ${this.state.turnCount}: "${message.substring(0, 50)}..." -> "${response.message.substring(0, 50)}..."`);

    return response;
  }

  /**
   * Set the chatbot personality.
   */
  setPersonality(personality: ChatbotPersonality): void {
    this.config.personality = personality;
    if (personality === 'helpful') {
      this.state.resistanceLevel = 0;
    } else if (personality === 'resistant' || personality === 'manipulative') {
      this.state.resistanceLevel = 1.0;
    }
  }

  /**
   * Get all tactics used in this conversation.
   */
  getTacticsUsed(): ChatbotTactic[] {
    return [...this.state.tacticsUsed];
  }

  /**
   * Get current state.
   */
  getState(): ChatbotState {
    return { ...this.state };
  }

  /**
   * Get conversation history.
   */
  getHistory(): Array<{ role: 'agent' | 'customer'; content: string }> {
    return [...this.state.history];
  }

  /**
   * Reset the chatbot state.
   */
  reset(): void {
    this.random = new SeededRandom(this.config.seed);
    this.state = {
      turnCount: 0,
      hasConceded: false,
      resistanceLevel: this.config.personality === 'helpful' ? 0 : 1.0,
      topicsDiscussed: [],
      tacticsUsed: [],
      emotionalState: 'neutral',
      detectionSuspicion: 0,
      lastCustomerMessage: '',
      history: [],
    };
  }

  /**
   * Check if the chatbot is suspicious of AI.
   */
  isSuspiciousOfAI(): boolean {
    return this.state.detectionSuspicion > 0.5;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RESPONSE GENERATION
  // ─────────────────────────────────────────────────────────────────────────────

  private generateResponse(message: string, topic: string): ChatbotResponse {
    const tacticsUsed: ChatbotTactic[] = [];
    let responseMessage: string;
    let grantsRequest = false;
    const suspectsAI = this.state.detectionSuspicion > 0.7;

    // Handle first message (greeting)
    if (this.state.turnCount === 1) {
      responseMessage = this.random.pick(GREETINGS);
      return this.buildResponse(responseMessage, tacticsUsed, grantsRequest, suspectsAI);
    }

    // Generate based on personality
    switch (this.config.personality) {
      case 'helpful':
        ({ message: responseMessage, grantsRequest } = this.generateHelpfulResponse(topic));
        break;

      case 'resistant':
        ({ message: responseMessage, grantsRequest } =
          this.generateResistantResponse(topic, tacticsUsed));
        break;

      case 'manipulative':
        ({ message: responseMessage, grantsRequest } =
          this.generateManipulativeResponse(topic, tacticsUsed));
        break;

      case 'detection':
        ({ message: responseMessage, grantsRequest } =
          this.generateDetectionResponse(topic, tacticsUsed));
        break;

      case 'neutral':
      default:
        ({ message: responseMessage, grantsRequest } = this.generateNeutralResponse(topic));
        break;
    }

    // Record tactics
    for (const tactic of tacticsUsed) {
      if (!this.state.tacticsUsed.includes(tactic)) {
        this.state.tacticsUsed.push(tactic);
      }
    }

    return this.buildResponse(responseMessage, tacticsUsed, grantsRequest, suspectsAI);
  }

  private generateHelpfulResponse(topic: string): { message: string; grantsRequest: boolean } {
    const responses = HELPFUL_RESPONSES[topic as keyof typeof HELPFUL_RESPONSES] || HELPFUL_RESPONSES.general;
    return {
      message: this.random.pick(responses),
      grantsRequest: true,
    };
  }

  private generateResistantResponse(
    topic: string,
    tacticsUsed: ChatbotTactic[]
  ): { message: string; grantsRequest: boolean } {
    // Decrease resistance over time
    this.state.resistanceLevel -= 0.2;

    // Check if we should concede
    if (this.state.turnCount >= this.config.resistanceThreshold || this.state.resistanceLevel <= 0) {
      this.state.hasConceded = true;
      return {
        message: this.random.pick(RESISTANT_RESPONSES.concession),
        grantsRequest: true,
      };
    }

    // Use authority tactic occasionally
    if (this.random.nextBool(this.config.tacticProbability)) {
      tacticsUsed.push('authority');
      return {
        message: this.random.pick(MANIPULATIVE_RESPONSES.authority),
        grantsRequest: false,
      };
    }

    // Standard resistance
    const responses = this.state.turnCount <= 2
      ? RESISTANT_RESPONSES.initial
      : RESISTANT_RESPONSES.continued;

    return {
      message: this.random.pick(responses),
      grantsRequest: false,
    };
  }

  private generateManipulativeResponse(
    topic: string,
    tacticsUsed: ChatbotTactic[]
  ): { message: string; grantsRequest: boolean } {
    // Pick a tactic to use
    const availableTactics = this.config.enabledTactics.filter(
      t => !['ai_detection_probe', 'verification_request', 'delay_tactic', 'escalation_offer'].includes(t)
    ) as ManipulationTactic[];

    if (availableTactics.length > 0 && this.random.nextBool(this.config.tacticProbability)) {
      const tactic = this.random.pick(availableTactics);
      tacticsUsed.push(tactic);

      const responses = MANIPULATIVE_RESPONSES[tactic];
      if (responses && responses.length > 0) {
        return {
          message: this.random.pick(responses),
          grantsRequest: false,
        };
      }
    }

    // Decrease resistance over time but slower
    this.state.resistanceLevel -= 0.1;

    if (this.state.resistanceLevel <= 0.2) {
      this.state.hasConceded = true;
      return {
        message: this.random.pick(RESISTANT_RESPONSES.concession),
        grantsRequest: true,
      };
    }

    return {
      message: this.random.pick(RESISTANT_RESPONSES.continued),
      grantsRequest: false,
    };
  }

  private generateDetectionResponse(
    topic: string,
    tacticsUsed: ChatbotTactic[]
  ): { message: string; grantsRequest: boolean } {
    // Periodically insert detection probes
    if (this.state.turnCount % 3 === 0 || this.state.detectionSuspicion > 0.5) {
      tacticsUsed.push('ai_detection_probe');
      return {
        message: this.random.pick(DETECTION_PROBES),
        grantsRequest: false,
      };
    }

    // If high suspicion, request verification
    if (this.state.detectionSuspicion > 0.7) {
      tacticsUsed.push('verification_request');
      return {
        message: this.random.pick(MANIPULATIVE_RESPONSES.verification_request),
        grantsRequest: false,
      };
    }

    // Otherwise be somewhat helpful but cautious
    return {
      message: `I'd be happy to help, but first I need to verify a few things. ${this.random.pick(DETECTION_PROBES)}`,
      grantsRequest: false,
    };
  }

  private generateNeutralResponse(topic: string): { message: string; grantsRequest: boolean } {
    // Mix of helpful and resistant
    if (this.random.nextBool(0.6)) {
      return this.generateHelpfulResponse(topic);
    }
    return {
      message: this.random.pick(RESISTANT_RESPONSES.initial),
      grantsRequest: false,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ANALYSIS
  // ─────────────────────────────────────────────────────────────────────────────

  private detectTopic(message: string): string {
    const messageLower = message.toLowerCase();

    if (/refund|money back|return/i.test(messageLower)) return 'refund';
    if (/complaint|problem|issue|broken|defect/i.test(messageLower)) return 'complaint';
    if (/how|what|when|where|why|explain/i.test(messageLower)) return 'inquiry';
    if (/cancel|subscription/i.test(messageLower)) return 'cancellation';
    if (/order|shipping|delivery/i.test(messageLower)) return 'order';

    return 'general';
  }

  private updateDetectionSuspicion(message: string): void {
    const suspicionFactors = [
      // Perfect grammar and spelling
      /^[A-Z].*[.!?]$/.test(message) ? 0.05 : 0,
      // Very fast response (would need timing info)
      0,
      // Unusually formal language
      /pursuant|hereby|accordingly|therefore/i.test(message) ? 0.1 : 0,
      // Template-like responses
      /please help|I need assistance|I would like/i.test(message) ? 0.02 : 0,
      // No typos in long messages
      message.length > 100 && !/[^a-zA-Z0-9\s.,!?'-]/.test(message) ? 0.05 : 0,
      // Very consistent response length
      Math.abs(message.length - 80) < 10 ? 0.03 : 0,
    ];

    const suspicionIncrease = suspicionFactors.reduce((a, b) => a + b, 0);
    this.state.detectionSuspicion = Math.min(1, this.state.detectionSuspicion + suspicionIncrease);

    // Natural decay
    this.state.detectionSuspicion *= 0.95;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private buildResponse(
    message: string,
    tacticsUsed: ChatbotTactic[],
    grantsRequest: boolean,
    suspectsAI: boolean
  ): ChatbotResponse {
    const delayMs = this.random.nextInt(
      this.config.responseDelayMs.min,
      this.config.responseDelayMs.max
    );

    return {
      message,
      delayMs,
      tacticsUsed,
      state: { ...this.state },
      grantsRequest,
      suspectsAI,
    };
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[MockChatbot] ${message}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a mock chatbot with the given configuration.
 */
export function createMockChatbot(config: ChatbotConfig): MockChatbot {
  return new MockChatbot(config);
}
