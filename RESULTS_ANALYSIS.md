# DeepSearchQA Registry Test - Results Analysis

**Date**: 2025-12-25
**Status**: HYPOTHESIS NOT SUPPORTED

---

## 1. EXECUTIVE SUMMARY

| Metric | Predicted | Actual | Variance |
|--------|-----------|--------|----------|
| Avg Coverage (Without) | 55% | **95%** | +40% |
| Avg Coverage (With) | 88% | **97%** | +9% |
| Expected Delta | +35% | **+2%** | -33% |
| High Variance Questions | 0 | **9/10** | N/A |

**Conclusion**: The symbol registry grounding hypothesis was NOT supported by this test.
The baseline (without registry) performed far better than predicted, leaving minimal room for improvement.

---

## 2. HYPOTHESIS vs REALITY

### 2.1 What We Predicted

```
WITHOUT Registry:
- Agents would lose track of multi-part questions
- Information would degrade through the chain
- Average coverage ~55%

WITH Registry:
- Explicit requirements would prevent drift
- All parts would be addressed
- Average coverage ~88%
- Delta: +33%
```

### 2.2 What Actually Happened

```
WITHOUT Registry:
- Claude handled multi-part questions well
- Minimal information loss
- Average coverage: 95% (!)

WITH Registry:
- Marginal improvement
- Average coverage: 97%
- Delta: +2%

Drift was actually WORSE with registry: 38% vs 28%
```

---

## 3. PER-QUESTION ANALYSIS

| Q# | Category | Without | With | Delta | Predicted Δ | Variance | Status |
|----|----------|---------|------|-------|-------------|----------|--------|
| Q01 | Politics | 100% | 100% | 0% | +30% | 30% | ❌ |
| Q02 | Media | 100% | 100% | 0% | +35% | 35% | ❌ |
| Q03 | Media | 50% | 100% | **+50%** | +40% | 10% | ✅ |
| Q04 | Education | 100% | 67% | **-33%** | +35% | 68% | ❌❌ |
| Q05 | Geography | 100% | 100% | 0% | +40% | 40% | ❌ |
| Q06 | Education | 100% | 100% | 0% | +30% | 30% | ❌ |
| Q07 | Politics | 100% | 100% | 0% | +35% | 35% | ❌ |
| Q08 | Other | 100% | 100% | 0% | +30% | 30% | ❌ |
| Q09 | Other | 100% | 100% | 0% | +40% | 40% | ❌ |
| Q10 | Health | 100% | 100% | 0% | +40% | 40% | ❌ |

**Notable Cases**:
- **Q03**: Only question matching predictions (+50% actual vs +40% predicted)
- **Q04**: Registry HURT performance (-33% delta!)

---

## 4. ROOT CAUSE ANALYSIS

### 4.1 Why Baseline Was Higher Than Expected

1. **DeepSearchQA questions are professionally structured**
   - Benchmark questions are designed to be clear
   - They explicitly state what's needed
   - Claude can parse them without help

2. **Claude Sonnet is highly capable**
   - Modern Claude handles complex multi-part questions well
   - 4 agents is not enough chain length to show degradation
   - Earlier telephone experiments needed 1000+ turns to show drift

3. **Our previous tests used WORSE questions**
   - Earlier "knowledge benchmark" used simpler questions
   - The comparison wasn't apples-to-apples

### 4.2 Why Registry Didn't Help

1. **Ceiling Effect**
   - At 95% baseline, there's only 5% room for improvement
   - Registry can't improve what's already working

2. **Requirements Parsing Was Generic**
   - Auto-parsed requirements like "MUST answer: which countries..."
   - These don't add value beyond the original question

3. **4-Agent Chain Too Short**
   - Not enough handoffs to accumulate drift
   - Need 10+ agents to see telephone effect

4. **Symbol Overhead May Hurt**
   - Q04 showed NEGATIVE delta (-33%)
   - Additional context may have confused the model
   - "Less is more" in some cases

### 4.3 Measurement Issues

1. **Coverage metric too lenient**
   - Checking if key words appear in output
   - Doesn't verify CORRECT answers
   - Doesn't check logical coherence

2. **Drift measurement flawed**
   - Drift was HIGHER with registry (38% vs 28%)
   - The symbol block may have introduced noise
   - Need better drift detection

---

## 5. WHAT WOULD NEED TO CHANGE

### 5.1 For Symbols to Show Value

1. **Longer agent chains (10+ agents)**
   - Telephone effect requires more handoffs
   - 4 agents insufficient to demonstrate drift

2. **More ambiguous tasks**
   - DeepSearchQA is too well-structured
   - Need vague, complex, multi-step tasks

3. **Domain-specific constraints**
   - Financial regulations, compliance rules
   - Things Claude wouldn't know without grounding

4. **Live updates mid-chain**
   - Dynamic symbol modification
   - This showed 100% pickup rate earlier

### 5.2 For Better Measurement

1. **Accuracy, not just coverage**
   - Check if answers are CORRECT
   - Not just if keywords appear

2. **Human evaluation**
   - Manual review of response quality
   - Rubric-based scoring

3. **Longer chains with controlled drift injection**
   - Deliberately inject errors
   - See if symbol prevents propagation

---

## 6. HONEST CONCLUSIONS

### What Symbols ARE Good For:
1. ✅ Long agent chains (10+ handoffs)
2. ✅ Mid-chain updates (100% pickup rate demonstrated)
3. ✅ Explicit constraint enforcement
4. ✅ Audit trail / version control
5. ✅ Cross-session consistency

### What Symbols DON'T Help With:
1. ❌ Well-structured questions (ceiling effect)
2. ❌ Short agent chains (<10)
3. ❌ Tasks Claude already handles well
4. ❌ Speed (adds overhead)

### The Real Value Proposition:
Symbol grounding is NOT about making Claude smarter.
It's about **maintaining consistency at scale** across:
- Many agents
- Many turns
- Many sessions
- Live updates

---

## 7. RECOMMENDATIONS

1. **Rerun with longer chains**
   - 12 agents minimum
   - Track per-agent degradation

2. **Test with ambiguous tasks**
   - "Research company X" without structure
   - See if symbol provides missing structure

3. **Test live update scenario**
   - Modify symbol at agent 5
   - Verify agents 6-12 see changes

4. **Compare to competing approaches**
   - AgentAsk (clarification-based)
   - MASS (topology optimization)
   - See where symbols win/lose

---

*Results documented honestly. Hypothesis not supported for this specific test case.*
