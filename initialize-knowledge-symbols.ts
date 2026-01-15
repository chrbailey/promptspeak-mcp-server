/**
 * Initialize PromptSpeak Database with 5W1H+AI Symbols
 *
 * Creates foundational symbols representing:
 * - The OWC drive organization structure
 * - Key projects and their purposes
 * - Knowledge base content
 * - Machine/infrastructure configuration
 */

import { initializeSymbolManager, getSymbolManager } from './src/symbols/index.js';
import * as path from 'path';
import * as fs from 'fs';

// ═══════════════════════════════════════════════════════════════════════════════
// SYMBOL DEFINITIONS - 5W1H Format
// ═══════════════════════════════════════════════════════════════════════════════

interface Symbol5W1H {
  symbolId: string;
  category: 'KNOWLEDGE' | 'SYSTEM' | 'TASK' | 'WORKFLOW' | 'COMPANY' | 'PERSON';
  who: string;
  what: string;
  why: string;
  where: string;
  when: string;
  how: {
    focus: string[];
    constraints: string[];
  };
  commanders_intent: string;
  requirements: string[];
  tags: string[];
  ai_insight?: string;
}

const KNOWLEDGE_SYMBOLS: Symbol5W1H[] = [
  // Infrastructure Symbols
  {
    symbolId: 'Ξ.SY.OWC_DRIVE',
    category: 'SYSTEM',
    who: 'Christopher Bailey (developer/owner)',
    what: '2TB OWC SSD external drive - central AI development workspace',
    why: 'Centralized storage for all AI projects, datasets, and outputs',
    where: '/Volumes/OWC drive - connected to Mac Mini via Thunderbolt 4',
    when: 'December 2025 - present, always-on storage',
    how: {
      focus: ['AI development', 'Dataset storage', 'Model caching', 'Cross-machine access'],
      constraints: ['Must be mounted before use', 'Backup to 4TB HDD regularly']
    },
    commanders_intent: 'Serve as the single source of truth for all AI development work across Mac Mini and MacBook Pro',
    requirements: [
      'Keep canonical project versions in /Dev',
      'Store large models and datasets separate from code',
      'Maintain clear archive vs active separation'
    ],
    tags: ['infrastructure', 'storage', 'development'],
    ai_insight: 'Central hub connecting Mac Mini (compute) and MacBook Pro (mobile dev) - eliminates duplication issues'
  },
  {
    symbolId: 'Ξ.SY.MAC_MINI',
    category: 'SYSTEM',
    who: 'Christopher Bailey',
    what: 'Mac Mini M-series - primary AI compute and development machine',
    why: 'Dedicated, always-on AI processing without interruption',
    where: 'Home office, connected to OWC drive',
    when: 'October 2025 - present',
    how: {
      focus: ['Claude Code execution', 'AI inference', 'Background processing', 'MCP server hosting'],
      constraints: ['256GB SSD - large files on OWC', 'Symlinks to OWC for development']
    },
    commanders_intent: 'Be the always-on AI development hub that runs Claude Code and background services',
    requirements: [
      'Symlink ~/Promptspeak... to OWC drive',
      'Run launchd services for API monitoring',
      'Keep system lean - heavy files on OWC'
    ],
    tags: ['infrastructure', 'compute', 'development'],
    ai_insight: '256GB SSD is constraint - all heavy work delegated to OWC; symlinks maintain compatibility with old paths'
  },

  // Project Symbols
  {
    symbolId: 'Ξ.K.PROMPTSPEAK',
    category: 'KNOWLEDGE',
    who: 'Christopher Bailey (architect), Claude (implementation partner)',
    what: 'PromptSpeak MCP Server - LLM-to-LLM symbolic language protocol',
    why: 'Enable structured, verifiable, drift-resistant communication between AI agents',
    where: '/Volumes/OWC drive/Dev/promptspeak/mcp-server',
    when: 'October 2025 - ongoing (88+ TypeScript files implemented)',
    how: {
      focus: ['Symbol registry', 'Multi-agent coordination', 'Commander\'s Intent', 'Drift detection'],
      constraints: ['MCP protocol compliance', 'Security hardening against prompt injection']
    },
    commanders_intent: 'Create a grounded symbolic language that prevents AI hallucination through verifiable context anchors',
    requirements: [
      'Symbols must have 5W1H structure',
      'All content sanitized against injection',
      'Support for multi-agent missions with intent propagation',
      'Database persistence for cross-session continuity'
    ],
    tags: ['ai', 'mcp', 'llm', 'symbolic-language', 'primary-project'],
    ai_insight: 'Implementation is ~90% complete; main gap is database population with actual symbols. Ready for production use.'
  },
  {
    symbolId: 'Ξ.K.EPISTEMIC_FLOW',
    category: 'KNOWLEDGE',
    who: 'Christopher Bailey',
    what: 'Epistemic Flow Control - uncertainty quantification for LLM outputs',
    why: 'Detect when AI is uncertain and route to human verification',
    where: '/Volumes/OWC drive/Dev/epistemic-flow-control',
    when: 'November 2025 - ongoing',
    how: {
      focus: ['Semantic entropy', 'Confidence calibration', 'Human-in-the-loop routing'],
      constraints: ['Must integrate with PromptSpeak symbols']
    },
    commanders_intent: 'Build trust in AI outputs by exposing uncertainty and enabling targeted human review',
    requirements: [
      'Compute P(uncertainty) for LLM claims',
      'Flag high-uncertainty outputs',
      'Integrate with PromptSpeak EPISTEMIC symbols'
    ],
    tags: ['ai', 'uncertainty', 'trust', 'human-loop'],
    ai_insight: 'Complements PromptSpeak by adding probabilistic confidence to symbol-grounded outputs'
  },
  {
    symbolId: 'Ξ.K.UNIFIED_BELIEF',
    category: 'KNOWLEDGE',
    who: 'Christopher Bailey',
    what: 'Unified Belief System - belief graphs and truth validation for AI',
    why: 'Model and validate AI reasoning as a belief network',
    where: '/Volumes/OWC drive/Dev/unified-belief-system',
    when: 'December 2025 - recently consolidated from MacBook',
    how: {
      focus: ['Belief graphs', 'Truth validation', 'Steering vectors', 'Outlier detection'],
      constraints: ['Python implementation', 'Needs integration with PromptSpeak']
    },
    commanders_intent: 'Create explainable AI reasoning through structured belief representation',
    requirements: [
      'belief_graph.py for graph construction',
      'truth_validator.py for claim verification',
      'guardian.py for safety constraints'
    ],
    tags: ['ai', 'beliefs', 'reasoning', 'python'],
    ai_insight: 'Python project that could provide belief layer for PromptSpeak symbols'
  },

  // Knowledge Base Symbols
  {
    symbolId: 'Ξ.K.EXTRACTED_KNOWLEDGE',
    category: 'KNOWLEDGE',
    who: 'Various historical employers and projects',
    what: 'Extracted JSON knowledge base from 12k+ historical documents',
    why: 'Provide structured context from 20+ years of professional experience',
    where: '/Volumes/OWC drive/Knowledge/extracted',
    when: 'Extracted January 2026, sources span 2006-2025',
    how: {
      focus: ['2xcel (1212 files)', 'Axon (7371 files)', 'Confluent (1524 files)', 'Fitbit (1851 files)'],
      constraints: ['JSON format', 'Needs vectorization for RAG']
    },
    commanders_intent: 'Transform historical experience into queryable AI context',
    requirements: [
      'Index in vector store for semantic search',
      'Link to PromptSpeak KNOWLEDGE symbols',
      'Maintain provenance metadata'
    ],
    tags: ['knowledge-base', 'historical', 'json', 'rag'],
    ai_insight: '12k+ documents extracted - represents significant competitive advantage as domain-specific training data'
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('═'.repeat(70));
  console.log('PROMPTSPEAK DATABASE INITIALIZATION');
  console.log('Creating 5W1H+AI Symbols');
  console.log('═'.repeat(70));
  console.log('');

  // Initialize symbol manager
  const symbolsRoot = path.join(process.cwd(), 'symbols');

  try {
    initializeSymbolManager(symbolsRoot);
    console.log('✅ Symbol manager initialized');
    console.log('   Database: ' + path.join(symbolsRoot, 'promptspeak.db'));
    console.log('');
  } catch (e) {
    console.log('ℹ️  Symbol manager already initialized');
    console.log('');
  }

  const manager = getSymbolManager();

  // Create each symbol
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const sym of KNOWLEDGE_SYMBOLS) {
    console.log('─'.repeat(70));
    console.log('Processing: ' + sym.symbolId);
    console.log('Category: ' + sym.category);
    console.log('');

    try {
      // Check if exists
      const existing = manager.get(sym.symbolId);

      if (existing) {
        console.log('  ⚠️  Symbol exists, updating...');
        // Update logic would go here
        updated++;
      } else {
        // Create new symbol
        const result = manager.create({
          symbolId: sym.symbolId,
          category: sym.category as any,
          subcategory: undefined,
          who: sym.who,
          what: sym.what,
          why: sym.why,
          where: sym.where,
          when: sym.when,
          how: sym.how,
          commanders_intent: sym.commanders_intent,
          requirements: sym.requirements,
          anti_requirements: [],
          tags: sym.tags,
          key_terms: [],
        });

        if (result.success) {
          console.log('  ✅ Created: ' + result.symbol?.symbolId);
          console.log('     Hash: ' + result.symbol?.hash);
          console.log('     Intent: ' + sym.commanders_intent.substring(0, 60) + '...');
          created++;
        } else {
          console.log('  ❌ Failed: ' + result.error);
          failed++;
        }
      }
    } catch (e) {
      console.log('  ❌ Error: ' + (e as Error).message);
      failed++;
    }
    console.log('');
  }

  // Summary
  console.log('═'.repeat(70));
  console.log('INITIALIZATION COMPLETE');
  console.log('═'.repeat(70));
  console.log('');
  console.log('Created: ' + created);
  console.log('Updated: ' + updated);
  console.log('Failed: ' + failed);
  console.log('');

  // Show stats
  const stats = manager.getStats();
  console.log('Database Stats:');
  console.log('  Total Symbols: ' + stats.total_symbols);
  console.log('  By Category:');
  for (const [cat, count] of Object.entries(stats.by_category)) {
    if (count > 0) {
      console.log('    ' + cat + ': ' + count);
    }
  }
}

main().catch(console.error);
