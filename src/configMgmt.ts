import type {
  ConfigManagementSnapshot,
  DeviceConfigProfile,
  ObsSyncPluginSettings,
} from "./baseTypes";
import {
  CONFIG_MGMT_DEVICES_DIR,
  CONFIG_MGMT_DIR,
  CONFIG_MGMT_MANIFEST,
  CONFIG_MGMT_SNAPSHOT_VERSION,
} from "./baseTypes";
import type { FakeFs } from "./fsAll";

/** 排除敏感字段，返回安全的设置副本 */
export const sanitizeSettingsForSnapshot = (
  settings: ObsSyncPluginSettings
): Partial<ObsSyncPluginSettings> => {
  const {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    password: _password,
    webdav,
    onedrive,
    ...rest
  } = settings;

  return {
    ...rest,
    webdav: {
      ...webdav,
      password: "",
    },
    onedrive: {
      ...onedrive,
      accessToken: "",
      refreshToken: "",
    },
  };
};

/** 构建配置快照 */
export const buildConfigSnapshot = (
  settings: ObsSyncPluginSettings,
  deviceId: string,
  deviceName: string,
  pluginVersion: string
): ConfigManagementSnapshot => ({
  version: CONFIG_MGMT_SNAPSHOT_VERSION,
  savedAt: Date.now(),
  savedByDeviceId: deviceId,
  savedByDeviceName: deviceName,
  pluginVersion,
  pluginSettings: sanitizeSettingsForSnapshot(settings),
  deviceProfiles: { ...(settings.deviceProfiles ?? {}) },
});

/** 将 ArrayBuffer 转为字符串 */
const ab2str = (buf: ArrayBuffer): string =>
  new TextDecoder().decode(buf);

/** 将字符串转为 ArrayBuffer */
const str2ab = (str: string): ArrayBuffer =>
  new TextEncoder().encode(str).buffer;

/** 保存配置快照到远程 */
export const saveConfigToRemote = async (
  fs: FakeFs,
  snapshot: ConfigManagementSnapshot,
  deviceId: string
): Promise<void> => {
  // 确保目录存在（mkdir 要求路径以 / 结尾）
  await fs.mkdir(`${CONFIG_MGMT_DIR}/`).catch(() => {});
  await fs.mkdir(`${CONFIG_MGMT_DEVICES_DIR}/`).catch(() => {});

  // 写入 manifest
  const manifestContent = str2ab(
    JSON.stringify({ version: CONFIG_MGMT_SNAPSHOT_VERSION })
  );
  await fs
    .writeFile(CONFIG_MGMT_MANIFEST, manifestContent, Date.now(), Date.now())
    .catch(() => {});

  // 写入设备快照
  const snapshotKey = `${CONFIG_MGMT_DEVICES_DIR}/${deviceId}.json`;
  const snapshotContent = str2ab(JSON.stringify(snapshot, null, 2));
  await fs.writeFile(snapshotKey, snapshotContent, Date.now(), Date.now());
};

/** 从远程拉取所有配置快照 */
export const pullConfigsFromRemote = async (
  fs: FakeFs
): Promise<ConfigManagementSnapshot[]> => {
  const allEntities = await fs.walk();
  const deviceFiles = allEntities.filter(
    (e) =>
      e.key &&
      !e.key.endsWith("/") &&
      e.key.startsWith(`${CONFIG_MGMT_DEVICES_DIR}/`) &&
      e.key.endsWith(".json")
  );

  const snapshots: ConfigManagementSnapshot[] = [];
  for (const file of deviceFiles) {
    try {
      const content = await fs.readFile(file.key!);
      const snapshot: ConfigManagementSnapshot = JSON.parse(ab2str(content));
      snapshots.push(snapshot);
    } catch {
      // 跳过无法解析的文件
    }
  }

  // 按保存时间降序排列
  snapshots.sort((a, b) => b.savedAt - a.savedAt);
  return snapshots;
};

/** 从远程删除指定设备的配置快照 */
export const deleteConfigFromRemote = async (
  fs: FakeFs,
  deviceId: string
): Promise<void> => {
  const snapshotKey = `${CONFIG_MGMT_DEVICES_DIR}/${deviceId}.json`;
  await fs.rm(snapshotKey);
};

/** 智能合并：将远程快照应用到本地设置 */
export const applySnapshotToLocal = (
  snapshot: ConfigManagementSnapshot,
  currentSettings: ObsSyncPluginSettings,
  currentDeviceId: string
): ObsSyncPluginSettings => {
  const remote = snapshot.pluginSettings;

  // 这些字段绝不覆盖（连接相关）
  const preserved: Partial<ObsSyncPluginSettings> = {
    webdav: currentSettings.webdav,
    onedrive: currentSettings.onedrive,
    password: currentSettings.password,
    serviceType: currentSettings.serviceType,
    encryptionMethod: currentSettings.encryptionMethod,
  };

  // 合并 deviceProfiles：当前设备的 profile 保持不变，导入其他设备的
  const mergedProfiles: Record<string, DeviceConfigProfile> = {
    ...(snapshot.deviceProfiles ?? {}),
  };
  // 保留当前设备的本地 profile
  if (currentSettings.deviceProfiles?.[currentDeviceId]) {
    mergedProfiles[currentDeviceId] =
      currentSettings.deviceProfiles[currentDeviceId];
  }

  return {
    ...currentSettings,
    ...remote,
    ...preserved,
    deviceProfiles: mergedProfiles,
  };
};
