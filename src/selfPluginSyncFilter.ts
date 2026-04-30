const SELF_PLUGIN_SYNC_ALLOWED_FILES = new Set([
  ".gitignore",
  "main.js",
  "manifest.json",
  "styles.css",
]);

const removeTrailingSlash = (x: string) => (x.endsWith("/") ? x.slice(0, -1) : x);

export const isSelfPluginSyncSkippedPath = (
  key: string | undefined,
  configDir: string,
  pluginId: string | undefined
): boolean => {
  if (!key || !pluginId) {
    return false;
  }

  const normalizedKey = removeTrailingSlash(key);
  const pluginDir = `${configDir}/plugins/${pluginId}`;
  if (normalizedKey === pluginDir) {
    return false;
  }
  if (!normalizedKey.startsWith(`${pluginDir}/`)) {
    return false;
  }

  const relativePath = normalizedKey.slice(pluginDir.length + 1);
  return (
    relativePath.includes("/") ||
    !SELF_PLUGIN_SYNC_ALLOWED_FILES.has(relativePath)
  );
};
