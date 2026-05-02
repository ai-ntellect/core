# Living Documentation: Visualizing Your Agents

One of the biggest challenges in AI orchestration is the "Black Box" problem: you don't know why an agent took a certain path. `@ai.ntellect/core` solves this by treating **documentation as code**.

CortexFlow can automatically generate visual and textual documentation directly from your Petri Net definitions.

---

## 🛠️ Generation Tools

### 1. CLI Generation
You can generate documentation for any JSON-defined Petri Net using the provided script:

```bash
npx ts-node scripts/generate-petri-docs.ts <petri-net.json> [output-dir]
```

**What you get:**
- **Markdown (`.md`)**: A human-readable explanation of all places, transitions, and the intended flow.
- **Mermaid Diagram (`.mmd`)**: A visual graph that can be rendered in GitHub, Notion, or Obsidian.
- **Interactive HTML (`.html`)**: A standalone page with an embedded render of the workflow.

### 2. Programmatic Generation
You can integrate documentation generation into your CI/CD pipeline or your own admin dashboard:

```typescript
import { PetriDocumentationGenerator } from "@ai.ntellect/core/petri/documentation-generator";

const generator = new PetriDocumentationGenerator();
await generator.generateForPetri(net, {
  outputDir: "./docs/petri",
  format: "all",
});
```

---

## 🔍 Session-Based Documentation (The "Audit Trail")

Unlike static documentation, **Session Documentation** captures the *actual* execution of a specific request.

When you generate documentation for a session:
1. **State Highlighting**: The resulting diagram highlights exactly where the tokens were located at the time of the snapshot.
2. **Transition History**: The Markdown report lists every transition that was fired, in order, with its associated `traceId`.
3. **Enabled Analysis**: The report shows which transitions were "enabled" (ready to fire) but were not chosen.

**This turns your documentation into a forensic tool for debugging production agents.**

---

## 📈 Why "Living" Docs?

- **Zero Drift**: Since the docs are generated from the `PetriNet` object, they can never be out of sync with the code.
- **Accessibility**: Non-technical stakeholders (Product Managers, Compliance Officers) can review the Mermaid diagrams to verify the business logic.
- **Fast Onboarding**: New developers can visualize the entire agent's decision tree without reading thousands of lines of code.
