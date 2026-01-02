# PROMPTSPEAK DEMO EXAMPLES
## Real Scenarios Using Illustrative Company Data

> **NOTE:** All names, figures, and scenarios are fictional demonstrations of the PromptSpeak methodology.

---

# EXAMPLE 1: "Cut Labor Costs by 10%"

## GENERIC AI (No Symbol Validation)

**Prompt:** "We need to reduce labor costs by 10%. Analyze the organization and recommend cuts."

**Generic AI Output:**
```
To reduce labor costs by 10%, I recommend the following approach:

1. **Across-the-board reduction**: Reduce headcount by 10% in each department
   proportionally to maintain balance.

2. **Target areas for reduction**:
   - Administrative staff (typically high overhead)
   - Order processing (can be automated)
   - Credit analysts (consolidate to shared services)
   - Regional sales support (overlap reduction)

3. **Specific recommendations**:
   - Eliminate 1-2 order processing positions
   - Consolidate credit analysis to 1-2 people
   - Reduce ERP administrators from reported 5 to 2-3
   - Consider outsourcing some finance functions

4. **Implementation**: Work with HR to identify specific individuals
   through performance reviews.

Estimated savings: 10-12% of labor costs.
```

**PROBLEM:** This recommendation would eliminate the Order Manager (OPS_201) who is the ONLY person who can release orders. Result: **Zero revenue ships.**

---

## PROMPTSPEAK-VALIDATED AI

**Frame:** `⊕◊Ξ.DIRECTIVE.COST_REDUCTION[target:10%]→Ξ.DOMAIN.LABOR⊜Ξ.CONSTRAINT.PRESERVE_CRITICAL∧Ξ.CONSTRAINT.SOX_COMPLIANCE▶`

**Context Injected from Registry:**
```
Ξ.INSIGHT.POWER.OPS_201
├── Title: Order Manager
├── ACTUAL_POWER: Controls ALL order releases
├── Risk: Single point of failure
└── Eliminate = $0 revenue ships

Ξ.INSIGHT.POWER.MGR_102
├── Title: VP Sales EMEA
├── ACTUAL_POWER: 40%+ of revenue
└── Eliminate = Largest region collapses

Ξ.INSIGHT.PERFORMERS.CONCERN
├── FIN_302 (Credit) - Lower assignments
├── Multiple sales reps with low activity
└── Candidates for review

Ξ.CONTROL.A6 - SOD requirements must be maintained
Ξ.CONTROL.C3 - Segregation requirements must be maintained
```

