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

  enable(): void { this.enabled = true; }
  disable(): void { this.enabled = false; }
  isEnabled(): boolean { return this.enabled; }

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

    const colors: Record<LogLevel, any> = {
      debug: chalk.gray,
      info: chalk.blue,
      warn: chalk.yellow,
      error: chalk.red,
    };

    const time = new Date().toLocaleTimeString("fr-FR", {hour12: false});
    const prefix = colors[level](`[${time}]`);
    const src = chalk.cyan(`[${source}]`);
    
    console.log(`${prefix} ${src} ${message}`);
  }

  debug(source: string, message: string, data?: any): void { this.log("debug", source, message, data); }
  info(source: string, message: string, data?: any): void { this.log("info", source, message, data); }
  warn(source: string, message: string, data?: any): void { this.log("warn", source, message, data); }
  error(source: string, message: string, data?: any): void { this.log("error", source, message, data); }

  think(source: string, message: string, reasoning?: string): void {
    const time = new Date().toLocaleTimeString("fr-FR", {hour12: false});
    console.log(`${chalk.cyan(`[${time}]`)} ${chalk.cyan(`[${source}]`)} ${message}`);
    if (reasoning) {
      console.log(chalk.gray("  → ") + chalk.gray(reasoning.substring(0, 500)));
    }
  }

  action(source: string, toolName: string, params: any): void {
    const time = new Date().toLocaleTimeString("fr-FR", {hour12: false});
    const p = JSON.stringify(params).substring(0, 150);
    console.log(`${chalk.yellow(`[${time}]`)} ${chalk.cyan(`[${source}]`)} → ${toolName}(${p})`);
  }

  result(source: string, toolName: string, result: any): void {
    const time = new Date().toLocaleTimeString("fr-FR", {hour12: false});
    const r = JSON.stringify(result).substring(0, 150);
    console.log(`${chalk.green(`[${time}]`)} ${chalk.green(`[${source}]`)} ${toolName} → ${r})`);
  }

  getLogs(): LogEntry[] { return [...this.logs]; }
  getLogsByLevel(level: LogLevel): LogEntry[] { return this.logs.filter((l) => l.level === level); }
  getLogsBySource(source: string): LogEntry[] { return this.logs.filter((l) => l.source === source); }
  clearLogs(): void { this.logs = []; }

  exportHistory(): string {
    return this.logs.map((l) => {
      const time = l.timestamp.toISOString();
      const dataStr = l.data ? ` | ${JSON.stringify(l.data)}` : "";
      return `[${time}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}${dataStr}`;
    }).join("\n");
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
}

export const logger = new AgentLogger(true);