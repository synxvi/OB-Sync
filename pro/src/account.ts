import type { RemotelySavePluginSettings } from "../../src/baseTypes";

/**
 * Stub function: always returns true.
 * smart_conflict and all features are now built-in without Pro verification.
 */
export const checkProRunnableAndFixInplace = async (
  _config: RemotelySavePluginSettings,
  _pluginVersion: string,
  _saveUpdatedConfigFunc: () => Promise<any> | undefined
): Promise<true> => {
  return true;
};
