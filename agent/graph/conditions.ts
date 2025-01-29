import {
  MAX_ATTEMPTS,
  MINIMUM_ACCEPTABLE_SCORE,
} from "../../llm/orchestrator/context";
import { MyContext, SharedState } from "../../types";

export const hasActions = (state: SharedState<MyContext>) =>
  Boolean(state.context?.actions && state.context?.actions?.length > 0);

export const isNotStopped = (state: SharedState<MyContext>) =>
  Boolean(!state.context?.processing?.stop);

export const isInterpreterDefined = (state: SharedState<MyContext>) =>
  Boolean(state.context?.interpreter);

export const isResultsDefined = (state: SharedState<MyContext>) =>
  Boolean(state.context?.results);

export const isStopped = (state: SharedState<MyContext>) =>
  Boolean(state.context?.processing?.stop);

export const hasAcceptableScore = (state: SharedState<MyContext>): boolean => {
  return (state.context.stateScore?.value ?? 0) >= MINIMUM_ACCEPTABLE_SCORE;
};

export const shouldRetry = (state: SharedState<MyContext>): boolean => {
  return (
    !hasAcceptableScore(state) &&
    (state.scoreHistory?.attempts ?? 1) < MAX_ATTEMPTS
  );
};
