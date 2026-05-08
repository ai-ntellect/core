/**
 * @file cli-dev.ts
 * @description CortexFlow interactive development REPL.
 *
 * Provides a lightweight command-line debugger for Petri Net workflows.
 * Load a JSON workflow definition, inspect token state, fire transitions manually
 * or automatically, inject tokens, and export the graph to DOT format — all
 * without writing a single line of test code.
 *
 * Usage:
 * ```sh
 * npx ts-node cli-dev.ts [workflow.json]
 * ```
 *
 * Commands available at the prompt:
 * - `load <file.json>`        — Load a workflow definition from disk
 * - `show [placeId]`          — Display current token marking (optionally filtered to one place)
 * - `enabled`                 — List all currently enabled transitions
 * - `step <transitionId>`     — Fire a single transition
 * - `auto`                    — Auto-fire transitions until the net is blocked (max 100 steps)
 * - `inject <placeId> [json]` — Inject a token into a place
 * - `history`                 — Show the ordered transition fire history
 * - `dot`                     — Print a Graphviz DOT representation of the net
 * - `reset`                   — Reset marking to the initial state
 * - `help`                    — Print this command reference
 * - `exit`                    — Quit the REPL
 */

import * as readline from 'readline';
import { PetriNet, TransitionResult } from './routing/index';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * JSON schema for a workflow definition file loaded by the `load` command.
 *
 * Example file:
 * ```json
 * {
 *   "name": "approval_flow",
 *   "places": [
 *     { "id": "idle",     "type": "initial", "tokens": [{ "id": "start" }] },
 *     { "id": "pending",  "type": "normal"  },
 *     { "id": "approved", "type": "final"   }
 *   ],
 *   "transitions": [
 *     { "id": "submit",  "from": ["idle"],    "to": "pending"  },
 *     { "id": "approve", "from": ["pending"], "to": "approved" }
 *   ]
 * }
 * ```
 */