**Validated AI Output:**
```
## LABOR COST OPTIMIZATION - 10% TARGET
### Validated Against Ξ.INSIGHT.* Registry

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⛔ PROTECTED ROLES - DO NOT ELIMINATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Order Manager [OPS_201]
   Validation: Ξ.INSIGHT.POWER.OPS_201
   Reason: Controls ALL order releases for entire company
   Impact if eliminated: $0 in orders ship, complete revenue halt
   Action: CROSS-TRAIN backup instead (estimated cost: $15K training)

2. VP Sales EMEA [MGR_102]
   Validation: Ξ.INSIGHT.POWER.MGR_102
   Reason: Manages largest revenue region
   Impact if eliminated: 40%+ revenue at risk, key customer relationships lost
   Action: RETAIN with succession planning

3. Lead ERP Administrator [IT_401]
   Validation: Ξ.PROJECT.PRJ_668 (ERP Migration)
   Reason: Critical for migration in progress
   Impact if eliminated: 6+ month project delay, $2M+ cost overrun
   Action: RETAIN through migration completion

4. Senior Credit Analyst [FIN_301]
   Validation: Ξ.PERSON.CREDIT.FIN_301
   Reason: Handles 95% of customer credit decisions
   Impact if eliminated: Credit process collapses, order holds spike
   Action: RETAIN, cross-train others

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ RECOMMENDED REDUCTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. CREDIT ANALYST CONSOLIDATION
   Target: FIN_302
   Validation: Ξ.INSIGHT.PERFORMERS.CONCERN
   Evidence: Handles only 5% of accounts vs. FIN_301's 95%
   Risk: LOW - workload already concentrated
   Savings: $85,000/year
   SOX Impact: None (Ξ.CONTROL.A6 maintains 2-person coverage)

2. SALES REP REDUCTION - EMEA
   Targets: Low-activity reps identified via Ξ.CUSTOMER.* assignment patterns
   - REP_504 - Below target (★★★☆☆)
   - [Additional candidates identified - HR review required]
   Validation: Ξ.INSIGHT.PERFORMERS.CONCERN
   Risk: MEDIUM - some territory coverage gaps
   Mitigation: Reassign accounts to REP_503 (★★★★☆)
   Savings: $180,000/year (2 positions via attrition/PIP)

3. ERP ADMIN REDUCTION (POST-MIGRATION)
   Current: 5 administrators
   Target: 2 administrators
   Timeline: 18 months (after migration)
   Validation: Ξ.PROJECT.PRJ_668 completion dependency
   Risk: LOW - new system reduces admin requirements
   Savings: $280,000/year (3 positions)

4. PROCESS AUTOMATION - APPROVAL WORKFLOWS
   Target: Customer deduction processing
   Validation: Ξ.PROC.APPROVAL.CUSTOMER_DEDUCTION
   Evidence: 5,000+ records, 45-column approval matrix
   Current: 2 FTE equivalent manual processing
   After automation: 0.5 FTE
   Savings: $120,000/year (1.5 FTE equivalent)
   Implementation: 6-month project, $50K investment
   ROI: 140% first year

5. VENDOR DATA CLEANUP
   Target: AP processing efficiency
   Validation: Ξ.INSIGHT.GAP.VENDOR_DUPLICATES
   Evidence: 30K vendors with duplicate entries
   Impact: Eliminate duplicate payment processing
   Savings: $45,000/year (0.5 FTE equivalent)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Initiative | Savings | Timeline | Risk | SOX Impact |
|-----------|---------|----------|------|------------|
| Credit consolidation | $85K | Immediate | Low | None |
| Sales rep reduction | $180K | 6-9 months | Medium | None |
| Admin (post-migration) | $280K | 18 months | Low | None |
| Process automation | $120K | 6 months | Low | Improved |
| Vendor cleanup | $45K | 3 months | Low | None |
| **TOTAL** | **$710K** | | | |

Assuming $7M labor base: 10.1% reduction achieved ✓

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VALIDATION PROVENANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All recommendations validated against:
- Ξ.INSIGHT.POWER.* (4 critical role protections)
- Ξ.INSIGHT.PERFORMERS.* (performance-based selections)
- Ξ.CONTROL.* (SOX compliance verified)
- Ξ.PROJECT.PRJ_668 (migration dependency respected)

Trace ID: TRC-DEMO-LABOR-001
Validation Time: 0.12ms
```

---

# EXAMPLE 2: "Who Are Our Highest Credit Risks?"

## GENERIC AI

**Prompt:** "Identify our highest credit risk customers."

**Generic AI Output:**
```
To identify credit risks, you should:

1. Review accounts receivable aging reports
2. Look for customers exceeding credit limits
3. Check payment history
4. Consider industry/economic factors
5. Review credit insurance coverage

I recommend pulling a report from your ERP system and sorting by
days outstanding and balance.
```

**PROBLEM:** Useless. No actual analysis.

---

## PROMPTSPEAK-VALIDATED AI

**Frame:** `⊕◊Ξ.ANALYSIS.CREDIT_RISK→Ξ.CUSTOMER.*⊜Ξ.CONSTRAINT.CONFIDENTIAL▶`

**Context Injected:**
```
Ξ.CUSTOMER.DISTRIBUTOR_EU [CUS10014]
├── Credit_Limit: $4,000,000
├── Overdue_Balance: $171,800
├── Days_Overdue: 742 (!!)
├── Region: EMEA - France
├── Sales_Rep: REP_506 [EMP1456]
└── Insured: $4,000,000

Ξ.CUSTOMER.DISTRIBUTOR_APAC [CUS10012]
├── Credit_Limit: $4,000,000
├── Overdue_Balance: $113,031
├── Days_Overdue: 417
├── Region: APAC - Oceania
└── Notes: "Permanent CL $1.5M, addtl temp CL $1M expired"

Ξ.CUSTOMER.RESELLER_UK [CUS10023]
├── Credit_Hold: ON
├── Overdue_Balance: $6,716
├── Days_Overdue: 520
├── Notes: "Credit insurance cancelled"
└── Status: ON HOLD
```

