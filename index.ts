/**
 * @module @ai.ntellect/core
 * @description Core module with workflow functionality, providing graph management,
 * memory storage, agenda scheduling, and embedding capabilities.
 *
 * This module exports various components:
 * - Graph management and controller
 * - Memory storage adapters (Meilisearch, Redis)
 * - Agenda scheduling with node-cron adapter
 * - Embedding functionality with AI adapter
 * - Utility functions for action schema generation and header building
 */

export * from "./agent/agent";
export * from "./agent/prompt-builder";

export * from "./execution/controller";
export * from "./execution/event-manager";
export * from "./execution/index";
export * from "./execution/node";
export * from "./execution/observer";
export * from "./execution/visualizer";
export * from "./execution/registry";
export * from "./execution/planner";
export * from "./execution/compiler";

export * from "./interfaces";
export * from "./modules/agenda";
export * from "./modules/embedding";
export * from "./modules/memory";

// Persistence barrel — unified storage layer
export * from "./persistence";

export * from "./types";

export * from "./utils/generate-action-schema";
export * from "./utils/header-builder";

export { startCLI, runCLI, type CLIConfig } from "./modules/cli";

// PetriNet core — deterministic routing engine (thesis backbone)
export { PetriNet } from "./routing/index";
export { CortexFlowOrchestrator } from "./routing/orchestrator";
export type { Session, FallbackLLM } from "./routing/orchestrator";
export { IntentClassifier, HybridIntentClassifier } from "./routing/intent-classifier";
export type { IntentResult, IntentClassifierFn } from "./routing/intent-classifier";
export type { Token, Place, Transition, Guard, TransitionAction, TransitionResult, PetriNetState } from "./routing/types";
export { IPetriCheckpointAdapter, InMemoryPetriCheckpointAdapter } from "./routing/checkpoint-adapter";
export { RedisPetriCheckpointAdapter } from "./routing/redis-checkpoint-adapter";
export { PostgresPetriCheckpointAdapter } from "./routing/postgres-checkpoint-adapter";

// Pipeline - High-level abstraction for agent orchestration
export { AgentPipeline, priceZone } from "./pipeline/agent-pipeline";
export type { Stage, PriceTrigger, AgentPipelineConfig } from "./pipeline/agent-pipeline";
