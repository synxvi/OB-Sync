/**
 * Only type defs here.
 * To avoid circular dependency.
 */

import type { LangTypeAndAuto } from "./i18n";

declare global {
  var DEFAULT_ONEDRIVE_CLIENT_ID: string;
  var DEFAULT_ONEDRIVE_AUTHORITY: string;
}

export const ONEDRIVE_CLIENT_ID = global.DEFAULT_ONEDRIVE_CLIENT_ID;
export const ONEDRIVE_AUTHORITY = global.DEFAULT_ONEDRIVE_AUTHORITY;

export const DEFAULT_CONTENT_TYPE = "application/octet-stream";

export type SUPPORTED_SERVICES_TYPE = "webdav" | "onedrive";

export type SUPPORTED_SERVICES_TYPE_WITH_REMOTE_BASE_DIR =
  SUPPORTED_SERVICES_TYPE;

export type WebdavAuthType = "digest" | "basic";
export type WebdavDepthType =
  | "auto" // deprecated on 20240116
  | "auto_unknown" // deprecated on 20240116
  | "auto_1" // deprecated on 20240116
  | "auto_infinity" // deprecated on 20240116
  | "manual_1"
  | "manual_infinity";

export interface WebdavConfig {
  address: string;
  username: string;
  password: string;
  authType: WebdavAuthType;

  depth?: WebdavDepthType;
  remoteBaseDir?: string;

  customHeaders?: string;

  /**
   * @deprecated
   */
  manualRecursive: boolean; // deprecated in 0.3.6, use depth
}

export interface OnedriveConfig {
  accessToken: string;
  clientID: string;
  authority: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  accessTokenExpiresAtTime: number;
  deltaLink: string;
  username: string;
  credentialsShouldBeDeletedAtTime?: number;
  remoteBaseDir?: string;
  emptyFile: "skip" | "error";
  kind: "onedrive";
}

export type SyncDirectionType =
  | "bidirectional"
  | "incremental_pull_only"
  | "incremental_push_only"
  | "incremental_pull_and_delete_only"
  | "incremental_push_and_delete_only";

export type CipherMethodType = "rclone-base64" | "openssl-base64" | "unknown";

export type QRExportType = "basic_and_advanced" | SUPPORTED_SERVICES_TYPE;

export interface ProfilerConfig {
  enable?: boolean;
  enablePrinting?: boolean;
  recordSize?: boolean;
}

export interface ObsSyncPluginSettings {
  webdav: WebdavConfig;
  onedrive: OnedriveConfig;

  password: string;
  serviceType: SUPPORTED_SERVICES_TYPE;
  currLogLevel?: string;
  autoRunEveryMilliseconds?: number;
  initRunAfterMilliseconds?: number;
  syncOnSaveAfterMilliseconds?: number;

  concurrency?: number;
  syncUnderscoreItems?: boolean;
  lang?: LangTypeAndAuto;
  agreeToUseSyncV3?: boolean;
  skipSizeLargerThan?: number;
  ignorePaths?: string[];
  onlyAllowPaths?: string[];
  enableStatusBarInfo?: boolean;
  deleteToWhere?: "system" | "obsidian";
  conflictAction?: ConflictActionType;

  protectModifyPercentage?: number;
  syncDirection?: SyncDirectionType;

  obfuscateSettingFile?: boolean;

  enableMobileStatusBar?: boolean;

  encryptionMethod?: CipherMethodType;

  profiler?: ProfilerConfig;

  /**
   * @deprecated
   */
  agreeToUploadExtraMetadata?: boolean;

  /**
   * @deprecated
   */
  vaultRandomID?: string;

  /**
   * @deprecated
   */
  logToDB?: boolean;

  /**
   * @deprecated
   */
  howToCleanEmptyFolder?: EmptyFolderCleanType;

  /** 启用设备级配置同步模式 */
  enableDeviceConfigSync?: boolean;
  /** 设备配置档案，key 为 deviceId */
  deviceProfiles?: Record<string, DeviceConfigProfile>;
}

export const COMMAND_URI = "ob-sync";
export const COMMAND_CALLBACK = "ob-sync-cb";
export const COMMAND_CALLBACK_ONEDRIVE = "ob-sync-cb-onedrive";

export interface UriParams {
  func?: string;
  vault?: string;
  ver?: string;
  data?: string;
}

// 80 days
export const OAUTH2_FORCE_EXPIRE_MILLISECONDS = 1000 * 60 * 60 * 24 * 80;

export type EmptyFolderCleanType = "skip" | "clean_both";

export type ConflictActionType =
  | "keep_newer"
  | "keep_larger"
  | "smart_conflict";

/** 配置同步类别：.obsidian 下的文件分组 */
export type ConfigSyncCategory =
  | "appearance"
  | "app"
  | "bookmarks"
  | "communityPlugins"
  | "corePlugins"
  | "hotkeys"
  | "graph"
  | "snippets"
  | "themes"
  | "pluginsData";

/** 配置同步模式 */
export type ConfigSyncMode = "sync" | "pull_only" | "push_only" | "skip";

