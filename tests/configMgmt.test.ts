import assert from "node:assert/strict";
import type {
  ConfigManagementSnapshot,
  ObsSyncPluginSettings,
} from "../src/baseTypes";
import { applySnapshotToLocal } from "../src/configMgmt";

const makeSettings = (
  overrides: Partial<ObsSyncPluginSettings> = {}
): ObsSyncPluginSettings =>
  ({
    webdav: {
      address: "https://local.example",
      username: "local-user",
      password: "local-password",
      authType: "basic",
      manualRecursive: true,
    },
    onedrive: {
      accessToken: "local-access",
      clientID: "local-client",
      authority: "local-authority",
      refreshToken: "local-refresh",
      accessTokenExpiresInSeconds: 0,
      accessTokenExpiresAtTime: 0,
      deltaLink: "",
      username: "",
      remoteBaseDir: "",
      emptyFile: "skip",
      kind: "onedrive",
    },
    password: "local-e2e-password",
    serviceType: "webdav",
    deviceProfiles: {},
    ...overrides,
  }) as ObsSyncPluginSettings;

const makeSnapshot = (
  overrides: Partial<ConfigManagementSnapshot> = {}
): ConfigManagementSnapshot => ({
  version: 1,
  savedAt: 1,
  savedByDeviceId: "remote-device",
  savedByDeviceName: "Remote Device",
  pluginVersion: "1.5.2",
  pluginSettings: {},
  deviceProfiles: {},
  ...overrides,
});

