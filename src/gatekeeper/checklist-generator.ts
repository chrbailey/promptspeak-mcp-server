// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK MCP SERVER - TRUTH-VALIDATOR CHECKLIST GENERATOR
// ═══════════════════════════════════════════════════════════════════════════
// Integrates the truth-validator skill philosophy into the hold workflow.
// Generates human review checklists when legal domain (◇) operations are held.
//
// ═══════════════════════════════════════════════════════════════════════════
// CRITICAL PHILOSOPHY - READ BEFORE MODIFYING:
// ═══════════════════════════════════════════════════════════════════════════
//
// This generator FLAGS items for human review. It does NOT:
// - Validate accuracy or truth
// - Find evidence of anything
// - Make compliance determinations
// - Confirm or deny any claims
//
// The checklist ASSISTS human review. It does NOT REPLACE human judgment.
//
// Traditional AI approach: "I verified this is accurate"
// THIS skill's approach: "Here's what you should verify yourself"
//
// ═══════════════════════════════════════════════════════════════════════════

import type {
  HoldRequest,
  TruthValidatorChecklist,
  TruthValidatorChecklistItem,
  TruthValidatorFlagType,
  ChecklistCompletionState,
  ChecklistCompletionSummary,
  ExecuteRequest,
} from '../types/index.js';
import { generateAuditId } from '../utils/hash.js';

// ─────────────────────────────────────────────────────────────────────────────
// DISCLAIMER - ALWAYS INCLUDED IN CHECKLISTS
// ─────────────────────────────────────────────────────────────────────────────
// This text is from the truth-validator SKILL.md and MUST be shown to reviewers.

const CHECKLIST_DISCLAIMER = `IMPORTANT LIMITATIONS:
This checklist flags items for YOUR review.
- It does not validate accuracy
- It does not find evidence of anything
- It does not make compliance determinations
- It may miss items that should be reviewed
- It may flag items that are actually fine

Your professional judgment is required.
Review each item against your source materials.`;

// ─────────────────────────────────────────────────────────────────────────────
// FLAG PATTERN DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
// These heuristic patterns identify content that MIGHT need human review.
// They are intentionally broad - false positives are acceptable because
// the human reviewer makes the final determination.

interface FlagDefinition {
  type: TruthValidatorFlagType;
  patterns: RegExp[];
  description: string;
  suggestedAction: string;
}

