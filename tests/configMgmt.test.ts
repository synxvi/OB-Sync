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
  pluginVersion: "1.5.1",
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

  it("keeps the current device profile when the snapshot lacks it", () => {
    const current = makeSettings({
      deviceProfiles: {
        mobile: {
          deviceId: "mobile",
          deviceName: "Local Mobile",
          platform: "mobile",
          registeredAt: 1,
          categorySyncModes: { hotkeys: "pull_only" },
          pullOnlyPlugins: [],
          skipPlugins: [],
        },
      },
    });
    const snapshot = makeSnapshot({
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
      },
    });

    const applied = applySnapshotToLocal(snapshot, current, "mobile");

    assert.equal(applied.deviceProfiles?.mobile.deviceName, "Local Mobile");
    assert.equal(
      applied.deviceProfiles?.mobile.categorySyncModes.hotkeys,
      "pull_only"
    );
    assert.equal(applied.deviceProfiles?.desktop.deviceName, "Desktop");
  });
});
