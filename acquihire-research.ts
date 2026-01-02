#!/usr/bin/env npx tsx
// =============================================================================
// ACQUI-HIRE LEGAL RESEARCH - CourtListener Search
// =============================================================================
// Research query: Structuring acquisitions for founders/key team while leaving
// VC investors and option holders with little recourse. Example: Grok acquisition.
// =============================================================================

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const TOKEN_FILE = join(homedir(), '.legal-review', '.courtlistener-token');
const OUTPUT_FILE = join(process.cwd(), 'acquihire-research-results.md');

interface SearchResult {
  caseName?: string;
  citation?: string[];
  dateFiled?: string;
  court?: string;
  court_id?: string;
  docket_number?: string;
  snippet?: string;
  absolute_url?: string;
  id?: number;
  cluster_id?: number;
  status?: string;
  judges?: string;
}

interface SearchResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: SearchResult[];
}

// Key search queries for acqui-hire/fiduciary duty cases
const SEARCH_QUERIES = [
  // Direct acqui-hire terminology
  {
    name: 'Acqui-hire & Talent Acquisition Disputes',
    query: 'acqui-hire OR "talent acquisition" OR "acquire team" OR "acquiring employees"',
    courts: ['del', 'cacd', 'cand'],
  },
  // Fiduciary duty in sale context
  {
    name: 'Fiduciary Duty - Sale of Company',
    query: '"fiduciary duty" AND (sale OR acquisition OR merger) AND (shareholders OR stockholders)',
    courts: ['del'],
  },
  // Revlon duties (enhanced scrutiny in sale)
  {
    name: 'Revlon Duties - Change of Control',
    query: 'Revlon AND (duties OR breach) AND (sale OR acquisition)',
    courts: ['del'],
  },
  // Self-dealing by founders/management
  {
    name: 'Self-Dealing in M&A Transactions',
    query: '"self-dealing" AND (acquisition OR merger OR sale) AND (management OR founders OR officers)',
    courts: ['del', 'cacd', 'cand'],
  },
  // Minority shareholder oppression
  {
    name: 'Minority Shareholder Squeeze-out',
    query: '"minority shareholders" AND (squeeze OR oppression OR "freeze out") AND (acquisition OR sale)',
    courts: ['del'],
  },
  // Entire fairness standard
  {
    name: 'Entire Fairness Review',
    query: '"entire fairness" AND (transaction OR acquisition OR merger)',
    courts: ['del'],
  },
  // Option holder rights
  {
    name: 'Stock Option Holder Rights in M&A',
    query: '"stock options" OR "option holders" AND (acquisition OR merger OR sale) AND (breach OR dispute)',
    courts: ['del', 'cacd', 'cand'],
  },
  // IP licensing in acquisitions
  {
    name: 'IP License vs Asset Purchase',
    query: '"license agreement" AND (acquisition OR "asset purchase") AND (technology OR "intellectual property")',
    courts: ['cacd', 'cand', 'del'],
  },
  // Fraudulent conveyance
  {
    name: 'Fraudulent Transfer - Asset Stripping',
    query: '"fraudulent transfer" OR "fraudulent conveyance" AND (acquisition OR sale) AND (creditors OR shareholders)',
    courts: ['del', 'cacd'],
  },
  // Zone of insolvency duties
  {
    name: 'Zone of Insolvency Duties',
    query: '"zone of insolvency" AND (fiduciary OR duty OR directors)',
    courts: ['del'],
  },
  // Recent AI/tech company acquisitions
  {
    name: 'AI Company Acquisitions',
    query: '"artificial intelligence" OR "AI company" AND (acquisition OR merger) AND (dispute OR litigation)',
    courts: ['del', 'cacd', 'cand'],
  },
  // Startup/VC disputes
  {
    name: 'Venture Capital Disputes in Exits',
    query: '"venture capital" OR "preferred stock" AND (acquisition OR sale OR exit) AND (dispute OR breach)',
    courts: ['del', 'cacd'],
  },
];

