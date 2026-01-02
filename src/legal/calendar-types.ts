// ═══════════════════════════════════════════════════════════════════════════
// LEGAL CALENDAR TYPES
// ═══════════════════════════════════════════════════════════════════════════
// Types for deadline extraction and calendar integration.
// Supports federal and state court deadline calculation rules.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Types of legal deadlines commonly found in court documents.
 */
export type DeadlineType =
  | 'response'           // Response to motion/complaint
  | 'reply'              // Reply brief
  | 'discovery'          // Discovery deadline
  | 'disclosure'         // Disclosure deadline
  | 'filing'             // General filing deadline
  | 'hearing'            // Hearing date
  | 'trial'              // Trial date
  | 'appeal'             // Appeal deadline
  | 'statute_limitations' // SOL deadline
  | 'other';

/**
 * Court rules for calculating deadlines.
 */
export type CourtRules =
  | 'frcp'               // Federal Rules of Civil Procedure
  | 'frap'               // Federal Rules of Appellate Procedure
  | 'california'         // California state rules
  | 'texas'              // Texas state rules
  | 'new_york'           // New York state rules
  | 'generic';           // Generic calendar day counting

/**
 * How to count days for a deadline.
 */
export type CountingMethod =
  | 'calendar'           // All days count
  | 'business'           // Exclude weekends
  | 'court';             // Exclude weekends and federal holidays

/**
 * Priority level for a deadline.
 */
export type DeadlinePriority =
  | 'critical'           // Miss this = malpractice (SOL, appeals)
  | 'high'               // Court-ordered deadline
  | 'medium'             // Procedural deadline
  | 'low';               // Soft deadline

/**
 * A deadline extracted from a legal document.
 */
export interface ExtractedDeadline {
  /** Unique identifier for this deadline */
  id: string;

  /** Type of deadline */
  type: DeadlineType;

  /** Human-readable description */
  description: string;

  /** The original text that triggered extraction */
  sourceText: string;

  /** Location in document (line number or section) */
  sourceLocation?: string;

  /** Base date for calculation (e.g., service date) */
  baseDate?: Date;

  /** Number of days from base date */
  daysFromBase?: number;

  /** Calculated due date */
  dueDate?: Date;

  /** Court rules used for calculation */
  courtRules: CourtRules;

  /** How days are counted */
  countingMethod: CountingMethod;

  /** Priority level */
  priority: DeadlinePriority;

  /** Case name or matter identifier */
  matter?: string;

  /** Court name */
  court?: string;

  /** Case number */
  caseNumber?: string;

  /** Whether this deadline is estimated vs. explicit */
  isEstimated: boolean;

  /** Confidence score (0-1) */
  confidence: number;

  /** Warning message if any */
  warning?: string;
}

/**
 * A calendar event for export.
 */
export interface CalendarEvent {
  /** Unique identifier */
  uid: string;

  /** Event title */
  summary: string;

  /** Event description */
  description: string;

  /** Start date/time */
  dtstart: Date;

  /** End date/time (optional, defaults to 1 hour after start) */
  dtend?: Date;

  /** Is this an all-day event? */
  allDay: boolean;

  /** Location (e.g., courtroom) */
  location?: string;

  /** Reminder minutes before event */
  reminders: number[];

  /** Categories/tags */
  categories: string[];

  /** URL for more info */
  url?: string;

  /** Priority (1-9, 1 = highest) */
  priority: number;

  /** Organizer name */
  organizer?: string;

  /** Created timestamp */
  created: Date;

  /** Last modified timestamp */
  lastModified: Date;
}

/**
 * Federal holidays for court day calculations.
 */
export interface FederalHoliday {
  name: string;
  date: Date;
  observed?: Date; // If different from actual date
}

/**
 * Configuration for deadline extraction.
 */
export interface DeadlineExtractorConfig {
  /** Default court rules to use */
  defaultCourtRules: CourtRules;

  /** Default base date if none specified */
  defaultBaseDate?: Date;

  /** Matter name to tag deadlines with */
  matter?: string;

  /** Court name */
  court?: string;

  /** Case number */
  caseNumber?: string;

  /** Include estimated deadlines? */
  includeEstimated: boolean;

  /** Minimum confidence to include */
  minConfidence: number;
}

/**
 * Result of deadline extraction.
 */
export interface DeadlineExtractionResult {
  /** Extracted deadlines */
  deadlines: ExtractedDeadline[];

  /** Extraction metadata */
  metadata: {
    documentLength: number;
    extractionTime: number;
    rulesUsed: CourtRules;
  };

  /** Warnings */
  warnings: string[];
}

/**
 * Common deadline patterns in legal documents.
 */