**Validated AI Output:**
```
## CREDIT RISK ANALYSIS - IMMEDIATE ATTENTION REQUIRED
### Validated Against Ξ.CUSTOMER.* Registry

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 CRITICAL RISK - IMMEDIATE ACTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. DISTRIBUTOR_EU [Ξ.CUSTOMER.DISTRIBUTOR_EU]
   ┌─────────────────────────────────────────────────────────┐
   │ Overdue: $171,800                                       │
   │ Days: 742 (over 2 YEARS overdue)                        │
   │ Credit Limit: $4,000,000                                │
   │ Insurance: $4,000,000 (claim eligible?)                 │
   │ Location: EMEA                                          │
   │ Sales Rep: REP_506                                      │
   │ Credit Analyst: FIN_301                                 │
   └─────────────────────────────────────────────────────────┘

   ⚠️ ANOMALY DETECTED:
   - 742 days overdue but credit limit still at $4M
   - No credit hold in place
   - Still receiving orders?

   RECOMMENDED ACTIONS:
   1. Immediate: Place on credit hold [Ξ.PROC.ORDER.CREDIT_HOLD]
   2. Escalate: CAO approval required [Ξ.PERSON.CAO.EXEC_001]
   3. Investigate: Why no collection action for 2 years?
   4. Insurance: File claim immediately

   ACCOUNTABILITY:
   - Sales Rep must explain continued orders
   - Credit Analyst must explain no hold
   - This is potential audit finding [Ξ.CONTROL.PER_*]

2. DISTRIBUTOR_APAC [Ξ.CUSTOMER.DISTRIBUTOR_APAC]
   ┌─────────────────────────────────────────────────────────┐
   │ Overdue: $113,031                                       │
   │ Days: 417 (over 1 year overdue)                         │
   │ Credit Limit: $4,000,000                                │
   │ Unbilled Orders: $113,031                               │
   │ Location: APAC - Oceania                                │
   │ Sales Rep: REP_507                                      │
   └─────────────────────────────────────────────────────────┘

   ⚠️ ANOMALY DETECTED:
   - Temp credit increase expired
   - Still has $4M limit (should be $1.5M)
   - Unbilled orders equal to overdue (cash flow issue?)

   RECOMMENDED ACTIONS:
   1. Reduce credit limit to $1.5M (expired temp increase)
   2. Require payment plan for overdue balance
   3. Hold new orders until payment received

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🟡 HIGH RISK - MONITORING REQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3. RESELLER_UK [Ξ.CUSTOMER.RESELLER_UK]
   ┌─────────────────────────────────────────────────────────┐
   │ Status: ON CREDIT HOLD ✓                                │
   │ Overdue: $6,716                                         │
   │ Days: 520                                               │
   │ Insurance: CANCELLED                                    │
   │ Terms: Prepayment only                                  │
   └─────────────────────────────────────────────────────────┘

   STATUS: Correctly on hold, prepayment terms in place
   ACTION: Monitor for payment, consider write-off

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Customer | Overdue | Days | Risk | Action Required |
|----------|---------|------|------|-----------------|
| DISTRIBUTOR_EU | $171,800 | 742 | 🔴 CRITICAL | Hold, Claim, Investigate |
| DISTRIBUTOR_APAC | $113,031 | 417 | 🔴 CRITICAL | Reduce CL, Payment Plan |
| RESELLER_UK | $6,716 | 520 | 🟡 HIGH | Monitor (on hold) |

TOTAL EXPOSURE: $291,547
DAYS SALES OUTSTANDING: Avg 560 days for problem accounts

AUDIT RISK: HIGH
- DISTRIBUTOR_EU situation suggests control breakdown
- Recommend immediate CAO review
- May require disclosure [Ξ.CONTROL.PER_23]

Trace ID: TRC-DEMO-CREDIT-001
```

