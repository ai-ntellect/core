#!/usr/bin/env node

import { deepseek } from "@ai-sdk/deepseek";
import { configDotenv } from "dotenv";
import readline from "readline";
import { Agent } from "../agent";
import { Interpreter } from "../llm/interpreter";
import {
  marketInterpreterCharacter,
  securityInterpreterCharacter,
} from "../llm/interpreter/context";
import { getRssNews } from "./actions/get-rss";
configDotenv();
// Initialiser l'agent une fois pour toute la session
const initializeAgent = () => {
  const model = deepseek("deepseek-chat");

  const securityInterpreter = new Interpreter({
    name: "security-check",
    model,
    character: securityInterpreterCharacter,
  });
  const marketInterpreter = new Interpreter({
    name: "market-analysis",
    model,
    character: marketInterpreterCharacter,
  });

  const agent = new Agent({
    cache: {
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT) || 6379,
    },
    orchestrator: {
      model,
      tools: [getRssNews],
    },
    interpreters: [securityInterpreter, marketInterpreter],
    memoryManager: {
      model,
    },
    maxIterations: 3,
  });

  return agent;
};

// Fonction pour lancer une session interactive
const startChatSession = async () => {
  console.log("Bienvenue dans votre session de chat avec l'agent !");
  console.log("Tapez 'exit' pour quitter.\n");

  const agent = initializeAgent();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "Vous > ",
  });

  let state = {
    currentContext: "",
    previousActions: [],
  };

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();

    if (input.toLowerCase() === "exit") {
      console.log("Fin de la session. À bientôt !");
      rl.close();
      return;
    }

    console.log("Agent en réflexion...");
    try {
      const result = await agent.process(input, {
        onMessage: (message) => {
          console.log(`Agent > ${message.socialResponse?.response}\n`);
        },
      });
    } catch (error) {
      console.error("Erreur avec l'agent :", error);
    }

    rl.prompt();
  });

  rl.on("close", () => {
    console.log("Session terminée.");
    process.exit(0);
  });
};

// Lancer la session de chat
startChatSession();
