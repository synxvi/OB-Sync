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

/**
 * 设备隔离模型下的合并：将远程单个快照应用到本地设置。
 *
 * 权威来源（device isolation）：
 *  - 每台设备的 profile 只由该设备自己写入（远程 `devices/<deviceId>.json`），
 *    因此一个快照只对它自己的作者（`savedByDeviceId`）的 profile 有权威；
 *  - 快照里对「当前设备」的描述只是作者的二手记忆，一律丢弃，本设备完全自治；
 *  - 任何设备在本地缺失的 profile，可从快照中引入（首次见到该设备的场景）。
 *
 * 这样「A 设备的设置覆盖 B 设备的设置」从架构上无法发生。
 *
 * 注：pluginSettings（lang / conflictAction 等非设备绑定全局配置）仍走「远程覆盖本地」，
 * 这些字段的多方写冲突需要后续通过字段级时间戳根治，不在本次修复范围内。
 */
export const applySnapshotToLocal = (
  snapshot: ConfigManagementSnapshot,
  currentSettings: ObsSyncPluginSettings,
  currentDeviceId: string
): ObsSyncPluginSettings => {
  const remote = snapshot.pluginSettings;
  const author = snapshot.savedByDeviceId;

  // 这些字段绝不覆盖（连接相关）
  const preserved: Partial<ObsSyncPluginSettings> = {
    webdav: currentSettings.webdav,
    onedrive: currentSettings.onedrive,
    password: currentSettings.password,
    serviceType: currentSettings.serviceType,
    encryptionMethod: currentSettings.encryptionMethod,
  };

  // 以本地 profile 为基底，逐个决定每个设备 profile 的去留。
  const mergedProfiles: Record<string, DeviceConfigProfile> = {
    ...(currentSettings.deviceProfiles ?? {}),
  };

  for (const [deviceId, remoteProfile] of Object.entries(
    snapshot.deviceProfiles ?? {}
  )) {
    if (deviceId === currentDeviceId) {
      // 当前设备的 profile 完全自治：忽略远程对它的任何描述。
      // 本地已有则保留本地；本地缺失（首次注册前的极端情况）也跳过，
      // 由 main.ts 的设备自注册逻辑负责补齐，绝不接受他人代写。
      continue;
    }

    const localProfile = mergedProfiles[deviceId];
    if (deviceId === author) {
      // 作者对自己 profile 的写入是权威的：无条件采纳。
      mergedProfiles[deviceId] = remoteProfile;
    } else if (!localProfile) {
      // 非作者、且本地没有该设备 profile：作为「首次见到」引入。
      // （作者记忆中的第三方设备可能陈旧，但本地一无所有时引入总比缺失好。）
      mergedProfiles[deviceId] = remoteProfile;
    }
    // 其它情况（非作者 + 本地已有）：保留本地，作者对该设备的二手记忆不可信。
  }

  return {
    ...currentSettings,
    ...remote,
    ...preserved,
    deviceProfiles: mergedProfiles,
  };
};