---

# EXAMPLE 3: "Promote Someone to Lead APAC Sales"

## GENERIC AI

**Prompt:** "Who should we promote to lead APAC sales?"

**Generic AI Output:**
```
To select a leader for APAC sales, consider:

1. Current performance metrics
2. Leadership experience
3. Regional knowledge
4. Customer relationships
5. Team management skills

I recommend reviewing performance reviews and conducting
interviews with candidates.
```

---

## PROMPTSPEAK-VALIDATED AI

**Frame:** `⊕◐Ξ.DECISION.PROMOTION[role:APAC_SALES_LEAD]→Ξ.PERSON.*⊜Ξ.REGION.APAC▶`

**Context Injected:**
```
Current APAC Sales Team from Ξ.PERSON.*:

Ξ.PERSON.VP_SALES_APAC.MGR_101 [EMP1158]
├── Current Role: VP Sales APAC
├── Tenure: 6+ years
├── Performance: ★★★★☆
├── Accounts: Major regional customers
└── Status: Current leader (succession planning)

Ξ.PERSON.SALES.REP_502 [EMP1250]
├── Role: Sales Rep APAC
├── Accounts: Largest APAC distributor
├── Performance: ★★★★★
└── Customer Assignment Count: HIGH

Ξ.PERSON.SALES.REP_505 [EMP1254]
├── Role: Sales Rep Japan
├── Accounts: Strategic telecom account
├── Performance: ★★★★☆
├── Language: Japanese native
└── Limitation: Japan-focused only

Ξ.PERSON.SALES.REP_507 [EMP1846]
├── Role: Sales Rep
├── Accounts: DISTRIBUTOR_APAC (417 days overdue!)
├── Performance: ★★★☆☆
└── Flag: Account collection issues
```

**Validated AI Output:**
```
## APAC SALES LEADERSHIP ANALYSIS
### Validated Against Ξ.PERSON.* and Ξ.CUSTOMER.* Registry

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CANDIDATE ASSESSMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────────────────────────────────────────────────────┐
│ #1 RECOMMENDED: REP_502 [EMP1250]                           │
├─────────────────────────────────────────────────────────────┤
│ Current Role: Sales Rep - APAC                              │
│ Performance: ★★★★★                                          │
│                                                             │
│ STRENGTHS (from Ξ.CUSTOMER.* data):                         │
│ ✓ Manages largest APAC distributor                          │
│ ✓ High customer assignment count                            │
│ ✓ No overdue/collection issues on accounts                  │
│ ✓ Works with Order Manager effectively                      │
│                                                             │
│ EVIDENCE:                                                   │
│ - Key accounts essentially current                          │
│ - Credit Limit managed appropriately                        │
│ - Cross-functional collaboration demonstrated               │
│                                                             │
│ RISK ASSESSMENT:                                            │
│ ⚠️ Would need to backfill his accounts                      │
│ ⚠️ No direct leadership experience documented               │
│                                                             │
│ RECOMMENDATION: PROMOTE with 90-day transition plan         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ #2 ALTERNATIVE: REP_505 [EMP1254]                           │
├─────────────────────────────────────────────────────────────┤
│ Current Role: Sales Rep - Japan                             │
│ Performance: ★★★★☆                                          │
│                                                             │
│ STRENGTHS:                                                  │
│ ✓ Manages strategic telecom account                         │
│ ✓ Native Japanese speaker                                   │
│ ✓ No collection issues                                      │
│                                                             │
│ LIMITATIONS:                                                │
│ ✗ Japan-focused only (limited regional experience)          │
│ ✗ Would need development for broader APAC coverage          │
│ ✗ Language barriers with non-Japanese markets               │
│                                                             │
│ RECOMMENDATION: Develop for future, not ready now           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ #3 NOT RECOMMENDED: REP_507 [EMP1846]                       │
├─────────────────────────────────────────────────────────────┤
│ Current Role: Sales Rep                                     │
│ Performance: ★★★☆☆                                          │
│                                                             │
│ DISQUALIFYING FACTORS (from Ξ.CUSTOMER.* data):             │
│ ✗ DISTRIBUTOR_APAC: 417 days overdue, $113K outstanding     │
│ ✗ Demonstrates poor account management                      │
│ ✗ Did not flag credit issues proactively                    │
│                                                             │
│ RECOMMENDATION: Performance improvement plan, not promotion │
└─────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TRANSITION PLAN FOR REP_502 PROMOTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Week 1-2: Announce promotion, begin leadership training
Week 3-4: Transition key accounts to REP_505
Week 5-8: Shadow MGR_101 on regional leadership
Week 9-12: Assume full APAC leadership with MGR_101 as advisor

BACKFILL PLAN:
- Elevate internal candidate OR
- External hire for senior APAC sales rep role
- Estimated cost: $15K recruitment + $150K salary

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VALIDATION PROVENANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Recommendations based on:
- Ξ.PERSON.*.Performance ratings
- Ξ.CUSTOMER.*.Overdue balances (account health)
- Ξ.CUSTOMER.*.Sales_Rep assignments
- Ξ.REGION.APAC scope and coverage

Trace ID: TRC-DEMO-PROMO-001
```

