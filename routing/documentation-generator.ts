import { PetriNet } from '../routing/index';
import { CortexFlowOrchestrator } from '../routing/orchestrator';
import { ToolRegistry } from '../execution/registry';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface DocumentationOptions {
  outputDir: string;
  format: 'markdown' | 'all';  // all = markdown + mermaid + html
  includeHistory?: boolean;
  includeState?: boolean;
}

export class PetriDocumentationGenerator {
  
  /**
   * Generate living documentation for a Petri net
   */
  async generateForPetri(
    net: PetriNet,
    options: DocumentationOptions
  ): Promise<void> {
    const { outputDir, format } = options;
    await fs.mkdir(outputDir, { recursive: true });

    // Generate Mermaid diagram
    const mermaid = this.generateMermaid(net);
    await fs.writeFile(
      path.join(outputDir, `${this.sanitizeFilename(net.name)}-diagram.mmd`),
      mermaid
    );

    // Generate Markdown documentation
    const markdown = this.generateMarkdown(net, mermaid);
    await fs.writeFile(
      path.join(outputDir, `${this.sanitizeFilename(net.name)}.md`),
      markdown
    );

    // Generate HTML preview if 'all' format
    if (format === 'all') {
      const html = this.generateHTML(net, mermaid);
      await fs.writeFile(
        path.join(outputDir, `${this.sanitizeFilename(net.name)}.html`),
        html
      );
    }

    console.log(`✅ Documentation generated in ${outputDir}`);
  }

  /**
   * Generate living documentation for an orchestrator session
   */
  async generateForSession(
    orchestrator: CortexFlowOrchestrator,
    sessionId: string,
    options: DocumentationOptions
  ): Promise<void> {
    const { outputDir } = options;
    await fs.mkdir(outputDir, { recursive: true });

    const net = orchestrator.petri;
    const session = (orchestrator as any).sessions?.get(sessionId);
    
    // Current state
    const marking = (net as any).state.marking as Map<string, any[]>;
    const history = (net as any).state.history || [];
    const enabled = net.getEnabledTransitions();

    // Generate state documentation
    const stateDoc = this.generateStateDoc(net, marking, history, enabled, session);
    await fs.writeFile(
      path.join(outputDir, `session-${sessionId}-state.md`),
      stateDoc
    );

    // Generate Mermaid with current state highlighted
    const mermaidWithState = this.generateMermaidWithState(net, marking, enabled);
    await fs.writeFile(
      path.join(outputDir, `session-${sessionId}-state.mmd`),
      mermaidWithState
    );

    // Generate full session report
    const sessionReport = this.generateSessionReport(net, session, history, enabled);
    await fs.writeFile(
      path.join(outputDir, `session-${sessionId}-report.md`),
      sessionReport
    );

    console.log(`✅ Session documentation generated in ${outputDir}`);
  }

  /**
   * Generate Mermaid diagram for Petri net
   */
  private generateMermaid(net: PetriNet): string {
    const lines: string[] = ['graph TD'];
    
    // Add places
    for (const [id, place] of net.places) {
      const label = `${id}\\n(${place.type})`;
      const shape = place.type === 'initial' ? `((${label}))` : 
                   place.type === 'final' ? `(((${label})))` : 
                   `[${label}]`;
      lines.push(`  ${id}${shape}`);
    }

    // Add transitions
    for (const [id, trans] of net.transitions) {
      const desc = (trans as any).description || id;
      lines.push(`  ${id}[/${desc}/]`);
    }

    // Add arcs (from transitions to places = output, places to transitions = input)
    for (const [tid, trans] of net.transitions) {
      // Input arcs (place -> transition)
      for (const pid of trans.from) {
        lines.push(`  ${pid} -->|${tid}| ${tid}`);
      }
      // Output arcs (transition -> place)
      for (const pid of trans.to) {
        lines.push(`  ${tid} -->|${tid}| ${pid}`);
      }
    }

    // Add style for initial/final places
    lines.push('');
    lines.push('  style initial fill:#90EE90,stroke:#228B22');
    lines.push('  style final fill:#FFB6C1,stroke:#DC143C');

    return lines.join('\n');
  }

  /**
   * Generate Mermaid with current state highlighted
   */
  private generateMermaidWithState(
    net: PetriNet, 
    marking: Map<string, any[]>,
    enabled: string[]
  ): string {
    const lines = this.generateMermaid(net).split('\n');
    
    // Highlight places with tokens
    for (const [pid, tokens] of marking) {
      if (tokens.length > 0) {
        lines.push(`  style ${pid} fill:#FFD700,stroke:#FFA500`);
      }
    }

    // Highlight enabled transitions
    for (const tid of enabled) {
      lines.push(`  style ${tid} fill:#90EE90,stroke:#228B22`);
    }

    return lines.join('\n');
  }

