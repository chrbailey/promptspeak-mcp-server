// ═══════════════════════════════════════════════════════════════════════════
// ICAL GENERATOR
// ═══════════════════════════════════════════════════════════════════════════
// Generates iCalendar (.ics) files from legal deadlines.
// Compatible with Apple Calendar, Google Calendar, Outlook, etc.
// ═══════════════════════════════════════════════════════════════════════════

import {
  ExtractedDeadline,
  CalendarEvent,
  DeadlinePriority,
} from './calendar-types.js';

// ─────────────────────────────────────────────────────────────────────────────
// ICAL GENERATOR CLASS
// ─────────────────────────────────────────────────────────────────────────────

export interface ICalGeneratorConfig {
  /** Product identifier for the calendar */
  prodId: string;

  /** Calendar name */
  calendarName: string;

  /** Default reminder minutes before event */
  defaultReminders: number[];

  /** Include location in events */
  includeLocation: boolean;

  /** Timezone */
  timezone: string;
}

export class ICalGenerator {
  private config: ICalGeneratorConfig;

  constructor(config: Partial<ICalGeneratorConfig> = {}) {
    this.config = {
      prodId: config.prodId ?? '-//PromptSpeak//Legal Calendar//EN',
      calendarName: config.calendarName ?? 'Legal Deadlines',
      defaultReminders: config.defaultReminders ?? [1440, 60], // 1 day and 1 hour
      includeLocation: config.includeLocation ?? true,
      timezone: config.timezone ?? 'America/Los_Angeles',
    };
  }

  /**
   * Generate iCal string from deadlines.
   */
  fromDeadlines(deadlines: ExtractedDeadline[]): string {
    const events = deadlines
      .filter(d => d.dueDate)
      .map(d => this.deadlineToEvent(d));

    return this.generateICalString(events);
  }

