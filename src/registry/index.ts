/**
 * PromptSpeak Verb Registry Module
 *
 * SQLite-backed verb registry with lifecycle management and audit trail.
 */

export { VerbRegistryDB, type VerbEntry, type RegisterInput, type VerbStatus, type SafetyClass, type VerbCategory } from './registry-db.js';
export { seedCoreVerbs, seedProcurementVerbs, seedProcurementModifiers, CORE_VERB_SYMBOLS, PROCUREMENT_VERB_SYMBOLS, PROCUREMENT_MODIFIER_SYMBOLS } from './seed-verbs.js';
