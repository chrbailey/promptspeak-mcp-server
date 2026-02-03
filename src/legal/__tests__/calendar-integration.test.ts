/**
 * Unit Tests: Legal Calendar Integration
 *
 * Tests deadline extraction, iCal generation, and calendar tools.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DeadlineExtractor,
  createDeadlineExtractor,
} from '../deadline-extractor.js';
import {
  ICalGenerator,
  createICalGenerator,
  generateICalFromDeadlines,
} from '../ical-generator.js';
import {
  CalendarIntegration,
  createCalendarIntegration,
  processDocumentsToICal,
  extractDeadlinesFromDocument,
  lookupFRCPDeadline,
  getDeadlinesForRule,
} from '../calendar-integration.js';
import {
  handleExtractDeadlines,
  handleGenerateICal,
  handleDeadlineSummary,
  handleCalendarTool,
  isCalendarTool,
  getCalendarToolDefinitions,
} from '../calendar-tools.js';
import type { ExtractedDeadline, CourtRules } from '../calendar-types.js';
import { FRCP_DEADLINES, FEDERAL_HOLIDAYS_2024_2025 } from '../calendar-types.js';

// =============================================================================
// SECTION 1: DEADLINE EXTRACTOR TESTS
// =============================================================================

describe('DeadlineExtractor', () => {
  let extractor: DeadlineExtractor;

  beforeEach(() => {
    extractor = createDeadlineExtractor({
      defaultCourtRules: 'frcp',
      minConfidence: 0.5,
    });
  });

  describe('Explicit Date Extraction', () => {
    it('should extract explicit deadline dates', () => {
      const content = `
        The response must be filed by January 15, 2025.
        Opposition papers are due by February 1, 2025.
      `;

      const result = extractor.extract(content);

      expect(result.deadlines.length).toBeGreaterThanOrEqual(2);
      expect(result.deadlines.some(d => d.description.includes('filed') || d.sourceText.includes('filed'))).toBe(true);
    });

    it('should extract "no later than" dates', () => {
      const content = 'All discovery requests must be served no later than March 15, 2025.';

      const result = extractor.extract(content);

      expect(result.deadlines.length).toBeGreaterThanOrEqual(1);
      expect(result.deadlines[0].confidence).toBeGreaterThan(0.8);
    });

    it('should extract deadline with explicit keyword', () => {
      const content = 'Deadline: April 30, 2025';

      const result = extractor.extract(content);

      expect(result.deadlines.length).toBe(1);
      expect(result.deadlines[0].confidence).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('Relative Deadline Extraction', () => {
    it('should extract "within X days" patterns', () => {
      const content = 'Defendant shall respond within 30 days of service.';

      const result = extractor.extract(content);

      expect(result.deadlines.length).toBeGreaterThanOrEqual(1);
      expect(result.deadlines[0].daysFromBase).toBe(30);
    });

    it('should extract business days patterns', () => {
      const content = 'Reply must be filed within 5 business days of opposition.';

      const result = extractor.extract(content);

      expect(result.deadlines.length).toBeGreaterThanOrEqual(1);
      expect(result.deadlines[0].countingMethod).toBe('business');
    });

    it('should calculate due date when base date provided', () => {
      const baseDate = new Date('2025-01-01');
      extractor.setConfig({ defaultBaseDate: baseDate });

      const content = 'Response due within 21 days of filing.';

      const result = extractor.extract(content);

      expect(result.deadlines.length).toBeGreaterThanOrEqual(1);
      expect(result.deadlines[0].dueDate).toBeDefined();
      expect(result.deadlines[0].isEstimated).toBe(false);
    });

    it('should mark deadline as estimated when no base date', () => {
      const content = 'Response due within 21 days of filing.';

      const result = extractor.extract(content);

      expect(result.deadlines.length).toBeGreaterThanOrEqual(1);
      expect(result.deadlines[0].isEstimated).toBe(true);
      expect(result.deadlines[0].warning).toContain('Base date not specified');
    });
  });

  describe('FRCP Deadline Extraction', () => {
    it('should extract Rule 12 answer deadline', () => {
      const content = 'Pursuant to Rule 12, defendant must file an answer.';

      const result = extractor.extract(content);

      expect(result.deadlines.length).toBeGreaterThanOrEqual(1);
      expect(result.deadlines.some(d => d.description.includes('Rule 12'))).toBe(true);
    });

    it('should extract Rule 33 interrogatory deadline', () => {
      const content = 'Responses to interrogatories under Rule 33 are required.';

      const result = extractor.extract(content);

      expect(result.deadlines.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract Rule 56 summary judgment response', () => {
      const content = 'Opposition to summary judgment is due under Fed. R. Civ. P. 56.';

      const result = extractor.extract(content);

      expect(result.deadlines.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Event Date Extraction', () => {
    it('should extract hearing dates', () => {
      const content = 'The hearing is scheduled for May 15, 2025 at 9:00 am.';

      const result = extractor.extract(content);

      expect(result.deadlines.length).toBe(1);
      expect(result.deadlines[0].type).toBe('hearing');
      expect(result.deadlines[0].priority).toBe('critical');
    });

    it('should extract trial dates', () => {
      const content = 'Trial is set for September 1, 2025.';

      const result = extractor.extract(content);

      expect(result.deadlines.length).toBe(1);
      expect(result.deadlines[0].type).toBe('trial');
      expect(result.deadlines[0].priority).toBe('critical');
    });
  });

  describe('Date Calculation', () => {
    it('should calculate calendar days correctly', () => {
      const baseDate = new Date('2025-01-01');
      const result = extractor.calculateDueDate(baseDate, 30, 'calendar');

      expect(result.toISOString().split('T')[0]).toBe('2025-01-31');
    });

    it('should calculate business days (excluding weekends)', () => {
      const baseDate = new Date('2025-01-06'); // Monday
      const result = extractor.calculateDueDate(baseDate, 5, 'business');

      // 5 business days from Monday Jan 6 = Monday Jan 13
      expect(result.toISOString().split('T')[0]).toBe('2025-01-13');
    });

    it('should calculate court days (short periods)', () => {
      const baseDate = new Date('2025-01-06'); // Monday
      const result = extractor.calculateDueDate(baseDate, 7, 'court');

      // 7 court days from Monday, excluding weekends and holidays
      expect(result.getDay()).not.toBe(0); // Not Sunday
      expect(result.getDay()).not.toBe(6); // Not Saturday
    });

    it('should extend deadline if landing on weekend (long periods)', () => {
      // January 4, 2025 is a Saturday
      const baseDate = new Date('2024-12-21'); // Saturday
      const result = extractor.calculateDueDate(baseDate, 14, 'court');

      // 14 days = Jan 4, 2025 (Saturday) -> should extend to Monday Jan 6
      const day = result.getDay();
      expect(day).not.toBe(0);
      expect(day).not.toBe(6);
    });
  });

  describe('Priority Assignment', () => {
    it('should assign critical priority to trial/hearing', () => {
      const content = 'Trial begins June 1, 2025.';

      const result = extractor.extract(content);

      expect(result.deadlines[0].priority).toBe('critical');
    });

    it('should assign high priority to short deadlines', () => {
      const content = 'Response due within 7 days of service.';

      const result = extractor.extract(content);

      expect(result.deadlines[0].priority).toBe('high');
    });
  });
});

// =============================================================================
// SECTION 2: ICAL GENERATOR TESTS
// =============================================================================

describe('ICalGenerator', () => {
  let generator: ICalGenerator;

  beforeEach(() => {
    generator = createICalGenerator({
      calendarName: 'Test Legal Calendar',
      timezone: 'America/Los_Angeles',
    });
  });

  describe('iCal Generation', () => {
    it('should generate valid iCal structure', () => {
      const deadlines: ExtractedDeadline[] = [
        {
          id: 'test_1',
          type: 'response',
          description: 'Response to Motion',
          sourceText: 'Response due by January 15, 2025',
          courtRules: 'frcp',
          countingMethod: 'calendar',
          priority: 'high',
          dueDate: new Date('2025-01-15'),
          isEstimated: false,
          confidence: 0.9,
        },
      ];

      const ical = generator.fromDeadlines(deadlines);

      expect(ical).toContain('BEGIN:VCALENDAR');
      expect(ical).toContain('END:VCALENDAR');
      expect(ical).toContain('BEGIN:VEVENT');
      expect(ical).toContain('END:VEVENT');
      expect(ical).toContain('VERSION:2.0');
    });

    it('should include timezone definition', () => {
      const deadlines: ExtractedDeadline[] = [
        {
          id: 'test_1',
          type: 'filing',
          description: 'Filing Deadline',
          sourceText: 'Due January 15, 2025',
          courtRules: 'frcp',
          countingMethod: 'calendar',
          priority: 'medium',
          dueDate: new Date('2025-01-15'),
          isEstimated: false,
          confidence: 0.9,
        },
      ];

      const ical = generator.fromDeadlines(deadlines);

      expect(ical).toContain('BEGIN:VTIMEZONE');
      expect(ical).toContain('America/Los_Angeles');
    });

    it('should generate all-day events for filing deadlines', () => {
      const deadlines: ExtractedDeadline[] = [
        {
          id: 'test_1',
          type: 'filing',
          description: 'Filing Deadline',
          sourceText: 'Due January 15, 2025',
          courtRules: 'frcp',
          countingMethod: 'calendar',
          priority: 'medium',
          dueDate: new Date('2025-01-15'),
          isEstimated: false,
          confidence: 0.9,
        },
      ];

      const ical = generator.fromDeadlines(deadlines);

      expect(ical).toContain('DTSTART;VALUE=DATE:20250115');
    });

    it('should generate timed events for hearings', () => {
      const hearingDate = new Date('2025-01-15T09:00:00');
      const deadlines: ExtractedDeadline[] = [
        {
          id: 'test_1',
          type: 'hearing',
          description: 'Motion Hearing',
          sourceText: 'Hearing January 15, 2025 at 9:00 am',
          courtRules: 'frcp',
          countingMethod: 'calendar',
          priority: 'critical',
          dueDate: hearingDate,
          isEstimated: false,
          confidence: 0.95,
        },
      ];

      const ical = generator.fromDeadlines(deadlines);

      expect(ical).toContain('DTSTART;TZID=America/Los_Angeles:');
      expect(ical).toContain('DTEND;TZID=America/Los_Angeles:');
    });

    it('should include reminders based on priority', () => {
      const deadlines: ExtractedDeadline[] = [
        {
          id: 'test_1',
          type: 'response',
          description: 'Critical Response',
          sourceText: 'Response due',
          courtRules: 'frcp',
          countingMethod: 'calendar',
          priority: 'critical',
          dueDate: new Date('2025-01-15'),
          isEstimated: false,
          confidence: 0.9,
        },
      ];

      const ical = generator.fromDeadlines(deadlines);

      // Critical events should have multiple alarms
      const alarmCount = (ical.match(/BEGIN:VALARM/g) || []).length;
      expect(alarmCount).toBeGreaterThanOrEqual(3);
    });

    it('should skip deadlines without due dates', () => {
      const deadlines: ExtractedDeadline[] = [
        {
          id: 'test_1',
          type: 'response',
          description: 'No date',
          sourceText: 'Response due within 30 days',
          courtRules: 'frcp',
          countingMethod: 'calendar',
          priority: 'high',
          isEstimated: true,
          confidence: 0.7,
        },
      ];

      const ical = generator.fromDeadlines(deadlines);

      expect(ical).not.toContain('BEGIN:VEVENT');
    });
  });

  describe('Convenience Function', () => {
    it('should generate iCal using convenience function', () => {
      const deadlines: ExtractedDeadline[] = [
        {
          id: 'test_1',
          type: 'filing',
          description: 'Test Filing',
          sourceText: 'Due January 15, 2025',
          courtRules: 'frcp',
          countingMethod: 'calendar',
          priority: 'medium',
          dueDate: new Date('2025-01-15'),
          isEstimated: false,
          confidence: 0.9,
        },
      ];

      const ical = generateICalFromDeadlines(deadlines);

      expect(ical).toContain('BEGIN:VCALENDAR');
      expect(ical).toContain('BEGIN:VEVENT');
    });
  });
});

// =============================================================================
// SECTION 3: CALENDAR INTEGRATION TESTS
// =============================================================================

describe('CalendarIntegration', () => {
  let integration: CalendarIntegration;

  beforeEach(() => {
    integration = createCalendarIntegration({
      deduplicateDeadlines: true,
      mergeSimilar: true,
    });
  });

  describe('Single Document Processing', () => {
    it('should process a document and extract deadlines', () => {
      const doc = {
        id: 'doc_1',
        content: 'Response must be filed by January 15, 2025.',
        matter: 'Smith v. Jones',
        court: 'N.D. Cal.',
        caseNumber: '3:24-cv-00001',
      };

      const result = integration.processDocument(doc);

      expect(result.success).toBe(true);
      expect(result.documentId).toBe('doc_1');
      expect(result.deadlines.length).toBeGreaterThanOrEqual(1);
    });

    it('should include document metadata in deadlines', () => {
      const doc = {
        id: 'doc_1',
        content: 'Deadline: February 1, 2025',
        matter: 'Smith v. Jones',
        court: 'N.D. Cal.',
        caseNumber: '3:24-cv-00001',
      };

      const result = integration.processDocument(doc);

      expect(result.deadlines[0].matter).toBe('Smith v. Jones');
      expect(result.deadlines[0].court).toBe('N.D. Cal.');
      expect(result.deadlines[0].caseNumber).toBe('3:24-cv-00001');
    });
  });

  describe('Batch Processing', () => {
    it('should process multiple documents', () => {
      const docs = [
        { id: 'doc_1', content: 'Response due by January 15, 2025.' },
        { id: 'doc_2', content: 'Opposition due by February 1, 2025.' },
        { id: 'doc_3', content: 'Reply due by February 15, 2025.' },
      ];

      const result = integration.processDocuments(docs);

      expect(result.summary.documentsProcessed).toBe(3);
      expect(result.summary.documentsSucceeded).toBe(3);
      expect(result.summary.totalDeadlines).toBeGreaterThanOrEqual(3);
    });

    it('should deduplicate deadlines across documents', () => {
      const docs = [
        { id: 'doc_1', content: 'Response due by January 15, 2025.' },
        { id: 'doc_2', content: 'Response due by January 15, 2025.' }, // Same deadline
      ];

      const result = integration.processDocuments(docs);

      // Should have fewer unique deadlines than total
      expect(result.summary.uniqueDeadlines).toBeLessThan(result.summary.totalDeadlines);
      expect(result.summary.duplicatesRemoved).toBeGreaterThan(0);
    });

    it('should sort deadlines by date and priority', () => {
      const docs = [
        { id: 'doc_1', content: 'Low priority due by March 1, 2025.' },
        { id: 'doc_2', content: 'Trial begins February 1, 2025.' },
        { id: 'doc_3', content: 'Response due by January 15, 2025.' },
      ];

      const result = integration.processDocuments(docs);

      // First deadline should be earliest
      if (result.allDeadlines.length > 1 && result.allDeadlines[0].dueDate && result.allDeadlines[1].dueDate) {
        expect(result.allDeadlines[0].dueDate.getTime()).toBeLessThanOrEqual(
          result.allDeadlines[1].dueDate.getTime()
        );
      }
    });
  });

  describe('FRCP Rules Lookup', () => {
    it('should look up FRCP deadline rule', () => {
      const rule = integration.lookupFRCPRule('12_answer');

      expect(rule).toBeDefined();
      expect(rule?.days).toBe(21);
      expect(rule?.type).toBe('response');
    });

    it('should get all FRCP rules', () => {
      const rules = integration.getAllFRCPRules();

      expect(Object.keys(rules).length).toBeGreaterThan(0);
      expect(rules['12_answer']).toBeDefined();
      expect(rules['33_response']).toBeDefined();
    });

    it('should get federal holidays', () => {
      const holidays = integration.getFederalHolidays();

      expect(holidays.length).toBeGreaterThan(0);
      expect(holidays.some(h => h.name === 'Thanksgiving')).toBe(true);
    });

    it('should check if date is non-court day', () => {
      // Saturday
      const saturday = integration.isNonCourtDay(new Date('2025-01-04'));
      expect(saturday.isNonCourtDay).toBe(true);
      expect(saturday.reason).toBe('Saturday');

      // Sunday
      const sunday = integration.isNonCourtDay(new Date('2025-01-05'));
      expect(sunday.isNonCourtDay).toBe(true);
      expect(sunday.reason).toBe('Sunday');

      // Weekday (not holiday)
      const monday = integration.isNonCourtDay(new Date('2025-01-06'));
      expect(monday.isNonCourtDay).toBe(false);
    });
  });

  describe('iCal Generation', () => {
    it('should generate iCal from processed documents', () => {
      const docs = [
        { id: 'doc_1', content: 'Response due by January 15, 2025.' },
      ];

      const result = integration.processAndGenerateICal(docs);

      expect(result.icalContent).toContain('BEGIN:VCALENDAR');
      expect(result.eventsGenerated).toBeGreaterThanOrEqual(1);
    });
  });
});

// =============================================================================
// SECTION 4: MCP TOOL HANDLER TESTS
// =============================================================================

describe('Calendar MCP Tools', () => {
  describe('Tool Definitions', () => {
    it('should have all tool definitions', () => {
      const tools = getCalendarToolDefinitions();

      expect(tools.length).toBe(3);
      expect(tools.some(t => t.name === 'ps_legal_extract_deadlines')).toBe(true);
      expect(tools.some(t => t.name === 'ps_legal_generate_ical')).toBe(true);
      expect(tools.some(t => t.name === 'ps_legal_deadline_summary')).toBe(true);
    });

    it('should identify calendar tools', () => {
      expect(isCalendarTool('ps_legal_extract_deadlines')).toBe(true);
      expect(isCalendarTool('ps_legal_generate_ical')).toBe(true);
      expect(isCalendarTool('ps_legal_deadline_summary')).toBe(true);
      expect(isCalendarTool('ps_other_tool')).toBe(false);
    });
  });

  describe('ps_legal_extract_deadlines', () => {
    it('should extract deadlines from content', () => {
      const result = handleExtractDeadlines({
        content: 'Response must be filed by January 15, 2025.',
      });

      expect(result.success).toBe(true);
      expect(result.count).toBeGreaterThanOrEqual(1);
      expect(result.deadlines).toBeDefined();
    });

    it('should apply court rules when specified', () => {
      const result = handleExtractDeadlines({
        content: 'Rule 12 answer required.',
        courtRules: 'frcp',
      });

      expect(result.success).toBe(true);
    });

    it('should calculate due dates with base date', () => {
      const result = handleExtractDeadlines({
        content: 'Response due within 30 days of service.',
        baseDate: '2025-01-01',
      });

      expect(result.success).toBe(true);
      if ((result.deadlines as any[])?.length > 0) {
        const deadline = (result.deadlines as any[])[0];
        expect(deadline.dueDate).toBeDefined();
      }
    });

    it('should reject invalid input', () => {
      const result = handleExtractDeadlines({
        content: 'short', // Too short
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });
  });

  describe('ps_legal_generate_ical', () => {
    it('should generate iCal from deadlines', () => {
      const result = handleGenerateICal({
        deadlines: [
          {
            id: 'test_1',
            type: 'response',
            description: 'Test Response',
            sourceText: 'Response due',
            courtRules: 'frcp',
            countingMethod: 'calendar',
            priority: 'high',
            dueDate: '2025-01-15T00:00:00.000Z',
            isEstimated: false,
            confidence: 0.9,
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.icalContent).toContain('BEGIN:VCALENDAR');
      expect(result.eventCount).toBe(1);
    });

    it('should reject deadlines without dates', () => {
      const result = handleGenerateICal({
        deadlines: [
          {
            id: 'test_1',
            type: 'response',
            description: 'Test Response',
            sourceText: 'Response due',
            courtRules: 'frcp',
            countingMethod: 'calendar',
            priority: 'high',
            isEstimated: true,
            confidence: 0.9,
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No deadlines with due dates');
    });
  });

  describe('ps_legal_deadline_summary', () => {
    it('should generate summary by priority', () => {
      const result = handleDeadlineSummary({
        deadlines: [
          { id: '1', type: 'response', description: 'Critical', dueDate: '2025-01-15', priority: 'critical', isEstimated: false, confidence: 0.9 },
          { id: '2', type: 'filing', description: 'High', dueDate: '2025-01-20', priority: 'high', isEstimated: false, confidence: 0.8 },
          { id: '3', type: 'discovery', description: 'Medium', dueDate: '2025-02-01', priority: 'medium', isEstimated: false, confidence: 0.7 },
        ],
        groupBy: 'priority',
      });

      expect(result.success).toBe(true);
      expect((result.summary as any).stats.byPriority.critical).toBe(1);
      expect((result.summary as any).stats.byPriority.high).toBe(1);
      expect((result.summary as any).stats.byPriority.medium).toBe(1);
    });

    it('should identify overdue deadlines', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      const result = handleDeadlineSummary({
        deadlines: [
          { id: '1', type: 'response', description: 'Overdue', dueDate: pastDate.toISOString(), priority: 'high', isEstimated: false, confidence: 0.9 },
        ],
        includeOverdue: true,
      });

      expect(result.success).toBe(true);
      expect((result.summary as any).stats.overdue).toBe(1);
    });

    it('should provide recommendations', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      const result = handleDeadlineSummary({
        deadlines: [
          { id: '1', type: 'response', description: 'Overdue', dueDate: pastDate.toISOString(), priority: 'critical', isEstimated: false, confidence: 0.9 },
        ],
      });

      expect(result.success).toBe(true);
      expect((result.recommendations as string[]).length).toBeGreaterThan(0);
      expect((result.recommendations as string[]).some(r => r.includes('OVERDUE'))).toBe(true);
    });
  });

  describe('Main Handler', () => {
    it('should route to correct handler', async () => {
      const result = await handleCalendarTool('ps_legal_extract_deadlines', {
        content: 'Response due by January 15, 2025.',
      });

      expect(result.success).toBe(true);
    });

    it('should reject unknown tools', async () => {
      const result = await handleCalendarTool('ps_unknown_tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown calendar tool');
    });
  });
});

// =============================================================================
// SECTION 5: CONVENIENCE FUNCTION TESTS
// =============================================================================

describe('Convenience Functions', () => {
  describe('extractDeadlinesFromDocument', () => {
    it('should extract deadlines with options', () => {
      const result = extractDeadlinesFromDocument(
        'Response due by January 15, 2025.',
        {
          courtRules: 'frcp',
          matter: 'Test Case',
        }
      );

      expect(result.deadlines.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('lookupFRCPDeadline', () => {
    it('should look up known rules', () => {
      expect(lookupFRCPDeadline('12_answer')?.days).toBe(21);
      expect(lookupFRCPDeadline('33_response')?.days).toBe(30);
      expect(lookupFRCPDeadline('59_motion')?.days).toBe(28);
    });

    it('should return undefined for unknown rules', () => {
      expect(lookupFRCPDeadline('99_unknown')).toBeUndefined();
    });
  });

  describe('getDeadlinesForRule', () => {
    it('should get all deadlines for Rule 12', () => {
      const rules = getDeadlinesForRule('12');

      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some(r => r.key === '12_answer')).toBe(true);
    });

    it('should get all deadlines for Rule 56', () => {
      const rules = getDeadlinesForRule('56');

      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some(r => r.key === '56_response')).toBe(true);
      expect(rules.some(r => r.key === '56_reply')).toBe(true);
    });
  });
});

// =============================================================================
// SECTION 6: FRCP CONSTANTS TESTS
// =============================================================================

describe('FRCP Constants', () => {
  describe('FRCP_DEADLINES', () => {
    it('should have Rule 12 deadlines', () => {
      expect(FRCP_DEADLINES['12_answer']).toBeDefined();
      expect(FRCP_DEADLINES['12_motion']).toBeDefined();
      expect(FRCP_DEADLINES['12_waiver']).toBeDefined();
    });

    it('should have discovery deadlines', () => {
      expect(FRCP_DEADLINES['33_response']).toBeDefined();
      expect(FRCP_DEADLINES['34_response']).toBeDefined();
      expect(FRCP_DEADLINES['36_response']).toBeDefined();
    });

    it('should have correct day counts', () => {
      expect(FRCP_DEADLINES['12_answer'].days).toBe(21);
      expect(FRCP_DEADLINES['33_response'].days).toBe(30);
      expect(FRCP_DEADLINES['56_response'].days).toBe(21);
      expect(FRCP_DEADLINES['60_motion'].days).toBe(365);
    });
  });

  describe('FEDERAL_HOLIDAYS', () => {
    it('should have 2024 holidays', () => {
      const holidays2024 = FEDERAL_HOLIDAYS_2024_2025.filter(
        h => h.date.getFullYear() === 2024
      );

      expect(holidays2024.length).toBeGreaterThan(0);
      expect(holidays2024.some(h => h.name === 'Independence Day')).toBe(true);
      expect(holidays2024.some(h => h.name === 'Thanksgiving')).toBe(true);
    });

    it('should have 2025 holidays', () => {
      const holidays2025 = FEDERAL_HOLIDAYS_2024_2025.filter(
        h => h.date.getFullYear() === 2025
      );

      expect(holidays2025.length).toBeGreaterThan(0);
      expect(holidays2025.some(h => h.name === "New Year's Day")).toBe(true);
    });
  });
});
