import assert from "node:assert/strict";
import { isSelfPluginSyncSkippedPath } from "../src/selfPluginSyncFilter";

describe("isSelfPluginSyncSkippedPath", () => {
  it("skips this plugin runtime settings", () => {
    assert.equal(
      isSelfPluginSyncSkippedPath(
        ".obsidian/plugins/ob-sync/data.json",
        ".obsidian",
        "ob-sync"
      ),
      true
    );
  });

  it("allows this plugin distribution files", () => {
    assert.equal(
      isSelfPluginSyncSkippedPath(
        ".obsidian/plugins/ob-sync/main.js",
        ".obsidian",
        "ob-sync"
      ),
      false
    );
    assert.equal(
      isSelfPluginSyncSkippedPath(
        ".obsidian/plugins/ob-sync/manifest.json",
        ".obsidian",
        "ob-sync"
      ),
      false
    );
  });

  it("does not affect other plugins", () => {
    assert.equal(
      isSelfPluginSyncSkippedPath(
        ".obsidian/plugins/calendar/data.json",
        ".obsidian",
        "ob-sync"
      ),
      false
    );
  });
});
