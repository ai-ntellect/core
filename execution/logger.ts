/**
 * Handles logging operations for a graph instance
 * Provides methods for adding, retrieving, and managing logs with optional verbose output
 */
export class GraphLogger {
  private logs: string[] = [];
  private verbose: boolean = false;

  /**
   * Creates a new GraphLogger instance
   * @param graphName - The name of the graph this logger is associated with
   * @param verbose - Whether to output logs to console in real-time
   */
  constructor(private graphName: string, verbose: boolean = false) {
    this.verbose = verbose;
  }

  /**
   * Adds a new log entry with timestamp
   * @param message - The message to log
   */
  public addLog(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    this.logs.push(logMessage);
    if (this.verbose) {
      console.log(`${this.graphName} - ${message}`);
    }
  }

  /**
   * Returns a copy of all stored logs
   * @returns Array of log messages
   */
  public getLogs(): string[] {
    return [...this.logs];
  }

  /**
   * Clears all stored logs
   */
  public clearLogs(): void {
    this.logs = [];
  }

  /**
   * Sets the verbose mode
   * @param enabled - Whether to enable verbose mode
   */
  public setVerbose(enabled: boolean): void {
    this.verbose = enabled;
  }

  /**
   * Gets the current verbose mode status
   * @returns Current verbose mode state
   */
  public isVerbose(): boolean {
    return this.verbose;
  }

  /**
   * Logs a message to console with graph name prefix
   * @param message - The message to log
   * @param data - Optional data to log
   */
  log(message: string, data?: any): void {
    console.log(`[Graph ${this.graphName}] ${message}`, data);
  }
}
