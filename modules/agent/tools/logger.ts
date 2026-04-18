import chalk from "chalk";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogEntry = {
  timestamp: Date;
  level: LogLevel;
  source: string;
  message: string;
  data?: any;
};

export class AgentLogger {
  private logs: LogEntry[] = [];
  private enabled: boolean;
  private maxLogs: number;

  constructor(enabled: boolean = true, maxLogs: number = 1000) {
    this.enabled = enabled;
    this.maxLogs = maxLogs;
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  log(level: LogLevel, source: string, message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      source,
      message,
      data,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    if (!this.enabled) return;

    const prefix = {
      debug: chalk.gray("[DEBUG]"),
      info: chalk.blue("[INFO]"),
      warn: chalk.yellow("[WARN]"),
      error: chalk.red("[ERROR]"),
    }[level];

    const sourceStr = chalk.cyan(`[${source}]`);
    console.log(`${prefix} ${sourceStr} ${message}`);

    if (data !== undefined) {
      console.log(chalk.gray("  Data:"), typeof data === "object" ? JSON.stringify(data, null, 2) : data);
    }
  }

  debug(source: string, message: string, data?: any): void {
    this.log("debug", source, message, data);
  }

  info(source: string, message: string, data?: any): void {
    this.log("info", source, message, data);
  }

  warn(source: string, message: string, data?: any): void {
    this.log("warn", source, message, data);
  }

  error(source: string, message: string, data?: any): void {
    this.log("error", source, message, data);
  }

  think(source: string, message: string, reasoning?: string): void {
    this.log("info", source, message);
    if (reasoning) {
      console.log(chalk.magenta("  Reasoning:") + " " + chalk.gray(reasoning.substring(0, 500)));
    }
  }

  action(source: string, toolName: string, params: any): void {
    this.log("info", source, `Executing: ${toolName}`);
    console.log(chalk.cyan("  Params:"), JSON.stringify(params, null, 2));
  }

  result(source: string, toolName: string, result: any): void {
    this.log("info", source, `Result from: ${toolName}`);
    console.log(chalk.green("  Result:"), typeof result === "object" ? JSON.stringify(result, null, 2) : result);
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter((l) => l.level === level);
  }

  getLogsBySource(source: string): LogEntry[] {
    return this.logs.filter((l) => l.source === source);
  }

  clearLogs(): void {
    this.logs = [];
  }

  exportHistory(): string {
    return this.logs
      .map((l) => {
        const time = l.timestamp.toISOString();
        const dataStr = l.data ? ` | ${JSON.stringify(l.data)}` : "";
        return `[${time}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}${dataStr}`;
      })
      .join("\n");
  }

  printSummary(): void {
    console.log(chalk.bold("\n=== Agent Log Summary ==="));
    console.log(`Total logs: ${this.logs.length}`);
    console.log(`Debug: ${this.getLogsByLevel("debug").length}`);
    console.log(`Info: ${this.getLogsByLevel("info").length}`);
    console.log(`Warn: ${this.getLogsByLevel("warn").length}`);
    console.log(`Error: ${this.getLogsByLevel("error").length}`);
    console.log(chalk.bold("========================\n"));
  }

  getConversationHistory(): { user: string; agent: string; tools: string[] }[] {
    const history: { user: string; agent: string; tools: string[] }[] = [];
    let current: { user: string; agent: string; tools: string[] } | null = null;

    for (const entry of this.logs) {
      if (entry.message.startsWith("User:") || entry.message.startsWith("Analyzing")) {
        if (current) history.push(current);
        current = { user: entry.message.replace("User:", "").trim(), agent: "", tools: [] };
      } else if (current && (entry.message.includes("Response:") || entry.message.includes("Final:"))) {
        current.agent = entry.message.replace("Response:", "").replace("Final:", "").trim();
      } else if (current && entry.source === "tools" && entry.message.includes("Result from:")) {
        current.tools.push(entry.message.replace("Result from:", "").trim());
      }
    }

    if (current) history.push(current);
    return history;
  }
}

export const logger = new AgentLogger(true);
