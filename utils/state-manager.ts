import { SharedState } from "../types";

export class StateManager {
  /**
   * Updates the shared state while preserving immutability
   * @param currentState Current shared state
   * @param updates Partial updates to apply
   * @returns Updated shared state
   */
  static updateState<T>(
    state: SharedState<T>,
    updates: Partial<T>
  ): SharedState<T> {
    return {
      ...state,
      context: {
        ...(state.context || {}),
        ...updates,
      },
    };
  }

  static createUpdate<T>(updates: Partial<T>) {
    return {
      context: {
        ...updates,
      },
    };
  }
}
