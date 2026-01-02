// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK MCP SERVER - LEGAL CALENDAR TOOLS
// ═══════════════════════════════════════════════════════════════════════════
// MCP tools for deadline extraction and calendar integration:
// - ps_calendar_extract: Extract deadlines from legal documents
// - ps_calendar_export: Export deadlines to iCal format
// - ps_calendar_calculate: Calculate due dates from base dates
//
// ═══════════════════════════════════════════════════════════════════════════

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
  DeadlineExtractor,
  createDeadlineExtractor,
  ICalGenerator,
  createICalGenerator,
  generateICalFromDeadlines,
  ExtractedDeadline,
  DeadlineExtractionResult,
  CourtRules,
  CountingMethod,
} from '../legal/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// MODULE STATE
// ─────────────────────────────────────────────────────────────────────────────

let deadlineExtractor: DeadlineExtractor;
let icalGenerator: ICalGenerator;

function initializeIfNeeded(): void {
  if (!deadlineExtractor) {
    deadlineExtractor = createDeadlineExtractor();
  }
  if (!icalGenerator) {
    icalGenerator = createICalGenerator();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

export const calendarToolDefinitions: Tool[] = [
  {
    name: 'ps_calendar_extract',
    description: `Extract legal deadlines from document content.

Detects:
- Explicit dates ("due by January 15, 2025")
- Relative deadlines ("within 21 days of service")
- FRCP rule references (Rule 12, 26, 33, 34, 56, etc.)
- Hearing and trial dates

Returns deadlines sorted by due date with priority levels.

IMPORTANT: For relative deadlines, provide a baseDate (service/filing date) to calculate actual due dates.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: 'The legal document content to extract deadlines from',
        },
        baseDate: {
          type: 'string',
          description: 'Base date for calculating relative deadlines (ISO format: YYYY-MM-DD). Usually the service date or filing date.',
        },
        matter: {
          type: 'string',
          description: 'Case/matter name to tag deadlines with',
        },
        court: {
          type: 'string',
          description: 'Court name',
        },
        caseNumber: {
          type: 'string',
          description: 'Case number',
        },
        courtRules: {
          type: 'string',
          enum: ['frcp', 'frap', 'california', 'texas', 'new_york', 'generic'],
          description: 'Court rules to use for deadline calculation (default: frcp)',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'ps_calendar_export',
    description: `Export extracted deadlines to iCal (.ics) format.

The generated file can be imported into:
- Apple Calendar
- Google Calendar
- Microsoft Outlook
- Any iCal-compatible calendar app

Events include appropriate reminders based on priority:
- Critical: 1 week, 3 days, 1 day, 4 hours, 1 hour before
- High: 3 days, 1 day, 4 hours before
- Medium: 1 day, 2 hours before
- Low: 1 day before`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        deadlines: {
          type: 'array',
          description: 'Array of deadlines to export (from ps_calendar_extract)',
          items: {
            type: 'object',
          },
        },
        filename: {
          type: 'string',
          description: 'Output filename (default: legal-deadlines.ics)',
        },
        calendarName: {
          type: 'string',
          description: 'Name for the calendar (default: Legal Deadlines)',
        },
        saveToFile: {
          type: 'boolean',
          description: 'Save to file in ~/Downloads (default: false, returns content)',
        },
      },
      required: ['deadlines'],
    },
  },
  {
    name: 'ps_calendar_calculate',
    description: `Calculate a due date from a base date and number of days.

Supports different counting methods:
- calendar: All days count
- business: Excludes weekends
- court: FRCP Rule 6(a) - excludes weekends/holidays for periods < 11 days

Useful for manually calculating response deadlines.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        baseDate: {
          type: 'string',
          description: 'Starting date (ISO format: YYYY-MM-DD)',
        },
        days: {
          type: 'number',
          description: 'Number of days to add',
        },
        countingMethod: {
          type: 'string',
          enum: ['calendar', 'business', 'court'],
          description: 'How to count days (default: court)',
        },
        description: {
          type: 'string',
          description: 'Description of what this deadline is for',
        },
      },
      required: ['baseDate', 'days'],
    },
  },
  {
    name: 'ps_calendar_frcp',
    description: `Get FRCP deadline information for common rules.

Returns the standard number of days and description for:
- Rule 12 (Answer, Motion to Dismiss)
- Rule 26 (Disclosures)
- Rule 33 (Interrogatories)
- Rule 34 (Document Requests)
- Rule 36 (Admissions)
- Rule 56 (Summary Judgment)
- Rule 59 (New Trial)
- Rule 60 (Relief from Judgment)`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        rule: {
          type: 'string',
          description: 'FRCP rule number (e.g., "12", "56")',
        },
        action: {
          type: 'string',
          description: 'Specific action (e.g., "answer", "response", "reply")',
        },
      },
      required: ['rule'],
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract deadlines from document content.
 */
export function handleCalendarExtract(args: {
  content: string;
  baseDate?: string;
  matter?: string;
  court?: string;
  caseNumber?: string;
  courtRules?: CourtRules;
}): DeadlineExtractionResult & { summary: string } {
  initializeIfNeeded();

  // Configure extractor
  deadlineExtractor.setConfig({
    defaultBaseDate: args.baseDate ? new Date(args.baseDate) : undefined,
    matter: args.matter,
    court: args.court,
    caseNumber: args.caseNumber,
    defaultCourtRules: args.courtRules ?? 'frcp',
  });

  // Extract deadlines
  const result = deadlineExtractor.extract(args.content);

  // Generate summary
  const criticalCount = result.deadlines.filter(d => d.priority === 'critical').length;
  const highCount = result.deadlines.filter(d => d.priority === 'high').length;
  const estimatedCount = result.deadlines.filter(d => d.isEstimated).length;

  let summary = `Found ${result.deadlines.length} deadline(s)`;
  if (criticalCount > 0) summary += ` (${criticalCount} critical)`;
  if (highCount > 0) summary += ` (${highCount} high priority)`;
  if (estimatedCount > 0) {
    summary += `\n⚠️ ${estimatedCount} deadline(s) have estimated dates - provide baseDate for accurate calculation`;
  }

  return {
    ...result,
    summary,
  };
}

/**
 * Export deadlines to iCal format.
 */
export function handleCalendarExport(args: {
  deadlines: ExtractedDeadline[];
  filename?: string;
  calendarName?: string;
  saveToFile?: boolean;
}): {
  success: boolean;
  content?: string;
  filePath?: string;
  eventCount: number;
  message: string;
} {
  initializeIfNeeded();

  // Filter deadlines with due dates
  const validDeadlines = args.deadlines.filter(d => d.dueDate);

  if (validDeadlines.length === 0) {
    return {
      success: false,
      eventCount: 0,
      message: 'No deadlines with due dates to export. Provide baseDate when extracting to calculate due dates.',
    };
  }

  // Configure generator
  if (args.calendarName) {
    icalGenerator.setConfig({ calendarName: args.calendarName });
  }

  // Generate iCal content
  const icalContent = generateICalFromDeadlines(validDeadlines, {
    calendarName: args.calendarName ?? 'Legal Deadlines',
  });

  // Save to file if requested
  if (args.saveToFile) {
    const filename = args.filename ?? 'legal-deadlines.ics';
    const downloadsDir = join(homedir(), 'Downloads');
    const filePath = join(downloadsDir, filename);

    try {
      writeFileSync(filePath, icalContent, 'utf-8');
      return {
        success: true,
        filePath,
        eventCount: validDeadlines.length,
        message: `Saved ${validDeadlines.length} event(s) to ${filePath}. Double-click to import into your calendar.`,
      };
    } catch (error) {
      return {
        success: false,
        content: icalContent,
        eventCount: validDeadlines.length,
        message: `Could not save to file: ${error}. iCal content returned in 'content' field.`,
      };
    }
  }

  return {
    success: true,
    content: icalContent,
    eventCount: validDeadlines.length,
    message: `Generated iCal with ${validDeadlines.length} event(s). Copy the 'content' field to a .ics file to import.`,
  };
}

/**
 * Calculate a due date from base date and days.
 */
export function handleCalendarCalculate(args: {
  baseDate: string;
  days: number;
  countingMethod?: CountingMethod;
  description?: string;
}): {
  baseDate: string;
  days: number;
  countingMethod: CountingMethod;
  dueDate: string;
  dueDateFormatted: string;
  dayOfWeek: string;
  description?: string;
  warnings: string[];
} {
  initializeIfNeeded();

  const base = new Date(args.baseDate);
  const method = args.countingMethod ?? 'court';

  // Calculate due date
  const dueDate = deadlineExtractor.calculateDueDate(base, args.days, method);

  // Check for warnings
  const warnings: string[] = [];
  const dayOfWeek = dueDate.toLocaleDateString('en-US', { weekday: 'long' });

  if (dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday') {
    warnings.push(`Due date falls on a ${dayOfWeek} - may extend to Monday`);
  }

  // Check if close to holiday
  const dueDateStr = dueDate.toISOString().split('T')[0];
  // (Holiday check would go here)

  return {
    baseDate: args.baseDate,
    days: args.days,
    countingMethod: method,
    dueDate: dueDate.toISOString(),
    dueDateFormatted: dueDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    dayOfWeek,
    description: args.description,
    warnings,
  };
}

/**
 * Get FRCP deadline information.
 */
export function handleCalendarFRCP(args: {
  rule: string;
  action?: string;
}): {
  rule: string;
  deadlines: Array<{
    key: string;
    days: number;
    type: string;
    description: string;
    countingMethod: string;
  }>;
  notes: string[];
} {
  // FRCP deadline rules
  const frcpRules: Record<string, Array<{
    key: string;
    days: number;
    type: string;
    description: string;
    countingMethod: string;
  }>> = {
    '12': [
      { key: '12_answer', days: 21, type: 'response', description: 'Answer to complaint', countingMethod: 'court' },
      { key: '12_motion', days: 21, type: 'response', description: 'Motion to dismiss', countingMethod: 'court' },
      { key: '12_waiver', days: 60, type: 'response', description: 'Answer after waiver of service', countingMethod: 'calendar' },
    ],
    '26': [
      { key: '26_disclosure', days: 14, type: 'disclosure', description: 'Initial disclosures after Rule 26(f) conference', countingMethod: 'court' },
      { key: '26_expert', days: 90, type: 'disclosure', description: 'Expert disclosure (before trial)', countingMethod: 'calendar' },
    ],
    '33': [
      { key: '33_response', days: 30, type: 'discovery', description: 'Response to interrogatories', countingMethod: 'calendar' },
    ],
    '34': [
      { key: '34_response', days: 30, type: 'discovery', description: 'Response to document requests', countingMethod: 'calendar' },
    ],
    '36': [
      { key: '36_response', days: 30, type: 'discovery', description: 'Response to requests for admission', countingMethod: 'calendar' },
    ],
    '56': [
      { key: '56_response', days: 21, type: 'response', description: 'Opposition to summary judgment', countingMethod: 'court' },
      { key: '56_reply', days: 14, type: 'reply', description: 'Reply in support of summary judgment', countingMethod: 'court' },
    ],
    '59': [
      { key: '59_motion', days: 28, type: 'filing', description: 'Motion for new trial', countingMethod: 'calendar' },
    ],
    '60': [
      { key: '60_motion', days: 365, type: 'filing', description: 'Motion for relief from judgment', countingMethod: 'calendar' },
    ],
  };

  const ruleNum = args.rule.replace(/[^0-9]/g, '');
  const deadlines = frcpRules[ruleNum] ?? [];

  // Filter by action if specified
  let filtered = deadlines;
  if (args.action) {
    const actionLower = args.action.toLowerCase();
    filtered = deadlines.filter(d =>
      d.description.toLowerCase().includes(actionLower) ||
      d.type.includes(actionLower) ||
      d.key.includes(actionLower)
    );
    if (filtered.length === 0) {
      filtered = deadlines; // Return all if no match
    }
  }

  const notes: string[] = [
    'FRCP Rule 6(a): For periods < 11 days, exclude weekends and federal holidays.',
    'For periods >= 11 days, count calendar days but extend if last day is weekend/holiday.',
    'These are DEFAULT deadlines - always check court orders for modified deadlines.',
  ];

  return {
    rule: `FRCP Rule ${ruleNum}`,
    deadlines: filtered,
    notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────────────────────

export async function handleCalendarTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case 'ps_calendar_extract':
      return handleCalendarExtract(args as Parameters<typeof handleCalendarExtract>[0]);

    case 'ps_calendar_export':
      return handleCalendarExport(args as Parameters<typeof handleCalendarExport>[0]);

    case 'ps_calendar_calculate':
      return handleCalendarCalculate(args as Parameters<typeof handleCalendarCalculate>[0]);

    case 'ps_calendar_frcp':
      return handleCalendarFRCP(args as Parameters<typeof handleCalendarFRCP>[0]);

    default:
      throw new Error(`Unknown calendar tool: ${toolName}`);
  }
}
