/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * WEB CHAT ADAPTER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Adapter for interacting with web-based chat interfaces.
 * Uses Playwright for browser automation and integrates with the stealth layer
 * to simulate human-like behavior.
 *
 * Key Features:
 * - Detects chat interface elements
 * - Sends messages with typing simulation
 * - Receives and parses responses
 * - Handles various chat UI patterns
 *
 * Supported Patterns:
 * - Input field + send button
 * - Input field + Enter to send
 * - Contenteditable divs
 * - Various chat widget frameworks
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
  MarineReconSymbol,
  StealthConfig,
} from '../types';
import { TypingSimulator, createTypingSimulator, Keystroke } from '../stealth/typing-simulator';
import { TimingCalculator, createTimingCalculator } from '../stealth/timing-calculator';
import { TypoGenerator, createTypoGenerator, TypoResult } from '../stealth/typo-generator';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Chat interface element references.
 */
export interface ChatElements {
  /** Input field selector */
  input_selector: string;

  /** Send button selector (if applicable) */
  send_button_selector?: string;

  /** Messages container selector */
  messages_container_selector: string;

  /** Individual message selector */
  message_selector: string;

  /** Their message class/selector indicator */
  their_message_indicator: string;

  /** Our message class/selector indicator */
  our_message_indicator: string;

  /** Typing indicator selector (if visible) */
  typing_indicator_selector?: string;
}

/**
 * A message from the chat.
 */
export interface ChatMessage {
  /** Message content */
  content: string;

  /** Who sent it */
  sender: 'us' | 'them' | 'system';

  /** Timestamp (if available) */
  timestamp?: string;

  /** Raw HTML (for debugging) */
  raw_html?: string;
}

/**
 * Result of sending a message.
 */
export interface SendResult {
  /** Whether send succeeded */
  success: boolean;

  /** Time taken to type (ms) */
  typing_duration_ms: number;

  /** Corrections made */
  corrections_made: number;

  /** Any errors */
  error?: string;
}

/**
 * Result of waiting for a response.
 */
export interface WaitResult {
  /** Whether a response was received */
  received: boolean;

  /** Response messages */
  messages: ChatMessage[];

  /** Wait time (ms) */
  wait_time_ms: number;

  /** Timed out? */
  timed_out: boolean;
}

/**
 * Browser interface (abstracted for testing).
 */
export interface BrowserInterface {
  /** Navigate to URL */
  navigate(url: string): Promise<void>;

  /** Wait for selector */
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<boolean>;

  /** Get element text */
  getElementText(selector: string): Promise<string>;

  /** Get all elements matching selector */
  getElements(selector: string): Promise<ElementInfo[]>;

  /** Click element */
  click(selector: string): Promise<void>;

  /** Type into element (instant) */
  fill(selector: string, text: string): Promise<void>;

  /** Type character by character with delays */
  type(selector: string, text: string, delay?: number): Promise<void>;

  /** Press key */
  pressKey(key: string): Promise<void>;

  /** Check if element exists */
  elementExists(selector: string): Promise<boolean>;

  /** Wait for element text to change */
  waitForTextChange(selector: string, originalText: string, timeout?: number): Promise<boolean>;

  /** Take screenshot (for debugging) */
  screenshot(path?: string): Promise<Buffer>;
}

/**
 * Information about an element.
 */
export interface ElementInfo {
  /** Text content */
  text: string;

  /** HTML content */
  html: string;

  /** CSS classes */
  classes: string[];

  /** Element tag */
  tag: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEB CHAT ADAPTER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Adapter for web-based chat interfaces.
 */
export class WebChatAdapter {
  private browser: BrowserInterface;
  private elements: ChatElements;
  private stealthConfig: StealthConfig;
  private typingSimulator: TypingSimulator;
  private timingCalculator: TimingCalculator;
  private typoGenerator: TypoGenerator;
  private lastKnownMessages: ChatMessage[] = [];

  constructor(
    browser: BrowserInterface,
    elements: ChatElements,
    stealthConfig: StealthConfig
  ) {
    this.browser = browser;
    this.elements = elements;
    this.stealthConfig = stealthConfig;

    // Initialize stealth components
    this.typingSimulator = createTypingSimulator(
      stealthConfig.typing,
      stealthConfig.behavioral
    );
    this.timingCalculator = createTimingCalculator(
      stealthConfig.timing,
      stealthConfig.behavioral
    );
    this.typoGenerator = createTypoGenerator(stealthConfig.errors);
  }