export const DEADLINE_PATTERNS = {
  // Explicit date patterns
  explicitDate: [
    /(?:due|filed?|submit(?:ted)?|respond|reply)\s+(?:by|on|before)\s+(\w+\s+\d{1,2},?\s+\d{4})/gi,
    /deadline[:\s]+(\w+\s+\d{1,2},?\s+\d{4})/gi,
    /no\s+later\s+than\s+(\w+\s+\d{1,2},?\s+\d{4})/gi,
  ],

  // Days from service/filing patterns
  daysFromEvent: [
    /within\s+(\d+)\s+(?:calendar\s+)?days?\s+(?:of|from|after)\s+(\w+)/gi,
    /(\d+)\s+(?:calendar\s+)?days?\s+(?:to|for)\s+(\w+)/gi,
    /shall\s+(?:have\s+)?(\d+)\s+days?\s+to\s+(\w+)/gi,
  ],

  // FRCP-specific patterns
  frcpPatterns: [
    /(?:Rule|Fed\.?\s*R\.?\s*Civ\.?\s*P\.?)\s+(\d+)(?:\([a-z]\))?/gi,
    /pursuant\s+to\s+(?:Rule|FRCP)\s+(\d+)/gi,
  ],

  // Hearing/trial patterns
  eventPatterns: [
    /hearing\s+(?:scheduled\s+for|set\s+for|on)\s+(\w+\s+\d{1,2},?\s+\d{4})/gi,
    /trial\s+(?:date|set\s+for|begins?)\s+(\w+\s+\d{1,2},?\s+\d{4})/gi,
  ],
} as const;

/**
 * FRCP deadline rules (days to respond/reply).
 */
export const FRCP_DEADLINES: Record<string, { days: number; type: DeadlineType; description: string }> = {
  // Rule 12 - Defenses and Objections
  '12_answer': { days: 21, type: 'response', description: 'Answer to complaint' },
  '12_motion': { days: 21, type: 'response', description: 'Motion to dismiss deadline' },
  '12_waiver': { days: 60, type: 'response', description: 'Answer after waiver of service' },

  // Rule 26 - Discovery
  '26_disclosure': { days: 14, type: 'disclosure', description: 'Initial disclosures after Rule 26(f) conference' },
  '26_expert': { days: 90, type: 'disclosure', description: 'Expert disclosure (before trial)' },

  // Rule 33 - Interrogatories
  '33_response': { days: 30, type: 'discovery', description: 'Response to interrogatories' },

  // Rule 34 - Document Requests
  '34_response': { days: 30, type: 'discovery', description: 'Response to document requests' },

  // Rule 36 - Admissions
  '36_response': { days: 30, type: 'discovery', description: 'Response to requests for admission' },

  // Rule 56 - Summary Judgment
  '56_response': { days: 21, type: 'response', description: 'Opposition to summary judgment' },
  '56_reply': { days: 14, type: 'reply', description: 'Reply in support of summary judgment' },

  // Rule 59 - New Trial
  '59_motion': { days: 28, type: 'filing', description: 'Motion for new trial' },

  // Rule 60 - Relief from Judgment
  '60_motion': { days: 365, type: 'filing', description: 'Motion for relief from judgment (1 year)' },
} as const;

/**
 * Federal holidays (2024-2025).
 */
export const FEDERAL_HOLIDAYS_2024_2025: FederalHoliday[] = [
  // 2024
  { name: "New Year's Day", date: new Date('2024-01-01') },
  { name: "Martin Luther King Jr. Day", date: new Date('2024-01-15') },
  { name: "Presidents' Day", date: new Date('2024-02-19') },
  { name: "Memorial Day", date: new Date('2024-05-27') },
  { name: "Juneteenth", date: new Date('2024-06-19') },
  { name: "Independence Day", date: new Date('2024-07-04') },
  { name: "Labor Day", date: new Date('2024-09-02') },
  { name: "Columbus Day", date: new Date('2024-10-14') },
  { name: "Veterans Day", date: new Date('2024-11-11') },
  { name: "Thanksgiving", date: new Date('2024-11-28') },
  { name: "Christmas", date: new Date('2024-12-25') },

  // 2025
  { name: "New Year's Day", date: new Date('2025-01-01') },
  { name: "Martin Luther King Jr. Day", date: new Date('2025-01-20') },
  { name: "Presidents' Day", date: new Date('2025-02-17') },
  { name: "Memorial Day", date: new Date('2025-05-26') },
  { name: "Juneteenth", date: new Date('2025-06-19') },
  { name: "Independence Day", date: new Date('2025-07-04') },
  { name: "Labor Day", date: new Date('2025-09-01') },
  { name: "Columbus Day", date: new Date('2025-10-13') },
  { name: "Veterans Day", date: new Date('2025-11-11') },
  { name: "Thanksgiving", date: new Date('2025-11-27') },
  { name: "Christmas", date: new Date('2025-12-25') },
];