  /**
   * Generate Markdown documentation
   */
  private generateMarkdown(net: PetriNet, mermaid: string): string {
    const lines: string[] = [
      `# Petri Net: ${net.name}`,
      '',
      '## Overview',
      '',
      `- **Name**: ${net.name}`,
      `- **Places**: ${net.places.size}`,
      `- **Transitions**: ${net.transitions.size}`,
      '',
      '## Mermaid Diagram',
      '',
      '```mermaid',
      mermaid,
      '```',
      '',
      '## Places',
      '',
    ];

    for (const [id, place] of net.places) {
      lines.push(`### ${id} (${place.type})`);
      lines.push('');
      lines.push(`- Type: ${place.type}`);
      lines.push('');
    }

    lines.push('## Transitions');
    lines.push('');

    for (const [id, trans] of net.transitions) {
      lines.push(`### ${id}`);
      lines.push('');
      lines.push(`- **Description**: ${trans.description || id}`);
      lines.push(`- **From**: ${Array.isArray(trans.from) ? trans.from.join(', ') : trans.from}`);
      lines.push(`- **To**: ${Array.isArray(trans.to) ? trans.to.join(', ') : trans.to}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate state documentation
   */
  private generateStateDoc(
    net: PetriNet,
    marking: Map<string, any[]>,
    history: string[],
    enabled: string[],
    session: any
  ): string {
    const lines: string[] = [
      `# Session State: ${session?.id || 'unknown'}`,
      '',
      '## Current Marking',
      '',
    ];

    for (const [pid, tokens] of marking) {
      const place = net.places.get(pid);
      lines.push(`- **${pid}** (${place?.type}): ${tokens.length} token(s)`);
      if (tokens.length > 0) {
        tokens.forEach((t, i) => {
          lines.push(`  - Token ${i + 1}: ${JSON.stringify(t.data).substring(0, 100)}`);
        });
      }
    }

    lines.push('');
    lines.push('## Enabled Transitions');
    lines.push('');

    if (enabled.length === 0) {
      lines.push('*No enabled transitions*');
    } else {
      enabled.forEach(tid => {
        const trans = net.transitions.get(tid);
        lines.push(`- **${tid}**: ${(trans as any)?.description || tid}`);
      });
    }

    lines.push('');
    lines.push('## Session Context');
    lines.push('');
    if (session?.context) {
      lines.push('```json');
      lines.push(JSON.stringify(session.context, null, 2));
      lines.push('```');
    } else {
      lines.push('*No context*');
    }

    lines.push('');
    lines.push('## History (last 20)');
    lines.push('');
    history.slice(-20).forEach((h, i) => {
      lines.push(`${history.length - 20 + i + 1}. ${h}`);
    });

    return lines.join('\n');
  }

  /**
   * Generate session report
   */
  private generateSessionReport(
    net: PetriNet,
    session: any,
    history: string[],
    enabled: string[]
  ): string {
    const lines: string[] = [
      `# Session Report: ${session?.id || 'unknown'}`,
      '',
      `Generated: ${new Date().toISOString()}`,
      '',
      '## Summary',
      '',
      `- **Petri Net**: ${net.name}`,
      `- **Session ID**: ${session?.id || 'N/A'}`,
      `- **Total Transitions Fired**: ${history.length}`,
      `- **Enabled Transitions**: ${enabled.length}`,
      '',
      '## Timeline',
      '',
    ];

    history.forEach((h, i) => {
      lines.push(`${i + 1}. ${h}`);
    });

    lines.push('');
    lines.push('## Final State');
    lines.push('');

    const marking = (net as any).state.marking as Map<string, any[]>;
    for (const [pid, tokens] of marking) {
      lines.push(`- **${pid}**: ${tokens.length} token(s)`);
    }

    return lines.join('\n');
  }

  /**
   * Generate HTML preview
   */
  private generateHTML(net: PetriNet, mermaid: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <title>Petri Net: ${net.name}</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #333; }
    .mermaid { background: white; padding: 20px; border: 1px solid #ddd; border-radius: 4px; }
    pre { background: #f8f8f8; padding: 15px; border-radius: 4px; overflow-x: auto; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Petri Net: ${net.name}</h1>
    
    <h2>Visualization</h2>
    <div class="mermaid">
${mermaid}
    </div>

    <h2>Places</h2>
    <ul>
      ${Array.from(net.places.entries()).map(([id, p]) => `<li><strong>${id}</strong> (${p.type})</li>`).join('\n      ')}
    </ul>

    <h2>Transitions</h2>
    <ul>
      ${Array.from(net.transitions.entries()).map(([id, t]) => `<li><strong>${id}</strong>: ${t.description || id} | from: ${Array.isArray(t.from) ? t.from.join(', ') : t.from} → to: ${Array.isArray(t.to) ? t.to.join(', ') : t.to}</li>`).join('\n      ')}
    </ul>
  </div>

  <script>
    mermaid.initialize({ startOnLoad: true, theme: 'default' });
  </script>
</body>
</html>`;
  }

  /**
   * Sanitize filename
   */
  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_');
  }
}
