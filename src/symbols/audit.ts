/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PROMPTSPEAK SECURITY AUDIT LOG
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Security audit logging for forensics and anomaly detection.
 * Logs all symbol operations, security violations, and access patterns.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import type { InjectionViolation, FullValidationResult } from './sanitizer.js';
import { createLogger } from '../core/logging/index.js';

const logger = createLogger('SecurityAudit');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type AuditEventType =
  | 'SYMBOL_CREATE'
  | 'SYMBOL_CREATE_BLOCKED'
  | 'SYMBOL_UPDATE'
  | 'SYMBOL_UPDATE_BLOCKED'
  | 'SYMBOL_DELETE'
  | 'SYMBOL_ACCESS'
  | 'SYMBOL_FORMAT'
  | 'VALIDATION_WARNING'
  | 'INJECTION_ATTEMPT'
  | 'SECURITY_ALERT';

export interface AuditEntry {
  timestamp: string;
  eventType: AuditEventType;
  symbolId?: string;
  details: Record<string, unknown>;
  violations?: InjectionViolation[];
  riskScore?: number;
  sourceIp?: string;
  userId?: string;
}

export interface AuditStats {
  totalEvents: number;
  eventsByType: Record<AuditEventType, number>;
  blockedAttempts: number;
  injectionAttempts: number;
  symbolAccessCount: number;
  highRiskEvents: number;
  lastEventTime?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const AUDIT_CONFIG = {
  // Maximum log file size (10MB)
  MAX_LOG_SIZE: 10 * 1024 * 1024,

  // Keep last N log files
  MAX_LOG_FILES: 10,

  // Log rotation check interval
  ROTATION_CHECK_INTERVAL: 100, // Every 100 writes

  // Enable console output for critical events
  CONSOLE_CRITICAL: true,

  // High risk threshold
  HIGH_RISK_THRESHOLD: 60,
};

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGGER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class AuditLogger {
  private logPath: string;
  private writeCount: number = 0;
  private stats: AuditStats;

  constructor(logsDir: string) {
    this.logPath = path.join(logsDir, 'security-audit.jsonl');

    // Ensure logs directory exists
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Initialize stats
    this.stats = {
      totalEvents: 0,
      eventsByType: {
        'SYMBOL_CREATE': 0,
        'SYMBOL_CREATE_BLOCKED': 0,
        'SYMBOL_UPDATE': 0,
        'SYMBOL_UPDATE_BLOCKED': 0,
        'SYMBOL_DELETE': 0,
        'SYMBOL_ACCESS': 0,
        'SYMBOL_FORMAT': 0,
        'VALIDATION_WARNING': 0,
        'INJECTION_ATTEMPT': 0,
        'SECURITY_ALERT': 0,
      },
      blockedAttempts: 0,
      injectionAttempts: 0,
      symbolAccessCount: 0,
      highRiskEvents: 0,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CORE LOGGING
  // ─────────────────────────────────────────────────────────────────────────────

  private log(entry: AuditEntry): void {
    const line = JSON.stringify(entry) + '\n';

    // Append to log file
    try {
      fs.appendFileSync(this.logPath, line);
    } catch (error) {
      logger.error('Failed to write log', error instanceof Error ? error : undefined);
    }

    // Update stats
    this.stats.totalEvents++;
    this.stats.eventsByType[entry.eventType]++;
    this.stats.lastEventTime = entry.timestamp;

    if (entry.riskScore && entry.riskScore >= AUDIT_CONFIG.HIGH_RISK_THRESHOLD) {
      this.stats.highRiskEvents++;
    }

    // Console output for critical events
    if (AUDIT_CONFIG.CONSOLE_CRITICAL) {
      if (entry.eventType.includes('BLOCKED') ||
          entry.eventType === 'INJECTION_ATTEMPT' ||
          entry.eventType === 'SECURITY_ALERT') {
        logger.warn(`[AUDIT:${entry.eventType}] ${entry.symbolId || 'N/A'}`, entry.details);
      }
    }

    // Check for log rotation
    this.writeCount++;
    if (this.writeCount >= AUDIT_CONFIG.ROTATION_CHECK_INTERVAL) {
      this.checkRotation();
      this.writeCount = 0;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EVENT METHODS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Log symbol creation
   */
  logCreate(
    symbolId: string,
    success: boolean,
    validation?: FullValidationResult,
    details?: Record<string, unknown>
  ): void {
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      eventType: success ? 'SYMBOL_CREATE' : 'SYMBOL_CREATE_BLOCKED',
      symbolId,
      details: {
        success,
        ...details,
      },
    };

    if (validation) {
      entry.riskScore = validation.totalRiskScore;
      if (validation.totalViolations > 0) {
        entry.violations = Array.from(validation.fieldResults.values())
          .flatMap(r => r.violations);
      }
    }

    if (!success) {
      this.stats.blockedAttempts++;
    }

    this.log(entry);
  }

  /**
   * Log symbol update
   */
  logUpdate(
    symbolId: string,
    success: boolean,
    validation?: FullValidationResult,
    details?: Record<string, unknown>
  ): void {
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      eventType: success ? 'SYMBOL_UPDATE' : 'SYMBOL_UPDATE_BLOCKED',
      symbolId,
      details: {
        success,
        ...details,
      },
    };

    if (validation) {
      entry.riskScore = validation.totalRiskScore;
      if (validation.totalViolations > 0) {
        entry.violations = Array.from(validation.fieldResults.values())
          .flatMap(r => r.violations);
      }
    }

    if (!success && validation?.blocked) {
      this.stats.blockedAttempts++;
    }

    this.log(entry);
  }

  /**
   * Log symbol deletion
   */
  logDelete(symbolId: string, reason: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      eventType: 'SYMBOL_DELETE',
      symbolId,
      details: { reason },
    });
  }

  /**
   * Log symbol access (read)
   */
  logAccess(symbolId: string, found: boolean, format?: string): void {
    this.stats.symbolAccessCount++;
    this.log({
      timestamp: new Date().toISOString(),
      eventType: format ? 'SYMBOL_FORMAT' : 'SYMBOL_ACCESS',
      symbolId,
      details: { found, format },
    });
  }

  /**
   * Log injection attempt
   */
  logInjectionAttempt(
    symbolId: string,
    violations: InjectionViolation[],
    riskScore: number,
    blocked: boolean
  ): void {
    this.stats.injectionAttempts++;
    this.log({
      timestamp: new Date().toISOString(),
      eventType: 'INJECTION_ATTEMPT',
      symbolId,
      violations,
      riskScore,
      details: {
        blocked,
        violationCount: violations.length,
        criticalCount: violations.filter(v => v.severity === 'CRITICAL').length,
      },
    });
  }

  /**
   * Log validation warning (non-blocking)
   */
  logValidationWarning(
    symbolId: string,
    violations: InjectionViolation[],
    riskScore: number
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      eventType: 'VALIDATION_WARNING',
      symbolId,
      violations,
      riskScore,
      details: {
        violationCount: violations.length,
      },
    });
  }

  /**
   * Log security alert
   */
  logSecurityAlert(
    message: string,
    details: Record<string, unknown>
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      eventType: 'SECURITY_ALERT',
      details: {
        message,
        ...details,
      },
    });
  }

  /**
   * Log a security-related event with risk assessment
   */
  logSecurityEvent(
    eventType: string,
    riskScore: number,
    details: object
  ): void {
    // Map custom event type to closest AuditEventType, defaulting to SECURITY_ALERT
    const mappedEventType: AuditEventType = 'SECURITY_ALERT';

    this.log({
      timestamp: new Date().toISOString(),
      eventType: mappedEventType,
      riskScore,
      details: {
        customEventType: eventType,
        ...(details as Record<string, unknown>),
      },
    });
  }

  /**
   * Query audit log entries with filtering options
   */
  query(options: {
    symbolId?: string;
    eventType?: string;
    since?: Date;
    limit?: number;
  }): AuditEntry[] {
    try {
      if (!fs.existsSync(this.logPath)) {
        return [];
      }

      const content = fs.readFileSync(this.logPath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l);

      let entries = lines.map(line => JSON.parse(line) as AuditEntry);

      // Filter by symbolId if provided
      if (options.symbolId) {
        entries = entries.filter(entry => entry.symbolId === options.symbolId);
      }

      // Filter by eventType if provided
      if (options.eventType) {
        entries = entries.filter(entry => entry.eventType === options.eventType);
      }

      // Filter by timestamp if since is provided
      if (options.since) {
        const sinceTime = options.since.getTime();
        entries = entries.filter(entry => {
          const entryTime = new Date(entry.timestamp).getTime();
          return entryTime >= sinceTime;
        });
      }

      // Apply limit if provided (take from the end for most recent)
      if (options.limit && options.limit > 0) {
        entries = entries.slice(-options.limit);
      }

      return entries;
    } catch (error) {
      logger.error('Failed to query entries', error instanceof Error ? error : undefined);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LOG ROTATION
  // ─────────────────────────────────────────────────────────────────────────────

  private checkRotation(): void {
    try {
      const stats = fs.statSync(this.logPath);
      if (stats.size >= AUDIT_CONFIG.MAX_LOG_SIZE) {
        this.rotateLog();
      }
    } catch {
      // File doesn't exist yet, no rotation needed
    }
  }

  private rotateLog(): void {
    const dir = path.dirname(this.logPath);
    const base = path.basename(this.logPath, '.jsonl');

    // Rotate existing logs
    for (let i = AUDIT_CONFIG.MAX_LOG_FILES - 1; i >= 0; i--) {
      const oldPath = i === 0
        ? this.logPath
        : path.join(dir, `${base}.${i}.jsonl`);
      const newPath = path.join(dir, `${base}.${i + 1}.jsonl`);

      if (fs.existsSync(oldPath)) {
        if (i === AUDIT_CONFIG.MAX_LOG_FILES - 1) {
          // Delete oldest
          fs.unlinkSync(oldPath);
        } else {
          // Rename
          fs.renameSync(oldPath, newPath);
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STATS & QUERIES
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get current audit statistics
   */
  getStats(): AuditStats {
    return { ...this.stats };
  }

  /**
   * Read recent audit entries
   */
  getRecentEntries(limit: number = 100): AuditEntry[] {
    try {
      if (!fs.existsSync(this.logPath)) {
        return [];
      }

      const content = fs.readFileSync(this.logPath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l);

      // Get last N entries
      const recent = lines.slice(-limit);
      return recent.map(line => JSON.parse(line) as AuditEntry);
    } catch (error) {
      logger.error('Failed to read entries', error instanceof Error ? error : undefined);
      return [];
    }
  }

  /**
   * Get entries for a specific symbol
   */
  getEntriesForSymbol(symbolId: string): AuditEntry[] {
    try {
      if (!fs.existsSync(this.logPath)) {
        return [];
      }

      const content = fs.readFileSync(this.logPath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l);

      return lines
        .map(line => JSON.parse(line) as AuditEntry)
        .filter(entry => entry.symbolId === symbolId);
    } catch (error) {
      logger.error('Failed to read entries', error instanceof Error ? error : undefined);
      return [];
    }
  }

  /**
   * Get all injection attempts
   */
  getInjectionAttempts(): AuditEntry[] {
    try {
      if (!fs.existsSync(this.logPath)) {
        return [];
      }

      const content = fs.readFileSync(this.logPath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l);

      return lines
        .map(line => JSON.parse(line) as AuditEntry)
        .filter(entry =>
          entry.eventType === 'INJECTION_ATTEMPT' ||
          entry.eventType.includes('BLOCKED')
        );
    } catch (error) {
      logger.error('Failed to read entries', error instanceof Error ? error : undefined);
      return [];
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let auditLogger: AuditLogger | null = null;

export function initializeAuditLogger(logsDir: string): AuditLogger {
  auditLogger = new AuditLogger(logsDir);
  return auditLogger;
}

export function getAuditLogger(): AuditLogger | null {
  return auditLogger;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Note: AuditLogger class is already exported at its declaration above
// ═══════════════════════════════════════════════════════════════════════════════
