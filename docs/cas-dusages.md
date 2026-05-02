# Use Cases & Design Patterns

`@ai.ntellect/core` is designed for scenarios where **failure is not an option**. While simple chatbots can use raw LLM loops, production systems require structured, predictable execution.

Here are the primary patterns you can build with this framework.

---

## 1. Task-Based Assistants (The "Router" Pattern)
Perfect for applications that provide a suite of specific services.

**The Pattern**: `Natural Language` $\rightarrow$ `Intent Classification` $\rightarrow$ `Deterministic Workflow`.

- **Example**: A Banking Assistant.
  - "What's my balance?" $\rightarrow$ `GET_BALANCE` intent $\rightarrow$ `fetchBalance` GraphFlow.
  - "Pay my electricity bill" $\rightarrow$ `PAY_BILL` intent $\rightarrow$ `validateAccount` $\rightarrow$ `executePayment` $\rightarrow$ `notifyUser` GraphFlow.
- **Why this wins**: The LLM cannot "hallucinate" a new payment method or skip the validation step. The path is hardcoded in the Petri Net.

---

## 2. Human-in-the-Loop (The "Approval" Pattern)
Essential for high-stakes actions that require a human "sanity check."

**The Pattern**: `Workflow Execution` $\rightarrow$ `Checkpoint` $\rightarrow$ `Awaiting Approval` $\rightarrow$ `Resume`.

- **Example**: Enterprise Expense Approval.
  - Employee submits a \$5,000 expense.
  - GraphFlow processes the request and hits a **Breakpoint**.
  - Execution pauses; state is saved to Redis.
  - Manager receives a notification and calls `/approve`.
  - GraphFlow resumes from the exact same state and completes the payment.
- **Why this wins**: You don't have to write complex "polling" logic. The system natively supports pausing and resuming long-running processes.

---

## 3. Event-Driven Orchestration (The "Reactive" Pattern)
For systems that must react to the real world (Webhooks, IoT, Blockchain).

**The Pattern**: `Event Trigger` $\rightarrow$ `Context Correlation` $\rightarrow$ `Workflow Trigger`.

- **Example**: Crypto Whale Alert & Trade.
  - **Event**: A large transfer is detected on-chain.
  - **Action**: Trigger a GraphFlow that analyzes the wallet history, calculates the impact, and executes a hedge trade.
- **Why this wins**: By using **Event-Driven Nodes**, your workflows can "sleep" for days and wake up the instant a specific external condition is met.

---

## 4. Financial & Critical Workflows (The "Zero-Failure" Pattern)
For systems where a single error can result in financial loss or compliance breach.

**The Pattern**: `Formal Verification` $\rightarrow$ `Zod Validation` $\rightarrow$ `Atomic Execution`.

- **Example**: Automated Compliance Reporting.
  - Collect data from 5 different APIs.
  - Validate each piece of data against a strict Zod schema.
  - Use a **Fork-Join** model to process reports in parallel.
  - Merge results using a custom **Reducer** to ensure no data is lost.
- **Why this wins**: The use of Petri Nets allows you to prove that the workflow will never enter an invalid state (Deadlock Detection), and Zod ensures that no corrupted data ever reaches your core logic.

---

## 🚀 Summary: When to use what?

| If you need... | Use this pattern | Key Primitive |
| :--- | :--- | :--- |
| Predictable routing | **Task-Based** | `CortexFlow` (Intent $\rightarrow$ Net) |
| Safety / Oversight | **Approval** | `Checkpoints` + `Breakpoints` |
| External triggers | **Reactive** | `Event-Driven Nodes` |
| Mathematical certainty | **Zero-Failure** | `Petri Net Verification` + `Zod` |
