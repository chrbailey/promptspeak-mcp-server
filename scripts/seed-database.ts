#!/usr/bin/env npx ts-node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SEED DATABASE SCRIPT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Loads seed symbols into the PromptSpeak database.
 *
 * Usage:
 *   npx ts-node scripts/seed-database.ts
 *   # or
 *   npm run seed
 *
 * Options:
 *   --dry-run    Preview what would be created without inserting
 *   --force      Overwrite existing symbols
 *   --category   Only seed specific category (e.g., --category=COMPANY)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { initializeSymbolManager, getSymbolManager } from '../src/symbols/manager.js';
import { ALL_SEED_SYMBOLS, SEED_STATS, type SeedSymbol } from '../data/seeds/symbol-seeds.js';
import type { DirectiveSymbol, SymbolCategory } from '../src/symbols/types.js';

// Get directory paths for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data', 'symbols');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

interface SeedOptions {
  dryRun: boolean;
  force: boolean;
  category?: SymbolCategory;
  verbose: boolean;
}

function parseArgs(): SeedOptions {
  const args = process.argv.slice(2);
  const options: SeedOptions = {
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    category: undefined,
  };

  const categoryArg = args.find((a) => a.startsWith('--category='));
  if (categoryArg) {
    options.category = categoryArg.split('=')[1] as SymbolCategory;
  }

  return options;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEED CONVERSION
// ═══════════════════════════════════════════════════════════════════════════════

function seedToDirective(seed: SeedSymbol): Partial<DirectiveSymbol> {
  const now = new Date().toISOString();

  return {
    symbolId: seed.symbolId,
    category: seed.category,
    who: seed.who,
    what: seed.what,
    why: seed.why,
    where: seed.where,
    when: seed.when,
    commanders_intent: seed.commanders_intent,
    requirements: seed.requirements || [],
    tags: seed.tags || [],
    domains: seed.domains as DirectiveSymbol['domains'],
    created_at: now,
    created_by: 'seed-script',
    // Extended fields if present
    ...(seed.financial && { financial: seed.financial }),
    ...(seed.metric && { metric: seed.metric }),
    ...(seed.regulatory && { regulatory: seed.regulatory }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SEEDING LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

async function seedDatabase(options: SeedOptions): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  PROMPTSPEAK DATABASE SEEDER');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  // Display stats
  console.log('Seed Data Statistics:');
  console.log('─────────────────────────────────────────────────────────────────────');
  Object.entries(SEED_STATS).forEach(([key, value]) => {
    if (key !== 'total') {
      console.log(`  ${key.padEnd(15)} ${value}`);
    }
  });
  console.log('─────────────────────────────────────────────────────────────────────');
  console.log(`  TOTAL          ${SEED_STATS.total}`);
  console.log('');

  // Display options
  console.log('Options:');
  console.log(`  Dry Run:  ${options.dryRun ? 'YES (no changes will be made)' : 'NO'}`);
  console.log(`  Force:    ${options.force ? 'YES (will overwrite existing)' : 'NO'}`);
  console.log(`  Category: ${options.category || 'ALL'}`);
  console.log('');

  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  // Initialize manager
  console.log(`Database path: ${DATA_DIR}\n`);
  initializeSymbolManager(DATA_DIR);
  const manager = getSymbolManager();

  // Filter seeds if category specified
  let seedsToProcess = ALL_SEED_SYMBOLS;
  if (options.category) {
    seedsToProcess = seedsToProcess.filter((s) => s.category === options.category);
    console.log(`Filtered to ${seedsToProcess.length} ${options.category} symbols\n`);
  }

  // Process seeds
  const results = {
    created: 0,
    skipped: 0,
    updated: 0,
    errors: 0,
  };

  const errors: Array<{ symbolId: string; error: string }> = [];

  console.log('Processing symbols...\n');

  for (const seed of seedsToProcess) {
    try {
      // Check if exists
      const existingResult = manager.get({ symbolId: seed.symbolId });
      const existing = existingResult.success && existingResult.symbol;

      if (existing && !options.force) {
        if (options.verbose) {
          console.log(`  ⏭️  SKIP: ${seed.symbolId} (already exists)`);
        }
        results.skipped++;
        continue;
      }

      if (options.dryRun) {
        console.log(`  📝 WOULD CREATE: ${seed.symbolId}`);
        results.created++;
        continue;
      }

      // Convert and create
      const directive = seedToDirective(seed);

      if (existing && options.force) {
        // Update existing
        const updateResult = manager.update(seed.symbolId, directive);
        if (updateResult.success) {
          if (options.verbose) {
            console.log(`  ✏️  UPDATED: ${seed.symbolId}`);
          }
          results.updated++;
        } else {
          throw new Error(updateResult.error || 'Update failed');
        }
      } else {
        // Create new
        const createResult = manager.create(directive);
        if (createResult.success) {
          if (options.verbose) {
            console.log(`  ✅ CREATED: ${seed.symbolId}`);
          }
          results.created++;
        } else {
          throw new Error(createResult.error || 'Create failed');
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push({ symbolId: seed.symbolId, error: errorMsg });
      results.errors++;
      console.log(`  ❌ ERROR: ${seed.symbolId} - ${errorMsg}`);
    }
  }

  // Summary
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  SEEDING COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Results:');
  console.log(`  Created:  ${results.created}`);
  console.log(`  Updated:  ${results.updated}`);
  console.log(`  Skipped:  ${results.skipped}`);
  console.log(`  Errors:   ${results.errors}`);
  console.log('');

  if (errors.length > 0) {
    console.log('Errors encountered:');
    errors.forEach(({ symbolId, error }) => {
      console.log(`  - ${symbolId}: ${error}`);
    });
    console.log('');
  }

  // Database stats
  const stats = manager.getStats();
  console.log('Database Statistics:');
  console.log(`  Total Symbols: ${stats.total_symbols}`);
  console.log(`  By Category:`);
  Object.entries(stats.by_category).forEach(([cat, count]) => {
    if (count > 0) {
      console.log(`    ${cat}: ${count}`);
    }
  });
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

const options = parseArgs();

seedDatabase(options)
  .then(() => {
    console.log('✅ Seeding script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seeding script failed:', error);
    process.exit(1);
  });
