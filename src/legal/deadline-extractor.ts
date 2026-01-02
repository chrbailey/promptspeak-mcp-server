// ═══════════════════════════════════════════════════════════════════════════
// LEGAL DEADLINE EXTRACTOR
// ═══════════════════════════════════════════════════════════════════════════
// Extracts deadlines from legal documents using pattern matching and NLP.
// Calculates due dates based on court rules (FRCP, state rules, etc.).
// ═══════════════════════════════════════════════════════════════════════════

import {
  ExtractedDeadline,
  DeadlineType,
  DeadlinePriority,
  CourtRules,
  CountingMethod,
  DeadlineExtractorConfig,
  DeadlineExtractionResult,
  FRCP_DEADLINES,
  FEDERAL_HOLIDAYS_2024_2025,
} from './calendar-types.js';

// ─────────────────────────────────────────────────────────────────────────────
// DEADLINE EXTRACTOR CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class DeadlineExtractor {
  private config: DeadlineExtractorConfig;

  constructor(config: Partial<DeadlineExtractorConfig> = {}) {
    this.config = {
      defaultCourtRules: config.defaultCourtRules ?? 'frcp',
      defaultBaseDate: config.defaultBaseDate,
      matter: config.matter,
      court: config.court,
      caseNumber: config.caseNumber,
      includeEstimated: config.includeEstimated ?? true,
      minConfidence: config.minConfidence ?? 0.5,
    };
  }

  /**
   * Extract deadlines from document content.
   */
  extract(content: string): DeadlineExtractionResult {
    const startTime = Date.now();
    const deadlines: ExtractedDeadline[] = [];
    const warnings: string[] = [];

    // Extract explicit dates
    const explicitDeadlines = this.extractExplicitDates(content);
    deadlines.push(...explicitDeadlines);

    // Extract "within X days" patterns
    const relativeDeadlines = this.extractRelativeDeadlines(content);
    deadlines.push(...relativeDeadlines);

    // Extract FRCP-specific deadlines
    const frcpDeadlines = this.extractFRCPDeadlines(content);
    deadlines.push(...frcpDeadlines);

    // Extract hearing/trial dates
    const eventDeadlines = this.extractEventDates(content);
    deadlines.push(...eventDeadlines);

    // Filter by confidence
    const filtered = deadlines.filter(d => d.confidence >= this.config.minConfidence);

    // Add warnings for low-confidence extractions
    const lowConfidence = deadlines.filter(d => d.confidence < this.config.minConfidence);
    if (lowConfidence.length > 0) {
      warnings.push(`${lowConfidence.length} potential deadline(s) excluded due to low confidence`);
    }

    // Sort by due date (earliest first), then by priority
    filtered.sort((a, b) => {
      if (a.dueDate && b.dueDate) {
        return a.dueDate.getTime() - b.dueDate.getTime();
      }
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

    return {
      deadlines: filtered,
      metadata: {
        documentLength: content.length,
        extractionTime: Date.now() - startTime,
        rulesUsed: this.config.defaultCourtRules,
      },
      warnings,
    };
  }

  /**
   * Extract explicit date mentions.
   */
  private extractExplicitDates(content: string): ExtractedDeadline[] {
    const deadlines: ExtractedDeadline[] = [];
    const lines = content.split('\n');

    // Patterns for explicit dates
    const patterns = [
      {
        regex: /(?:due|file[d]?|submit(?:ted)?|respond|reply)\s+(?:by|on|before)\s+(\w+\s+\d{1,2},?\s+\d{4})/gi,
        type: 'filing' as DeadlineType,
        priority: 'high' as DeadlinePriority,
        confidence: 0.9,
      },
      {
        regex: /deadline[:\s]+(\w+\s+\d{1,2},?\s+\d{4})/gi,
        type: 'filing' as DeadlineType,
        priority: 'high' as DeadlinePriority,
        confidence: 0.95,
      },
      {
        regex: /no\s+later\s+than\s+(\w+\s+\d{1,2},?\s+\d{4})/gi,
        type: 'filing' as DeadlineType,
        priority: 'high' as DeadlinePriority,
        confidence: 0.9,
      },
      {
        regex: /must\s+be\s+(?:filed|submitted)\s+by\s+(\w+\s+\d{1,2},?\s+\d{4})/gi,
        type: 'filing' as DeadlineType,
        priority: 'critical' as DeadlinePriority,
        confidence: 0.95,
      },
    ];

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      for (const pattern of patterns) {
        let match;
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags);

        while ((match = regex.exec(line)) !== null) {
          const dateStr = match[1];
          const parsedDate = this.parseDate(dateStr);

          if (parsedDate) {
            deadlines.push({
              id: this.generateId(),
              type: pattern.type,
              description: this.extractDescription(line, match[0]),
              sourceText: match[0],
              sourceLocation: `Line ${lineNum + 1}`,
              dueDate: parsedDate,
              courtRules: this.config.defaultCourtRules,
              countingMethod: 'calendar',
              priority: pattern.priority,
              matter: this.config.matter,
              court: this.config.court,
              caseNumber: this.config.caseNumber,
              isEstimated: false,
              confidence: pattern.confidence,
            });
          }
        }
      }
    }

    return deadlines;
  }

  /**
   * Extract "within X days" relative deadlines.
   */
  private extractRelativeDeadlines(content: string): ExtractedDeadline[] {
    const deadlines: ExtractedDeadline[] = [];
    const lines = content.split('\n');

    const patterns = [
      {
        regex: /within\s+(\d+)\s+(?:calendar\s+)?days?\s+(?:of|from|after)\s+(\w+(?:\s+\w+)*)/gi,
        countingMethod: 'calendar' as CountingMethod,
        confidence: 0.8,
      },
      {
        regex: /within\s+(\d+)\s+(?:business|court)\s+days?\s+(?:of|from|after)\s+(\w+(?:\s+\w+)*)/gi,
        countingMethod: 'business' as CountingMethod,
        confidence: 0.85,
      },
      {
        regex: /(\d+)\s+days?\s+(?:to|for)\s+(\w+(?:\s+\w+)*)/gi,
        countingMethod: 'calendar' as CountingMethod,
        confidence: 0.7,
      },
      {
        regex: /shall\s+(?:have\s+)?(\d+)\s+days?\s+to\s+(\w+(?:\s+\w+)*)/gi,
        countingMethod: 'calendar' as CountingMethod,
        confidence: 0.85,
      },
    ];

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      for (const pattern of patterns) {
        let match;
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags);

        while ((match = regex.exec(line)) !== null) {
          const days = parseInt(match[1], 10);
          const action = match[2];

          // Determine deadline type from action
          const type = this.inferDeadlineType(action);
          const priority = this.inferPriority(type, days);

          // Calculate due date if we have a base date
          let dueDate: Date | undefined;
          if (this.config.defaultBaseDate) {
            dueDate = this.calculateDueDate(
              this.config.defaultBaseDate,
              days,
              pattern.countingMethod
            );
          }

          deadlines.push({
            id: this.generateId(),
            type,
            description: `${action} (${days} days)`,
            sourceText: match[0],
            sourceLocation: `Line ${lineNum + 1}`,
            baseDate: this.config.defaultBaseDate,
            daysFromBase: days,
            dueDate,
            courtRules: this.config.defaultCourtRules,
            countingMethod: pattern.countingMethod,
            priority,
            matter: this.config.matter,
            court: this.config.court,
            caseNumber: this.config.caseNumber,
            isEstimated: !this.config.defaultBaseDate,
            confidence: pattern.confidence,
            warning: !this.config.defaultBaseDate
              ? 'Base date not specified - provide service/filing date to calculate due date'
              : undefined,
          });
        }
      }
    }

    return deadlines;
  }

  /**
   * Extract FRCP-specific deadline references.
   */
  private extractFRCPDeadlines(content: string): ExtractedDeadline[] {
    const deadlines: ExtractedDeadline[] = [];
    const lines = content.split('\n');

    // Match FRCP rule references
    const rulePattern = /(?:Rule|Fed\.?\s*R\.?\s*Civ\.?\s*P\.?|FRCP)\s+(\d+)(?:\(([a-z])\))?/gi;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      let match;
      const regex = new RegExp(rulePattern.source, rulePattern.flags);

      while ((match = regex.exec(line)) !== null) {
        const ruleNum = match[1];
        const subsection = match[2];

        // Check for known FRCP deadline rules
        const ruleKey = this.findFRCPRule(ruleNum, subsection, line);

        if (ruleKey && FRCP_DEADLINES[ruleKey]) {
          const rule = FRCP_DEADLINES[ruleKey];

          // Calculate due date if we have a base date
          let dueDate: Date | undefined;
          if (this.config.defaultBaseDate) {
            dueDate = this.calculateDueDate(
              this.config.defaultBaseDate,
              rule.days,
              'court' // FRCP uses court days (excludes weekends/holidays for short periods)
            );
          }

          deadlines.push({
            id: this.generateId(),
            type: rule.type,
            description: `${rule.description} (FRCP Rule ${ruleNum})`,
            sourceText: match[0],
            sourceLocation: `Line ${lineNum + 1}`,
            baseDate: this.config.defaultBaseDate,
            daysFromBase: rule.days,
            dueDate,
            courtRules: 'frcp',
            countingMethod: rule.days <= 7 ? 'court' : 'calendar',
            priority: this.inferPriority(rule.type, rule.days),
            matter: this.config.matter,
            court: this.config.court,
            caseNumber: this.config.caseNumber,
            isEstimated: !this.config.defaultBaseDate,
            confidence: 0.9,
            warning: !this.config.defaultBaseDate
              ? 'Base date not specified - provide service/filing date to calculate due date'
              : undefined,
          });
        }
      }
    }

    return deadlines;
  }

  /**
   * Extract hearing and trial dates.
   */
  private extractEventDates(content: string): ExtractedDeadline[] {
    const deadlines: ExtractedDeadline[] = [];
    const lines = content.split('\n');

    const patterns = [
      {
        regex: /hearing\s+(?:scheduled\s+for|set\s+for|on)\s+(\w+\s+\d{1,2},?\s+\d{4})(?:\s+at\s+(\d{1,2}:\d{2}\s*(?:am|pm)?))?/gi,
        type: 'hearing' as DeadlineType,
        priority: 'critical' as DeadlinePriority,
        confidence: 0.95,
      },
      {
        regex: /trial\s+(?:date|set\s+for|begins?|commences?)\s+(\w+\s+\d{1,2},?\s+\d{4})/gi,
        type: 'trial' as DeadlineType,
        priority: 'critical' as DeadlinePriority,
        confidence: 0.95,
      },
      {
        regex: /(?:oral\s+)?argument\s+(?:scheduled\s+for|on)\s+(\w+\s+\d{1,2},?\s+\d{4})/gi,
        type: 'hearing' as DeadlineType,
        priority: 'critical' as DeadlinePriority,
        confidence: 0.9,
      },
    ];

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      for (const pattern of patterns) {
        let match;
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags);

        while ((match = regex.exec(line)) !== null) {
          const dateStr = match[1];
          const timeStr = match[2];
          const parsedDate = this.parseDate(dateStr, timeStr);

          if (parsedDate) {
            deadlines.push({
              id: this.generateId(),
              type: pattern.type,
              description: `${pattern.type.charAt(0).toUpperCase() + pattern.type.slice(1)}: ${match[0]}`,
              sourceText: match[0],
              sourceLocation: `Line ${lineNum + 1}`,
              dueDate: parsedDate,
              courtRules: this.config.defaultCourtRules,
              countingMethod: 'calendar',
              priority: pattern.priority,
              matter: this.config.matter,
              court: this.config.court,
              caseNumber: this.config.caseNumber,
              isEstimated: false,
              confidence: pattern.confidence,
            });
          }
        }
      }
    }

    return deadlines;
  }

  /**
   * Calculate due date from base date and days.
   */
  calculateDueDate(baseDate: Date, days: number, method: CountingMethod): Date {
    const result = new Date(baseDate);

    if (method === 'calendar') {
      result.setDate(result.getDate() + days);
    } else if (method === 'business') {
      let addedDays = 0;
      while (addedDays < days) {
        result.setDate(result.getDate() + 1);
        if (!this.isWeekend(result)) {
          addedDays++;
        }
      }
    } else if (method === 'court') {
      // FRCP Rule 6(a): For periods < 11 days, exclude weekends and holidays
      // For periods >= 11 days, count calendar days but if last day is weekend/holiday, extend
      if (days < 11) {
        let addedDays = 0;
        while (addedDays < days) {
          result.setDate(result.getDate() + 1);
          if (!this.isWeekend(result) && !this.isFederalHoliday(result)) {
            addedDays++;
          }
        }
      } else {
        result.setDate(result.getDate() + days);
        // If last day is weekend or holiday, extend to next business day
        while (this.isWeekend(result) || this.isFederalHoliday(result)) {
          result.setDate(result.getDate() + 1);
        }
      }
    }

    return result;
  }

  /**
   * Check if date is a weekend.
   */
  private isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday = 0, Saturday = 6
  }

  /**
   * Check if date is a federal holiday.
   */
  private isFederalHoliday(date: Date): boolean {
    const dateStr = date.toISOString().split('T')[0];
    return FEDERAL_HOLIDAYS_2024_2025.some(
      h => h.date.toISOString().split('T')[0] === dateStr ||
           h.observed?.toISOString().split('T')[0] === dateStr
    );
  }

  /**
   * Parse a date string.
   */
  private parseDate(dateStr: string, timeStr?: string): Date | undefined {
    try {
      // Handle various date formats
      const cleaned = dateStr.replace(/,/g, '').trim();

      // Try parsing with built-in Date
      let date = new Date(cleaned);

      if (isNaN(date.getTime())) {
        // Try manual parsing for "Month DD YYYY" format
        const parts = cleaned.match(/(\w+)\s+(\d{1,2})\s+(\d{4})/);
        if (parts) {
          const months: Record<string, number> = {
            january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
            july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
          };
          const monthNum = months[parts[1].toLowerCase()];
          if (monthNum !== undefined) {
            date = new Date(parseInt(parts[3]), monthNum, parseInt(parts[2]));
          }
        }
      }

      if (isNaN(date.getTime())) {
        return undefined;
      }

      // Add time if provided
      if (timeStr) {
        const timeParts = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
        if (timeParts) {
          let hours = parseInt(timeParts[1]);
          const minutes = parseInt(timeParts[2]);
          const meridiem = timeParts[3]?.toLowerCase();

          if (meridiem === 'pm' && hours < 12) hours += 12;
          if (meridiem === 'am' && hours === 12) hours = 0;

          date.setHours(hours, minutes, 0, 0);
        }
      }

      return date;
    } catch {
      return undefined;
    }
  }

  /**
   * Infer deadline type from action text.
   */
  private inferDeadlineType(action: string): DeadlineType {
    const lower = action.toLowerCase();

    if (lower.includes('respond') || lower.includes('answer') || lower.includes('opposition')) {
      return 'response';
    }
    if (lower.includes('reply')) {
      return 'reply';
    }
    if (lower.includes('discover') || lower.includes('interrogator') || lower.includes('document')) {
      return 'discovery';
    }
    if (lower.includes('disclos')) {
      return 'disclosure';
    }
    if (lower.includes('appeal')) {
      return 'appeal';
    }
    if (lower.includes('trial')) {
      return 'trial';
    }
    if (lower.includes('hearing')) {
      return 'hearing';
    }

    return 'filing';
  }

  /**
   * Infer priority from deadline type and days.
   */
  private inferPriority(type: DeadlineType, days: number): DeadlinePriority {
    // Critical deadlines
    if (type === 'appeal' || type === 'statute_limitations') {
      return 'critical';
    }
    if (type === 'trial' || type === 'hearing') {
      return 'critical';
    }

    // Short deadlines are high priority
    if (days <= 7) {
      return 'high';
    }

    // Response/reply deadlines
    if (type === 'response' || type === 'reply') {
      return days <= 21 ? 'high' : 'medium';
    }

    // Discovery deadlines
    if (type === 'discovery' || type === 'disclosure') {
      return 'medium';
    }

    return 'medium';
  }

  /**
   * Find matching FRCP rule.
   */
  private findFRCPRule(ruleNum: string, subsection: string | undefined, context: string): string | undefined {
    const contextLower = context.toLowerCase();

    // Rule 12 - Defenses
    if (ruleNum === '12') {
      if (contextLower.includes('answer')) return '12_answer';
      if (contextLower.includes('motion') || contextLower.includes('dismiss')) return '12_motion';
      if (contextLower.includes('waiver')) return '12_waiver';
      return '12_answer'; // Default
    }

    // Rule 26 - Discovery
    if (ruleNum === '26') {
      if (contextLower.includes('expert')) return '26_expert';
      return '26_disclosure';
    }

    // Rule 33 - Interrogatories
    if (ruleNum === '33') return '33_response';

    // Rule 34 - Document requests
    if (ruleNum === '34') return '34_response';

    // Rule 36 - Admissions
    if (ruleNum === '36') return '36_response';

    // Rule 56 - Summary Judgment
    if (ruleNum === '56') {
      if (contextLower.includes('reply')) return '56_reply';
      if (contextLower.includes('oppos') || contextLower.includes('respond')) return '56_response';
    }

    // Rule 59 - New Trial
    if (ruleNum === '59') return '59_motion';

    // Rule 60 - Relief from Judgment
    if (ruleNum === '60') return '60_motion';

    return undefined;
  }

  /**
   * Extract description from surrounding context.
   */
  private extractDescription(line: string, match: string): string {
    // Get a reasonable description from the line
    const trimmed = line.trim();
    if (trimmed.length <= 100) {
      return trimmed;
    }

    // Find the match position and get context
    const matchIndex = line.indexOf(match);
    const start = Math.max(0, matchIndex - 30);
    const end = Math.min(line.length, matchIndex + match.length + 30);

    let description = line.substring(start, end).trim();
    if (start > 0) description = '...' + description;
    if (end < line.length) description = description + '...';

    return description;
  }

  /**
   * Generate unique ID.
   */
  private generateId(): string {
    return `dl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Set configuration.
   */
  setConfig(config: Partial<DeadlineExtractorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration.
   */
  getConfig(): DeadlineExtractorConfig {
    return { ...this.config };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTORY FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

export function createDeadlineExtractor(
  config?: Partial<DeadlineExtractorConfig>
): DeadlineExtractor {
  return new DeadlineExtractor(config);
}
