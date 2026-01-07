/**
 * Broad AI/NLP/Agent Opportunity Search
 */
import 'dotenv/config';
import { getSAMOpportunitiesAdapter } from './src/government/index.js';

async function main() {
  const adapter = getSAMOpportunitiesAdapter();

  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  Broad AI/NLP/Agent Search - All Active Opportunities');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  // Date range: last 3 months (SAM.gov limits range to ~1 year)
  const postedFrom = '10/01/2025';
  const postedTo = '01/03/2026';

  // Search 1: AI/ML broad search
  const aiResults = await adapter.searchOpportunities({
    keywords: ['artificial intelligence'],
    postedFrom,
    postedTo,
    activeOnly: true,
    limit: 100,
  });

  console.log('📊 "artificial intelligence" Opportunities:', aiResults.totalRecords, 'total');

  // Search 2: Machine Learning
  await delay(1100);
  const mlResults = await adapter.searchOpportunities({
    keywords: ['machine learning'],
    postedFrom,
    postedTo,
    activeOnly: true,
    limit: 100,
  });

  console.log('📊 "machine learning" Opportunities:', mlResults.totalRecords, 'total');

  // Search 3: NLP/LLM specific
  await delay(1100);
  const nlpResults = await adapter.searchOpportunities({
    keywords: ['natural language processing'],
    postedFrom,
    postedTo,
    activeOnly: true,
    limit: 100,
  });

  console.log('📊 "natural language processing" Opportunities:', nlpResults.totalRecords, 'total');

  // Search 4: Agent/Automation
  await delay(1100);
  const agentResults = await adapter.searchOpportunities({
    keywords: ['autonomous'],
    postedFrom,
    postedTo,
    activeOnly: true,
    limit: 100,
  });

  console.log('📊 "autonomous" Opportunities:', agentResults.totalRecords, 'total');

  // Search 5: Data analytics
  await delay(1100);
  const dataResults = await adapter.searchOpportunities({
    keywords: ['data analytics'],
    postedFrom,
    postedTo,
    activeOnly: true,
    limit: 100,
  });

  console.log('📊 Data Analytics/Decision Support:', dataResults.totalRecords, 'total\n');

  // Combine and dedupe
  const allOpps = new Map();
  [
    ...aiResults.opportunitiesData,
    ...mlResults.opportunitiesData,
    ...nlpResults.opportunitiesData,
    ...agentResults.opportunitiesData,
    ...dataResults.opportunitiesData
  ].forEach(o => {
    allOpps.set(o.noticeId, o);
  });

  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  COMBINED UNIQUE RESULTS:', allOpps.size);
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  // Print all unique opportunities
  for (const opp of allOpps.values()) {
    const setAside = opp.typeOfSetAsideDescription || 'Open';
    const isSDVOSB = setAside.toLowerCase().includes('disabled veteran');
    const isSmallBiz = setAside.toLowerCase().includes('small business') && !isSDVOSB;
    const badge = isSDVOSB ? '⭐ SDVOSB ' : (isSmallBiz ? '🏢 SB ' : '');

    console.log('┌──────────────────────────────────────────────────────────────────────────');
    console.log('│', badge + opp.title);
    console.log('├──────────────────────────────────────────────────────────────────────────');
    console.log('│ Notice ID:    ', opp.noticeId);
    console.log('│ Type:         ', opp.type);
    console.log('│ Set-Aside:    ', setAside);
    console.log('│ Agency:       ', [opp.department, opp.subTier].filter(Boolean).join(' > ') || 'See details');
    console.log('│ Posted:       ', opp.postedDate);
    console.log('│ Response Due: ', opp.responseDeadLine || 'See solicitation');
    console.log('│ NAICS:        ', opp.naicsCode || 'N/A');
    console.log('│ Link:         ', opp.uiLink);
    console.log('└──────────────────────────────────────────────────────────────────────────\n');
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
