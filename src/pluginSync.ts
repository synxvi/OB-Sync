import type { DataAdapter } from "obsidian";
import type { DeviceConfigProfile } from "./baseTypes";

const lastPathPart = (path: string): string => {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? "";
};

const uniqueStrings = (values: string[]): string[] => [
  ...new Set(values.filter((value) => value.trim() !== "")),
];

export const cleanPluginOverrides = (
  deviceProfiles: Record<string, DeviceConfigProfile> | undefined,
  validPluginIds: string[]
): number => {
  if (!deviceProfiles) {
    return 0;
  }

  const validPluginIdSet = new Set(validPluginIds);
  let cleaned = 0;

  for (const [deviceId, profile] of Object.entries(deviceProfiles)) {
    const before =
      (profile.pullOnlyPlugins ?? []).length +
      (profile.pushOnlyPlugins ?? []).length +
      (profile.skipPlugins ?? []).length;
    const pullOnlyPlugins = (profile.pullOnlyPlugins ?? []).filter((id) =>
      validPluginIdSet.has(id)
    );
    const pushOnlyPlugins = (profile.pushOnlyPlugins ?? []).filter((id) =>
      validPluginIdSet.has(id)
    );
    const skipPlugins = (profile.skipPlugins ?? []).filter((id) =>
      validPluginIdSet.has(id)
    );
    const after =
      pullOnlyPlugins.length + pushOnlyPlugins.length + skipPlugins.length;

    if (after !== before) {
      deviceProfiles[deviceId] = {
        ...profile,
        pullOnlyPlugins,
        pushOnlyPlugins,
        skipPlugins,
      };
      cleaned += before - after;
    }
  }

  return cleaned;
};

export const countPluginOverrides = (
  deviceProfiles: Record<string, DeviceConfigProfile> | undefined
): number => {
  if (!deviceProfiles) {
    return 0;
  }

  return Object.values(deviceProfiles).reduce(
    (count, profile) =>
      count +
      (profile.pullOnlyPlugins ?? []).length +
      (profile.pushOnlyPlugins ?? []).length +
      (profile.skipPlugins ?? []).length,
    0
  );
};

export const listInstalledPluginIds = async (
  adapter: DataAdapter,
  configDir: string,
  selfPluginId: string
): Promise<string[]> => {
  let listed;
  try {
    listed = await adapter.list(`${configDir}/plugins`);
  } catch {
    return [];
  }

  const validPluginIds = await Promise.all(
    listed.folders.map(async (folder) => {
      const pluginId = lastPathPart(folder);
      if (pluginId === "" || pluginId === selfPluginId) {
        return undefined;
      }

      try {
        await adapter.read(`${folder}/manifest.json`);
        return pluginId;
      } catch {
        return undefined;
      }
    })
  );

  return uniqueStrings(
    validPluginIds.filter((pluginId): pluginId is string => pluginId !== undefined)
  ).sort((a, b) => a.localeCompare(b));
};
