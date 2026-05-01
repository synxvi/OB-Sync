import assert from "node:assert/strict";
import type { DataAdapter, ListedFiles } from "obsidian";
import type { DeviceConfigProfile } from "../src/baseTypes";
import {
  cleanPluginOverrides,
  countPluginOverrides,
  listInstalledPluginIds,
} from "../src/pluginSync";

class MockAdapter implements Partial<DataAdapter> {
  constructor(
    private readonly folders: string[],
    private readonly readableFiles: Set<string>,
    private readonly shouldFailList = false
  ) {}

  async list(_path: string): Promise<ListedFiles> {
    if (this.shouldFailList) {
      throw new Error("missing folder");
    }

    return {
      files: [],
      folders: this.folders,
    };
  }

  async read(path: string): Promise<string> {
    if (!this.readableFiles.has(path)) {
      throw new Error(`missing file: ${path}`);
    }
    return "{}";
  }
}

const makeProfile = (
  overrides: Partial<DeviceConfigProfile> = {}
): DeviceConfigProfile => ({
  deviceId: "desktop",
  deviceName: "Desktop",
  platform: "desktop",
  registeredAt: 1,
  categorySyncModes: {},
  ...overrides,
});

describe("pluginSync", () => {
  it("lists plugins from actual plugin directories with manifests", async () => {
    const adapter = new MockAdapter(
      [
        ".obsidian/plugins/calendar",
        ".obsidian/plugins/deleted-plugin",
        ".obsidian/plugins/ob-sync",
      ],
      new Set([
        ".obsidian/plugins/calendar/manifest.json",
        ".obsidian/plugins/ob-sync/manifest.json",
      ])
    );

    const pluginIds = await listInstalledPluginIds(
      adapter as unknown as DataAdapter,
      ".obsidian",
      "ob-sync"
    );

    assert.deepEqual(pluginIds, ["calendar"]);
  });

  it("returns an empty plugin list when the plugins directory is missing", async () => {
    const adapter = new MockAdapter([], new Set(), true);

    const pluginIds = await listInstalledPluginIds(
      adapter as unknown as DataAdapter,
      ".obsidian",
      "ob-sync"
    );

    assert.deepEqual(pluginIds, []);
  });

  it("cleans stale per-plugin overrides from every device profile", () => {
    const profiles = {
      desktop: makeProfile({
        pullOnlyPlugins: ["calendar", "deleted-plugin"],
        pushOnlyPlugins: ["another-deleted-plugin"],
        skipPlugins: ["tasks"],
      }),
      mobile: makeProfile({
        deviceId: "mobile",
        pullOnlyPlugins: ["deleted-plugin"],
        skipPlugins: ["calendar"],
      }),
    };

    const cleaned = cleanPluginOverrides(profiles, ["calendar", "tasks"]);

    assert.equal(cleaned, 3);
    assert.deepEqual(profiles.desktop.pullOnlyPlugins, ["calendar"]);
    assert.deepEqual(profiles.desktop.pushOnlyPlugins, []);
    assert.deepEqual(profiles.desktop.skipPlugins, ["tasks"]);
    assert.deepEqual(profiles.mobile.pullOnlyPlugins, []);
    assert.deepEqual(profiles.mobile.skipPlugins, ["calendar"]);
  });

  it("counts stale overrides so the refresh button can still be shown", () => {
    const profiles = {
      desktop: makeProfile({
        pullOnlyPlugins: ["deleted-plugin"],
        pushOnlyPlugins: ["another-deleted-plugin"],
      }),
    };

    assert.equal(countPluginOverrides(profiles), 2);
  });
});