  /**
   * Generate iCal string from events.
   */
  generateICalString(events: CalendarEvent[]): string {
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      `PRODID:${this.config.prodId}`,
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${this.escapeText(this.config.calendarName)}`,
      `X-WR-TIMEZONE:${this.config.timezone}`,
    ];

    // Add timezone component
    lines.push(...this.generateTimezone());

    // Add events
    for (const event of events) {
      lines.push(...this.generateEvent(event));
    }

    lines.push('END:VCALENDAR');

    return lines.join('\r\n');
  }

  /**
   * Convert a deadline to a calendar event.
   */
  deadlineToEvent(deadline: ExtractedDeadline): CalendarEvent {
    if (!deadline.dueDate) {
      throw new Error('Deadline must have a dueDate to convert to event');
    }

    // Determine event title
    const priorityEmoji = this.getPriorityEmoji(deadline.priority);
    const typeLabel = this.getTypeLabel(deadline.type);
    let summary = `${priorityEmoji} ${typeLabel}`;

    if (deadline.matter) {
      summary += `: ${deadline.matter}`;
    }

    // Build description
    const descriptionParts: string[] = [];
    descriptionParts.push(deadline.description);

    if (deadline.caseNumber) {
      descriptionParts.push(`Case: ${deadline.caseNumber}`);
    }

    if (deadline.sourceText) {
      descriptionParts.push(`Source: "${deadline.sourceText}"`);
    }

    if (deadline.warning) {
      descriptionParts.push(`⚠️ Warning: ${deadline.warning}`);
    }

    if (deadline.isEstimated) {
      descriptionParts.push('⚠️ This date is ESTIMATED - verify with court order');
    }

    descriptionParts.push(`\\n---\\nExtracted by Legal Review Tool`);

    // Determine reminders based on priority
    const reminders = this.getRemindersForPriority(deadline.priority);

    // Determine if all-day event
    // Hearings/trials at specific times are not all-day
    const isAllDay = deadline.type !== 'hearing' && deadline.type !== 'trial';

    return {
      uid: `${deadline.id}@promptspeak.legal`,
      summary,
      description: descriptionParts.join('\\n'),
      dtstart: deadline.dueDate,
      dtend: isAllDay
        ? undefined
        : new Date(deadline.dueDate.getTime() + 60 * 60 * 1000), // 1 hour later
      allDay: isAllDay,
      location: deadline.court,
      reminders,
      categories: [
        'Legal',
        deadline.type,
        deadline.priority,
        ...(deadline.matter ? [deadline.matter] : []),
      ],
      priority: this.getPriorityNumber(deadline.priority),
      created: new Date(),
      lastModified: new Date(),
    };
  }

  /**
   * Generate VEVENT component.
   */
  private generateEvent(event: CalendarEvent): string[] {
    const lines: string[] = ['BEGIN:VEVENT'];

    // UID and timestamps
    lines.push(`UID:${event.uid}`);
    lines.push(`DTSTAMP:${this.formatDateTime(new Date())}`);
    lines.push(`CREATED:${this.formatDateTime(event.created)}`);
    lines.push(`LAST-MODIFIED:${this.formatDateTime(event.lastModified)}`);

    // Summary and description
    lines.push(`SUMMARY:${this.escapeText(event.summary)}`);
    lines.push(`DESCRIPTION:${this.escapeText(event.description)}`);

    // Start and end times
    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${this.formatDate(event.dtstart)}`);
      if (event.dtend) {
        lines.push(`DTEND;VALUE=DATE:${this.formatDate(event.dtend)}`);
      }
    } else {
      lines.push(`DTSTART;TZID=${this.config.timezone}:${this.formatDateTimeLocal(event.dtstart)}`);
      if (event.dtend) {
        lines.push(`DTEND;TZID=${this.config.timezone}:${this.formatDateTimeLocal(event.dtend)}`);
      }
    }

    // Location
    if (event.location) {
      lines.push(`LOCATION:${this.escapeText(event.location)}`);
    }

    // Categories
    if (event.categories.length > 0) {
      lines.push(`CATEGORIES:${event.categories.map(c => this.escapeText(c)).join(',')}`);
    }

    // Priority (1-9, 1 = highest)
    if (event.priority) {
      lines.push(`PRIORITY:${event.priority}`);
    }

    // URL
    if (event.url) {
      lines.push(`URL:${event.url}`);
    }

    // Reminders (VALARM)
    for (const minutes of event.reminders) {
      lines.push(...this.generateAlarm(minutes, event.summary));
    }

    lines.push('END:VEVENT');

    return lines;
  }

  /**
   * Generate VALARM component.
   */
  private generateAlarm(minutesBefore: number, summary: string): string[] {
    return [
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:Reminder: ${summary}`,
      `TRIGGER:-PT${minutesBefore}M`,
      'END:VALARM',
    ];
  }

  /**
   * Generate timezone component.
   */
  private generateTimezone(): string[] {
    // Simplified timezone definition for US/Pacific
    // In production, would use full VTIMEZONE data
    return [
      'BEGIN:VTIMEZONE',
      `TZID:${this.config.timezone}`,
      'BEGIN:DAYLIGHT',
      'TZOFFSETFROM:-0800',
      'TZOFFSETTO:-0700',
      'DTSTART:20070311T020000',
      'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
      'TZNAME:PDT',
      'END:DAYLIGHT',
      'BEGIN:STANDARD',
      'TZOFFSETFROM:-0700',
      'TZOFFSETTO:-0800',
      'DTSTART:20071104T020000',
      'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
      'TZNAME:PST',
      'END:STANDARD',
      'END:VTIMEZONE',
    ];
  }

  /**
   * Format date as iCal date (YYYYMMDD).
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Format date/time as iCal UTC datetime (YYYYMMDDTHHmmssZ).
   */
  private formatDateTime(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    const minute = String(date.getUTCMinutes()).padStart(2, '0');
    const second = String(date.getUTCSeconds()).padStart(2, '0');
    return `${year}${month}${day}T${hour}${minute}${second}Z`;
  }

  /**
   * Format date/time as local datetime (YYYYMMDDTHHmmss).
   */
  private formatDateTimeLocal(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}T${hour}${minute}${second}`;
  }

  /**
   * Escape text for iCal.
   */
  private escapeText(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  }

  /**
   * Get emoji for priority level.
   */
  private getPriorityEmoji(priority: DeadlinePriority): string {
    switch (priority) {
      case 'critical': return '🔴';
      case 'high': return '🟠';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
    }
  }

  /**
   * Get label for deadline type.
   */
  private getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      response: 'Response Due',
      reply: 'Reply Due',
      discovery: 'Discovery Deadline',
      disclosure: 'Disclosure Due',
      filing: 'Filing Deadline',
      hearing: 'Hearing',
      trial: 'Trial',
      appeal: 'Appeal Deadline',
      statute_limitations: 'SOL Deadline',
      other: 'Deadline',
    };
    return labels[type] ?? 'Deadline';
  }

  /**
   * Get iCal priority number (1-9).
   */
  private getPriorityNumber(priority: DeadlinePriority): number {
    switch (priority) {
      case 'critical': return 1;
      case 'high': return 3;
      case 'medium': return 5;
      case 'low': return 7;
      default: return 5;
    }
  }

  /**
   * Get reminders based on priority.
   */
  private getRemindersForPriority(priority: DeadlinePriority): number[] {
    switch (priority) {
      case 'critical':
        // 1 week, 3 days, 1 day, 4 hours, 1 hour
        return [10080, 4320, 1440, 240, 60];
      case 'high':
        // 3 days, 1 day, 4 hours
        return [4320, 1440, 240];
      case 'medium':
        // 1 day, 2 hours
        return [1440, 120];
      case 'low':
        // 1 day
        return [1440];
      default:
        return this.config.defaultReminders;
    }
  }

  /**
   * Set configuration.
   */
  setConfig(config: Partial<ICalGeneratorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTORY FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

export function createICalGenerator(
  config?: Partial<ICalGeneratorConfig>
): ICalGenerator {
  return new ICalGenerator(config);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate iCal file content from deadlines.
 */
export function generateICalFromDeadlines(
  deadlines: ExtractedDeadline[],
  config?: Partial<ICalGeneratorConfig>
): string {
  const generator = createICalGenerator(config);
  return generator.fromDeadlines(deadlines);
}
