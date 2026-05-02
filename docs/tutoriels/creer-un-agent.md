# Building Tool-Using Agents

An **Agent** is a high-level entity that combines an LLM's reasoning with GraphFlow's deterministic execution. 

Instead of letting the LLM "guess" how to solve a problem, we give it a set of **Tools** (which are just GraphFlows) and let it decide which one to use.

## 🛠️ Step 1: Create the Tools

A tool is simply a `GraphFlow`. The LLM uses the `name` and the `Zod schema` to understand what the tool does and what parameters it needs.

```typescript
import { z } from "zod";
import { GraphFlow } from "@ai.ntellect/core";

// Tool 1: A simple calculator
const calculator = new GraphFlow({
  name: "calculator",
  schema: z.object({
    a: z.number(),
    b: z.number(),
    operation: z.enum(["add", "subtract", "multiply", "divide"]),
    result: z.number().optional(),
  }),
  context: { a: 0, b: 0, operation: "add" },
  nodes: [{
    name: "calc",
    execute: async (ctx) => {
      if (ctx.operation === "add") ctx.result = ctx.a + ctx.b;
      // ... other operations
    }
  }],
});

// Tool 2: A web search tool
const webSearch = new GraphFlow({
  name: "web_search",
  schema: z.object({
    query: z.string(),
    results: z.array(z.string()).optional(),
  }),
  context: { query: "", results: [] },
  nodes: [{
    name: "search",
    execute: async (ctx) => {
      const res = await fetch(`https://api.example.com/search?q=${ctx.query}`);
      ctx.results = await res.json();
    }
  }],
});
```

## 🤖 Step 2: Initialize the Agent

The `Agent` class handles the "Cognitive Loop": **Think $\rightarrow$ Execute $\rightarrow$ Reply**.

```typescript
import { Agent } from "@ai.ntellect/core";

const agent = new Agent({
  role: "Research Assistant",
  goal: "Provide accurate data and calculations",
  tools: [calculator, webSearch],
  llmConfig: { 
    provider: "ollama", 
    model: "gemma4:4b" 
  },
});
```

## 🚀 Step 3: Process a Request

When you call `agent.process()`, the following happens:
1. **Analyze**: The LLM looks at the user request and the available tools.
2. **Select**: The LLM chooses the best tool and extracts the parameters.
3. **Execute**: The framework runs the selected `GraphFlow` deterministically.
4. **Synthesize**: The LLM takes the tool result and formulates a final answer.

```typescript
const response = await agent.process("Search for the current price of Bitcoin and multiply it by 2");

// The agent will:
// 1. Call 'web_search' with { query: "current price of Bitcoin" }
// 2. Take the result and call 'calculator' with { a: price, b: 2, operation: "multiply" }
// 3. Return: "The current price is X, so double that is Y."
```

---

## 🧠 Pro Tip: Adding Memory

By default, an agent might forget what it just did. Enable `memory: true` to allow the agent to track its own history and avoid repeating the same mistake.

```typescript
const smartAgent = new Agent({
  // ... other config
  memory: true,
});
```

## ⚖️ Agent vs. CortexFlow

| Agent (Standard) | CortexFlow (Deterministic) |
| :--- | :--- |
| LLM chooses tools in a loop | LLM classifies intent once |
| High flexibility, higher drift | Low drift, total predictability |
| Best for open-ended exploration | Best for business-critical workflows |

**Rule of thumb**: Use the `Agent` module for "Assistant" behavior, and `CortexFlow` for "Workflow" behavior.
