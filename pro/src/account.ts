import type { ObsSyncPluginSettings } from "../../src/baseTypes";

/**
 * Stub function: always returns true.
 * smart_conflict and all features are now built-in without Pro verification.
 */
export const checkProRunnableAndFixInplace = async (
  _config: ObsSyncPluginSettings,
  _pluginVersion: string,
  _saveUpdatedConfigFunc: () => Promise<any> | undefined
): Promise<true> => {
  return true;
};
