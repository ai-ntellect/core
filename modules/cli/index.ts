import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import {
  Agent,
  CheckpointAwaitApprovalError,
  CheckpointInterruptError,
} from "../../index";
import { InMemoryCheckpointAdapter } from "../../graph/adapters/in-memory-checkpoint";
import { Memory } from "../../modules/memory";
import { InMemoryAdapter } from "../memory/adapters/in-memory";
import { LLMConfig, LLMProvider } from "../../types/agent";
import { createAllAgentTools } from "../agent/tools";
import { Checkpoint } from "../../types";

function loadEnv(): void {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, "utf-8")
      .split("\n")
      .forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const key = trimmed.substring(0, eqIdx).trim();
            const value = trimmed.substring(eqIdx + 1).trim();
            if (!process.env[key]) process.env[key] = value;
          }
        }
      });
  }
}

loadEnv();

export interface CLIConfig {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  role?: string;
  goal?: string;
  verbose?: boolean;
}

const DEFAULT_ROLE = "Helpful Assistant";
const DEFAULT_GOAL = "Assist the user with their requests";
const DEFAULT_MODEL: Record<LLMProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-haiku-20240307",
  ollama: "gemma4:4b",
  groq: "llama-3.1-8b-instant",
  custom: "custom",
};

function getLLMConfig(config: CLIConfig): LLMConfig {
  return {
    provider: config.provider,
    model: config.model || DEFAULT_MODEL[config.provider],
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  };
}

function createAgent(config: CLIConfig): Agent {
  const llmConfig = getLLMConfig(config);
  const memory = new Memory(new InMemoryAdapter());
  const tools = createAllAgentTools();

  return new Agent({
    role: config.role || DEFAULT_ROLE,
    goal: config.goal || DEFAULT_GOAL,
    backstory: `You are a ${config.role || DEFAULT_ROLE}. Be concise and helpful.`,
    tools,
    llmConfig,
    memory,
    verbose: config.verbose ?? false,
  });
}