describe("applySnapshotToLocal (device-isolation model)", () => {
  it("keeps the current device's profile fully authoritative; never adopts remote's view of it", () => {
    // 当前设备是 mobile，本地 profile 与快照里「别人写的 mobile profile」完全冲突。
    const current = makeSettings({
      deviceProfiles: {
        mobile: {
          deviceId: "mobile",
          deviceName: "Local Mobile",
          platform: "mobile",
          registeredAt: 1,
          categorySyncModes: { themes: "skip" },
          pullOnlyPlugins: [],
          skipPlugins: [],
        },
      },
    });
    const snapshot = makeSnapshot({
      savedByDeviceId: "desktop",
      savedByDeviceName: "Desktop",
      pluginSettings: {
        serviceType: "onedrive",
        enableDeviceConfigSync: true,
      },
      // desktop 在自己的快照里「记忆」了 mobile 的样子 —— 但这对 mobile 无权威。
      deviceProfiles: {
        mobile: {
          deviceId: "mobile",
          deviceName: "Remote Mobile",
          platform: "mobile",
          registeredAt: 2,
          categorySyncModes: { themes: "pull_only", pluginsData: "skip" },
          pullOnlyPlugins: ["calendar"],
          skipPlugins: ["large-plugin"],
        },
      },
    });

    const applied = applySnapshotToLocal(snapshot, current, "mobile");

    // 连接相关字段保留本地
    assert.equal(applied.serviceType, "webdav");
    assert.equal(applied.webdav.password, "local-password");
    // 当前设备 profile 完全自治：所有字段都是本地的，远程一律不覆盖
    assert.equal(applied.deviceProfiles?.mobile.deviceName, "Local Mobile");
    assert.equal(
      applied.deviceProfiles?.mobile.categorySyncModes.themes,
      "skip"
    );
    assert.equal(
      applied.deviceProfiles?.mobile.categorySyncModes.pluginsData,
      undefined
    );
    assert.deepEqual(applied.deviceProfiles?.mobile.skipPlugins, []);
  });

  it("adopts the author's own profile as authoritative", () => {
    // 用户点「应用 desktop 快照」：desktop 对自己的 profile 有写权，应无条件采纳。
    const current = makeSettings({
      deviceProfiles: {
        mobile: {
          deviceId: "mobile",
          deviceName: "Local Mobile",
          platform: "mobile",
          registeredAt: 1,
          categorySyncModes: { themes: "skip" },
          pullOnlyPlugins: [],
          skipPlugins: [],
        },
        desktop: {
          deviceId: "desktop",
          deviceName: "Stale Desktop",
          platform: "desktop",
          registeredAt: 1,
          categorySyncModes: { hotkeys: "skip" },
          pullOnlyPlugins: [],
          skipPlugins: [],
        },
      },
    });
    const snapshot = makeSnapshot({
      savedByDeviceId: "desktop",
      savedByDeviceName: "Fresh Desktop",
      deviceProfiles: {
        desktop: {
          deviceId: "desktop",
          deviceName: "Fresh Desktop",
          platform: "desktop",
          registeredAt: 2,
          categorySyncModes: { themes: "pull_only", hotkeys: "push_only" },
          pullOnlyPlugins: ["calendar"],
          pushOnlyPlugins: ["tasks"],
          skipPlugins: ["large-plugin"],
        },
      },
    });

    const applied = applySnapshotToLocal(snapshot, current, "mobile");

    // 作者对自己 profile 的写入权威：本地旧 desktop 被远程覆盖
    assert.equal(applied.deviceProfiles?.desktop.deviceName, "Fresh Desktop");
    assert.equal(
      applied.deviceProfiles?.desktop.categorySyncModes.themes,
      "pull_only"
    );
    assert.equal(
      applied.deviceProfiles?.desktop.categorySyncModes.hotkeys,
      "push_only"
    );
    assert.deepEqual(applied.deviceProfiles?.desktop.skipPlugins, [
      "large-plugin",
    ]);
    // 同时当前设备保持自治
    assert.equal(applied.deviceProfiles?.mobile.deviceName, "Local Mobile");
  });

  it("introduces a third-party device profile when local has never seen it", () => {
    // 本地只有 mobile，快照作者 desktop 在自己的记忆里带了一个 tablet。
    // 本地一无所有 → 引入（首次见到），即使可能陈旧也比缺失好。
    const current = makeSettings({
      deviceProfiles: {
        mobile: {
          deviceId: "mobile",
          deviceName: "Local Mobile",
          platform: "mobile",
          registeredAt: 1,
          categorySyncModes: { themes: "skip" },
          pullOnlyPlugins: [],
          skipPlugins: [],
        },
      },
    });
    const snapshot = makeSnapshot({
      savedByDeviceId: "desktop",
      savedByDeviceName: "Desktop",
      deviceProfiles: {
        desktop: {
          deviceId: "desktop",
          deviceName: "Desktop",
          platform: "desktop",
          registeredAt: 2,
          categorySyncModes: { themes: "skip" },
          pullOnlyPlugins: [],
          skipPlugins: [],
        },
        tablet: {
          deviceId: "tablet",
          deviceName: "Tablet (from desktop memory)",
          platform: "mobile",
          registeredAt: 1,
          categorySyncModes: { graph: "pull_only" },
          pullOnlyPlugins: [],
          skipPlugins: [],
        },
      },
    });

    const applied = applySnapshotToLocal(snapshot, current, "mobile");

    assert.equal(
      applied.deviceProfiles?.tablet.deviceName,
      "Tablet (from desktop memory)"
    );
    assert.equal(applied.deviceProfiles?.desktop.deviceName, "Desktop");
  });

  it("ignores the author's stale memory of a third-party device when local already has it", () => {
    // 本地已有 tablet 的较新 profile；desktop 的快照里带着一份旧的 tablet 记忆。
    // desktop 不是 tablet 的作者 → 它对 tablet 的二手记忆不可信 → 保留本地。
    const current = makeSettings({
      deviceProfiles: {
        mobile: {
          deviceId: "mobile",
          deviceName: "Local Mobile",
          platform: "mobile",
          registeredAt: 1,
          categorySyncModes: { themes: "skip" },
          pullOnlyPlugins: [],
          skipPlugins: [],
        },
        tablet: {
          deviceId: "tablet",
          deviceName: "Fresh Tablet",
          platform: "mobile",
          registeredAt: 5,
          categorySyncModes: { themes: "sync" },
          pullOnlyPlugins: [],
          skipPlugins: [],
        },
      },
    });
    const snapshot = makeSnapshot({
      savedByDeviceId: "desktop",
      savedByDeviceName: "Desktop",
      deviceProfiles: {
        desktop: {
          deviceId: "desktop",
          deviceName: "Desktop",
          platform: "desktop",
          registeredAt: 2,
          categorySyncModes: { themes: "skip" },
          pullOnlyPlugins: [],
          skipPlugins: [],
        },
        tablet: {
          deviceId: "tablet",
          deviceName: "Stale Tablet (desktop memory)",
          platform: "mobile",
          registeredAt: 1,
          categorySyncModes: { themes: "pull_only" },
          pullOnlyPlugins: ["old-plugin"],
          skipPlugins: [],
        },
      },
    });

    const applied = applySnapshotToLocal(snapshot, current, "mobile");

    // 保留本地的 Fresh Tablet，丢弃 desktop 对 tablet 的二手记忆
    assert.equal(applied.deviceProfiles?.tablet.deviceName, "Fresh Tablet");
    assert.equal(
      applied.deviceProfiles?.tablet.categorySyncModes.themes,
      "sync"
    );
    assert.deepEqual(applied.deviceProfiles?.tablet.pullOnlyPlugins, []);
    // desktop 自己的 profile 仍然被采纳
    assert.equal(applied.deviceProfiles?.desktop.deviceName, "Desktop");
  });

  it("merges non-device-bound global settings from pluginSettings", () => {
    // pluginSettings 里的全局配置（如 lang）仍走远程覆盖，这是设备隔离模型之外的合并路径。
    const current = makeSettings({
      lang: "en",
      concurrency: 3,
      deviceProfiles: {
        mobile: {
          deviceId: "mobile",
          deviceName: "Local Mobile",
          platform: "mobile",
          registeredAt: 1,
          categorySyncModes: {},
          pullOnlyPlugins: [],
          skipPlugins: [],
        },
      },
    });
    const snapshot = makeSnapshot({
      savedByDeviceId: "desktop",
      savedByDeviceName: "Desktop",
      pluginSettings: {
        lang: "zh_cn",
        concurrency: 8,
        // 连接字段在快照里即使存在，也必须被本地 preserved 字段保护
        webdav: {
          address: "https://remote.example",
          username: "remote-user",
          password: "should-not-apply",
          authType: "basic",
          manualRecursive: true,
        },
      },
      deviceProfiles: {},
    });

    const applied = applySnapshotToLocal(snapshot, current, "mobile");

    // 全局非敏感配置：远程覆盖
    assert.equal(applied.lang, "zh_cn");
    assert.equal(applied.concurrency, 8);
    // 连接相关字段：本地保留（preserved 优先级最高）
    assert.equal(applied.webdav.address, "https://local.example");
    assert.equal(applied.webdav.password, "local-password");
  });
});
