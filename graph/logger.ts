export class GraphLogger {
  private logs: string[] = [];
  private verbose: boolean = false;

  constructor(private graphName: string, verbose: boolean = false) {
    this.verbose = verbose;
  }

  public addLog(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    this.logs.push(logMessage);
    if (this.verbose) {
      console.log(`${this.graphName} - ${message}`);
    }
  }

  public getLogs(): string[] {
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
  }

  public setVerbose(enabled: boolean): void {
    this.verbose = enabled;
  }

  public isVerbose(): boolean {
    return this.verbose;
  }

  log(message: string, data?: any): void {
    console.log(`[Graph ${this.graphName}] ${message}`, data);
  }
}