function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function chatLoop(
  agent: Agent,
  provider: string,
  model: string
): Promise<void> {
  const rl = createInterface();
  const checkpointAdapter = new InMemoryCheckpointAdapter();

  let currentRunId: string | null = null;
  let lastCheckpointId: string | null = null;
  let pendingApprovalCp: Checkpoint | null = null;

  const showBanner = () => {
    console.log(chalk.cyan("\n=== @ai.ntellect/core CLI ==="));
    console.log(chalk.gray(`Provider: ${provider} | Model: ${model}`));
    console.log(chalk.gray("Type /help for commands, /exit to quit\n"));
    console.log(chalk.green("Agent: ") + "Hello! How can I help you today?\n");
  };

  const printCheckpointStatus = (cpId: string, runId: string | null) => {
    console.log(chalk.yellow(`  Checkpoint: ${cpId}`));
    if (runId) console.log(chalk.yellow(`  Run ID: ${runId}`));
  };

  const prompt = () => {
    const prefix = pendingApprovalCp
      ? chalk.red("[AWAITING APPROVAL] ")
      : currentRunId
        ? chalk.dim(`[run:${currentRunId.slice(0, 8)}] `)
        : "";

    rl.question(prefix + chalk.blue("You: "), async (input) => {
      const message = input.trim();

      if (!message) {
        prompt();
        return;
      }

      if (message.startsWith("/")) {
        await handleCommand(message, rl);
        prompt();
        return;
      }

      try {
        if (pendingApprovalCp) {
          await handleApproval(message, rl);
          prompt();
          return;
        }

        currentRunId = `run-${Date.now()}`;
        const result = await agent.processWithCheckpoint(message, checkpointAdapter, {
          runId: currentRunId,
          saveOnComplete: true,
        });

        lastCheckpointId = result.checkpointId;
        const ctx = result.context;

        if (ctx.response) {
          console.log(chalk.green("\nAgent: ") + ctx.response + "\n");
        }

        const history = await agent.getCheckpointHistory(currentRunId, checkpointAdapter);
        const completed = history.find((c) => c.nodeName === "__completed__");
        if (completed) {
          console.log(chalk.dim(`  [Saved: ${completed.id}]\n`));
          lastCheckpointId = completed.id;
        }
      } catch (error) {
        if (error instanceof CheckpointAwaitApprovalError) {
          const cp = await checkpointAdapter.load(error.checkpointId);
          if (cp) {
            pendingApprovalCp = cp;
            console.log(
              chalk.yellow(
                `\n⏸ Paused at "${pendingApprovalCp.nodeName}" for review.`
              )
            );
            console.log(chalk.gray("Approve (press Enter), /reject, /modify <key>=<value>, /resume <cpId>, or /exit\n"));
            lastCheckpointId = error.checkpointId;
            printCheckpointStatus(error.checkpointId, currentRunId);
          } else {
            console.log(chalk.red("Checkpoint not found."));
          }
        } else if (error instanceof CheckpointInterruptError) {
          lastCheckpointId = error.checkpointId;
          console.log(
            chalk.yellow(`\n⏸ Interrupted. Checkpoint: ${error.checkpointId}`)
          );
          console.log(chalk.gray("/resume to continue, /exit to quit\n"));
        } else {
          console.log(chalk.red("\nError: ") + (error as Error).message + "\n");
        }
      }

      prompt();
    });
  };

  const handleCommand = async (cmd: string, rl: readline.Interface) => {
    const parts = cmd.split(" ");
    const command = parts[0].toLowerCase();

    switch (command) {
      case "/help":
        showHelp();
        break;

      case "/exit":
      case "/quit":
        console.log(chalk.cyan("\nGoodbye!\n"));
        rl.close();
        process.exit(0);
        break;

      case "/clear":
        console.clear();
        showBanner();
        break;

      case "/status":
        if (currentRunId) {
          console.log(chalk.yellow("Current Run:"), currentRunId);
        } else {
          console.log(chalk.gray("No active run."));
        }
        if (pendingApprovalCp) {
          console.log(
            chalk.red("Pending Approval:"),
            pendingApprovalCp.nodeName
          );
          console.log(
            chalk.gray(
              "  Context:",
              JSON.stringify(pendingApprovalCp.context, null, 2)
            )
          );
        }
        if (lastCheckpointId) {
          console.log(chalk.yellow("Last Checkpoint:"), lastCheckpointId);
        }
        break;

      case "/history":
      case "/h": {
        const runId = parts[1] || currentRunId;
        if (!runId) {
          console.log(chalk.gray("No run ID. Use /history <runId>"));
          break;
        }
        const history = await agent.getCheckpointHistory(
          runId,
          checkpointAdapter
        );
        if (history.length === 0) {
          console.log(chalk.gray("No checkpoints for this run."));
          break;
        }
        console.log(chalk.cyan(`\nCheckpoint History (run: ${runId.slice(0, 8)}...):`));
        history.forEach((cp, i) => {
          const marker = cp.metadata.awaitingApproval
            ? chalk.red(" [BREAKPOINT]")
            : cp.nodeName === "__completed__"
              ? chalk.green(" [COMPLETED]")
              : cp.nodeName === "__error__"
                ? chalk.red(" [ERROR]")
                : "";
          console.log(
            chalk.gray(`  ${i + 1}.`) +
              ` ${cp.nodeName}` +
              marker +
              chalk.dim(` (${cp.id})`)
          );
        });
        console.log();
        break;
      }

      case "/list": {
        const allCps = await agent.listCheckpoints(checkpointAdapter);
        if (allCps.length === 0) {
          console.log(chalk.gray("No checkpoints saved."));
          break;
        }
        console.log(chalk.cyan("\nAll Checkpoints:"));
        allCps.slice(0, 20).forEach((cp, i) => {
          const runLabel = cp.runId ? ` run:${cp.runId.slice(0, 8)}` : "";
          console.log(
            chalk.gray(`  ${i + 1}.`) +
              ` ${cp.nodeName}` +
              chalk.dim(`${runLabel} (${cp.id})`)
          );
        });
        console.log();
        break;
      }

      case "/resume": {
        const cpId = parts[1] || lastCheckpointId;
        if (!cpId) {
          console.log(chalk.red("No checkpoint ID. Use /resume <id> or run first."));
          break;
        }
        const cp = await checkpointAdapter.load(cpId);
        if (!cp) {
          console.log(chalk.red(`Checkpoint "${cpId}" not found.`));
          break;
        }
        console.log(chalk.yellow(`\nResuming from "${cp.nodeName}"...`));
        try {
          const result = await agent.resumeFromCheckpoint(
            cpId,
            checkpointAdapter
          );
          currentRunId = cp.runId || `run-${Date.now()}`;
          if (result.response) {
            console.log(chalk.green("\nAgent: ") + result.response + "\n");
          }
          console.log(chalk.dim(`  [Completed]\n`));
        } catch (error) {
          if (error instanceof CheckpointAwaitApprovalError) {
            const cp = await checkpointAdapter.load(error.checkpointId);
            if (cp) {
              pendingApprovalCp = cp;
              console.log(
                chalk.yellow(
                  `\n⏸ Paused at "${pendingApprovalCp.nodeName}" for review.`
                )
              );
              console.log(
                chalk.gray(
                  "Approve (press Enter), /reject, /modify <key>=<value>, or /exit\n"
                )
              );
            } else {
              console.log(chalk.red("Checkpoint not found."));
            }
          } else {
            console.log(chalk.red("\nError: ") + (error as Error).message + "\n");
          }
        }
        break;
      }

      case "/reject":
        if (!pendingApprovalCp) {
          console.log(chalk.gray("No pending approval."));
          break;
        }
        console.log(chalk.red("Rejected. Skipping execution.\n"));
        pendingApprovalCp = null;
        break;

      case "/modify": {
        if (!pendingApprovalCp) {
          console.log(chalk.gray("No pending approval to modify."));
          break;
        }
        const modifications: Record<string, any> = {};
        for (const part of parts.slice(1)) {
          const eqIdx = part.indexOf("=");
          if (eqIdx > 0) {
            const key = part.substring(0, eqIdx);
            const value = part.substring(eqIdx + 1);
            modifications[key] = isNaN(Number(value)) ? value : Number(value);
          }
        }
        if (Object.keys(modifications).length === 0) {
          console.log(chalk.red("Usage: /modify key=value [key2=value2]"));
          break;
        }
        try {
          const result = await agent.resumeFromCheckpoint(
            pendingApprovalCp.id,
            checkpointAdapter,
            modifications
          );
          currentRunId = pendingApprovalCp.runId || `run-${Date.now()}`;
          pendingApprovalCp = null;
          if (result.response) {
            console.log(chalk.green("\nAgent: ") + result.response + "\n");
          }
        } catch (error) {
          console.log(chalk.red("\nError: ") + (error as Error).message + "\n");
        }
        break;
      }

      case "/approve":
        if (!pendingApprovalCp) {
          console.log(chalk.gray("No pending approval."));
          break;
        }
        console.log(chalk.green("Approved. Continuing...\n"));
        try {
          const result = await agent.resumeFromCheckpoint(
            pendingApprovalCp.id,
            checkpointAdapter
          );
          currentRunId = pendingApprovalCp.runId || `run-${Date.now()}`;
          pendingApprovalCp = null;
          if (result.response) {
            console.log(chalk.green("\nAgent: ") + result.response + "\n");
          }
        } catch (error) {
          console.log(chalk.red("\nError: ") + (error as Error).message + "\n");
        }
        break;

      case "/breakpoints": {
        console.log(chalk.cyan("\nBreakpoint nodes (auto-pause before execution):"));
        console.log(chalk.gray("  - think (before LLM decides actions)\n"));
        break;
      }

      default:
        console.log(chalk.red(`Unknown command: ${command}. Type /help for commands.`));
    }
  };

  const handleApproval = async (message: string, rl: readline.Interface) => {
    if (message.toLowerCase() === "approve" || message === "") {
      if (!pendingApprovalCp) return;
      console.log(chalk.green("Approved. Continuing...\n"));
      try {
        const result = await agent.resumeFromCheckpoint(
          pendingApprovalCp.id,
          checkpointAdapter
        );
        currentRunId = pendingApprovalCp.runId || `run-${Date.now()}`;
        pendingApprovalCp = null;
        if (result.response) {
          console.log(chalk.green("\nAgent: ") + result.response + "\n");
        }
      } catch (error) {
        console.log(chalk.red("\nError: ") + (error as Error).message + "\n");
      }
    } else if (message.toLowerCase().startsWith("/reject")) {
      console.log(chalk.red("Rejected. Skipping execution.\n"));
      pendingApprovalCp = null;
    } else if (message.toLowerCase().startsWith("/modify")) {
      const parts = message.split(" ");
      const modifications: Record<string, any> = {};
      for (const part of parts.slice(1)) {
        const eqIdx = part.indexOf("=");
        if (eqIdx > 0) {
          const key = part.substring(0, eqIdx);
          const value = part.substring(eqIdx + 1);
          modifications[key] = isNaN(Number(value)) ? value : Number(value);
        }
      }
      if (Object.keys(modifications).length === 0) {
        console.log(chalk.red("Usage: /modify key=value"));
        return;
      }
      try {
        const result = await agent.resumeFromCheckpoint(
          pendingApprovalCp!.id,
          checkpointAdapter,
          modifications
        );
        currentRunId = pendingApprovalCp!.runId || `run-${Date.now()}`;
        pendingApprovalCp = null;
        if (result.response) {
          console.log(chalk.green("\nAgent: ") + result.response + "\n");
        }
      } catch (error) {
        console.log(chalk.red("\nError: ") + (error as Error).message + "\n");
      }
    } else if (message.toLowerCase().startsWith("/exit")) {
      console.log(chalk.cyan("\nGoodbye!\n"));
      rl.close();
      process.exit(0);
    } else if (message.toLowerCase().startsWith("/")) {
      await handleCommand(message, rl);
    } else {
      console.log(chalk.gray("Use /approve, /reject, /modify key=value, or press Enter to continue."));
    }
  };

  showBanner();
  prompt();
}

