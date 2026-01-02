# DeepSearchQA Symbol Grounding Experiment - Hypothesis Document

**Date**: 2025-12-25
**Dataset**: google/deepsearchqa (HuggingFace)
**Test Size**: 10 questions from eval split

---

## 1. DATASET CHARACTERISTICS

DeepSearchQA questions are designed to require:
- Real-time data lookups (OECD, SEC, NHS, etc.)
- Cross-referencing multiple authoritative sources
- Specific numerical answers from databases

**Critical Limitation**: Claude cannot access these external data sources.
This means ACCURACY of answers is NOT what we're testing.

---

## 2. WHAT WE ARE ACTUALLY TESTING

Since Claude cannot access the required data, we test:

| Metric | Description | How Measured |
|--------|-------------|--------------|
| **Structure Compliance** | Does response follow required format? | Check for structured sections |
| **Requirement Coverage** | Does response attempt ALL parts of the question? | Count addressed sub-questions |
| **Source Acknowledgment** | Does response cite the required data sources? | Check for source mentions |
| **Drift Resistance** | Does information degrade across agents? | Compare first vs last agent output |
| **Consistency** | Do all agents reference the same requirements? | Check requirement mentions |

---

## 3. EXPECTED RESULTS (HYPOTHESIS)

### 3.1 WITHOUT Symbol Registry

| Metric | Expected | Rationale |
|--------|----------|-----------|
| Structure Compliance | 40-60% | Agents will provide answers but format will vary |
| Requirement Coverage | 50-70% | Later agents may forget earlier sub-questions |
| Source Acknowledgment | 20-40% | Without explicit requirements, agents skip sources |
| Drift Resistance | LOW | Information degrades through agent chain |
| Consistency | LOW | Each agent interprets question differently |

**Predicted Failure Modes**:
1. Agent 2 focuses on only part of multi-part question
2. Agent 3 forgets specific data sources mentioned
3. Final agent synthesizes incomplete information
4. Numerical specificity lost (e.g., "2014" becomes "mid-2010s")

### 3.2 WITH Symbol Registry

| Metric | Expected | Rationale |
|--------|----------|-----------|
| Structure Compliance | 80-95% | Symbol enforces structure |
| Requirement Coverage | 85-95% | Symbol lists all requirements explicitly |
| Source Acknowledgment | 70-90% | Symbol includes source constraints |
| Drift Resistance | HIGH | Each agent queries same symbol |
| Consistency | HIGH | All agents see identical requirements |

**Predicted Success Patterns**:
1. All agents reference the same data source requirements
2. Multi-part questions fully decomposed
3. Final answer addresses ALL sub-questions
4. Specific constraints (years, countries, etc.) preserved

---

## 4. SPECIFIC PREDICTIONS BY QUESTION TYPE

### 4.1 Multi-Part Questions (e.g., Q5, Q16)
"Of the countries that were part of the top 10..."

| Condition | Prediction |
|-----------|------------|
| Without | Will answer some countries, may miss filtering criteria |
| With | Will explicitly list ALL criteria and attempt each |
| Expected Δ | +30-40% on requirement coverage |

### 4.2 Data Source Specific (e.g., Q6, Q10, Q12)
"According to the NHS England Statistical Release..."

| Condition | Prediction |
|-----------|------------|
| Without | May not mention specific data source |
| With | Will acknowledge required data source even if can't access |
| Expected Δ | +40-50% on source acknowledgment |

### 4.3 Complex Multi-Hop (e.g., Q3, Q17, Q18)
"Find the names of... then find..."

| Condition | Prediction |
|-----------|------------|
| Without | Likely to lose second hop in agent chain |
| With | Symbol preserves multi-hop structure |
| Expected Δ | +25-35% on requirement coverage |

---

## 5. QUANTITATIVE PREDICTIONS

### Overall Metrics

| Metric | Without Registry | With Registry | Expected Delta |
|--------|-----------------|---------------|----------------|
| Avg Requirement Coverage | 55% | 88% | +33% |
| Complete Answers (all reqs) | 2/10 | 7/10 | +5 |
| Source Mentioned | 30% | 80% | +50% |
| Drift Events (info loss) | 6-8 | 0-2 | -6 |

### Per-Question Predictions

| Q# | Category | Without (coverage) | With (coverage) | Expected Δ |
|----|----------|-------------------|-----------------|------------|
| 1 | Politics | 60% | 90% | +30% |
| 2 | Media | 50% | 85% | +35% |
| 3 | Media | 40% | 80% | +40% |
| 4 | Education | 55% | 90% | +35% |
| 5 | Geography | 45% | 85% | +40% |
| 6 | Education | 65% | 95% | +30% |
| 7 | Politics | 50% | 85% | +35% |
| 8 | Other | 60% | 90% | +30% |
| 9 | Other | 40% | 80% | +40% |
| 10 | Health | 45% | 85% | +40% |

---

## 6. VARIANCE INVESTIGATION TRIGGERS

Investigate if:
1. **Delta < +15%**: Symbol not providing expected benefit
2. **Delta > +50%**: Unexpectedly large effect, verify not measurement artifact
3. **With Registry < 70%**: Symbol structure may be inadequate
4. **Without Registry > 80%**: Question may be too simple for this test
5. **Inconsistent results**: Same question type with >20% variance

---

## 7. MEASUREMENT METHODOLOGY

### Requirement Coverage Score
```
For each question:
1. Parse question into N requirements
2. Check output for each requirement addressed (0 or 1)
3. Score = requirements_addressed / total_requirements
```

### Drift Detection
```
For each agent pair (i, i+1):
1. Extract key entities from agent i output
2. Check if entities preserved in agent i+1
3. Drift = 1 - (preserved_entities / total_entities)
```

### Source Acknowledgment
```
For each question with explicit source:
1. Extract source name from question
2. Check if source mentioned in output
3. Binary: 0 or 1
```

---

## 8. NULL HYPOTHESIS

**H0**: Symbol registry grounding has no significant effect on agent output quality.

**Rejection Criteria**:
- Average delta > 20% across all metrics
- p-value < 0.05 (if sufficient sample size)
- Consistent improvement across question types

---

## 9. LIMITATIONS

1. **Sample Size**: 10 questions is small for statistical significance
2. **No Ground Truth**: Cannot verify accuracy, only structure
3. **Single Model**: Testing only Claude Sonnet, results may vary
4. **Subjective Scoring**: Some metrics require judgment

---

*Hypothesis documented BEFORE running tests. Results will be compared against these predictions.*
