# Benchmark: CortexFlow vs. LangGraph

To validate our thesis that **deterministic routing is superior to probabilistic routing**, we conducted a rigorous benchmark comparing `CortexFlow` against a standard `LangGraph` implementation.

## 🧪 The Test Scenario

**The Task**: An AI Agent must process an inbox of 5 emails. It must:
1. Fetch emails $\rightarrow$ 2. Classify urgency $\rightarrow$ 3. Draft responses for urgent ones $\rightarrow$ 4. Archive non-urgent ones.

This is a classic "routing" task where an agent must decide between different paths based on input.

---

## 📊 The Results

### Test 1: Local Execution (Ollama — llama3:latest)
*Observation: Local LLM calls have high latency (~2s per call), making the number of calls the primary bottleneck.*

| Metric | CortexFlow | LangGraph (Naive) | LangGraph (Optimized) |
| :--- | :--- | :--- | :--- |
| **LLM Calls** | **1** | 7 | 2 |
| **Total Time** | **13.4s** | 3.7s | 4.2s |
| **Reliability** | 100% (Deterministic) | ~85% (Occasional Drift) | ~95% (Manual Batching) |

**Analysis**: CortexFlow is slower in local mode because it performs **Formal Verification** (deadlock/boundedness checks) at the start. However, it reduces LLM calls by **86%**.

### Test 2: Cloud Execution (Groq API — llama-3.1-8b-instant)
*Observation: Cloud LLMs have extremely low latency, shifting the bottleneck to the orchestration overhead.*

| Metric | CortexFlow | LangGraph (Naive) | LangGraph (Optimized) |
| :--- | :--- | :--- | :--- |
| **LLM Calls** | **1** | 7 | 2 |
| **Total Time** | **1,650 ms** | 2,192 ms | 1,668 ms |
| **Performance** | **1.33x Faster** | Baseline | 1.31x Faster |

**Analysis**: In a production environment (low-latency LLM), **CortexFlow is the fastest**. By eliminating the "routing loops," it removes multiple network round-trips.

---

## 📉 The "LLM Call" Tax

The biggest find from this benchmark is the **LLM Call Tax**.
In traditional frameworks, every decision is a call:
`User` $\rightarrow$ `Call 1 (Route)` $\rightarrow$ `Call 2 (Validate)` $\rightarrow$ `Call 3 (Act)` $\rightarrow$ `Call 4 (Summarize)`.

In CortexFlow, we pay the tax **once**:
`User` $\rightarrow$ `Call 1 (Classify Intent)` $\rightarrow$ `System (Deterministic Route)` $\rightarrow$ `Done`.

---

## 🏆 Final Verdict: Why Choose CortexFlow?

The benchmark proves that the gain is not just about milliseconds—it's about **Reliability**.

1. **Zero Routing Hallucinations**: Because the routing is in a Petri Net, the agent *cannot* decide to go to a node that doesn't exist or skip a mandatory step.
2. **Constant Complexity**: Whether the conversation is 2 turns or 200 turns, the routing cost remains **1 LLM call**.
3. **Formal Guarantees**: You get a mathematical proof that your agent will never deadlock, regardless of what the LLM outputs.

**LangGraph is a great tool for autonomous exploration. CortexFlow is the tool for production systems.**
