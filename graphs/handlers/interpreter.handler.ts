import { Agent } from "../../agent";
import { StateManager } from "../../agent/utils/state.utils";
import { ActionData, MyContext, SharedState } from "../../types";

export const handleInterpreter = async (
  sharedState: SharedState<MyContext>,
  agent: Agent
) => {
  console.log("🔄 Interpreting actions");
  console.log("\n🏁 Analysis complete - generating final interpretation");

  const interpreter = agent.getInterpreter(
    agent.config.interpreters,
    sharedState.context.interpreter ?? ""
  );

  if (!interpreter) {
    throw new Error("No interpreter found");
  }

  console.log("🎭 Selected Interpreter:", interpreter?.name);
  (await interpreter?.process(sharedState, async (event: any) => {
    console.log("🎭 Interpreter event:", event);

    // Store message in recent messages
    await agent.cache.storeMessage("assistant", event.response);
  })) as { response: string };

  const validatedActions = sharedState.context.actions?.map(
    (action: ActionData) => ({
      ...action,
      name: action.name || "default", // Ensure name is always defined
      parameters:
        action.parameters?.map((param: { value: string }) => ({
          ...param,
          value: param.value ?? null,
        })) ?? [],
    })
  );

  return StateManager.updateState(sharedState, {
    context: {
      actions: validatedActions,
      prompt: sharedState.context.prompt,
      processing: {
        stop: true,
      },
    },
  });
};