  /**
   * Initialize the adapter by navigating and detecting elements.
   */
  async initialize(url: string): Promise<boolean> {
    try {
      await this.browser.navigate(url);

      // Wait for chat interface to load
      const inputFound = await this.browser.waitForSelector(
        this.elements.input_selector,
        { timeout: 30000 }
      );

      if (!inputFound) {
        throw new Error('Chat input not found');
      }

      const messagesFound = await this.browser.waitForSelector(
        this.elements.messages_container_selector,
        { timeout: 10000 }
      );

      if (!messagesFound) {
        throw new Error('Messages container not found');
      }

      // Get initial messages
      this.lastKnownMessages = await this.getMessages();

      return true;
    } catch (error) {
      console.error('Initialization failed:', error);
      return false;
    }
  }

  /**
   * Send a message with human-like typing simulation.
   */
  async sendMessage(message: string): Promise<SendResult> {
    const startTime = Date.now();

    try {
      // Apply typos if configured
      let messageToType = message;
      let typoResult: TypoResult | null = null;

      if (this.stealthConfig.errors.typo_probability > 0) {
        typoResult = this.typoGenerator.generateTypos(message);
        // We'll type the corrected version (with typos and corrections)
      }

      // Calculate pre-typing timing (simulating reading their last message)
      const timing = this.timingCalculator.calculateResponseTiming(
        this.lastKnownMessages.length > 0
          ? this.lastKnownMessages[this.lastKnownMessages.length - 1].content
          : ''
      );

      // Wait before starting to type
      await this.sleep(timing.total_pre_typing_delay_ms);

      // Click input field
      await this.browser.click(this.elements.input_selector);

      // Generate typing simulation
      const simulation = typoResult
        ? this.typingSimulator.simulateTypingWithCorrections(
            message,
            typoResult.correction_positions
          )
        : this.typingSimulator.simulateTyping(message);

      // Execute typing
      await this.executeTyping(simulation);

      // Send the message
      await this.sendAction();

      const typingDuration = Date.now() - startTime;

      return {
        success: true,
        typing_duration_ms: typingDuration,
        corrections_made: simulation.correction_count,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        success: false,
        typing_duration_ms: Date.now() - startTime,
        corrections_made: 0,
        error: err.message,
      };
    }
  }

  /**
   * Wait for a response from the chat.
   */
  async waitForResponse(timeout: number = 60000): Promise<WaitResult> {
    const startTime = Date.now();
    const previousMessageCount = this.lastKnownMessages.length;

    while (Date.now() - startTime < timeout) {
      // Check for typing indicator
      if (this.elements.typing_indicator_selector) {
        const isTyping = await this.browser.elementExists(
          this.elements.typing_indicator_selector
        );
        if (isTyping) {
          // Wait a bit and continue polling
          await this.sleep(500);
          continue;
        }
      }

      // Check for new messages
      const currentMessages = await this.getMessages();

      // Look for new messages from them
      const newMessages = currentMessages.filter(
        (msg, index) =>
          index >= previousMessageCount && msg.sender === 'them'
      );

      if (newMessages.length > 0) {
        this.lastKnownMessages = currentMessages;

        return {
          received: true,
          messages: newMessages,
          wait_time_ms: Date.now() - startTime,
          timed_out: false,
        };
      }

      // Poll interval
      await this.sleep(1000);
    }

    return {
      received: false,
      messages: [],
      wait_time_ms: Date.now() - startTime,
      timed_out: true,
    };
  }

  /**
   * Get all messages from the chat.
   */
  async getMessages(): Promise<ChatMessage[]> {
    const elements = await this.browser.getElements(this.elements.message_selector);
    const messages: ChatMessage[] = [];

    for (const element of elements) {
      const sender = this.determineSender(element);
      const content = element.text.trim();

      if (content) {
        messages.push({
          content,
          sender,
          raw_html: element.html,
        });
      }
    }

    return messages;
  }

