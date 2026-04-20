import type {
  ConfigSyncCategory,
  ConfigSyncMode,
  DeviceConfigProfile,
} from "./baseTypes";
import { ALL_CONFIG_SYNC_CATEGORIES } from "./baseTypes";

/** 类别到文件路径的映射规则 */
interface CategoryPathRule {
  /** 精确匹配的文件路径 */
  paths: string[];
  /** 前缀匹配的目录路径 */
  prefixes: string[];
}

/** 获取指定配置类别的文件路径规则 */
export const getCategoryPathRules = (
  configDir: string,
  category: ConfigSyncCategory
): CategoryPathRule => {
  switch (category) {
    case "appearance":
      return { paths: [`${configDir}/appearance.json`], prefixes: [] };
    case "app":
      return { paths: [`${configDir}/app.json`], prefixes: [] };
    case "bookmarks":
      return { paths: [`${configDir}/bookmarks.json`], prefixes: [] };
    case "communityPlugins":
      return {
        paths: [`${configDir}/community-plugins.json`],
        prefixes: [],
      };
    case "corePlugins":
      return {
        paths: [
          `${configDir}/core-plugins.json`,
          `${configDir}/core-plugins-migration.json`,
        ],
        prefixes: [],
      };
    case "hotkeys":
      return { paths: [`${configDir}/hotkeys.json`], prefixes: [] };
    case "graph":
      return { paths: [`${configDir}/graph.json`], prefixes: [] };
    case "snippets":
      return { paths: [], prefixes: [`${configDir}/snippets/`] };
    case "themes":
      return { paths: [], prefixes: [`${configDir}/themes/`] };
    case "pluginsData":
      return { paths: [], prefixes: [`${configDir}/plugins/`] };
    default:
      return { paths: [], prefixes: [] };
  }
};

/**
 * 给定文件路径和当前设备的配置档案，返回该文件的同步模式。
 * 如果文件不在配置目录内，返回 undefined。
 */
export const getConfigSyncModeForFile = (
  key: string,
  configDir: string,
  deviceProfile: DeviceConfigProfile
): ConfigSyncMode | undefined => {
  if (!key.startsWith(`${configDir}/`)) return undefined;

  for (const cat of ALL_CONFIG_SYNC_CATEGORIES) {
    const rules = getCategoryPathRules(configDir, cat);

    // 精确路径匹配
    if (rules.paths.includes(key)) {
      return deviceProfile.categorySyncModes[cat] ?? "sync";
    }

    // 前缀匹配
    for (const prefix of rules.prefixes) {
      if (key.startsWith(prefix)) {
        // pluginsData 类别支持逐插件覆盖
        if (cat === "pluginsData") {
          const pluginsPrefix = `${configDir}/plugins/`;
          const afterPlugins = key.slice(pluginsPrefix.length);
          const slashIdx = afterPlugins.indexOf("/");
          if (slashIdx !== -1) {
            const pluginId = afterPlugins.slice(0, slashIdx);
            if (deviceProfile.skipPlugins?.includes(pluginId)) {
              return "skip";
            }
            if (deviceProfile.pullOnlyPlugins?.includes(pluginId)) {
              return "pull_only";
            }
          }
        }
        return deviceProfile.categorySyncModes[cat] ?? "sync";
      }
    }
  }

  // 文件在 configDir 内但不匹配任何类别，默认 sync
  return "sync";
};

/** 获取配置类别的中文显示名称 */
export const getCategoryDisplayName = (
  t: (key: string) => string,
  category: ConfigSyncCategory
): string => {
  const key = `device_config_category_${category}`;
  const translated = t(key);
  // 如果没有翻译，返回原始类别名
  return translated === key ? category : translated;
};

/** 获取同步模式的中文显示名称 */
export const getSyncModeDisplayName = (
  t: (key: string) => string,
  mode: ConfigSyncMode
): string => {
  return t(`device_config_mode_${mode}`);
};