function showHelp(): void {
  console.log(`
${chalk.cyan("Commands")}

${chalk.bold("Chat:")}
  (text)          Send a message to the agent

${chalk.bold("Checkpoint:")}
  /status          Show current run and checkpoint status
  /history [runId] Show checkpoint history for current or specified run
  /list            List all saved checkpoints
  /resume [cpId]   Resume execution from a checkpoint

${chalk.bold("Human-in-the-Loop:")}
  /approve         Approve and continue from breakpoint
  /reject          Reject and skip current execution
  /modify k=v      Modify context and continue (e.g., /modify value=42)

${chalk.bold("Other:")}
  /clear           Clear screen
  /help            Show this help
  /exit            Quit the CLI

${chalk.bold("Breakpoint Behavior:")}
  Before the agent "thinks" (calls LLM), execution pauses.
  You can review state, modify context, approve, or reject.
`);
}

export async function runCLI(config: CLIConfig): Promise<void> {
  const llmConfig = getLLMConfig(config);

  if (
    !process.env.OPENAI_API_KEY &&
    config.provider === "openai" &&
    !config.apiKey
  ) {
    console.log(
      chalk.red("Error: OPENAI_API_KEY environment variable is not set.")
    );
    console.log(chalk.gray("Set it with: export OPENAI_API_KEY=your-key"));
    process.exit(1);
  }

  console.log(chalk.cyan(`Starting ${config.role || DEFAULT_ROLE}...`));

  const agent = createAgent(config);
  await chatLoop(agent, config.provider, llmConfig.model);
}

