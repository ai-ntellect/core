import * as readline from "readline";
import chalk from "chalk";
import { Agent, Memory } from "../../index";
import { InMemoryAdapter } from "../memory/adapters/in-memory";
import { LLMConfig, LLMProvider } from "../../types/agent";
import { createAllAgentTools } from "../agent/tools";

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
  ollama: "qwen3.5:4b",
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
    verbose: config.verbose || false,
  });
}

function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function chatLoop(agent: Agent, provider: string, model: string): Promise<void> {
  const rl = createInterface();

  console.log(chalk.cyan("\n=== @ai.ntellect/core CLI ==="));
  console.log(chalk.gray(`Provider: ${provider} | Model: ${model}`));
  console.log(chalk.gray("Type 'exit' or 'quit' to stop\n"));
  console.log(chalk.green("Agent: ") + "Hello! How can I help you today?\n");

  const prompt = () => {
    rl.question(chalk.blue("You: "), async (input) => {
      const message = input.trim();

      if (message.toLowerCase() === "exit" || message.toLowerCase() === "quit") {
        console.log(chalk.cyan("\nGoodbye!\n"));
        rl.close();
        return;
      }

      if (!message) {
        prompt();
        return;
      }

      try {
        const result = await agent.process(message);
        console.log(chalk.green("\nAgent: ") + result.response + "\n");
      } catch (error) {
        console.log(chalk.red("\nError: ") + (error as Error).message + "\n");
      }

      prompt();
    });
  };

  prompt();
}

export async function runCLI(config: CLIConfig): Promise<void> {
  const llmConfig = getLLMConfig(config);

  if (!process.env.OPENAI_API_KEY && config.provider === "openai" && !config.apiKey) {
    console.log(chalk.red("Error: OPENAI_API_KEY environment variable is not set."));
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

  if (config.provider === "openai" && !config.apiKey && !process.env.OPENAI_API_KEY) {
    console.log(chalk.red("Error: OpenAI requires an API key."));
    console.log(chalk.gray("Use --api-key or set OPENAI_API_KEY"));
    process.exit(1);
  }

  await runCLI(config);
}

function showHelp(): void {
  console.log(`
${chalk.cyan("@ai.ntellect/core CLI")}

${chalk.bold("Usage:")}
  npx ts-node modules/cli/index.ts [options] [role]

${chalk.bold("Options:")}
  -p, --provider <name>   LLM provider: openai, ollama, anthropic (default: ollama)
  -m, --model <model>     Model name (default: varies by provider)
  -b, --base-url <url>    Base URL for local providers (default: http://localhost:11434)
  --api-key <key>         API key for OpenAI/Anthropic
  -r, --role <role>       Agent role description
  -g, --goal <goal>       Agent goal
  -v, --verbose           Enable verbose output
  -h, --help              Show this help

${chalk.bold("Examples:")}
  npx ts-node modules/cli/index.ts --provider ollama --model qwen3.5:4b
  npx ts-node modules/cli/index.ts --provider openai --api-key sk-... "My Assistant"
  npx ts-node modules/cli/index.ts -p ollama -m qwen3.5:9b "Coding Helper"
`);
}
