import { Agent } from "../..";
import { MemoryScope, MyContext, SharedState } from "../../../types";
import { StateManager } from "../../../utils/state-manager";

export const handleMemory = async (
  sharedState: SharedState<MyContext>,
  agent: Agent
) => {
  console.log("🔄 Storing memories");
  const recentMessages =
    await agent.memoryManager.memory?.cache?.getRecentMessages();

  const updatedState = StateManager.updateState(sharedState, {
    messages: recentMessages,
  });

  await agent.memoryManager.process(updatedState, {
    onMemoriesGenerated: async (event) => {
      if (event.memories.length === 0) {
        return;
      }
      // Store memories after all processing is complete
      await Promise.all([
        // Store short-term memories in cache
        ...event.memories
          .filter((m: any) => m.type === "short-term")
          .map(async (memoryItem: any) => {
            await agent.memoryManager.memory?.cache?.createMemory({
              query: memoryItem.queryForMemory,
              data: memoryItem.data,
              ttl: memoryItem.ttl, // Use TTL from LLM
            });

            const existingCacheMemories =
              await agent.memoryManager.memory?.cache?.findSimilarActions(
                memoryItem.data,
                {
                  similarityThreshold: 85,
                  maxResults: 3,
                  scope: MemoryScope.GLOBAL,
                }
              );

            if (
              existingCacheMemories?.length &&
              existingCacheMemories.length > 0
            ) {
              console.log(
                "⚠️ Similar memory already exists in cache:",
                memoryItem.data
              );
              return;
            }

            await agent.memoryManager.memory?.cache?.createMemory({
              query: memoryItem.queryForMemory,
              data: memoryItem.data,
              ttl: memoryItem.ttl, // Use TTL from LLM
            });
            console.log("✅ Memory stored in cache:", memoryItem.data);
          }),

        // Store long-term memories in persistent storage
        ...event.memories
          .filter((m: any) => m.type === "long-term")
          .map(async (memoryItem: any) => {
            if (!agent.memoryManager.memory?.persistent) {
              return;
            }

            const existingPersistentMemories =
              await agent.memoryManager.memory?.persistent?.findRelevantDocuments(
                memoryItem.data,
                {
                  similarityThreshold: 85,
                }
              );

            if (
              existingPersistentMemories?.length &&
              existingPersistentMemories.length > 0
            ) {
              console.log(
                "⚠️ Similar memory already exists in persistent storage:",
                memoryItem.data
              );
              return;
            }

            await agent.memoryManager.memory?.persistent?.createMemory({
              query: memoryItem.queryForMemory,
              data: memoryItem.data,
              category: memoryItem.category,
              tags: memoryItem.tags,
              roomId: "global",
              createdAt: new Date(),
              id: crypto.randomUUID(),
            });
            console.log("✅ Memory stored in persistent storage:", memoryItem);
          }),
      ]);
    },
  });

  return updatedState;
};
