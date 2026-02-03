/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RALPH-LOOP SCHEDULER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages the scheduling of ralph-loop validation cycles.
 * The ralph-loop runs at regular intervals to:
 * - Validate agent state against symbol
 * - Check for symbol updates from commander
 * - Report status to commander
 * - Detect and handle drift
 *
 * Key Concepts:
 * - Fixed interval validation (default 30s)
 * - Can be paused/resumed
 * - Handles missed cycles gracefully
 * - Integrates with runtime events
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { RalphLoopConfig, ValidationComponent } from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scheduler state.
 */
export interface SchedulerState {
  /** Is the scheduler running */
  running: boolean;

  /** Current cycle number */
  cycle_number: number;

  /** Time of last cycle (ms since epoch) */
  last_cycle_time: number;

  /** Time of next scheduled cycle (ms since epoch) */
  next_cycle_time: number;

  /** Total cycles completed */
  total_cycles: number;

  /** Missed cycles (scheduler was paused) */
  missed_cycles: number;
}

/**
 * Cycle trigger reason.
 */
export type CycleTrigger =
  | 'scheduled'      // Normal interval trigger
  | 'manual'         // Manually triggered
  | 'event'          // Event-driven trigger
  | 'catchup';       // Catching up after pause

/**
 * Callback for when a cycle should execute.
 */
export type CycleCallback = (
  cycleNumber: number,
  trigger: CycleTrigger
) => Promise<void>;

/**
 * Scheduler events.
 */
export type SchedulerEvent =
  | { type: 'started' }
  | { type: 'stopped' }
  | { type: 'paused' }
  | { type: 'resumed' }
  | { type: 'cycle_scheduled'; next_time: number }
  | { type: 'cycle_triggered'; cycle: number; trigger: CycleTrigger }
  | { type: 'cycle_completed'; cycle: number; duration_ms: number }
  | { type: 'cycle_error'; cycle: number; error: Error };

/**
 * Event listener type.
 */
export type SchedulerEventListener = (event: SchedulerEvent) => void;

// ═══════════════════════════════════════════════════════════════════════════════
// RALPH-LOOP SCHEDULER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Schedules and manages ralph-loop validation cycles.
 */
export class RalphLoopScheduler {
  private config: RalphLoopConfig;
  private state: SchedulerState;
  private callback: CycleCallback | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners: SchedulerEventListener[] = [];

  constructor(config: RalphLoopConfig) {
    this.config = config;
    this.state = {
      running: false,
      cycle_number: 0,
      last_cycle_time: 0,
      next_cycle_time: 0,
      total_cycles: 0,
      missed_cycles: 0,
    };
  }

  /**
   * Set the callback for cycle execution.
   */
  setCallback(callback: CycleCallback): void {
    this.callback = callback;
  }

  /**
   * Start the scheduler.
   */
  start(): void {
    if (this.state.running) {
      return;
    }

    if (!this.callback) {
      throw new Error('No callback set - call setCallback() first');
    }

    this.state.running = true;
    this.emit({ type: 'started' });

    // Schedule first cycle
    this.scheduleNextCycle();
  }

  /**
   * Stop the scheduler.
   */
  stop(): void {
    if (!this.state.running) {
      return;
    }

    this.state.running = false;
    this.cancelPendingCycle();
    this.emit({ type: 'stopped' });
  }

  /**
   * Pause the scheduler (can resume later).
   */
  pause(): void {
    if (!this.state.running) {
      return;
    }

    this.cancelPendingCycle();
    this.emit({ type: 'paused' });
  }

  /**
   * Resume the scheduler.
   */
  resume(): void {
    if (!this.state.running) {
      // If stopped, need to start instead
      this.start();
      return;
    }

    // Calculate missed cycles
    const now = Date.now();
    if (this.state.next_cycle_time > 0 && now > this.state.next_cycle_time) {
      const timeMissed = now - this.state.next_cycle_time;
      const cyclesMissed = Math.floor(timeMissed / this.config.interval_ms);
      this.state.missed_cycles += cyclesMissed;
    }

    this.emit({ type: 'resumed' });

    // Schedule next cycle immediately
    this.scheduleNextCycle();
  }

  /**
   * Trigger a cycle manually.
   */
  async triggerManual(): Promise<void> {
    if (!this.callback) {
      throw new Error('No callback set');
    }

    await this.executeCycle('manual');
  }

  /**
   * Trigger a cycle due to an event.
   */
  async triggerEvent(): Promise<void> {
    if (!this.callback) {
      throw new Error('No callback set');
    }

    await this.executeCycle('event');
  }

  /**
   * Get current state.
   */
  getState(): SchedulerState {
    return { ...this.state };
  }

  /**
   * Get time until next cycle (ms).
   */
  getTimeUntilNextCycle(): number {
    if (!this.state.running || this.state.next_cycle_time === 0) {
      return -1;
    }

    return Math.max(0, this.state.next_cycle_time - Date.now());
  }

  /**
   * Update configuration.
   */
  updateConfig(newConfig: Partial<RalphLoopConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Reschedule if running
    if (this.state.running) {
      this.cancelPendingCycle();
      this.scheduleNextCycle();
    }
  }

  /**
   * Add event listener.
   */
  addEventListener(listener: SchedulerEventListener): void {
    this.listeners.push(listener);
  }

  /**
   * Remove event listener.
   */
  removeEventListener(listener: SchedulerEventListener): void {
    const index = this.listeners.indexOf(listener);
    if (index >= 0) {
      this.listeners.splice(index, 1);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private scheduleNextCycle(): void {
    if (!this.state.running) {
      return;
    }

    const now = Date.now();

    // Calculate next cycle time
    let nextTime: number;
    if (this.state.last_cycle_time === 0) {
      // First cycle - run after a short delay
      nextTime = now + Math.min(this.config.interval_ms, 5000);
    } else {
      // Normal scheduling
      nextTime = this.state.last_cycle_time + this.config.interval_ms;

      // If we've fallen behind, catch up
      if (nextTime < now) {
        nextTime = now + 1000; // Run in 1 second
      }
    }

    this.state.next_cycle_time = nextTime;
    const delay = nextTime - now;

    this.emit({ type: 'cycle_scheduled', next_time: nextTime });

    // Set timer
    this.timer = setTimeout(() => {
      this.executeCycle('scheduled');
    }, delay);
  }

  private cancelPendingCycle(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async executeCycle(trigger: CycleTrigger): Promise<void> {
    if (!this.callback) {
      return;
    }

    const cycleNumber = ++this.state.cycle_number;
    const startTime = Date.now();

    this.emit({ type: 'cycle_triggered', cycle: cycleNumber, trigger });

    try {
      await this.callback(cycleNumber, trigger);

      const duration = Date.now() - startTime;
      this.state.last_cycle_time = Date.now();
      this.state.total_cycles++;

      this.emit({ type: 'cycle_completed', cycle: cycleNumber, duration_ms: duration });

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit({ type: 'cycle_error', cycle: cycleNumber, error: err });
    }

    // Schedule next cycle if still running
    if (this.state.running && trigger === 'scheduled') {
      this.scheduleNextCycle();
    }
  }

  private emit(event: SchedulerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error('Scheduler event listener error:', e);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a scheduler from config.
 */
export function createScheduler(config: RalphLoopConfig): RalphLoopScheduler {
  return new RalphLoopScheduler(config);
}
