import { MyContext, SharedState } from "../../types";

export class StateManager {
  /**
   * Updates the shared state while preserving immutability
   * @param currentState Current shared state
   * @param updates Partial updates to apply
   * @returns Updated shared state
   */
  static updateState(
    currentState: SharedState<MyContext>,
    updates: Partial<SharedState<MyContext>>
  ): SharedState<MyContext> {
    return {
      ...currentState,
      ...updates,
      context: {
        ...currentState.context,
        ...(updates.context || {}),
      },
    };
  }
}