const FLAG_DEFINITIONS: FlagDefinition[] = [
  {
    type: 'NEEDS_CITATION',
    patterns: [
      /according to/i,
      /studies show/i,
      /research indicates/i,
      /it is established that/i,
      /the court held/i,
      /the statute provides/i,
      /precedent establishes/i,
      /as stated in/i,
      /pursuant to/i,
      /under the authority of/i,
      /the record shows/i,
      /evidence demonstrates/i,
    ],
    description: 'Factual claim without explicit source reference',
    suggestedAction: 'Verify the source exists and supports the claim',
  },
  {
    type: 'CALCULATION_VERIFY',
    patterns: [
      /\d+(\.\d+)?%/,                    // Percentages: 45%, 3.5%
      /\$[\d,]+(\.\d{2})?/,              // Dollar amounts: $1,000, $50.00
      /totaling\s/i,
      /calculated\s/i,
      /amounts to\s/i,
      /sum of\s/i,
      /average of\s/i,
      /increased by\s/i,
      /decreased by\s/i,
      /growth rate/i,
      /rate of\s+\d/i,
      /\d+\s*(times|x)\s*(more|less|greater|fewer)/i,
    ],
    description: 'Arithmetic, percentage, or derived value',
    suggestedAction: 'Verify the math independently',
  },
  {
    type: 'INFERENCE_FLAG',
    patterns: [
      /therefore/i,
      /thus\s/i,
      /hence\s/i,
      /consequently/i,
      /it follows that/i,
      /we can conclude/i,
      /this demonstrates/i,
      /this establishes/i,
      /clearly shows/i,
      /evidently/i,
      /obviously/i,
      /manifestly/i,
      /it is clear that/i,
      /this proves/i,
    ],
    description: 'Conclusion or characterization beyond explicit statement',
    suggestedAction: 'Decide if inference is warranted or should be removed',
  },
  {
    type: 'ASSUMPTION_FLAG',
    patterns: [
      /assuming\s/i,
      /given that/i,
      /if we accept/i,
      /under the premise/i,
      /taking as true/i,
      /presupposing/i,
      /on the assumption/i,
      /predicated on/i,
      /contingent upon/i,
    ],
    description: 'Unstated or stated assumption that affects interpretation',
    suggestedAction: 'Confirm assumption is valid or make it explicit',
  },
  {
    type: 'SCOPE_QUESTION',
    patterns: [
      /\ball\s+\w+/i,                    // "all customers", "all transactions"
      /\bevery\s+\w+/i,
      /\balways\b/i,
      /\bnever\b/i,
      /in all cases/i,
      /without exception/i,
      /comprehensive\b/i,
      /exhaustive\b/i,
      /complete\s+(list|set|record)/i,
      /\bno\s+\w+\s+(has|have|had|will)/i,  // "no customer has"
      /\bnone of/i,
    ],
    description: 'Claim about completeness, frequency, or pattern',
    suggestedAction: 'Verify scope claim is supported by evidence',
  },
  {
    type: 'PARAPHRASE_CHECK',
    patterns: [
      /in other words/i,
      /essentially\s/i,
      /to paraphrase/i,
      /what this means is/i,
      /the gist is/i,
      /in effect\s/i,
      /to summarize/i,
      /put differently/i,
      /stated another way/i,
    ],
    description: 'Wording that may differ from source in meaning-changing ways',
    suggestedAction: 'Compare to original source, confirm meaning preserved',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// LEGAL DOMAIN DETECTION
// ─────────────────────────────────────────────────────────────────────────────

// The legal domain symbol from PromptSpeak ontology (canonical: symbol-ontology.json)
// CRITICAL: ◇ = legal, ◈ = technical (do not confuse!)
const LEGAL_DOMAIN_SYMBOL = '◇';

/**
 * Check if a frame indicates legal domain.
 */
function isLegalDomainFrame(frame: string): boolean {
  return frame.includes(LEGAL_DOMAIN_SYMBOL);
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECKLIST GENERATOR CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class ChecklistGenerator {
  /**
   * Generate a checklist for a hold request.
   * Only generates for legal domain (◇) operations.
   *
   * @param holdRequest - The hold request to generate checklist for
   * @param request - The original execution request
   * @param contentToReview - Optional content to analyze (if not provided, extracts from request)
   * @returns TruthValidatorChecklist or null if not a legal domain hold
   */
  generateForHold(
    holdRequest: HoldRequest,
    request: ExecuteRequest,
    contentToReview?: string
  ): TruthValidatorChecklist | null {
    // Only generate checklists for legal domain operations
    if (!isLegalDomainFrame(holdRequest.frame)) {
      return null;
    }

    const checklistId = `chk_${generateAuditId()}`;
    const content = contentToReview || this.extractReviewableContent(request);
    const items = this.analyzeContent(content, checklistId);

    return {
      checklistId,
      holdId: holdRequest.holdId,
      generatedAt: Date.now(),
      items,
      completionState: items.length > 0 ? 'incomplete' : 'complete',
      disclaimer: CHECKLIST_DISCLAIMER,
    };
  }

  /**
   * Extract content that should be reviewed from the execution request.
   * Looks at tool arguments that might contain reviewable text.
   */
  private extractReviewableContent(request: ExecuteRequest): string {
    const parts: string[] = [];

    // Extract string content from arguments
    for (const [key, value] of Object.entries(request.arguments)) {
      if (typeof value === 'string') {
        parts.push(value);
      } else if (typeof value === 'object' && value !== null) {
        // Recursively extract strings from nested objects
        this.extractStringsFromObject(value, parts);
      }
    }

    return parts.join('\n');
  }

  /**
   * Recursively extract string values from an object.
   */
  private extractStringsFromObject(obj: unknown, collector: string[]): void {
    if (typeof obj === 'string') {
      collector.push(obj);
    } else if (Array.isArray(obj)) {
      for (const item of obj) {
        this.extractStringsFromObject(item, collector);
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const value of Object.values(obj)) {
        this.extractStringsFromObject(value, collector);
      }
    }
  }

  /**
   * Analyze content and generate checklist items.
   * This is heuristic-based - it flags for review, not validates.
   *
   * NOTE: This analysis intentionally errs on the side of flagging.
   * False positives are acceptable because the human reviewer makes
   * the final determination about each item.
   */
  private analyzeContent(
    content: string,
    checklistId: string
  ): TruthValidatorChecklistItem[] {
    const items: TruthValidatorChecklistItem[] = [];
    const lines = content.split('\n');
    const seenPatterns = new Set<string>();  // Avoid duplicate flags

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex].trim();
      if (!line) continue;  // Skip empty lines

      for (const flagDef of FLAG_DEFINITIONS) {
        for (const pattern of flagDef.patterns) {
          const match = line.match(pattern);
          if (match) {
            // Create a key to avoid duplicate flags for same issue
            const flagKey = `${flagDef.type}:${lineIndex}`;
            if (seenPatterns.has(flagKey)) continue;
            seenPatterns.add(flagKey);

            // Truncate long lines for display
            const displayLine = line.length > 60
              ? line.substring(0, 57) + '...'
              : line;

            items.push({
              itemId: `${checklistId}_item_${items.length + 1}`,
              flagType: flagDef.type,
              description: flagDef.description,
              location: `Line ${lineIndex + 1}: "${displayLine}"`,
              issue: `Pattern matched: "${match[0]}"`,
              suggestedAction: flagDef.suggestedAction,
              state: 'pending',
            });

            break;  // Only one flag per pattern type per line
          }
        }
      }
    }

    return items;
  }

  /**
   * Update the completion state of a checklist based on item states.
   */
  updateCompletionState(checklist: TruthValidatorChecklist): void {
    const pending = checklist.items.filter(i => i.state === 'pending').length;
    const total = checklist.items.length;

    if (total === 0 || pending === 0) {
      checklist.completionState = 'complete';
    } else if (pending === total) {
      checklist.completionState = 'incomplete';
    } else {
      checklist.completionState = 'partially_complete';
    }
  }

  /**
   * Calculate completion summary for a checklist.
   */
  getCompletionSummary(checklist: TruthValidatorChecklist): ChecklistCompletionSummary {
    return {
      totalItems: checklist.items.length,
      verifiedItems: checklist.items.filter(i => i.state === 'verified').length,
      disputedItems: checklist.items.filter(i => i.state === 'disputed').length,
      waivedItems: checklist.items.filter(i => i.state === 'waived').length,
      pendingItems: checklist.items.filter(i => i.state === 'pending').length,
    };
  }

  /**
   * Format a checklist for display (following truth-validator output format).
   */
  formatForDisplay(checklist: TruthValidatorChecklist): string {
    const lines: string[] = [];

    lines.push('━━━ HUMAN REVIEW CHECKLIST ━━━');
    lines.push('');
    lines.push(`ITEMS FOR YOUR REVIEW: ${checklist.items.length}`);
    lines.push('');

    for (let i = 0; i < checklist.items.length; i++) {
      const item = checklist.items[i];
      const checkbox = item.state === 'pending' ? '□' :
                       item.state === 'verified' ? '✓' :
                       item.state === 'disputed' ? '✗' : '~';

      lines.push(`${checkbox} ${i + 1}. [${item.flagType}]: ${item.description}`);
      lines.push(`   Location: ${item.location}`);
      lines.push(`   Issue: ${item.issue}`);
      lines.push(`   Your action: ${item.suggestedAction}`);

      if (item.state !== 'pending') {
        lines.push(`   Status: ${item.state.toUpperCase()} by ${item.verifiedBy || 'unknown'}`);
        if (item.notes) {
          lines.push(`   Notes: ${item.notes}`);
        }
      }
      lines.push('');
    }

    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
    lines.push(checklist.disclaimer);

    return lines.join('\n');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON INSTANCE
// ─────────────────────────────────────────────────────────────────────────────

export const checklistGenerator = new ChecklistGenerator();
