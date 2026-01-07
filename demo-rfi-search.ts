/**
 * Demo: Search SAM.gov for SDVOSB RFI Opportunities
 *
 * Test query: "what opportunities exist for sdvosb or other firms on sam.gov
 * to respond to rfi related to promptspeak for darpa, us army, marines or similar?
 * check 2026 valid entries for rfi only"
 *
 * Run with: npx tsx demo-rfi-search.ts
 *
 * To get live data:
 * 1. Go to https://sam.gov and create/login to your account
 * 2. Navigate to Profile → API Keys
 * 3. Generate a Public API key
 * 4. Add it to .env file: SAM_API_KEY=your_key_here
 * 5. Re-run this script
 */

// Load environment variables from .env file
import 'dotenv/config';

import {
  getSAMOpportunitiesAdapter,
  type SAMOpportunity,
  type OpportunitySearchResponse,
} from './src/government/index.js';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  SAM.gov RFI Search Demo');
  console.log('  Query: SDVOSB RFIs for DARPA/Army/Marines in 2026');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  // Get the adapter (will use stub mode if no API key)
  const adapter = getSAMOpportunitiesAdapter();

  if (adapter.isStubMode()) {
    console.log('⚠️  STUB MODE: No SAM_API_KEY found. Returning mock data.\n');
    console.log('   To get real data:');
    console.log('   1. Get API key from https://sam.gov/profile/details (under API Keys)');
    console.log('   2. Run: export SAM_API_KEY=your_key_here');
    console.log('   3. Re-run this script\n');
  } else {
    console.log('✅ LIVE MODE: Using SAM.gov API\n');
  }

  console.log('─────────────────────────────────────────────────────────────────────────────');
  console.log('Search 1: SDVOSB Set-Aside RFIs (2026)');
  console.log('─────────────────────────────────────────────────────────────────────────────\n');

  // Search #1: SDVOSB-specific RFIs
  const sdvosbRfis = await adapter.searchRFIs({
    keywords: ['AI', 'NLP', 'LLM', 'machine learning', 'natural language'],
    setAsideTypes: ['SDVOSBC', 'SDVOSBS'],
    postedFrom: '01/01/2026',
    postedTo: '12/31/2026',
    activeOnly: true,
    limit: 50,
  });

  printResults('SDVOSB RFIs', sdvosbRfis);

  console.log('\n─────────────────────────────────────────────────────────────────────────────');
  console.log('Search 2: Defense Agency RFIs (DARPA, Army, Marines)');
  console.log('─────────────────────────────────────────────────────────────────────────────\n');

  // Search #2: Agency-specific RFIs
  const defenseRfis = await adapter.searchByAgency(
    ['DARPA', 'Army', 'Marine Corps', 'Marines', 'DoD'],
    {
      noticeTypes: ['r'], // RFI only
      keywords: ['AI', 'NLP', 'LLM', 'language model'],
      postedFrom: '01/01/2026',
      postedTo: '12/31/2026',
      activeOnly: true,
      limit: 50,
    }
  );

  printResults('Defense Agency RFIs', defenseRfis);

  console.log('\n─────────────────────────────────────────────────────────────────────────────');
  console.log('Search 3: All Small Business RFIs (broader search)');
  console.log('─────────────────────────────────────────────────────────────────────────────\n');

  // Search #3: Broader small business search
  const allSmallBizRfis = await adapter.searchOpportunities({
    noticeTypes: ['r'],
    keywords: ['AI', 'artificial intelligence', 'NLP', 'language model'],
    setAsideTypes: ['SDVOSBC', 'SDVOSBS', 'SBA', '8A', 'WOSB'],
    postedFrom: '01/01/2026',
    postedTo: '12/31/2026',
    activeOnly: true,
    limit: 50,
  });

  printResults('All Small Business RFIs', allSmallBizRfis);

  // Convert first result to PromptSpeak symbol
  if (sdvosbRfis.opportunitiesData.length > 0) {
    console.log('\n─────────────────────────────────────────────────────────────────────────────');
    console.log('PromptSpeak Symbol Conversion (First Result)');
    console.log('─────────────────────────────────────────────────────────────────────────────\n');

    const symbol = adapter.toSymbol(sdvosbRfis.opportunitiesData[0]);
    console.log(JSON.stringify(symbol, null, 2));
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('  Demo Complete');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
}

function printResults(title: string, response: OpportunitySearchResponse) {
  console.log(`📊 ${title}: ${response.totalRecords} total results\n`);

  if (response.opportunitiesData.length === 0) {
    console.log('   No results found matching criteria.\n');
    return;
  }

  for (const opp of response.opportunitiesData) {
    console.log(`┌──────────────────────────────────────────────────────────────────────────`);
    console.log(`│ ${opp.title}`);
    console.log(`├──────────────────────────────────────────────────────────────────────────`);
    console.log(`│ Notice ID:       ${opp.noticeId}`);
    console.log(`│ Sol. Number:     ${opp.solicitationNumber || 'N/A'}`);
    console.log(`│ Agency:          ${[opp.department, opp.subTier].filter(Boolean).join(' > ')}`);
    console.log(`│ Type:            ${opp.type} (${opp.type === 'r' ? 'RFI/Sources Sought' : opp.type})`);
    console.log(`│ Set-Aside:       ${opp.typeOfSetAsideDescription || 'None'}`);
    console.log(`│ Posted:          ${opp.postedDate}`);
    console.log(`│ Response Due:    ${opp.responseDeadLine || 'See solicitation'}`);
    console.log(`│ NAICS:           ${opp.naicsCode || 'N/A'}`);
    console.log(`│ Active:          ${opp.active}`);
    console.log(`│ Link:            ${opp.uiLink}`);
    console.log(`└──────────────────────────────────────────────────────────────────────────\n`);
  }
}

main().catch(console.error);
