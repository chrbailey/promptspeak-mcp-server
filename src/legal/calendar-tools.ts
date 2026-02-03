/**
 * Legal Calendar MCP Tools
 *
 * MCP tools for extracting legal deadlines and generating calendar events.
 */

import { DeadlineExtractor, createDeadlineExtractor } from './deadline-extractor.js';
import { ICalGenerator, createICalGenerator, generateICalFromDeadlines } from './ical-generator.js';
import { mcpSuccess, mcpFailure } from '../core/result/index.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type {
  ExtractedDeadline,
  DeadlineExtractionResult,
  DeadlinePriority,
} from './calendar-types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const CALENDAR_TOOLS = [
  {
    name: 'ps_legal_extract_deadlines',
    description: 'Extract legal deadlines from document text using pattern matching and FRCP rules.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The legal document text to extract deadlines from',
        },
        court_rules: {
          type: 'string',
          enum: ['frcp', 'frap', 'local'],
          description: 'Court rules to apply (default: frcp)',
        },
        base_date: {
          type: 'string',
          description: 'Base date for relative deadline calculations (ISO format)',
        },
        case_number: {
          type: 'string',
          description: 'Case number to associate with extracted deadlines',
        },
        min_confidence: {
          type: 'number',
          description: 'Minimum confidence threshold (0-1, default: 0.5)',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'ps_legal_generate_ical',
    description: 'Generate iCalendar (.ics) file from extracted deadlines.',
    inputSchema: {
      type: 'object',
      properties: {
        deadlines: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              due_date: { type: 'string' },
              priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
              type: { type: 'string' },
              source_text: { type: 'string' },
            },
            required: ['description', 'due_date'],
          },
          description: 'Array of deadlines to convert to calendar events',
        },
        calendar_name: {
          type: 'string',
          description: 'Name for the calendar (default: Legal Deadlines)',
        },
        timezone: {
          type: 'string',
          description: 'Timezone (default: America/Los_Angeles)',
        },
        reminders: {
          type: 'array',
          items: { type: 'number' },
          description: 'Reminder times in minutes before event (default: [1440, 60])',
        },
      },
      required: ['deadlines'],
    },
  },
  {
    name: 'ps_legal_deadline_summary',
    description: 'Get a formatted summary of legal deadlines with priorities.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Legal document text to analyze',
        },
        format: {
          type: 'string',
          enum: ['text', 'markdown', 'json'],
          description: 'Output format (default: markdown)',
        },
        days_ahead: {
          type: 'number',
          description: 'Only include deadlines within this many days (default: all)',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'ps_legal_extract_and_export',
    description: 'Extract deadlines and generate iCal in one operation.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Legal document text',
        },
        calendar_name: {
          type: 'string',
          description: 'Name for the exported calendar',
        },
        court_rules: {
          type: 'string',
          enum: ['frcp', 'frap', 'local'],
        },
      },
      required: ['content'],
    },
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleExtractDeadlines(args: {
  content: string;
  court_rules?: 'frcp' | 'frap' | 'local';
  base_date?: string;
  case_number?: string;
  min_confidence?: number;
}): Promise<CallToolResult> {
  try {
    const extractor = createDeadlineExtractor({
      defaultCourtRules: args.court_rules || 'frcp',
      defaultBaseDate: args.base_date ? new Date(args.base_date) : undefined,
      caseNumber: args.case_number,
      minConfidence: args.min_confidence ?? 0.5,
    });

    const result = extractor.extract(args.content);

    return mcpSuccess({
      deadlines: result.deadlines.map(formatDeadline),
      count: result.deadlines.length,
      warnings: result.warnings,
      extraction_time_ms: result.extractionTimeMs,
    });
  } catch (error) {
    return mcpFailure(
      'EXTRACTION_FAILED',
      `Failed to extract deadlines: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function handleGenerateICal(args: {
  deadlines: Array<{
    description: string;
    due_date: string;
    priority?: string;
    type?: string;
    source_text?: string;
  }>;
  calendar_name?: string;
  timezone?: string;
  reminders?: number[];
}): Promise<CallToolResult> {
  try {
    const generator = createICalGenerator({
      calendarName: args.calendar_name,
      timezone: args.timezone,
      defaultReminders: args.reminders,
    });

    // Convert input to ExtractedDeadline format
    const deadlines: ExtractedDeadline[] = args.deadlines.map((d, idx) => ({
      id: `deadline_${idx}`,
      description: d.description,
      dueDate: new Date(d.due_date),
      priority: (d.priority as DeadlinePriority) || 'medium',
      type: d.type || 'deadline',
      sourceText: d.source_text,
      confidence: 1.0,
      rule: undefined,
    }));

    const icalContent = generator.fromDeadlines(deadlines);

    return mcpSuccess({
      ical_content: icalContent,
      event_count: deadlines.length,
      calendar_name: args.calendar_name || 'Legal Deadlines',
    });
  } catch (error) {
    return mcpFailure(
      'GENERATION_FAILED',
      `Failed to generate iCal: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function handleDeadlineSummary(args: {
  content: string;
  format?: 'text' | 'markdown' | 'json';
  days_ahead?: number;
}): Promise<CallToolResult> {
  try {
    const extractor = createDeadlineExtractor();
    const result = extractor.extract(args.content);

    let deadlines = result.deadlines;

    // Filter by days ahead if specified
    if (args.days_ahead !== undefined) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + args.days_ahead);

      deadlines = deadlines.filter(
        d => d.dueDate && d.dueDate <= cutoff
      );
    }

    // Format output
    const format = args.format || 'markdown';

    if (format === 'json') {
      return mcpSuccess({
        deadlines: deadlines.map(formatDeadline),
        total_count: deadlines.length,
        by_priority: groupByPriority(deadlines),
      });
    }

    if (format === 'markdown') {
      const summary = formatMarkdownSummary(deadlines);
      return mcpSuccess({
        summary,
        count: deadlines.length,
      });
    }

    // Plain text
    const summary = formatTextSummary(deadlines);
    return mcpSuccess({
      summary,
      count: deadlines.length,
    });
  } catch (error) {
    return mcpFailure(
      'SUMMARY_FAILED',
      `Failed to generate summary: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function handleExtractAndExport(args: {
  content: string;
  calendar_name?: string;
  court_rules?: 'frcp' | 'frap' | 'local';
}): Promise<CallToolResult> {
  try {
    const extractor = createDeadlineExtractor({
      defaultCourtRules: args.court_rules || 'frcp',
    });

    const result = extractor.extract(args.content);

    if (result.deadlines.length === 0) {
      return mcpSuccess({
        message: 'No deadlines found in the document',
        deadlines: [],
        ical_content: null,
      });
    }

    const icalContent = generateICalFromDeadlines(result.deadlines, {
      calendarName: args.calendar_name,
    });

    return mcpSuccess({
      deadlines: result.deadlines.map(formatDeadline),
      count: result.deadlines.length,
      ical_content: icalContent,
      warnings: result.warnings,
    });
  } catch (error) {
    return mcpFailure(
      'EXTRACT_EXPORT_FAILED',
      `Failed to extract and export: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DISPATCHER
// ═══════════════════════════════════════════════════════════════════════════════

export async function dispatchCalendarTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult | null> {
  switch (toolName) {
    case 'ps_legal_extract_deadlines':
      return handleExtractDeadlines(args as Parameters<typeof handleExtractDeadlines>[0]);

    case 'ps_legal_generate_ical':
      return handleGenerateICal(args as Parameters<typeof handleGenerateICal>[0]);

    case 'ps_legal_deadline_summary':
      return handleDeadlineSummary(args as Parameters<typeof handleDeadlineSummary>[0]);

    case 'ps_legal_extract_and_export':
      return handleExtractAndExport(args as Parameters<typeof handleExtractAndExport>[0]);

    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function formatDeadline(deadline: ExtractedDeadline): Record<string, unknown> {
  return {
    id: deadline.id,
    description: deadline.description,
    due_date: deadline.dueDate?.toISOString(),
    priority: deadline.priority,
    type: deadline.type,
    confidence: deadline.confidence,
    source_text: deadline.sourceText,
    rule: deadline.rule,
  };
}

function groupByPriority(deadlines: ExtractedDeadline[]): Record<string, number> {
  return deadlines.reduce((acc, d) => {
    acc[d.priority] = (acc[d.priority] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function formatMarkdownSummary(deadlines: ExtractedDeadline[]): string {
  if (deadlines.length === 0) {
    return '## Legal Deadlines\n\nNo deadlines found.';
  }

  const lines = ['## Legal Deadlines\n'];

  const byPriority = {
    critical: deadlines.filter(d => d.priority === 'critical'),
    high: deadlines.filter(d => d.priority === 'high'),
    medium: deadlines.filter(d => d.priority === 'medium'),
    low: deadlines.filter(d => d.priority === 'low'),
  };

  for (const [priority, items] of Object.entries(byPriority)) {
    if (items.length === 0) continue;

    const emoji = priority === 'critical' ? '🔴' :
                  priority === 'high' ? '🟠' :
                  priority === 'medium' ? '🟡' : '🟢';

    lines.push(`\n### ${emoji} ${priority.toUpperCase()} (${items.length})\n`);

    for (const deadline of items) {
      const dateStr = deadline.dueDate
        ? deadline.dueDate.toLocaleDateString()
        : 'Date TBD';
      lines.push(`- **${dateStr}**: ${deadline.description}`);
    }
  }

  return lines.join('\n');
}

function formatTextSummary(deadlines: ExtractedDeadline[]): string {
  if (deadlines.length === 0) {
    return 'No deadlines found.';
  }

  const lines = ['LEGAL DEADLINES', '=' .repeat(40), ''];

  for (const deadline of deadlines) {
    const dateStr = deadline.dueDate
      ? deadline.dueDate.toLocaleDateString()
      : 'Date TBD';
    lines.push(`[${deadline.priority.toUpperCase()}] ${dateStr}: ${deadline.description}`);
  }

  return lines.join('\n');
}
