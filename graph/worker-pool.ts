import { Worker } from "worker_threads";
import * as path from "path";
import * as os from "os";

/**
 * Worker pool STRICTEMENT pour les tâches CPU-bound
 * Ne pas utiliser pour l'orchestration (utiliser Promise.all à la place)
 */
export class CPUWorkerPool {
  private maxWorkers: number;
  private activeWorkers: Worker[] = [];

  constructor(maxWorkers?: number) {
    this.maxWorkers = maxWorkers || os.cpus().length;
  }

  /**
   * Exécute une tâche CPU-bound dans un worker
   * @param task - Fonction sous forme de string ou Function
   * @param data - Données à transférer (doit être sérialisable)
   */
  async executeCPU(task: string | Function, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const workerScriptPath = path.resolve(__dirname, "./workers/cpu-worker.js");

      const worker = new Worker(workerScriptPath, {
        workerData: {
          task: typeof task === "string" ? task : task.toString(),
          data: structuredClone(data),
        },
      });

      this.activeWorkers.push(worker);

      worker.on("message", (msg: any) => {
        if (msg.type === "result") {
          resolve(msg.data);
        } else if (msg.type === "error") {
          reject(new Error(msg.error));
        }
        this.cleanupWorker(worker);
      });

      worker.on("error", (error) => {
        reject(error);
        this.cleanupWorker(worker);
      });

      worker.on("exit", (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
        this.cleanupWorker(worker);
      });

      // Signaler au worker de démarrer
      worker.postMessage({ type: "execute" });
    });
  }

  /**
   * Exécute plusieurs tâches CPU-bound en parallèle
   */
  async executeParallel(
    tasks: Array<{ task: string | Function; data: any }>
  ): Promise<any[]> {
    // Limiter le nombre de workers simultanés
    const batches = [];
    for (let i = 0; i < tasks.length; i += this.maxWorkers) {
      batches.push(tasks.slice(i, i + this.maxWorkers));
    }

    const results: any[] = [];
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(({ task, data }) => this.executeCPU(task, data))
      );
      results.push(...batchResults);
    }

    return results;
  }

  private cleanupWorker(worker: Worker): void {
    const index = this.activeWorkers.indexOf(worker);
    if (index > -1) {
      this.activeWorkers.splice(index, 1);
    }
    try {
      worker.terminate();
    } catch (e) {
      // Ignore termination errors
    }
  }

  /**
   * Terminer tous les workers actifs
   */
  async terminateAll(): Promise<void> {
    await Promise.all(
      this.activeWorkers.map((worker) => {
        try {
          return worker.terminate();
        } catch (e) {
          return Promise.resolve();
        }
      })
    );
    this.activeWorkers = [];
  }
}

// Export singleton
export const cpuWorkerPool = new CPUWorkerPool();