interface WorkflowDefinition {
  name: string;
  places: Array<{
    id: string;
    type: 'initial' | 'normal' | 'final';
    tokens?: Array<{ id: string; data?: any }>;
  }>;
  transitions: Array<{
    id: string;
    from: string[];
    to: string | string[];
    description?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reads and parses a workflow definition JSON file, building a live `PetriNet`.
 *
 * @param filePath - Path to the JSON file (relative or absolute).
 * @returns A fully configured `PetriNet` instance.
 * @throws If the file does not exist or the JSON is malformed.
 */
function loadWorkflow(filePath: string): PetriNet {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Workflow file not found: ${absPath}`);
  }

  const def: WorkflowDefinition = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  const net = new PetriNet(def.name || 'loaded');

  for (const place of def.places) {
    net.addPlace({
      id: place.id,
      type: place.type,
      tokens: place.tokens?.map(t => ({
        id: t.id,
        data: t.data || {},
        createdAt: Date.now(),
      })) || [],
    });
  }

  for (const transition of def.transitions) {
    net.addTransition({
      id: transition.id,
      from: transition.from,
      to: transition.to,
      description: transition.description,
    });
  }

  return net;
}

/** Prints the full command reference to stdout. */
function showHelp(): void {
  console.log(`
CortexFlow DEV CLI — Interactive Petri Net Debugger
════════════════════════════════════════════════════

Commands:
  load <file.json>        Load a workflow from a JSON file
  show [placeId]          Display token marking (all places, or one specific place)
  enabled                 List currently enabled transitions
  step <transitionId>     Fire a specific transition
  auto                    Auto-fire all enabled transitions until blocked (max 100 steps)
  inject <placeId> [json] Inject a token into a place (optional JSON data)
  history                 Show the ordered transition fire history
  dot                     Export the net to Graphviz DOT format
  reset                   Reset marking to the initial state
  help / ?                Show this help message
  exit / quit             Quit the REPL

Examples:
  load ./examples/approval_flow.json
  show
  show idle
  step submit
  inject pending {"priority":"high"}
  auto
  dot > graph.dot
`);
}

/**
 * Renders the full token marking of a Petri net to stdout.
 *
 * Each place is prefixed with an icon reflecting its type:
 * - 🟢 initial
 * - 🔴 final
 * - ⚪ normal
 *
 * Up to 3 token payloads are shown inline; excess tokens are summarised.
 *
 * @param net - The `PetriNet` whose marking to display.
 */
function showMarking(net: PetriNet): void {
  console.log('\n📊 Current Marking:');
  const places = (net as any).places as Map<string, any>;
  const marking = (net as any).state.marking as Map<string, any[]>;

  for (const [pid, place] of places) {
    const tokens = marking.get(pid) || [];
    const icon = place.type === 'initial' ? '🟢' : place.type === 'final' ? '🔴' : '⚪';
    console.log(`  ${icon} ${pid} (${place.type}): ${tokens.length} token(s)`);

    const preview = tokens.slice(0, 3);
    for (const token of preview) {
      console.log(`    - ${token.id}: ${JSON.stringify(token.data || {})}`);
    }

    if (tokens.length > 3) {
      console.log(`    … and ${tokens.length - 3} more`);
    }
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Main REPL
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let net: PetriNet | null = null;
  const args = process.argv.slice(2);

  console.log('\n🚀 CortexFlow DEV CLI\n');

  if (args.length > 0) {
    try {
      net = loadWorkflow(args[0]);
      console.log(`✅ Loaded workflow: ${net.name}\n`);
      showMarking(net);
    } catch (error) {
      console.error(`❌ Error loading workflow:`, (error as Error).message);
      process.exit(1);
    }
  } else {
    console.log('No workflow file provided. Use "load <file>" to load one.\n');
  }

  const prompt = () => {
    const prefix = net ? `${net.name}> ` : 'cortex> ';
    rl.question(prefix, async (input) => {
      const parts = input.trim().split(/\s+/);
      const cmd = parts[0]?.toLowerCase();

      if (!cmd) {
        prompt();
        return;
      }

      try {
        switch (cmd) {
          // ── load ──────────────────────────────────────────────────────────
          case 'load': {
            if (!parts[1]) { console.log('Usage: load <file.json>'); break; }
            try {
              net = loadWorkflow(parts[1]);
              console.log(`✅ Loaded workflow: ${net.name}\n`);
              showMarking(net);
            } catch (error) {
              console.error(`❌ Error:`, (error as Error).message);
            }
            break;
          }

          // ── show ──────────────────────────────────────────────────────────
          case 'show': {
            if (!net) { console.log('No workflow loaded. Use "load" first.'); break; }
            if (parts[1]) {
              const marking = (net as any).state.marking as Map<string, any[]>;
              const tokens = marking.get(parts[1]) || [];
              console.log(`Place ${parts[1]}: ${tokens.length} token(s)`);
              tokens.forEach(t => console.log(`  - ${t.id}:`, t.data));
            } else {
              showMarking(net);
            }
            break;
          }

          // ── enabled ───────────────────────────────────────────────────────
          case 'enabled': {
            if (!net) { console.log('No workflow loaded.'); break; }
            const enabled = net.getEnabledTransitions();
            if (enabled.length === 0) {
              console.log('⚠️  No enabled transitions');
            } else {
              console.log('✅ Enabled transitions:');
              enabled.forEach(tid => console.log(`  - ${tid}`));
            }
            break;
          }

          // ── step ──────────────────────────────────────────────────────────
          case 'step': {
            if (!net) { console.log('No workflow loaded.'); break; }
            const tid = parts[1];
            if (!tid) { console.log('Usage: step <transitionId>'); break; }

            const result: TransitionResult = await net.fireTransition(tid);
            if (result.success) {
              console.log(`✅ Transition "${tid}" fired successfully`);
              if (result.consumedTokens?.length) {
                console.log(`  Consumed: ${result.consumedTokens.length} token(s)`);
              }
              if (result.producedTokens?.length) {
                console.log(`  Produced: ${result.producedTokens.length} token(s)`);
              }
              showMarking(net);
            } else {
              console.log(`❌ Failed to fire "${tid}": ${result.error || 'Unknown error'}`);
            }
            break;
          }

          // ── auto ──────────────────────────────────────────────────────────
          case 'auto': {
            if (!net) { console.log('No workflow loaded.'); break; }
            let steps = 0;
            const MAX_AUTO_STEPS = 100;

            while (true) {
              const enabled = net.getEnabledTransitions();
              if (enabled.length === 0) {
                console.log(`⏹  Blocked after ${steps} step(s)`);
                break;
              }

              const tid = enabled[0];
              const result = await net.fireTransition(tid);
              if (!result.success) {
                console.log(`❌ Failed at step ${steps + 1} ("${tid}"): ${result.error}`);
                break;
              }

              steps++;
              process.stdout.write(`  Step ${steps}: "${tid}"`);

              // Inline token counts for the first 10 steps to avoid flooding the terminal.
              if (steps <= 10) {
                const marking = (net as any).state.marking as Map<string, any[]>;
                const nonEmpty = Array.from(marking.entries())
                  .filter(([, tokens]) => tokens.length > 0)
                  .map(([pid, tokens]) => `${pid}:${tokens.length}`)
                  .join(' ');
                process.stdout.write(`  [${nonEmpty}]`);
              }
              process.stdout.write('\n');

              if (steps >= MAX_AUTO_STEPS) {
                console.log(`⚠️  Stopping auto after ${MAX_AUTO_STEPS} steps`);
                break;
              }
            }

            showMarking(net);
            break;
          }

          // ── inject ────────────────────────────────────────────────────────
          case 'inject': {
            if (!net) { console.log('No workflow loaded.'); break; }
            const placeId = parts[1];
            if (!placeId) { console.log('Usage: inject <placeId> [jsonData]'); break; }

            const jsonStr = parts.slice(2).join(' ');
            const data = jsonStr ? JSON.parse(jsonStr) : {};
            const marking = (net as any).state.marking as Map<string, any[]>;

            if (!marking.has(placeId)) {
              console.log(`❌ Place "${placeId}" not found`);
              break;
            }

            marking.get(placeId)!.push({
              id: `token_${Date.now()}`,
              data,
              createdAt: Date.now(),
            });

            console.log(`✅ Token injected into "${placeId}"`);
            showMarking(net);
            break;
          }

          // ── history ───────────────────────────────────────────────────────
          case 'history': {
            if (!net) { console.log('No workflow loaded.'); break; }
            const history = (net as any).state.history as string[];
            if (history.length === 0) {
              console.log('No transition history yet.');
            } else {
              console.log('📜 Transition History:');
              history.forEach((tid, i) => console.log(`  ${i + 1}. ${tid}`));
            }
            break;
          }

          // ── dot ───────────────────────────────────────────────────────────
          case 'dot': {
            if (!net) { console.log('No workflow loaded.'); break; }
            console.log(net.toDot());
            break;
          }

          // ── reset ─────────────────────────────────────────────────────────
          case 'reset': {
            if (!net) { console.log('No workflow loaded.'); break; }
            const places = (net as any).places as Map<string, any>;
            const marking = (net as any).state.marking as Map<string, any[]>;

            for (const [pid, place] of places) {
              if (place.type === 'initial') {
                marking.set(pid, place.tokens.map((t: any) => ({ ...t })));
              } else {
                marking.set(pid, []);
              }
            }
            (net as any).state.history = [];
            console.log('✅ Reset to initial marking\n');
            showMarking(net);
            break;
          }

          // ── help ──────────────────────────────────────────────────────────
          case 'help':
          case '?':
            showHelp();
            break;

          // ── exit ──────────────────────────────────────────────────────────
          case 'exit':
          case 'quit':
            console.log('\n👋 Goodbye!\n');
            rl.close();
            process.exit(0);

          default:
            console.log(`Unknown command: "${cmd}". Type "help" for available commands.`);
        }
      } catch (error) {
        console.error(`❌ Error:`, (error as Error).message);
      }

      prompt();
    });
  };

  prompt();
}

main().catch(console.error);