async function searchCourtListener(
  token: string,
  query: string,
  courts: string[] = [],
  dateAfter?: string
): Promise<SearchResponse | null> {
  const params = new URLSearchParams({
    q: query,
    type: 'o', // opinions
    order_by: 'dateFiled desc',
    page_size: '20',
  });

  if (courts.length === 1) {
    params.append('court', courts[0]);
  } else if (courts.length > 1) {
    params.append('court', courts.join(' OR '));
  }

  if (dateAfter) {
    params.append('filed_after', dateAfter);
  }

  const url = `https://www.courtlistener.com/api/rest/v4/search/?${params}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Token ${token}`,
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      return await response.json();
    } else {
      console.log(`  ⚠️  Search returned ${response.status}: ${response.statusText}`);
      return null;
    }
  } catch (error) {
    console.log(`  ❌ Search error: ${error}`);
    return null;
  }
}

async function searchDockets(
  token: string,
  query: string
): Promise<any | null> {
  const params = new URLSearchParams({
    q: query,
    type: 'd', // dockets
    order_by: 'dateFiled desc',
    page_size: '10',
  });

  const url = `https://www.courtlistener.com/api/rest/v4/search/?${params}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Token ${token}`,
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║       ACQUI-HIRE LEGAL RESEARCH - CourtListener Analysis                          ║');
  console.log('╠═══════════════════════════════════════════════════════════════════════════════════╣');
  console.log('║  Research: Acquisitions structured for founders/team while leaving investors      ║');
  console.log('║  Focus: Fiduciary duties, shareholder rights, option holder claims                ║');
  console.log('║  Example context: Grok-style acquisition patterns                                 ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Check for token
  let token: string | undefined;
  if (existsSync(TOKEN_FILE)) {
    token = readFileSync(TOKEN_FILE, 'utf-8').trim();
    console.log('✅ CourtListener API token found\n');
  } else if (process.env.COURTLISTENER_API_TOKEN) {
    token = process.env.COURTLISTENER_API_TOKEN;
    console.log('✅ Using environment token\n');
  } else {
    console.log('❌ No CourtListener API token found!');
    console.log('   Run: ./configure-courtlistener.sh');
    return;
  }

  const allResults: Map<string, { category: string; result: SearchResult }> = new Map();
  const report: string[] = [];

  report.push('# Acqui-Hire Legal Research Report');
  report.push(`Generated: ${new Date().toISOString()}`);
  report.push('');
  report.push('## Research Question');
  report.push('');
  report.push('What are the recent rulings and legal landscape regarding:');
  report.push('- Acquisitions structured primarily to acquire founders and key team members');
  report.push('- Licensing company technology rather than full asset acquisition');
  report.push('- Leaving VC investors and option holders questioning outcomes');
  report.push('- Example context: Grok-style "acqui-hire" transactions');
  report.push('');
  report.push('---');
  report.push('');

  // Run all searches
  for (const search of SEARCH_QUERIES) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🔍 ${search.name}`);
    console.log(`   Query: ${search.query.slice(0, 60)}...`);
    console.log(`   Courts: ${search.courts.join(', ')}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Search for recent cases (last 5 years)
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    const dateAfter = fiveYearsAgo.toISOString().split('T')[0];

    const results = await searchCourtListener(token, search.query, search.courts, dateAfter);

    if (results && results.count > 0) {
      console.log(`   ✅ Found ${results.count} results`);
      report.push(`## ${search.name}`);
      report.push('');
      report.push(`**Query:** \`${search.query}\``);
      report.push(`**Courts:** ${search.courts.join(', ')}`);
      report.push(`**Results found:** ${results.count}`);
      report.push('');

      for (const r of results.results.slice(0, 5)) {
        const key = r.caseName || r.docket_number || String(r.id);
        if (!allResults.has(key)) {
          allResults.set(key, { category: search.name, result: r });
        }

        const citations = Array.isArray(r.citation) ? r.citation.join(', ') : r.citation || 'N/A';
        console.log(`\n   📋 ${r.caseName || 'Unknown Case'}`);
        console.log(`      Date: ${r.dateFiled || 'N/A'}`);
        console.log(`      Court: ${r.court || r.court_id || 'N/A'}`);
        console.log(`      Citation: ${citations}`);

        report.push(`### ${r.caseName || 'Unknown Case'}`);
        report.push('');
        report.push(`- **Date Filed:** ${r.dateFiled || 'N/A'}`);
        report.push(`- **Court:** ${r.court || r.court_id || 'N/A'}`);
        report.push(`- **Citation:** ${citations}`);
        if (r.docket_number) {
          report.push(`- **Docket:** ${r.docket_number}`);
        }
        if (r.absolute_url) {
          report.push(`- **Link:** https://www.courtlistener.com${r.absolute_url}`);
        }
        if (r.snippet) {
          report.push('');
          report.push(`> ${r.snippet.replace(/<[^>]*>/g, '').slice(0, 300)}...`);
        }
        report.push('');
      }

      report.push('---');
      report.push('');
    } else {
      console.log(`   ⚠️  No results or search failed`);
    }

    // Rate limiting - be nice to the API
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Special search: Look for specific "Grok" or recent AI company cases
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🔍 SPECIAL SEARCH: Grok / xAI / AI Startup Litigation`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const specialQueries = [
    'Grok AND (acquisition OR merger OR shareholder)',
    'xAI AND (litigation OR dispute OR shareholder)',
    '"Elon Musk" AND (acquisition OR merger) AND shareholder',
    'OpenAI AND (shareholder OR investor OR dispute)',
    'Anthropic AND (shareholder OR investor)',
  ];

  for (const sq of specialQueries) {
    const results = await searchCourtListener(token, sq, []);
    if (results && results.count > 0) {
      console.log(`   Found ${results.count} results for: ${sq.slice(0, 40)}...`);
      for (const r of results.results.slice(0, 3)) {
        console.log(`     • ${r.caseName || 'Unknown'} (${r.dateFiled || 'N/A'})`);
      }
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // Search active dockets (pending cases)
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📁 DOCKET SEARCH: Active/Pending Cases`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const docketResults = await searchDockets(token, '"fiduciary duty" AND acquisition AND shareholder');
  if (docketResults && docketResults.count > 0) {
    console.log(`   Found ${docketResults.count} active dockets`);
    report.push('## Active/Pending Dockets');
    report.push('');
    for (const d of docketResults.results.slice(0, 10)) {
      console.log(`   📁 ${d.caseName || d.docketNumber || 'Unknown'}`);
      console.log(`      Court: ${d.court || 'N/A'}`);
      report.push(`- **${d.caseName || 'Unknown'}** - ${d.court || 'Unknown court'}`);
      if (d.absolute_url) {
        report.push(`  - Link: https://www.courtlistener.com${d.absolute_url}`);
      }
    }
    report.push('');
  }

  // Summary
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                              RESEARCH SUMMARY                                      ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`   Total unique cases found: ${allResults.size}`);
  console.log('');

  report.push('## Summary');
  report.push('');
  report.push(`Total unique cases analyzed: ${allResults.size}`);
  report.push('');
  report.push('### Key Legal Frameworks Identified');
  report.push('');
  report.push('1. **Revlon Duties** - Enhanced scrutiny when board approves sale of control');
  report.push('2. **Entire Fairness Standard** - Applied when controlling shareholder on both sides');
  report.push('3. **Fiduciary Duty of Loyalty** - Directors must act in shareholders\' best interest');
  report.push('4. **Minority Shareholder Protection** - Delaware courts scrutinize squeeze-outs');
  report.push('5. **Zone of Insolvency** - Expanded duties when company nears insolvency');
  report.push('');
  report.push('### Relevant Legal Theories for "Acqui-Hire" Challenges');
  report.push('');
  report.push('- **Breach of Fiduciary Duty**: Directors who approve deals benefiting themselves');
  report.push('- **Self-Dealing**: Management negotiating for personal benefits in acquisition');
  report.push('- **Fraudulent Transfer**: Assets conveyed to avoid creditor/shareholder claims');
  report.push('- **Option Holder Rights**: Claims based on plan documents and equity commitment');
  report.push('');

  // Categorize findings
  const categories = new Map<string, number>();
  for (const [, value] of allResults) {
    const cat = value.category;
    categories.set(cat, (categories.get(cat) || 0) + 1);
  }

  console.log('   Cases by category:');
  report.push('### Cases by Category');
  report.push('');
  for (const [cat, count] of categories) {
    console.log(`   • ${cat}: ${count}`);
    report.push(`- ${cat}: ${count} cases`);
  }
  report.push('');

  // Write report
  writeFileSync(OUTPUT_FILE, report.join('\n'));
  console.log(`\n   📄 Full report saved to: ${OUTPUT_FILE}`);

  console.log('\n');
  console.log('══════════════════════════════════════════════════════════════════════════════════════');
  console.log('');
}

main().catch(console.error);