/** 设备配置档案 */
export interface DeviceConfigProfile {
  deviceId: string;
  deviceName: string;
  platform: "desktop" | "mobile";
  registeredAt: number;
  /** 每个类别的同步模式，未设置的类别默认为 "sync" */
  categorySyncModes: Partial<Record<ConfigSyncCategory, ConfigSyncMode>>;
  /** 仅拉取的插件 ID 列表 */
  pullOnlyPlugins?: string[];
  /** 完全跳过的插件 ID 列表 */
  skipPlugins?: string[];
}

/** 配置管理远程存储目录 */
export const CONFIG_MGMT_DIR = ".obsidian-sync-config-mgmt";
export const CONFIG_MGMT_DEVICES_DIR = `${CONFIG_MGMT_DIR}/devices`;
export const CONFIG_MGMT_MANIFEST = `${CONFIG_MGMT_DIR}/manifest.json`;
export const CONFIG_MGMT_SNAPSHOT_VERSION = 1;

/** 远程配置快照 */
export interface ConfigManagementSnapshot {
  version: number;
  savedAt: number;
  savedByDeviceId: string;
  savedByDeviceName: string;
  pluginVersion: string;
  pluginSettings: Partial<ObsSyncPluginSettings>;
  deviceProfiles: Record<string, DeviceConfigProfile>;
}

/** 所有配置类别常量列表 */
export const ALL_CONFIG_SYNC_CATEGORIES: ConfigSyncCategory[] = [
  "appearance",
  "app",
  "bookmarks",
  "communityPlugins",
  "corePlugins",
  "hotkeys",
  "graph",
  "snippets",
  "themes",
  "pluginsData",
];

export type DecisionTypeForMixedEntity =
  | "only_history"
  | "equal"
  | "local_is_modified_then_push"
  | "remote_is_modified_then_pull"
  | "local_is_created_then_push"
  | "remote_is_created_then_pull"
  | "local_is_created_too_large_then_do_nothing"
  | "remote_is_created_too_large_then_do_nothing"
  | "local_is_deleted_thus_also_delete_remote"
  | "remote_is_deleted_thus_also_delete_local"
  | "conflict_created_then_keep_local"
  | "conflict_created_then_keep_remote"
  | "conflict_created_then_smart_conflict"
  | "conflict_created_then_do_nothing"
  | "conflict_modified_then_keep_local"
  | "conflict_modified_then_keep_remote"
  | "conflict_modified_then_smart_conflict"
  | "folder_existed_both_then_do_nothing"
  | "folder_existed_local_then_also_create_remote"
  | "folder_existed_remote_then_also_create_local"
  | "folder_to_be_created"
  | "folder_to_skip"
  | "folder_to_be_deleted_on_both"
  | "folder_to_be_deleted_on_remote"
  | "folder_to_be_deleted_on_local";

/**
 * uniform representation
 * everything should be flat and primitive, so that we can copy.
 */
export interface Entity {
  key?: string;
  keyEnc?: string;
  keyRaw: string;
  mtimeCli?: number;
  mtimeCliFmt?: string;
  ctimeCli?: number;
  ctimeCliFmt?: string;
  mtimeSvr?: number;
  mtimeSvrFmt?: string;
  prevSyncTime?: number;
  prevSyncTimeFmt?: string;
  size?: number; // might be unknown or to be filled
  sizeEnc?: number;
  sizeRaw: number;
  hash?: string;
  etag?: string;
  synthesizedFolder?: boolean;
  synthesizedFile?: boolean;
}

export interface UploadedType {
  entity: Entity;
  mtimeCli?: number;
}

/**
 * A replacement of FileOrFolderMixedState
 */
export interface MixedEntity {
  key: string;
  local?: Entity;
  prevSync?: Entity;
  remote?: Entity;

  decisionBranch?: number;
  decision?: DecisionTypeForMixedEntity;
  conflictAction?: ConflictActionType;

  change?: boolean;

  sideNotes?: Record<string, unknown>;
}

/**
 * @deprecated
 */
export interface FileOrFolderMixedState {
  key: string;
  existLocal?: boolean;
  existRemote?: boolean;
  mtimeLocal?: number;
  mtimeRemote?: number;
  deltimeLocal?: number;
  deltimeRemote?: number;
  sizeLocal?: number;
  sizeLocalEnc?: number;
  sizeRemote?: number;
  sizeRemoteEnc?: number;
  changeRemoteMtimeUsingMapping?: boolean;
  changeLocalMtimeUsingMapping?: boolean;
  decision?: string; // old DecisionType is deleted, fallback to string
  decisionBranch?: number;
  syncDone?: "done";
  remoteEncryptedKey?: string;

  mtimeLocalFmt?: string;
  mtimeRemoteFmt?: string;
  deltimeLocalFmt?: string;
  deltimeRemoteFmt?: string;
}

export const DEFAULT_DEBUG_FOLDER = "_debug_ob_sync/";
export const DEFAULT_SYNC_PLANS_HISTORY_FILE_PREFIX =
  "sync_plans_hist_exported_on_";
export const DEFAULT_LOG_HISTORY_FILE_PREFIX = "log_hist_exported_on_";
export const DEFAULT_PROFILER_RESULT_FILE_PREFIX =
  "profiler_results_exported_on_";

export type SyncTriggerSourceType =
  | "manual"
  | "dry"
  | "auto"
  | "auto_once_init"
  | "auto_sync_on_save";

export const OBSYNC_VERSION_2022 = "0.3.25";
export const OBSYNC_VERSION_2024PREPARE = "0.3.32";
