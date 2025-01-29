export const agentConfig = {
  cache: {
    host: process.env.NEXT_PUBLIC_REDIS_HOST || "localhost",
    port: parseInt(process.env.NEXT_PUBLIC_REDIS_PORT || "6379"),
    password: process.env.NEXT_PUBLIC_REDIS_PASSWORD,
  },
  orchestrator: {
    tools: [], // Ajoutez vos outils ici
  },
  memoryManager: {
    model: {}, // Configurez votre modèle ici
  },
  maxIterations: 3,
};
