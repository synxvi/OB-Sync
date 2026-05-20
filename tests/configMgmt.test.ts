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

describe("applySnapshotToLocal", () => {
  it("restores the current device profile when the snapshot contains it", () => {
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
      pluginSettings: {
        serviceType: "onedrive",
        enableDeviceConfigSync: true,
      },
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

    assert.equal(applied.serviceType, "webdav");
    assert.equal(applied.webdav.password, "local-password");
    assert.equal(applied.deviceProfiles?.mobile.deviceName, "Remote Mobile");
    assert.equal(
      applied.deviceProfiles?.mobile.categorySyncModes.themes,
      "pull_only"
    );
    assert.deepEqual(applied.deviceProfiles?.mobile.skipPlugins, [
      "large-plugin",
    ]);
  });

  it("inherits sender config sync prefs when the snapshot lacks the current device", () => {
    const current = makeSettings({
      deviceProfiles: {
        mobile: {
          deviceId: "mobile",
          deviceName: "Local Mobile",
          platform: "mobile",
          registeredAt: 1,
          categorySyncModes: { hotkeys: "pull_only" },
          pullOnlyPlugins: [],
          pushOnlyPlugins: [],
          skipPlugins: [],
        },
      },
    });
    const snapshot = makeSnapshot({
      savedByDeviceId: "desktop",
      deviceProfiles: {
        desktop: {
          deviceId: "desktop",
          deviceName: "Desktop",
          platform: "desktop",
          registeredAt: 2,
          categorySyncModes: { themes: "skip", hotkeys: "push_only" },
          pullOnlyPlugins: ["calendar"],
          pushOnlyPlugins: ["tasks"],
          skipPlugins: ["large-plugin"],
        },
      },
    });

    const applied = applySnapshotToLocal(snapshot, current, "mobile");

    // 身份信息保留本地
    assert.equal(applied.deviceProfiles?.mobile.deviceName, "Local Mobile");
    assert.equal(applied.deviceProfiles?.mobile.platform, "mobile");
    assert.equal(applied.deviceProfiles?.mobile.deviceId, "mobile");
    // 配置同步偏好从发送端继承
    assert.equal(
      applied.deviceProfiles?.mobile.categorySyncModes.themes,
      "skip"
    );
    assert.equal(
      applied.deviceProfiles?.mobile.categorySyncModes.hotkeys,
      "push_only"
    );
    assert.deepEqual(applied.deviceProfiles?.mobile.pullOnlyPlugins, [
      "calendar",
    ]);
    assert.deepEqual(applied.deviceProfiles?.mobile.pushOnlyPlugins, [
      "tasks",
    ]);
    assert.deepEqual(applied.deviceProfiles?.mobile.skipPlugins, [
      "large-plugin",
    ]);
    // 远程设备的 profile 也被合并进来
    assert.equal(applied.deviceProfiles?.desktop.deviceName, "Desktop");
  });

  it("keeps the current device profile as-is when both snapshot and sender lack it", () => {
    const current = makeSettings({
      deviceProfiles: {
        mobile: {
          deviceId: "mobile",
          deviceName: "Local Mobile",
          platform: "mobile",
          registeredAt: 1,
          categorySyncModes: { hotkeys: "pull_only" },
          pullOnlyPlugins: [],
          pushOnlyPlugins: [],
          skipPlugins: [],
        },
      },
    });
    // snapshot 没有任何 deviceProfiles
    const snapshot = makeSnapshot({
      savedByDeviceId: "unknown-device",
      deviceProfiles: {},
    });

    const applied = applySnapshotToLocal(snapshot, current, "mobile");

    // 发送端也没有 profile，本地保持不变
    assert.equal(applied.deviceProfiles?.mobile.deviceName, "Local Mobile");
    assert.equal(
      applied.deviceProfiles?.mobile.categorySyncModes.hotkeys,
      "pull_only"
    );
  });
});