export async function startCLI(): Promise<void> {
  const args = process.argv.slice(2);
  const config: CLIConfig = {
    provider: "ollama",
    model: "",
    baseUrl: "http://localhost:11434",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--provider":
      case "-p":
        config.provider = args[++i] as LLMProvider;
        break;
      case "--model":
      case "-m":
        config.model = args[++i];
        break;
      case "--api-key":
        config.apiKey = args[++i];
        break;
      case "--base-url":
      case "-b":
        config.baseUrl = args[++i];
        break;
      case "--role":
      case "-r":
        config.role = args[++i];
        break;
      case "--goal":
      case "-g":
        config.goal = args[++i];
        break;
      case "--verbose":
      case "-v":
        config.verbose = true;
        break;
      case "--help":
      case "-h":
        showHelp();
        return;
      default:
        if (!arg.startsWith("-")) {
          config.role = arg;
        }
    }
  }

  // Auto-resolve API keys from .env / environment
  if (config.provider === "openai" && !config.apiKey) {
    config.apiKey = process.env.OPENAI_API_KEY;
  }
  if (config.provider === "groq" && !config.apiKey) {
    config.apiKey = process.env.GROQ_API_KEY;
  }

  if (config.provider === "openai" && !config.apiKey) {
    console.log(chalk.red("Error: OpenAI requires an API key."));
    console.log(chalk.gray("Use --api-key, set OPENAI_API_KEY, or add to .env"));
    process.exit(1);
  }
  if (config.provider === "groq" && !config.apiKey) {
    console.log(chalk.red("Error: Groq requires an API key."));
    console.log(chalk.gray("Use --api-key, set GROQ_API_KEY, or add to .env"));
    process.exit(1);
  }

  await runCLI(config);
}