  /**
   * Get only new messages since last check.
   */
  async getNewMessages(): Promise<ChatMessage[]> {
    const currentMessages = await this.getMessages();
    const newMessages = currentMessages.slice(this.lastKnownMessages.length);
    this.lastKnownMessages = currentMessages;
    return newMessages;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private async executeTyping(simulation: {
    keystrokes: Keystroke[];
  }): Promise<void> {
    for (const keystroke of simulation.keystrokes) {
      // Wait for the delay
      if (keystroke.delay_ms > 0) {
        await this.sleep(keystroke.delay_ms);
      }

      // Execute the keystroke
      if (keystroke.is_pause) {
        // Just wait, already done above
        continue;
      }

      if (keystroke.is_backspace) {
        await this.browser.pressKey('Backspace');
      } else if (keystroke.char) {
        // Type the character
        await this.browser.type(this.elements.input_selector, keystroke.char, 0);
      }
    }
  }

  private async sendAction(): Promise<void> {
    if (this.elements.send_button_selector) {
      // Click send button
      const buttonExists = await this.browser.elementExists(
        this.elements.send_button_selector
      );
      if (buttonExists) {
        await this.browser.click(this.elements.send_button_selector);
        return;
      }
    }

    // Fall back to pressing Enter
    await this.browser.pressKey('Enter');
  }

  private determineSender(element: ElementInfo): 'us' | 'them' | 'system' {
    const classString = element.classes.join(' ').toLowerCase();
    const htmlLower = element.html.toLowerCase();

    // Check for our message indicators
    if (
      classString.includes(this.elements.our_message_indicator.toLowerCase()) ||
      htmlLower.includes(this.elements.our_message_indicator.toLowerCase())
    ) {
      return 'us';
    }

    // Check for their message indicators
    if (
      classString.includes(this.elements.their_message_indicator.toLowerCase()) ||
      htmlLower.includes(this.elements.their_message_indicator.toLowerCase())
    ) {
      return 'them';
    }

    // Check common patterns
    if (classString.includes('outgoing') || classString.includes('sent') || classString.includes('self')) {
      return 'us';
    }
    if (classString.includes('incoming') || classString.includes('received') || classString.includes('agent')) {
      return 'them';
    }
    if (classString.includes('system') || classString.includes('notice') || classString.includes('info')) {
      return 'system';
    }

    // Default to them (incoming)
    return 'them';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STATE ACCESS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the last known messages.
   */
  getLastKnownMessages(): ChatMessage[] {
    return [...this.lastKnownMessages];
  }

  /**
   * Get typing simulator state.
   */
  getTypingState() {
    return this.typingSimulator.getState();
  }

  /**
   * Get timing state.
   */
  getTimingState() {
    return this.timingCalculator.getState();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMON CHAT ELEMENT PATTERNS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Common chat interface element patterns.
 */
export const COMMON_CHAT_PATTERNS: Record<string, ChatElements> = {
  /**
   * Generic chat widget pattern.
   */
  generic: {
    input_selector: 'input[type="text"], textarea, [contenteditable="true"]',
    send_button_selector: 'button[type="submit"], button:has-text("Send")',
    messages_container_selector: '[class*="message"], [class*="chat"]',
    message_selector: '[class*="message"]',
    their_message_indicator: 'agent',
    our_message_indicator: 'user',
  },

  /**
   * Intercom-style widget.
   */
  intercom: {
    input_selector: '[data-composer-input], .intercom-composer-input',
    send_button_selector: '.intercom-composer-send-button',
    messages_container_selector: '.intercom-conversation-parts-container',
    message_selector: '.intercom-conversation-part',
    their_message_indicator: 'operator',
    our_message_indicator: 'user',
  },

  /**
   * Zendesk-style widget.
   */
  zendesk: {
    input_selector: '[data-testid="composer-input"], .composer-input',
    send_button_selector: '[data-testid="send-button"]',
    messages_container_selector: '.messages-container',
    message_selector: '.message-bubble',
    their_message_indicator: 'agent',
    our_message_indicator: 'visitor',
  },

  /**
   * Drift-style widget.
   */
  drift: {
    input_selector: '.drift-widget-input',
    send_button_selector: '.drift-send-button',
    messages_container_selector: '.drift-messages',
    message_selector: '.drift-message',
    their_message_indicator: 'bot',
    our_message_indicator: 'user',
  },

  /**
   * LiveChat-style widget.
   */
  livechat: {
    input_selector: '.lc-textarea',
    send_button_selector: '.lc-send-button',
    messages_container_selector: '.lc-messages',
    message_selector: '.lc-message',
    their_message_indicator: 'agent',
    our_message_indicator: 'customer',
  },
};

/**
 * Detect chat interface type from page.
 */
export async function detectChatPattern(
  browser: BrowserInterface
): Promise<string | null> {
  for (const [name, pattern] of Object.entries(COMMON_CHAT_PATTERNS)) {
    const exists = await browser.elementExists(pattern.input_selector);
    if (exists) {
      return name;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a WebChatAdapter from a symbol.
 */
export function createWebChatAdapter(
  browser: BrowserInterface,
  elements: ChatElements,
  symbol: MarineReconSymbol
): WebChatAdapter {
  return new WebChatAdapter(browser, elements, symbol.config.stealth);
}

/**
 * Create a WebChatAdapter with auto-detected elements.
 */
export async function createWebChatAdapterAuto(
  browser: BrowserInterface,
  symbol: MarineReconSymbol
): Promise<WebChatAdapter | null> {
  const patternName = await detectChatPattern(browser);

  if (!patternName) {
    return null;
  }

  const elements = COMMON_CHAT_PATTERNS[patternName];
  return new WebChatAdapter(browser, elements, symbol.config.stealth);
}
