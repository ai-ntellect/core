# Interactive CLI: Debugging & Control

The `@ai.ntellect/core` CLI is not just a runner—it is a **control center** for your agents. It allows you to interact with agents in real-time, inspect their internal state, and manually steer execution using checkpoints.

## 🚀 Getting Started

Launch the REPL by specifying your LLM provider and model:

```sh
pnpm cli -p groq -m llama-3.1-8b-instant       # High-speed Groq
pnpm cli -p openai -m gpt-4o-mini              # Versatile OpenAI
pnpm cli -p ollama -m gemma4:4b                # Local Privacy (Ollama)
```

### Configuration
The CLI automatically loads your `.env` file for API keys (`GROQ_API_KEY`, `OPENAI_API_KEY`, etc.), so you don't have to pass them manually.

---

## ⌨️ Control Commands (Slash Commands)

While in the interactive session, use these commands to manage the agent's lifecycle:

### 🔍 State Inspection
- `/status` — View the current execution state and active node.
- `/history` — Print the full conversation and tool execution history.
- `/list` — List all available checkpoints for the current session.

### 🕹️ Execution Control
- `/resume [cpId]` — **Time Travel**: Jump back to a specific checkpoint and continue from there.
- `/approve` — Signal a "Yes" to a pending human-in-the-loop breakpoint.
- `/reject` — Signal a "No" to a pending human-in-the-loop breakpoint.
- `/modify k=v` — **State Injection**: Change a variable in the context *before* resuming execution.

### 🧹 Session Management
- `/clear` — Reset the current conversation context.
- `/help` — Show all available commands.
- `/exit` — Gracefully terminate the session.

---

## 🛑 Human-in-the-Loop (HITL)

The CLI is designed for **safe AI deployment**. By default, the agent is configured with a breakpoint before the `think` node (the LLM call). 

**The Workflow:**
1. The agent identifies a need to call a tool.
2. The CLI **pauses** execution.
3. You review the proposed action.
4. You type `/approve` to let it proceed or `/modify` to correct the parameters.

This ensures that no destructive action (like a financial transfer or a file deletion) happens without explicit human consent.

## 📖 Example Session

```text
> /role Financial Assistant
> Transfer $50 to Alice
[BREAKPOINT] Agent wants to execute: transfer_funds { amount: 50, to: "Alice" }
> /approve
[Executing...]
Transaction successful. Reference: TX_9921.
> /status
Current Node: notify_user | Status: COMPLETED
```
