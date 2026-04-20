/**
 * Verb Registry — Seed Data
 *
 * Seeds the 30 core verbs (spec Section 2.4) and 6 procurement
 * domain verbs (spec Section 3.4) into the verb registry.
 */

import type { VerbRegistryDB, RegisterInput } from './registry-db.js';

interface VerbSeed {
  symbol: string;
  definition: string;
}

const CORE_ANALYSIS: VerbSeed[] = [
  { symbol: '::analyze', definition: 'Structural examination of patterns, relationships, and implications.' },
  { symbol: '::compare', definition: 'Side-by-side evaluation of two or more items against shared criteria.' },
  { symbol: '::eval', definition: 'Assessment of quality, correctness, or fitness for purpose.' },
  { symbol: '::classify', definition: 'Categorization of items into defined groups based on attributes.' },
  { symbol: '::reason', definition: 'Logical inference from premises to conclusions with explicit steps.' },
  { symbol: '::diagnose', definition: 'Root cause identification from observed symptoms or failures.' },
];

const CORE_GENERATION: VerbSeed[] = [
  { symbol: '::gen', definition: 'Creation of new content from specifications or constraints.' },
  { symbol: '::summary', definition: 'Condensed representation preserving key information and intent.' },
  { symbol: '::transform', definition: 'Structural conversion from one format or representation to another.' },
  { symbol: '::translate', definition: 'Faithful meaning transfer between languages or notation systems.' },
  { symbol: '::rewrite', definition: 'Rephrasing while preserving semantic content and intent.' },
  { symbol: '::draft', definition: 'Initial version creation intended for iterative refinement.' },
];

const CORE_DATA: VerbSeed[] = [
  { symbol: '::extract', definition: 'Targeted retrieval of specific elements from larger structures.' },
  { symbol: '::filter', definition: 'Selection of items matching specified criteria from a collection.' },
  { symbol: '::sort', definition: 'Ordering of items by one or more comparison keys.' },
  { symbol: '::merge', definition: 'Combination of multiple sources into a unified structure.' },
  { symbol: '::validate', definition: 'Verification that data conforms to schema, format, or business rules.' },
  { symbol: '::map', definition: 'Element-wise transformation applying a function across a collection.' },
];

const CORE_COMMUNICATION: VerbSeed[] = [
  { symbol: '::report', definition: 'Structured presentation of findings, status, or results.' },
  { symbol: '::alert', definition: 'Urgent notification of conditions requiring immediate attention.' },
  { symbol: '::log', definition: 'Chronological recording of events for audit or debugging.' },
  { symbol: '::explain', definition: 'Clarification of concepts, decisions, or mechanisms for understanding.' },
  { symbol: '::respond', definition: 'Contextually appropriate reply to a query or request.' },
  { symbol: '::checklist', definition: 'Ordered verification steps ensuring completeness of a process.' },
];

const CORE_CONTROL: VerbSeed[] = [
  { symbol: '::check', definition: 'Boolean verification of a condition or system state.' },
  { symbol: '::retry', definition: 'Re-execution of a failed operation with optional backoff strategy.' },
  { symbol: '::delegate', definition: 'Transfer of task execution to another agent or subsystem.' },
  { symbol: '::wait', definition: 'Suspension of execution until a condition is met or timeout expires.' },
  { symbol: '::load', definition: 'Retrieval of data or configuration from external storage.' },
  { symbol: '::review', definition: 'Human-in-the-loop inspection before proceeding with an action.' },
];

const PROCUREMENT_VERBS: VerbSeed[] = [
  { symbol: '::bid', definition: 'Submission of a formal offer in response to a solicitation.' },
  { symbol: '::team', definition: 'Formation of a partnering arrangement for joint pursuit.' },
  { symbol: '::certify', definition: 'Verification of compliance with certification requirements.' },
  { symbol: '::comply', definition: 'Demonstration of adherence to regulatory or contractual obligations.' },
  { symbol: '::propose', definition: 'Formal presentation of a solution approach to a requirement.' },
  { symbol: '::seek', definition: 'Discovery and evaluation of potential partners or opportunities.' },
];

const PROCUREMENT_MODIFIERS: VerbSeed[] = [
  { symbol: '|vehicle', definition: 'Contract vehicle type (SDVOSB, 8a, GWAC, BPA, IDIQ, GSA).' },
  { symbol: '|naics', definition: 'NAICS code for industry classification.' },
  { symbol: '|cage', definition: 'CAGE code for entity identification.' },
  { symbol: '|clearance', definition: 'Security clearance level required or held.' },
  { symbol: '|set-aside', definition: 'Set-aside type designation for restricted solicitations.' },
  { symbol: '|past-perf', definition: 'Past performance reference by contract number or description.' },
];

/** Verbs that require elevated safety classification. */
const MONITORED_VERBS = new Set(['::delegate']);

function seedVerbs(db: VerbRegistryDB, verbs: VerbSeed[], namespace: string, defaultSafetyClass: 'unrestricted' | 'monitored', category: 'verb' | 'modifier' = 'verb'): void {
  for (const verb of verbs) {
    const input: RegisterInput = {
      symbol: verb.symbol,
      namespace,
      category,
      definition: verb.definition,
      safety_class: MONITORED_VERBS.has(verb.symbol) ? 'monitored' : defaultSafetyClass,
      registered_by: 'PSR',
      revocation_auth: ['PSR', 'Anthropic'],
    };
    db.register(input);
    db.transition(verb.symbol, 'active');
  }
}

/**
 * Seed the 30 core verbs from spec Section 2.4.
 * All verbs are registered then transitioned to active.
 */
export function seedCoreVerbs(db: VerbRegistryDB): void {
  seedVerbs(db, CORE_ANALYSIS, 'ps:core', 'unrestricted');
  seedVerbs(db, CORE_GENERATION, 'ps:core', 'unrestricted');
  seedVerbs(db, CORE_DATA, 'ps:core', 'unrestricted');
  seedVerbs(db, CORE_COMMUNICATION, 'ps:core', 'unrestricted');
  seedVerbs(db, CORE_CONTROL, 'ps:core', 'unrestricted');
}

/**
 * Seed the 6 procurement domain verbs from spec Section 3.4.
 * All procurement verbs are monitored safety class.
 */
export function seedProcurementVerbs(db: VerbRegistryDB): void {
  seedVerbs(db, PROCUREMENT_VERBS, 'ps:gov', 'monitored');
}

/**
 * Seed the 6 procurement-domain modifiers from spec Section 3.4.
 * Modifiers carry dynamic values at use-time; the registry stores the key form
 * (e.g. `|vehicle`) and semantics so agents can resolve them at parse.
 */
export function seedProcurementModifiers(db: VerbRegistryDB): void {
  seedVerbs(db, PROCUREMENT_MODIFIERS, 'ps:gov', 'monitored', 'modifier');
}

/** All core verb symbols for testing convenience. */
export const CORE_VERB_SYMBOLS = [
  ...CORE_ANALYSIS,
  ...CORE_GENERATION,
  ...CORE_DATA,
  ...CORE_COMMUNICATION,
  ...CORE_CONTROL,
].map(v => v.symbol);

/** All procurement verb symbols for testing convenience. */
export const PROCUREMENT_VERB_SYMBOLS = PROCUREMENT_VERBS.map(v => v.symbol);

/** All procurement modifier symbols for testing convenience. */
export const PROCUREMENT_MODIFIER_SYMBOLS = PROCUREMENT_MODIFIERS.map(v => v.symbol);
