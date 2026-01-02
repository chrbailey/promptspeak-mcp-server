import { getDocumentAgent } from './src/document/agent.js';
import { initializeSymbolManager, getSymbolManager } from './src/symbols/index.js';
import * as path from 'path';

async function main() {
  // Initialize symbol manager
  const symbolsRoot = path.join(process.cwd(), 'symbols');

  try {
    initializeSymbolManager(symbolsRoot);
    console.log('Symbol manager initialized\n');
  } catch (e) {
    console.log('Symbol manager already initialized\n');
  }

  // Get document agent
  const agent = getDocumentAgent();

  console.log('='.repeat(70));
  console.log('SAVING SYMBOLS: NVIDIA Q3 FY25 CFO Commentary');
  console.log('='.repeat(70));
  console.log('');

  // Process the NVIDIA PDF - PERSIST to registry
  const result = await agent.processDocument(
    '/tmp/nvidia-q3fy25-cfo-commentary.pdf',
    'path',
    'NVDA',
    {
      companyName: 'NVIDIA Corporation',
      documentContext: 'CFO Commentary',
      fiscalPeriod: 'Q3FY25',
      symbolTypes: ['profile', 'financial', 'event', 'risk'],
      mergeStrategy: 'smart',
      dryRun: false  // PERSIST symbols
    }
  );

  console.log('Processing Result:');
  console.log('-'.repeat(40));
  console.log('Success: ' + result.success);
  console.log('Documents Processed: ' + result.documentsProcessed);
  console.log('Symbols Extracted: ' + result.extraction.symbols.length);
  console.log('Processing Time: ' + result.metadata.processingTimeMs + 'ms');
  console.log('');

  if (result.merge) {
    console.log('='.repeat(70));
    console.log('MERGE RESULTS');
    console.log('='.repeat(70));
    console.log('');
    console.log('Created: ' + result.merge.summary.created);
    console.log('Updated: ' + result.merge.summary.updated);
    console.log('Unchanged: ' + result.merge.summary.unchanged);
    console.log('Skipped: ' + result.merge.summary.skipped);
    console.log('Failed: ' + result.merge.summary.failed);
    console.log('');

    // Show details for each symbol
    for (const r of result.merge.results) {
      const icon = r.action === 'created' ? '✅' :
                   r.action === 'updated' ? '🔄' :
                   r.action === 'unchanged' ? '⏸️' : '⏭️';
      console.log(icon + ' ' + r.symbolId);
      console.log('   Action: ' + r.action);
      if (r.newVersion) {
        console.log('   Version: ' + r.newVersion);
      }
      console.log('   Reason: ' + r.reason);
      console.log('');
    }
  }

  // Show updated registry stats
  const manager = getSymbolManager();
  const stats = manager.getStats();

  console.log('='.repeat(70));
  console.log('UPDATED REGISTRY STATS');
  console.log('='.repeat(70));
  console.log('Total Symbols: ' + stats.total_symbols);
  console.log('');
  console.log('By Category:');
  for (const [cat, count] of Object.entries(stats.by_category)) {
    if (count > 0) {
      console.log('  ' + cat + ': ' + count);
    }
  }

  // List NVDA symbols
  console.log('');
  console.log('='.repeat(70));
  console.log('NVIDIA SYMBOLS IN REGISTRY');
  console.log('='.repeat(70));

  const nvdaSymbols = agent.listCompanySymbols('NVDA');
  console.log('');
  for (const sym of nvdaSymbols.symbols) {
    console.log('📌 ' + sym.symbolId);
    console.log('   Category: ' + sym.category + ' | Version: ' + sym.version);
    console.log('   Intent: ' + sym.commanders_intent.substring(0, 80) + '...');
    console.log('');
  }
}

main().catch(console.error);
