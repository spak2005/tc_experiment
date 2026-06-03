import { AsyncLocalStorage } from "node:async_hooks";

const activityRunStorage = new AsyncLocalStorage<string>();

export function getCurrentActivityRunId() {
  return activityRunStorage.getStore();
}

export function runWithActivityRun<T>(activityRunId: string, callback: () => T): T {
  return activityRunStorage.run(activityRunId, callback);
}
