# Agent avec prise de décision

Un agent qui **analyse** avant d'agir et **adapte** son comportement.

## Concept

```
User: "Mon solde est bas, rachète mes ETH"

Agent (raisonne):
  1. Vérifier le solde actuel (check_balance)
  2. Si solde < seuil -> Alerter l'utilisateur
  3. Si solde suffisant -> Exécuter le swap
  4. Confirmer la transaction
```

Le LLM **analyse** le contexte et **décide** quelle action prendre.

## Outils avec conditions

### Vérifier le solde

```typescript
const checkBalanceTool = new GraphFlow({
  name: "check_balance",
  schema: z.object({
    address: z.string(),
    balance: z.number().optional(),
    status: z.enum(["low", "normal", "high"]).optional(),
  }),
  context: { address: "", balance: undefined, status: undefined },
  nodes: [{
    name: "get_balance",
    execute: async (ctx) => {
      // Simuler un appel API
      ctx.balance = Math.random() * 1000;
      ctx.status = ctx.balance < 100 ? "low" : ctx.balance > 500 ? "high" : "normal";
    },
  }],
});
```

### Swap (avec validation)

```typescript
const swapTool = new GraphFlow({
  name: "execute_swap",
  schema: z.object({
    from: z.string(),
    to: z.string(),
    amount: z.number(),
    success: z.boolean().optional(),
    error: z.string().optional(),
  }),
  context: { from: "", to: "", amount: 0 },
  nodes: [{
    name: "validate",
    execute: async (ctx) => {
      if (ctx.amount <= 0) {
        ctx.error = "Amount must be positive";
        ctx.success = false;
      }
    },
    next: (ctx) => ctx.success === false ? [] : ["execute"],
  },
  {
    name: "execute",
    execute: async (ctx) => {
      // Simuler le swap
      ctx.success = true;
    },
  }],
});
```

### Alerter

```typescript
const alertTool = new GraphFlow({
  name: "send_alert",
  schema: z.object({
    message: z.string(),
    sent: z.boolean().optional(),
  }),
  context: { message: "" },
  nodes: [{
    name: "alert",
    execute: async (ctx) => {
      console.log(`⚠️ ALERT: ${ctx.message}`);
      ctx.sent = true;
    },
  }],
});
```

## Agent intelligent

```typescript
const agent = new Agent({
  role: "Trading Assistant",
  goal: "Aider avec les swaps en analysant le contexte",
  tools: [checkBalanceTool, swapTool, alertTool],
  llmConfig: { provider: "ollama", model: "gemma4:4b" },
  verbose: true,
});

// Le LLM analyse et décide:
await agent.process("Swap 50 ETH vers USDC");
// Logique:
// 1. check_balance (pour voir le contexte)
// 2. Si balance < 50 -> alertTool("Solde insuffisant")
// 3. Si balance >= 50 -> swapTool(amount=50)
// 4. Retourne le résultat
```

## Pattern: Decision Tree

Le LLM peut implémenter une **arbre de décision**:

```typescript
const decisionTreeAgent = new Agent({
  role: "Smart Assistant",
  goal: "Analyser et décider la meilleure action",
  tools: [checkBalanceTool, swapTool, alertTool, checkBalanceTool],
  llmConfig: getLLMConfig(),
});

// Requêtes et décisions:
// - "Swap 100 ETH" 
//   -> check_balance -> Si "low" -> alert("Trop risqué") 
//                     -> Si "normal" -> swapTool
//                     -> Si "high" -> swapTool + alert("Gros montant")
//
// - "Vérifie mon solde"
//   -> check_balance -> Retourne le solde
//
// - "Je veux swap tout"
//   -> check_balance -> swapTool(amount=solde)
```

## Test la décision

```typescript
async function test() {
  // Test direct des outils
  await checkBalanceTool.execute("get_balance", { address: "0x123..." });
  const status = checkBalanceTool.getContext().status;
  
  if (status === "low") {
    console.log("Solde bas, alert!");
    await alertTool.execute("alert", { message: "Solde bas!" });
  } else {
    console.log("Solde OK");
    await swapTool.execute("validate", { from: "ETH", to: "USDC", amount: 50 });
  }
}
```

## Concept: Contexte → Décision → Action

```
[CONTEXTE]          [DÉCISION]            [ACTION]
     │                   │                    │
     v                   v                    v
check_balance ----> LLM analyse ----> alertTool (si bas)
     │                   │                    │
     │                   v                    v
     +---------------> swapTool (si OK)
```

Le LLM voit le contexte et **choisit** l'action appropriée.

## Configuration

```typescript
function getLLMConfig() {
  if (process.env.OLLAMA_MODEL) {
    return {
      provider: "ollama" as const,
      model: process.env.OLLAMA_MODEL,
    };
  }
  return {
    provider: "openai" as const,
    model: "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY!,
  };
}
```
