/**
 * Worker pour tâches CPU-bound uniquement
 * Ne pas utiliser pour l'orchestration (utiliser Promise.all à la place)
 */
import { parentPort, workerData } from "worker_threads";

interface WorkerData {
  task: string; // Fonction sous forme de string
  data: any;
}

interface WorkerResult {
  type: "result" | "error";
  data?: any;
  error?: string;
}

// Écouter les messages du thread principal
parentPort?.on("message", async (msg: any) => {
  if (msg.type === "execute") {
    try {
      const { task, data } = workerData as WorkerData;
      
      // Reconstruire la fonction à partir du string
      let executeFn: Function;
      try {
        executeFn = eval(`(${task})`);
      } catch (evalError: any) {
        parentPort?.postMessage({
          type: "error",
          error: `Erreur eval fonction: ${evalError.message}`,
        });
        return;
      }
      
      // Exécuter la tâche CPU-bound
      const context = structuredClone(data);
      await executeFn(context);
      
      parentPort?.postMessage({
        type: "result",
        data: context,
      });
    } catch (error: any) {
      parentPort?.postMessage({
        type: "error",
        error: error.message || "Erreur inconnue",
      });
    }
  }
});

// Signaler que le worker est prêt
parentPort?.postMessage({ type: "ready" });