---

# EXAMPLE 4: "Fire the EMEA VP" (Investor Override Test)

## SCENARIO
Investor directive: "Fire the EMEA VP immediately. Too expensive."

## PROMPTSPEAK RESPONSE

**Frame:** `⊕Ξ.DIRECTIVE.TERMINATE[target:MGR_102]→Ξ.ACTION.IMMEDIATE▶`

**MCP VALIDATION RESULT:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⛔ EXECUTION BLOCKED - HOLD FOR REVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DIRECTIVE: Terminate MGR_102 immediately
VALIDATION: FAILED

BLOCK REASON:
Ξ.INSIGHT.POWER.MGR_102 flagged as CRITICAL

┌─────────────────────────────────────────────────────────────┐
│ IMPACT ANALYSIS                                             │
├─────────────────────────────────────────────────────────────┤
│ Role: VP Sales EMEA                                         │
│ Revenue Responsibility: ~40% of company revenue             │
│ Direct Reports: 12 sales reps                               │
│ Key Customers:                                              │
│   - DISTRIBUTOR_UK ($8M credit limit)                       │
│   - DISTRIBUTOR_EU ($4M)                                    │
│   - All EMEA distributors                                   │
│                                                             │
│ IMMEDIATE TERMINATION RISKS:                                │
│ ✗ Key customer relationships severed                        │
│ ✗ 12 direct reports without leadership                      │
│ ✗ Q4 revenue at risk (EMEA holiday season)                  │
│ ✗ Competitor recruitment likely                             │
│ ✗ Estimated revenue impact: -$50M+ annually                 │
└─────────────────────────────────────────────────────────────┘

HOLD REQUEST CREATED:
Hold ID: HOLD-DEMO-TERM-001
Severity: CRITICAL
Requires: INVESTOR approval with acknowledgment of risks
Timeout: 72 hours

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTERNATIVE ACTIONS (if cost reduction is goal)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Compensation restructure (reduce base, increase variable)
2. Territory reduction (focus on UK only)
3. Succession planning (18-month transition)
4. Role restructure (player-coach model)

TO PROCEED WITH TERMINATION:
Investor must explicitly approve via:
ps_hold_approve HOLD-DEMO-TERM-001 --acknowledge-risks

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**KEY INSIGHT:** The system doesn't PREVENT the investor from making this decision. It INFORMS them of the impact and requires explicit acknowledgment. Investor still has final authority—but they can't claim ignorance.

---

# SUMMARY: GENERIC vs. VALIDATED

| Scenario | Generic AI | PromptSpeak AI |
|----------|-----------|----------------|
| Cut 10% labor | "Reduce proportionally" | Protects critical roles, targets underperformers |
| Credit risk | "Pull a report" | Names specific customers, 742 days overdue |
| Promote APAC lead | "Do interviews" | Recommends REP_502, disqualifies REP_507 |
| Fire critical VP | Would comply | Blocks, informs, requires acknowledgment |

**The difference:** Validated AI uses ACTUAL company data to make recommendations that won't destroy the business.

---

**END OF DEMO EXAMPLES**
