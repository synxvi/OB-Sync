import { Eye, EyeOff, createElement } from "lucide";
import {
  type App,
  Modal,
  Notice,
  Platform,
  PluginSettingTab,
  Setting,
} from "obsidian";
import type { TextComponent } from "obsidian";
import type {
  ConfigManagementSnapshot,
  ConfigSyncCategory,
  ConfigSyncMode,
  ConflictActionType,
  DeviceConfigProfile,
  EmptyFolderCleanType,
  QRExportType,
  SUPPORTED_SERVICES_TYPE,
  SUPPORTED_SERVICES_TYPE_WITH_REMOTE_BASE_DIR,
  SyncDirectionType,
  WebdavAuthType,
} from "./baseTypes";
import { ALL_CONFIG_SYNC_CATEGORIES } from "./baseTypes";

import cloneDeep from "lodash/cloneDeep";
import { generateClearDupFilesSettingsPart } from "../pro/src/settingsClearDupFiles";
import { VALID_REQURL } from "./baseTypesObs";
import { messyConfigToNormal } from "./configPersist";
import {
  applySnapshotToLocal,
  buildConfigSnapshot,
  deleteConfigFromRemote,
  pullConfigsFromRemote,
  saveConfigToRemote,
} from "./configMgmt";
import {
  exportVaultProfilerResultsToFiles,
  exportVaultSyncPlansToFiles,
} from "./debugMode";
import { getClient } from "./fsGetter";
import {
  DEFAULT_ONEDRIVE_CONFIG,
  getAuthUrlAndVerifier as getAuthUrlAndVerifierOnedrive,
} from "./fsOnedrive";
import type { TransItemType } from "./i18n";
import {
  exportQrCodeUri,
  importQrCodeUri,
  parseUriByHand,
} from "./importExport";
import {
  clearAllPrevSyncRecordByVault,
  clearAllSyncPlanRecords,
  destroyDBs,
  upsertLastFailedSyncTimeByVault,
  upsertLastSuccessSyncTimeByVault,
} from "./localdb";
import type ObsSyncPlugin from "./main"; // unavoidable
import {
  changeMobileStatusBar,
  checkHasSpecialCharForDir,
  stringToFragment,
} from "./misc";
import { DEFAULT_PROFILER_CONFIG } from "./profiler";

export class ChangeRemoteBaseDirModal extends Modal {
  readonly plugin: ObsSyncPlugin;
  readonly newRemoteBaseDir: string;
  readonly service: SUPPORTED_SERVICES_TYPE_WITH_REMOTE_BASE_DIR;
  constructor(
    app: App,
    plugin: ObsSyncPlugin,
    newRemoteBaseDir: string,
    service: SUPPORTED_SERVICES_TYPE_WITH_REMOTE_BASE_DIR
  ) {
    super(app);
    this.plugin = plugin;
    this.newRemoteBaseDir = newRemoteBaseDir;
    this.service = service;
  }

  onOpen() {
    const { contentEl } = this;

    const t = (x: TransItemType, vars?: any) => {
      return this.plugin.i18n.t(x, vars);
    };

    contentEl.createEl("h2", { text: t("modal_remotebasedir_title") });
    t("modal_remotebasedir_shortdesc")
      .split("\n")
      .forEach((val, idx) => {
        contentEl.createEl("p", {
          text: val,
        });
      });

    if (
      this.newRemoteBaseDir === "" ||
      this.newRemoteBaseDir === this.app.vault.getName()
    ) {
      new Setting(contentEl)
        .addButton((button) => {
          button.setButtonText(
            t("modal_remotebasedir_secondconfirm_vaultname")
          );
          button.onClick(async () => {
            // in the settings, the value is reset to the special case ""
            this.plugin.settings[this.service].remoteBaseDir = "";
            await this.plugin.saveSettings();
            new Notice(t("modal_remotebasedir_notice"));
            this.close();
          });
          button.setClass("remotebasedir-second-confirm");
        })
        .addButton((button) => {
          button.setButtonText(t("goback"));
          button.onClick(() => {
            this.close();
          });
        });
    } else if (checkHasSpecialCharForDir(this.newRemoteBaseDir)) {
      contentEl.createEl("p", {
        text: t("modal_remotebasedir_invaliddirhint"),
      });
      new Setting(contentEl).addButton((button) => {
        button.setButtonText(t("goback"));
        button.onClick(() => {
          this.close();
        });
      });
    } else {
      new Setting(contentEl)
        .addButton((button) => {
          button.setButtonText(t("modal_remotebasedir_secondconfirm_change"));
          button.onClick(async () => {
            this.plugin.settings[this.service].remoteBaseDir =
              this.newRemoteBaseDir;
            await this.plugin.saveSettings();
            new Notice(t("modal_remotebasedir_notice"));
            this.close();
          });
          button.setClass("remotebasedir-second-confirm");
        })
        .addButton((button) => {
          button.setButtonText(t("goback"));
          button.onClick(() => {
            this.close();
          });
        });
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export class OnedriveAuthModal extends Modal {
  readonly plugin: ObsSyncPlugin;
  readonly authDiv: HTMLDivElement;
  readonly revokeAuthDiv: HTMLDivElement;
  readonly revokeAuthSetting: Setting;
  constructor(
    app: App,
    plugin: ObsSyncPlugin,
    authDiv: HTMLDivElement,
    revokeAuthDiv: HTMLDivElement,
    revokeAuthSetting: Setting
  ) {
    super(app);
    this.plugin = plugin;
    this.authDiv = authDiv;
    this.revokeAuthDiv = revokeAuthDiv;
    this.revokeAuthSetting = revokeAuthSetting;
  }

  async onOpen() {
    const { contentEl } = this;

    const { authUrl, verifier } = await getAuthUrlAndVerifierOnedrive(
      this.plugin.settings.onedrive.clientID,
      this.plugin.settings.onedrive.authority
    );
    this.plugin.oauth2Info.verifier = verifier;

    const t = (x: TransItemType, vars?: any) => {
      return this.plugin.i18n.t(x, vars);
    };

    t("modal_onedriveauth_shortdesc")
      .split("\n")
      .forEach((val) => {
        contentEl.createEl("p", {
          text: val,
        });
      });
    if (Platform.isLinux) {
      t("modal_onedriveauth_shortdesc_linux")
        .split("\n")
        .forEach((val) => {
          contentEl.createEl("p", {
            text: stringToFragment(val),
          });
        });
    }
    const div2 = contentEl.createDiv();
    div2.createEl(
      "button",
      {
        text: t("modal_onedriveauth_copybutton"),
      },
      (el) => {
        el.onclick = async () => {
          await navigator.clipboard.writeText(authUrl);
          new Notice(t("modal_onedriveauth_copynotice"));
        };
      }
    );

    contentEl.createEl("p").createEl("a", {
      href: authUrl,
      text: authUrl,
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export class OnedriveRevokeAuthModal extends Modal {
  readonly plugin: ObsSyncPlugin;
  readonly authDiv: HTMLDivElement;
  readonly revokeAuthDiv: HTMLDivElement;
  constructor(
    app: App,
    plugin: ObsSyncPlugin,
    authDiv: HTMLDivElement,
    revokeAuthDiv: HTMLDivElement
  ) {
    super(app);
    this.plugin = plugin;
    this.authDiv = authDiv;
    this.revokeAuthDiv = revokeAuthDiv;
  }

  async onOpen() {
    const { contentEl } = this;
    const t = (x: TransItemType, vars?: any) => {
      return this.plugin.i18n.t(x, vars);
    };

    contentEl.createEl("p", {
      text: t("modal_onedriverevokeauth_step1"),
    });
    const consentUrl = "https://microsoft.com/consent";
    contentEl.createEl("p").createEl("a", {
      href: consentUrl,
      text: consentUrl,
    });

    contentEl.createEl("p", {
      text: t("modal_onedriverevokeauth_step2"),
    });

    new Setting(contentEl)
      .setName(t("modal_onedriverevokeauth_clean"))
      .setDesc(t("modal_onedriverevokeauth_clean_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("modal_onedriverevokeauth_clean_button"));
        button.onClick(async () => {
          try {
            this.plugin.settings.onedrive = JSON.parse(
              JSON.stringify(DEFAULT_ONEDRIVE_CONFIG)
            );
            await this.plugin.saveSettings();
            this.authDiv.toggleClass(
              "onedrive-auth-button-hide",
              this.plugin.settings.onedrive.username !== ""
            );
            this.revokeAuthDiv.toggleClass(
              "onedrive-revoke-auth-button-hide",
              this.plugin.settings.onedrive.username === ""
            );
            new Notice(t("modal_onedriverevokeauth_clean_notice"));
            this.close();
          } catch (err) {
            console.error(err);
            new Notice(t("modal_onedriverevokeauth_clean_fail"));
          }
        });
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class ExportSettingsQrCodeModal extends Modal {
  plugin: ObsSyncPlugin;
  exportType: QRExportType;
  constructor(app: App, plugin: ObsSyncPlugin, exportType: QRExportType) {
    super(app);
    this.plugin = plugin;
    this.exportType = exportType;
  }

  async onOpen() {
    const { contentEl } = this;

    const t = (x: TransItemType, vars?: any) => {
      return this.plugin.i18n.t(x, vars);
    };

    const { rawUri, imgUri } = await exportQrCodeUri(
      this.plugin.settings,
      this.app.vault.getName(),
      this.plugin.manifest.version,
      this.exportType
    );

    const div1 = contentEl.createDiv();
    t("modal_qr_shortdesc")
      .split("\n")
      .forEach((val) => {
        div1.createEl("p", {
          text: val,
        });
      });

    const div2 = contentEl.createDiv();
    div2.createEl(
      "button",
      {
        text: t("modal_qr_button"),
      },
      (el) => {
        el.onclick = async () => {
          await navigator.clipboard.writeText(rawUri);
          new Notice(t("modal_qr_button_notice"));
        };
      }
    );

    const div3 = contentEl.createDiv();
    div3.createEl(
      "img",
      {
        cls: "qrcode-img",
      },
      async (el) => {
        el.src = imgUri;
      }
    );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

const getEyesElements = () => {
  const eyeEl = createElement(Eye);
  const eyeOffEl = createElement(EyeOff);
  return {
    eye: eyeEl.outerHTML,
    eyeOff: eyeOffEl.outerHTML,
  };
};

export const wrapTextWithPasswordHide = (text: TextComponent) => {
  const { eye, eyeOff } = getEyesElements();
  const hider = text.inputEl.insertAdjacentElement("afterend", createSpan())!;
  // the init type of hider is "hidden" === eyeOff === password
  hider.innerHTML = eyeOff;
  hider.addEventListener("click", (e) => {
    const isText = text.inputEl.getAttribute("type") === "text";
    hider.innerHTML = isText ? eyeOff : eye;
    text.inputEl.setAttribute("type", isText ? "password" : "text");
    text.inputEl.focus();
  });

  // the init type of text el is password
  text.inputEl.setAttribute("type", "password");
  return text;
};

export class ObsSyncSettingTab extends PluginSettingTab {
  readonly plugin: ObsSyncPlugin;
  private pulledSnapshots: ConfigManagementSnapshot[] = [];
  private renderDeviceList: (container: HTMLElement, t: (x: any, vars?: any) => string) => void = () => {};

  constructor(app: App, plugin: ObsSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async display(): Promise<void> {
    const { containerEl } = this;
    containerEl.style.setProperty("overflow-wrap", "break-word");

    containerEl.empty();

    const t = (x: TransItemType, vars?: any) => {
      return this.plugin.i18n.t(x, vars);
    };

    containerEl.createEl("h1", { text: "OB Sync" });

    //////////////////////////////////////////////////
    // below for service chooser (part 1/2)
    //////////////////////////////////////////////////

    // we need to create the div in advance of any other service divs
    const serviceChooserDiv = containerEl.createDiv();
    serviceChooserDiv.createEl("h2", { text: t("settings_chooseservice") });

    // below for onedrive
    //////////////////////////////////////////////////

    const onedriveDiv = containerEl.createEl("div", { cls: "onedrive-hide" });
    onedriveDiv.toggleClass(
      "onedrive-hide",
      this.plugin.settings.serviceType !== "onedrive"
    );
    onedriveDiv.createEl("h2", { text: t("settings_onedrive") });
    const onedriveLongDescDiv = onedriveDiv.createEl("div", {
      cls: "settings-long-desc",
    });
    for (const c of [
      t("settings_onedrive_disclaimer1"),
      t("settings_onedrive_disclaimer2"),
    ]) {
      onedriveLongDescDiv.createEl("p", {
        text: c,
        cls: "onedrive-disclaimer",
      });
    }

    onedriveLongDescDiv.createEl("p", {
      text: t("settings_onedrive_folder", {
        pluginID: this.plugin.manifest.id,
        remoteBaseDir:
          this.plugin.settings.onedrive.remoteBaseDir ||
          this.app.vault.getName(),
      }),
    });

    onedriveLongDescDiv.createEl("p", {
      text: t("settings_onedrive_nobiz"),
    });

    const onedriveSelectAuthDiv = onedriveDiv.createDiv();
    const onedriveAuthDiv = onedriveSelectAuthDiv.createDiv({
      cls: "onedrive-auth-button-hide settings-auth-related",
    });
    const onedriveRevokeAuthDiv = onedriveSelectAuthDiv.createDiv({
      cls: "onedrive-revoke-auth-button-hide settings-auth-related",
    });

    const onedriveRevokeAuthSetting = new Setting(onedriveRevokeAuthDiv)
      .setName(t("settings_onedrive_revoke"))
      .setDesc(
        t("settings_onedrive_revoke_desc", {
          username: this.plugin.settings.onedrive.username,
        })
      )
      .addButton(async (button) => {
        button.setButtonText(t("settings_onedrive_revoke_button"));
        button.onClick(async () => {
          new OnedriveRevokeAuthModal(
            this.app,
            this.plugin,
            onedriveAuthDiv,
            onedriveRevokeAuthDiv
          ).open();
        });
      });

    new Setting(onedriveAuthDiv)
      .setName(t("settings_onedrive_auth"))
      .setDesc(t("settings_onedrive_auth_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("settings_onedrive_auth_button"));
        button.onClick(async () => {
          const modal = new OnedriveAuthModal(
            this.app,
            this.plugin,
            onedriveAuthDiv,
            onedriveRevokeAuthDiv,
            onedriveRevokeAuthSetting
          );
          this.plugin.oauth2Info.helperModal = modal;
          this.plugin.oauth2Info.authDiv = onedriveAuthDiv;
          this.plugin.oauth2Info.revokeDiv = onedriveRevokeAuthDiv;
          this.plugin.oauth2Info.revokeAuthSetting = onedriveRevokeAuthSetting;
          modal.open();
        });
      });

    onedriveAuthDiv.toggleClass(
      "onedrive-auth-button-hide",
      this.plugin.settings.onedrive.username !== ""
    );
    onedriveRevokeAuthDiv.toggleClass(
      "onedrive-revoke-auth-button-hide",
      this.plugin.settings.onedrive.username === ""
    );

    let newOnedriveRemoteBaseDir =
      this.plugin.settings.onedrive.remoteBaseDir || "";
    new Setting(onedriveDiv)
      .setName(t("settings_remotebasedir"))
      .setDesc(t("settings_remotebasedir_desc"))
      .addText((text) =>
        text
          .setPlaceholder(this.app.vault.getName())
          .setValue(newOnedriveRemoteBaseDir)
          .onChange((value) => {
            newOnedriveRemoteBaseDir = value.trim();
          })
      )
      .addButton((button) => {
        button.setButtonText(t("confirm"));
        button.onClick(() => {
          new ChangeRemoteBaseDirModal(
            this.app,
            this.plugin,
            newOnedriveRemoteBaseDir,
            "onedrive"
          ).open();
        });
      });

    new Setting(onedriveDiv)
      .setName(t("settings_onedrive_emptyfile"))
      .setDesc(t("settings_onedrive_emptyfile_desc"))
      .addDropdown(async (dropdown) => {
        dropdown
          .addOption("skip", t("settings_onedrive_emptyfile_skip"))
          .addOption("error", t("settings_onedrive_emptyfile_error"))
          .setValue(this.plugin.settings.onedrive.emptyFile)
          .onChange(async (val) => {
            this.plugin.settings.onedrive.emptyFile = val as any;
            await this.plugin.saveSettings();
          });
      });

    new Setting(onedriveDiv)
      .setName(t("settings_checkonnectivity"))
      .setDesc(t("settings_checkonnectivity_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("settings_checkonnectivity_button"));
        button.onClick(async () => {
          new Notice(t("settings_checkonnectivity_checking"));
          const client = getClient(
            this.plugin.settings,
            this.app.vault.getName(),
            () => this.plugin.saveSettings()
          );
          const errors = { msg: "" };
          const res = await client.checkConnect((err: any) => {
            errors.msg = `${err}`;
          });
          if (res) {
            new Notice(t("settings_onedrive_connect_succ"));
          } else {
            new Notice(t("settings_onedrive_connect_fail"));
            new Notice(errors.msg);
          }
        });
      });

    //////////////////////////////////////////////////
    // below for webdav
    //////////////////////////////////////////////////

    const webdavDiv = containerEl.createEl("div", { cls: "webdav-hide" });
    webdavDiv.toggleClass(
      "webdav-hide",
      this.plugin.settings.serviceType !== "webdav"
    );

    webdavDiv.createEl("h2", { text: t("settings_webdav") });

    const webdavLongDescDiv = webdavDiv.createEl("div", {
      cls: "settings-long-desc",
    });

    webdavLongDescDiv.createEl("p", {
      text: t("settings_webdav_disclaimer1"),
      cls: "webdav-disclaimer",
    });

    if (!VALID_REQURL) {
      webdavLongDescDiv.createEl("p", {
        text: t("settings_webdav_cors_os"),
      });

      webdavLongDescDiv.createEl("p", {
        text: t("settings_webdav_cors"),
      });
    }

    webdavLongDescDiv.createEl("p", {
      text: t("settings_webdav_folder", {
        remoteBaseDir:
          this.plugin.settings.webdav.remoteBaseDir || this.app.vault.getName(),
      }),
    });

    new Setting(webdavDiv)
      .setName(t("settings_webdav_addr"))
      .setDesc(t("settings_webdav_addr_desc"))
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(this.plugin.settings.webdav.address)
          .onChange(async (value) => {
            this.plugin.settings.webdav.address = value.trim();
            // deprecate auto on 20240116, force to manual_1
            if (
              this.plugin.settings.webdav.depth === "auto" ||
              this.plugin.settings.webdav.depth === "auto_1" ||
              this.plugin.settings.webdav.depth === "auto_infinity" ||
              this.plugin.settings.webdav.depth === "auto_unknown"
            ) {
              this.plugin.settings.webdav.depth = "manual_1";
            }

            // normally saved
            await this.plugin.saveSettings();
          })
      );

    new Setting(webdavDiv)
      .setName(t("settings_webdav_user"))
      .setDesc(t("settings_webdav_user_desc"))
      .addText((text) => {
        wrapTextWithPasswordHide(text);
        text
          .setPlaceholder("")
          .setValue(this.plugin.settings.webdav.username)
          .onChange(async (value) => {
            this.plugin.settings.webdav.username = value.trim();
            // deprecate auto on 20240116, force to manual_1
            if (
              this.plugin.settings.webdav.depth === "auto" ||
              this.plugin.settings.webdav.depth === "auto_1" ||
              this.plugin.settings.webdav.depth === "auto_infinity" ||
              this.plugin.settings.webdav.depth === "auto_unknown"
            ) {
              this.plugin.settings.webdav.depth = "manual_1";
            }
            await this.plugin.saveSettings();
          });
      });

    new Setting(webdavDiv)
      .setName(t("settings_webdav_password"))
      .setDesc(t("settings_webdav_password_desc"))
      .addText((text) => {
        wrapTextWithPasswordHide(text);
        text
          .setPlaceholder("")
          .setValue(this.plugin.settings.webdav.password)
          .onChange(async (value) => {
            this.plugin.settings.webdav.password = value.trim();
            // deprecate auto on 20240116, force to manual_1
            if (
              this.plugin.settings.webdav.depth === "auto" ||
              this.plugin.settings.webdav.depth === "auto_1" ||
              this.plugin.settings.webdav.depth === "auto_infinity" ||
              this.plugin.settings.webdav.depth === "auto_unknown"
            ) {
              this.plugin.settings.webdav.depth = "manual_1";
            }
            await this.plugin.saveSettings();
          });
      });

    new Setting(webdavDiv)
      .setName(t("settings_webdav_auth"))
      .setDesc(t("settings_webdav_auth_desc"))
      .addDropdown(async (dropdown) => {
        dropdown.addOption("basic", "basic");
        if (VALID_REQURL) {
          dropdown.addOption("digest", "digest");
        }

        // new version config, copied to old version, we need to reset it
        if (!VALID_REQURL && this.plugin.settings.webdav.authType !== "basic") {
          this.plugin.settings.webdav.authType = "basic";
          await this.plugin.saveSettings();
        }

        dropdown
          .setValue(this.plugin.settings.webdav.authType)
          .onChange(async (val) => {
            this.plugin.settings.webdav.authType = val as WebdavAuthType;
            await this.plugin.saveSettings();
          });
      });

    new Setting(webdavDiv)
      .setName(t("settings_webdav_depth"))
      .setDesc(t("settings_webdav_depth_desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("manual_1", t("settings_webdav_depth_1"));
        dropdown.addOption("manual_infinity", t("settings_webdav_depth_inf"));

        dropdown
          .setValue(this.plugin.settings.webdav.depth || "manual_1")
          .onChange(async (val) => {
            if (val === "manual_1") {
              this.plugin.settings.webdav.depth = "manual_1";
              this.plugin.settings.webdav.manualRecursive = true;
            } else if (val === "manual_infinity") {
              this.plugin.settings.webdav.depth = "manual_infinity";
              this.plugin.settings.webdav.manualRecursive = false;
            }

            // normally save
            await this.plugin.saveSettings();
          });
      });

    new Setting(webdavDiv)
      .setName(t("settings_webdav_customheaders"))
      .setDesc(stringToFragment(t("settings_webdav_customheaders_desc")))
      .addTextArea((textArea) => {
        textArea
          .setPlaceholder(`X-Header1: Value1\nX-Header2: Value2`)
          .setValue(`${this.plugin.settings.webdav.customHeaders ?? ""}`)
          .onChange(async (value) => {
            this.plugin.settings.webdav.customHeaders = value
              .trim()
              .split("\n")
              .filter((x) => x.trim() !== "")
              .join("\n");
            await this.plugin.saveSettings();
          });
        textArea.inputEl.rows = 10;
        textArea.inputEl.cols = 30;

        textArea.inputEl.addClass("webdav-customheaders-textarea");
      });

    let newWebdavRemoteBaseDir =
      this.plugin.settings.webdav.remoteBaseDir || "";
    new Setting(webdavDiv)
      .setName(t("settings_remotebasedir"))
      .setDesc(t("settings_remotebasedir_desc"))
      .addText((text) =>
        text
          .setPlaceholder(this.app.vault.getName())
          .setValue(newWebdavRemoteBaseDir)
          .onChange((value) => {
            newWebdavRemoteBaseDir = value.trim();
          })
      )
      .addButton((button) => {
        button.setButtonText(t("confirm"));
        button.onClick(() => {
          new ChangeRemoteBaseDirModal(
            this.app,
            this.plugin,
            newWebdavRemoteBaseDir,
            "webdav"
          ).open();
        });
      });

    new Setting(webdavDiv)
      .setName(t("settings_checkonnectivity"))
      .setDesc(t("settings_checkonnectivity_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("settings_checkonnectivity_button"));
        button.onClick(async () => {
          new Notice(t("settings_checkonnectivity_checking"));
          const client = getClient(
            this.plugin.settings,
            this.app.vault.getName(),
            () => this.plugin.saveSettings()
          );
          const errors = { msg: "" };
          const res = await client.checkConnect((err: any) => {
            errors.msg = `${err}`;
          });
          if (res) {
            new Notice(t("settings_webdav_connect_succ"));
          } else {
            if (VALID_REQURL) {
              new Notice(t("settings_webdav_connect_fail"));
            } else {
              new Notice(t("settings_webdav_connect_fail_withcors"));
            }
            new Notice(errors.msg);
          }
        });
      });
    //////////////////////////////////////////////////
    // below for general chooser (part 2/2)
    //////////////////////////////////////////////////

    // we need to create chooser
    // after all service-div-s being created
    new Setting(serviceChooserDiv)
      .setName(t("settings_chooseservice"))
      .setDesc(t("settings_chooseservice_desc"))
      .addDropdown(async (dropdown) => {
        dropdown.addOption("webdav", t("settings_chooseservice_webdav"));
        dropdown.addOption("onedrive", t("settings_chooseservice_onedrive"));

        dropdown
          .setValue(this.plugin.settings.serviceType)
          .onChange(async (val) => {
            this.plugin.settings.serviceType = val as SUPPORTED_SERVICES_TYPE;
            onedriveDiv.toggleClass(
              "onedrive-hide",
              this.plugin.settings.serviceType !== "onedrive"
            );
            webdavDiv.toggleClass(
              "webdav-hide",
              this.plugin.settings.serviceType !== "webdav"
            );

            await this.plugin.saveSettings();
          });
      });
    const settingsDiv = containerEl.createEl("div");

    new Setting(settingsDiv)
      .setName(t("settings_autorun"))
      .setDesc(t("settings_autorun_desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("-1", t("settings_autorun_notset"));
        dropdown.addOption(`${1000 * 60 * 1}`, t("settings_autorun_1min"));
        dropdown.addOption(`${1000 * 60 * 5}`, t("settings_autorun_5min"));
        dropdown.addOption(`${1000 * 60 * 10}`, t("settings_autorun_10min"));
        dropdown.addOption(`${1000 * 60 * 30}`, t("settings_autorun_30min"));

        dropdown
          .setValue(`${this.plugin.settings.autoRunEveryMilliseconds}`)
          .onChange(async (val: string) => {
            const realVal = Number.parseInt(val);
            this.plugin.settings.autoRunEveryMilliseconds = realVal;
            await this.plugin.saveSettings();
            if (
              (realVal === undefined || realVal === null || realVal <= 0) &&
              this.plugin.autoRunIntervalID !== undefined
            ) {
              // clear
              window.clearInterval(this.plugin.autoRunIntervalID);
              this.plugin.autoRunIntervalID = undefined;
            } else if (
              realVal !== undefined &&
              realVal !== null &&
              realVal > 0
            ) {
              const intervalID = window.setInterval(() => {
                console.info("auto run from settings.ts");
                this.plugin.syncRun("auto");
              }, realVal);
              this.plugin.autoRunIntervalID = intervalID;
              this.plugin.registerInterval(intervalID);
            }
          });
      });

    new Setting(settingsDiv)
      .setName(t("settings_runoncestartup"))
      .setDesc(t("settings_runoncestartup_desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("-1", t("settings_runoncestartup_notset"));
        dropdown.addOption(
          `${1000 * 1 * 1}`,
          t("settings_runoncestartup_1sec")
        );
        dropdown.addOption(
          `${1000 * 10 * 1}`,
          t("settings_runoncestartup_10sec")
        );
        dropdown.addOption(
          `${1000 * 30 * 1}`,
          t("settings_runoncestartup_30sec")
        );
        dropdown
          .setValue(`${this.plugin.settings.initRunAfterMilliseconds}`)
          .onChange(async (val: string) => {
            const realVal = Number.parseInt(val);
            this.plugin.settings.initRunAfterMilliseconds = realVal;
            await this.plugin.saveSettings();
          });
      });

    new Setting(settingsDiv)
      .setName(t("settings_synconsave"))
      .setDesc(t("settings_synconsave_desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("-1", t("settings_synconsave_disable"));
        dropdown.addOption("1000", t("settings_synconsave_enable"));
        // for backward compatibility, we need to use a number representing seconds
        let syncOnSaveEnabled = false;
        if ((this.plugin.settings.syncOnSaveAfterMilliseconds ?? -1) > 0) {
          syncOnSaveEnabled = true;
        }
        dropdown
          .setValue(`${syncOnSaveEnabled ? "1000" : "-1"}`)
          .onChange(async (val: string) => {
            this.plugin.settings.syncOnSaveAfterMilliseconds =
              Number.parseInt(val);
            await this.plugin.saveSettings();
            this.plugin.toggleSyncOnSaveIfSet();
          });
      });

    new Setting(settingsDiv)
      .setName(t("settings_concurrency"))
      .setDesc(t("settings_concurrency_desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("1", "1");
        dropdown.addOption("2", "2");
        dropdown.addOption("3", "3");
        dropdown.addOption("5", "5 (default)");
        dropdown.addOption("10", "10");
        dropdown.addOption("15", "15");
        dropdown.addOption("20", "20");

        dropdown
          .setValue(`${this.plugin.settings.concurrency}`)
          .onChange(async (val) => {
            const realVal = Number.parseInt(val);
            this.plugin.settings.concurrency = realVal;
            await this.plugin.saveSettings();
          });
      });

    new Setting(settingsDiv)
      .setName(t("settings_skiplargefiles"))
      .setDesc(t("settings_skiplargefiles_desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("-1", t("settings_skiplargefiles_notset"));

        const mbs = [1, 5, 10, 20, 50, 100, 200, 500, 1000];
        for (const mb of mbs) {
          dropdown.addOption(`${mb * 1000 * 1000}`, `${mb} MB`);
        }
        dropdown
          .setValue(`${this.plugin.settings.skipSizeLargerThan}`)
          .onChange(async (val) => {
            this.plugin.settings.skipSizeLargerThan = Number.parseInt(val);
            await this.plugin.saveSettings();
          });
      });

      new Setting(settingsDiv)
        .setName(t("settings_syncunderscore"))
        .setDesc(t("settings_syncunderscore_desc"))
        .addDropdown((dropdown) => {
          dropdown.addOption("disable", t("disable"));
          dropdown.addOption("enable", t("enable"));
          dropdown
            .setValue(
              `${this.plugin.settings.syncUnderscoreItems ? "enable" : "disable"}`
            )
            .onChange(async (val) => {
              this.plugin.settings.syncUnderscoreItems = val === "enable";
              await this.plugin.saveSettings();
            });
        });

      new Setting(settingsDiv)
        .setName(t("setting_syncdirection"))
        .setDesc(stringToFragment(t("setting_syncdirection_desc")))
        .addDropdown((dropdown) => {
          dropdown.addOption(
            "bidirectional",
            t("setting_syncdirection_bidirectional_desc")
          );
          dropdown.addOption(
            "incremental_push_only",
            t("setting_syncdirection_incremental_push_only_desc")
          );
          dropdown.addOption(
            "incremental_pull_only",
            t("setting_syncdirection_incremental_pull_only_desc")
          );
          dropdown.addOption(
            "incremental_push_and_delete_only",
            t("setting_syncdirection_incremental_push_and_delete_only_desc")
          );
          dropdown.addOption(
            "incremental_pull_and_delete_only",
            t("setting_syncdirection_incremental_pull_and_delete_only_desc")
          );

          dropdown
            .setValue(this.plugin.settings.syncDirection ?? "bidirectional")
            .onChange(async (val) => {
              this.plugin.settings.syncDirection = val as SyncDirectionType;
              await this.plugin.saveSettings();
            });
        });

      let conflictActionSettingOrigDesc = t("settings_conflictaction_desc");
        if (
          (this.plugin.settings.conflictAction ?? "keep_newer") ===
          "smart_conflict"
        ) {
          conflictActionSettingOrigDesc += t(
            "settings_conflictaction_smart_conflict_desc"
          );
        }
        const conflictActionSetting = new Setting(settingsDiv)
          .setName(t("settings_conflictaction"))
          .setDesc(stringToFragment(conflictActionSettingOrigDesc));
        conflictActionSetting.addDropdown((dropdown) => {
          dropdown
            .addOption("keep_newer", t("settings_conflictaction_keep_newer"))
            .addOption("keep_larger", t("settings_conflictaction_keep_larger"))
            .addOption(
              "smart_conflict",
              t("settings_conflictaction_smart_conflict")
            )
            .setValue(this.plugin.settings.conflictAction ?? "keep_newer")
            .onChange(async (val) => {
              this.plugin.settings.conflictAction = val as ConflictActionType;
              await this.plugin.saveSettings();

              conflictActionSettingOrigDesc = t("settings_conflictaction_desc");
              if (
                (this.plugin.settings.conflictAction ?? "keep_newer") ===
                "smart_conflict"
              ) {
                conflictActionSettingOrigDesc += t(
                  "settings_conflictaction_smart_conflict_desc"
                );
              }
              conflictActionSetting.setDesc(
                stringToFragment(conflictActionSettingOrigDesc)
              );
            });
        });

        generateClearDupFilesSettingsPart(
          settingsDiv,
          t,
          this.app,
          this.plugin
        );

        new Setting(settingsDiv)
          .setName(t("settings_deletetowhere"))
          .setDesc(t("settings_deletetowhere_desc"))
          .addDropdown((dropdown) => {
            dropdown.addOption(
              "system",
              t("settings_deletetowhere_system_trash")
            );
            dropdown.addOption(
              "obsidian",
              t("settings_deletetowhere_obsidian_trash")
            );
            dropdown
              .setValue(this.plugin.settings.deleteToWhere ?? "system")
              .onChange(async (val) => {
                this.plugin.settings.deleteToWhere = val as
                  | "system"
                  | "obsidian";
                await this.plugin.saveSettings();
              });
          });

        const percentage1 = new Setting(settingsDiv)
          .setName(t("settings_protectmodifypercentage"))
          .setDesc(t("settings_protectmodifypercentage_desc"));

        const percentage2 = new Setting(settingsDiv)
          .setName(t("settings_protectmodifypercentage_customfield"))
          .setDesc(t("settings_protectmodifypercentage_customfield_desc"));
        if ((this.plugin.settings.protectModifyPercentage ?? 50) % 10 === 0) {
          percentage2.settingEl.addClass("settings-percentage-custom-hide");
        }
        let percentage2Text: TextComponent | undefined = undefined;
        percentage2.addText((text) => {
          text.inputEl.type = "number";
          percentage2Text = text;
          text
            .setPlaceholder("0 ~ 100")
            .setValue(`${this.plugin.settings.protectModifyPercentage ?? 50}`)
            .onChange(async (val) => {
              let k = Number.parseFloat(val.trim());
              if (Number.isNaN(k)) {
                // do nothing!
              } else {
                if (k < 0) {
                  k = 0;
                } else if (k > 100) {
                  k = 100;
                }
                this.plugin.settings.protectModifyPercentage = k;
                await this.plugin.saveSettings();
              }
            });
        });

        percentage1.addDropdown((dropdown) => {
          for (const i of Array.from({ length: 11 }, (x, i) => i * 10)) {
            let desc = `${i}`;
            if (i === 0) {
              desc = t("settings_protectmodifypercentage_000_desc");
            } else if (i === 50) {
              desc = t("settings_protectmodifypercentage_050_desc");
            } else if (i === 100) {
              desc = t("settings_protectmodifypercentage_100_desc");
            }
            dropdown.addOption(`${i}`, desc);
          }
          dropdown.addOption(
            "custom",
            t("settings_protectmodifypercentage_custom_desc")
          );

          const p = this.plugin.settings.protectModifyPercentage ?? 50;
          let initVal = "custom";
          if (p % 10 === 0) {
            initVal = `${p}`;
          } else {
            // show custom
            percentage2.settingEl.removeClass("settings-percentage-custom");
          }
          dropdown.setValue(initVal).onChange(async (val) => {
            const k = Number.parseInt(val);
            if (val === "custom" || Number.isNaN(k)) {
              // do nothing until user changes something in custom field
              percentage2.settingEl.removeClass(
                "settings-percentage-custom-hide"
              );
            } else {
              this.plugin.settings.protectModifyPercentage = k;
              percentage2.settingEl.addClass("settings-percentage-custom-hide");
              percentage2Text?.setValue(`${k}`);
              await this.plugin.saveSettings();
            }
          });
        });

        new Setting(settingsDiv)
          .setName(t("settings_enablestatusbar_info"))
          .setDesc(t("settings_enablestatusbar_info_desc"))
          .addToggle((toggle) => {
            toggle
              .setValue(this.plugin.settings.enableStatusBarInfo ?? false)
              .onChange(async (val) => {
                this.plugin.settings.enableStatusBarInfo = val;
                await this.plugin.saveSettings();
                new Notice(t("settings_enablestatusbar_reloadrequired_notice"));
              });
          });

        new Setting(settingsDiv)
          .setName(t("settings_resetstatusbar_time"))
          .setDesc(t("settings_resetstatusbar_time_desc"))
          .addButton((button) => {
            button.setButtonText(t("settings_resetstatusbar_button"));
            button.onClick(async () => {
              // reset last sync time
              await upsertLastSuccessSyncTimeByVault(
                this.plugin.db,
                this.plugin.vaultRandomID,
                -1
              );
              await upsertLastFailedSyncTimeByVault(
                this.plugin.db,
                this.plugin.vaultRandomID,
                -1
              );
              this.plugin.updateLastSyncMsg(
                undefined,
                "not_syncing",
                null,
                null
              );
              new Notice(t("settings_resetstatusbar_notice"));
            });
          });

      new Setting(settingsDiv)
        .setName(t("settings_ignorepaths"))
        .setDesc(t("settings_ignorepaths_desc"))
        .setClass("ignorepaths-settings")

        .addTextArea((textArea) => {
          textArea
            .setValue(`${(this.plugin.settings.ignorePaths ?? []).join("\n")}`)
            .onChange(async (value) => {
              this.plugin.settings.ignorePaths = value
                .trim()
                .split("\n")
                .filter((x) => x.trim() !== "");
              await this.plugin.saveSettings();
            });
          textArea.inputEl.rows = 10;
          textArea.inputEl.cols = 30;

          textArea.inputEl.addClass("ignorepaths-textarea");
        });

      new Setting(settingsDiv)
        .setName(t("settings_onlyallowpaths"))
        .setDesc(t("settings_onlyallowpaths_desc"))
        .setClass("onlyallowpaths-settings")

        .addTextArea((textArea) => {
          textArea
            .setValue(
              `${(this.plugin.settings.onlyAllowPaths ?? []).join("\n")}`
            )
            .onChange(async (value) => {
              this.plugin.settings.onlyAllowPaths = value
                .trim()
                .split("\n")
                .filter((x) => x.trim() !== "");
              await this.plugin.saveSettings();
            });
          textArea.inputEl.rows = 10;
          textArea.inputEl.cols = 30;

          textArea.inputEl.addClass("onlyallowpaths-textarea");
        });

      new Setting(settingsDiv)
        .setName(t("settings_enablemobilestatusbar"))
        .setDesc(t("settings_enablemobilestatusbar_desc"))
        .addDropdown(async (dropdown) => {
          dropdown
            .addOption("enable", t("enable"))
            .addOption("disable", t("disable"));

          dropdown
            .setValue(
              `${
                this.plugin.settings.enableMobileStatusBar
                  ? "enable"
                  : "disable"
              }`
            )
            .onChange(async (val) => {
              if (val === "enable") {
                this.plugin.settings.enableMobileStatusBar = true;
                this.plugin.appContainerObserver =
                  changeMobileStatusBar("enable");
              } else {
                this.plugin.settings.enableMobileStatusBar = false;
                changeMobileStatusBar(
                  "disable",
                  this.plugin.appContainerObserver
                );
                this.plugin.appContainerObserver?.disconnect();
                this.plugin.appContainerObserver = undefined;
              }
              await this.plugin.saveSettings();
            });
        });

    //////////////////////////////////////////////////
    // 配置管理
    //////////////////////////////////////////////////

    const configMgmtDiv = containerEl.createEl("div");
    configMgmtDiv.createEl("h2", { text: t("config_mgmt_title") });

    // --- 本地设备配置 ---
    configMgmtDiv.createEl("h3", { text: t("config_mgmt_local_section") });

    new Setting(configMgmtDiv)
      .setName(t("device_config_mode_title"))
      .setDesc(t("device_config_mode_desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("legacy", t("device_config_mode_legacy"));
        dropdown.addOption("device", t("device_config_mode_device"));
        dropdown
          .setValue(
            `${this.plugin.settings.enableDeviceConfigSync ? "device" : "legacy"}`
          )
          .onChange(async (val) => {
            const enableDevice = val === "device";
            if (enableDevice && !this.plugin.settings.enableDeviceConfigSync) {
              const deviceId = this.plugin.deviceId;
              if (!this.plugin.settings.deviceProfiles) {
                this.plugin.settings.deviceProfiles = {};
              }
              if (!this.plugin.settings.deviceProfiles[deviceId]) {
                this.plugin.settings.deviceProfiles[deviceId] = {
                  deviceId,
                  deviceName: Platform.isMobile
                    ? t("device_config_default_name_mobile")
                    : t("device_config_default_name_desktop"),
                  platform: Platform.isMobile ? "mobile" : "desktop",
                  registeredAt: Date.now(),
                  categorySyncModes: {},
                  pullOnlyPlugins: [],
                  skipPlugins: [],
                };
              }
            }
            this.plugin.settings.enableDeviceConfigSync = enableDevice;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    if (this.plugin.settings.enableDeviceConfigSync) {
      const deviceId = this.plugin.deviceId;
      const deviceProfile = this.plugin.settings.deviceProfiles?.[deviceId] ?? {
        deviceId,
        deviceName: Platform.isMobile
          ? t("device_config_default_name_mobile")
          : t("device_config_default_name_desktop"),
        platform: Platform.isMobile ? "mobile" : "desktop",
        registeredAt: Date.now(),
        categorySyncModes: {},
        pullOnlyPlugins: [],
        skipPlugins: [],
      };

      new Setting(configMgmtDiv)
        .setName(t("device_config_current_device"))
        .setDesc(
          `${t("device_config_platform")}: ${deviceProfile.platform === "mobile" ? t("device_config_platform_mobile") : t("device_config_platform_desktop")} | ID: ${deviceId.slice(0, 8)}...`
        )
        .addText((text) => {
          text
            .setPlaceholder(t("device_config_name_placeholder"))
            .setValue(deviceProfile.deviceName)
            .onChange(async (val) => {
              if (!this.plugin.settings.deviceProfiles) {
                this.plugin.settings.deviceProfiles = {};
              }
              const profile =
                this.plugin.settings.deviceProfiles[deviceId] ?? deviceProfile;
              this.plugin.settings.deviceProfiles[deviceId] = {
                ...profile,
                deviceName: val,
              };
              await this.plugin.saveSettings();
            });
        });

      for (const category of ALL_CONFIG_SYNC_CATEGORIES) {
        const currentMode = deviceProfile.categorySyncModes[category] ?? "sync";
        new Setting(configMgmtDiv)
          .setName(t(`device_config_category_${category}`))
          .addDropdown((dropdown) => {
            dropdown.addOption("sync", t("device_config_mode_sync"));
            dropdown.addOption("pull_only", t("device_config_mode_pull_only"));
            dropdown.addOption("push_only", t("device_config_mode_push_only"));
            dropdown.addOption("skip", t("device_config_mode_skip"));
            dropdown.setValue(currentMode).onChange(async (val) => {
              if (!this.plugin.settings.deviceProfiles) {
                this.plugin.settings.deviceProfiles = {};
              }
              const profile =
                this.plugin.settings.deviceProfiles[deviceId] ?? deviceProfile;
              const newModes = {
                ...profile.categorySyncModes,
                [category]: val as ConfigSyncMode,
              };
              this.plugin.settings.deviceProfiles[deviceId] = {
                ...profile,
                categorySyncModes: newModes,
              };
              await this.plugin.saveSettings();
            });
          });
      }

      const pluginsDataMode = deviceProfile.categorySyncModes.pluginsData ?? "sync";
      if (pluginsDataMode !== "skip") {
        try {
          const communityPluginsStr = await this.plugin.app.vault.adapter.read(
            ".obsidian/community-plugins.json"
          );
          const enabledPluginIds: string[] = JSON.parse(communityPluginsStr);
          const otherPlugins = enabledPluginIds.filter(
            (id) => id !== this.plugin.manifest.id
          );

          if (otherPlugins.length > 0) {
            new Setting(configMgmtDiv)
              .setName(t("device_config_per_plugin"))
              .setDesc(t("device_config_per_plugin_desc"));

            for (const pluginId of otherPlugins) {
              const isPullOnly = deviceProfile.pullOnlyPlugins?.includes(pluginId) ?? false;
              const isSkip = deviceProfile.skipPlugins?.includes(pluginId) ?? false;
              let currentOverride = "default";
              if (isSkip) currentOverride = "skip";
              else if (isPullOnly) currentOverride = "pull_only";

              new Setting(configMgmtDiv)
                .setName(pluginId)
                .addDropdown((dropdown) => {
                  dropdown.addOption("default", t("device_config_plugin_default"));
                  dropdown.addOption("pull_only", t("device_config_mode_pull_only"));
                  dropdown.addOption("skip", t("device_config_mode_skip"));
                  dropdown.setValue(currentOverride).onChange(async (val) => {
                    if (!this.plugin.settings.deviceProfiles) {
                      this.plugin.settings.deviceProfiles = {};
                    }
                    const profile =
                      this.plugin.settings.deviceProfiles[deviceId] ?? deviceProfile;
                    const pullOnly = (profile.pullOnlyPlugins ?? []).filter(
                      (id) => id !== pluginId
                    );
                    const skip = (profile.skipPlugins ?? []).filter(
                      (id) => id !== pluginId
                    );
                    if (val === "pull_only") pullOnly.push(pluginId);
                    if (val === "skip") skip.push(pluginId);
                    this.plugin.settings.deviceProfiles[deviceId] = {
                      ...profile,
                      pullOnlyPlugins: pullOnly,
                      skipPlugins: skip,
                    };
                    await this.plugin.saveSettings();
                  });
                });
            }
          }
        } catch {
          // community-plugins.json 可能不存在
        }
      }
    }

    // --- 远程配置管理 ---
    configMgmtDiv.createEl("h3", { text: t("config_mgmt_remote_section") });

    new Setting(configMgmtDiv)
      .setName(t("config_mgmt_save"))
      .setDesc(t("config_mgmt_save_desc"))
      .addButton((button) => {
        button.setButtonText(t("config_mgmt_save"));
        button.onClick(async () => {
          const settings = this.plugin.settings;
          if (!settings.serviceType) {
            new Notice(t("config_mgmt_no_remote"));
            return;
          }
          try {
            new Notice(t("config_mgmt_saving"));
            const client = getClient(
              settings,
              this.app.vault.getName(),
              () => this.plugin.saveSettings()
            );
            const deviceId = this.plugin.deviceId;
            const deviceProfile = settings.deviceProfiles?.[deviceId];
            const deviceName = deviceProfile?.deviceName ?? (Platform.isMobile ? "Mobile" : "Desktop");
            const snapshot = buildConfigSnapshot(
              settings,
              deviceId,
              deviceName,
              this.plugin.manifest.version
            );
            await saveConfigToRemote(client, snapshot, deviceId);
            new Notice(t("config_mgmt_save_success"));
          } catch (err) {
            new Notice(`${t("config_mgmt_save_fail")}: ${err}`);
          }
        });
      });

    new Setting(configMgmtDiv)
      .setName(t("config_mgmt_pull"))
      .setDesc(t("config_mgmt_pull_desc"))
      .addButton((button) => {
        button.setButtonText(t("config_mgmt_pull"));
        button.onClick(async () => {
          const settings = this.plugin.settings;
          if (!settings.serviceType) {
            new Notice(t("config_mgmt_no_remote"));
            return;
          }
          try {
            new Notice(t("config_mgmt_pulling"));
            const client = getClient(
              settings,
              this.app.vault.getName(),
              () => this.plugin.saveSettings()
            );
            const snapshots = await pullConfigsFromRemote(client);
            this.pulledSnapshots = snapshots;
            if (snapshots.length === 0) {
              new Notice(t("config_mgmt_pull_empty"));
            } else {
              new Notice(
                t("config_mgmt_pull_success", { count: `${snapshots.length}` })
              );
            }
            this.renderDeviceList(deviceListContainer, t);
          } catch (err) {
            new Notice(`${t("config_mgmt_pull_fail")}: ${err}`);
          }
        });
      });

    // 设备列表容器
    const deviceListContainer = configMgmtDiv.createDiv();
    deviceListContainer.createEl("h4", { text: t("config_mgmt_device_list") });

    // JSON 查看器
    let jsonViewer: HTMLTextAreaElement | null = null;

    const renderDeviceList = (container: HTMLElement, t: (x: any, vars?: any) => string) => {
      // 清除旧的设备列表（保留标题）
      const existingItems = container.querySelectorAll(".config-mgmt-device-item");
      for (const item of existingItems) {
        item.remove();
      }

      if (this.pulledSnapshots.length === 0) {
        return;
      }

      for (const snapshot of this.pulledSnapshots) {
        const itemDiv = container.createDiv({ cls: "config-mgmt-device-item" });
        const savedTime = new Date(snapshot.savedAt).toLocaleString();
        const platform = snapshot.pluginSettings;

        new Setting(itemDiv)
          .setName(
            `${snapshot.savedByDeviceName} (${snapshot.savedByDeviceId.slice(0, 8)}...)`
          )
          .setDesc(t("config_mgmt_saved_at", { time: savedTime }))
          .addButton((btn) => {
            btn.setButtonText(t("config_mgmt_view_json"));
            btn.onClick(() => {
              if (jsonViewer) {
                jsonViewer.value = JSON.stringify(snapshot, null, 2);
              }
            });
          })
          .addButton((btn) => {
            btn.setButtonText(t("config_mgmt_apply"));
            btn.onClick(() => {
              const confirmed = confirm(
                t("config_mgmt_apply_confirm", {
                  deviceName: snapshot.savedByDeviceName,
                })
              );
              if (!confirmed) return;
              try {
                const newSettings = applySnapshotToLocal(
                  snapshot,
                  this.plugin.settings,
                  this.plugin.deviceId
                );
                Object.assign(this.plugin.settings, newSettings);
                this.plugin.saveSettings().then(() => {
                  new Notice(
                    t("config_mgmt_apply_success", {
                      deviceName: snapshot.savedByDeviceName,
                    })
                  );
                  this.display();
                });
              } catch {
                new Notice(t("config_mgmt_apply_fail"));
              }
            });
          })
          .addButton((btn) => {
            btn.setButtonText(t("config_mgmt_delete"));
            btn.onClick(async () => {
              const confirmed = confirm(
                t("config_mgmt_delete_confirm", {
                  deviceName: snapshot.savedByDeviceName,
                })
              );
              if (!confirmed) return;
              try {
                const client = getClient(
                  this.plugin.settings,
                  this.app.vault.getName(),
                  () => this.plugin.saveSettings()
                );
                await deleteConfigFromRemote(client, snapshot.savedByDeviceId);
                new Notice(t("config_mgmt_delete_success"));
                this.pulledSnapshots = this.pulledSnapshots.filter(
                  (s) => s.savedByDeviceId !== snapshot.savedByDeviceId
                );
                renderDeviceList(container, t);
              } catch {
                new Notice(t("config_mgmt_delete_fail"));
              }
            });
          });
      }
    };

    // 初始渲染已有的快照
    this.renderDeviceList = renderDeviceList;
    renderDeviceList(deviceListContainer, t);

    // JSON 查看器区域
    configMgmtDiv.createEl("h4", { text: t("config_mgmt_json_viewer") });
    jsonViewer = configMgmtDiv.createEl("textarea", {
      cls: "config-mgmt-json-viewer",
      attr: { readonly: "", rows: "20", placeholder: "JSON..." },
    });

    //////////////////////////////////////////////////
    // below for import and export functions
    //////////////////////////////////////////////////

    // import and export
    const importExportDiv = containerEl.createEl("div");
    importExportDiv.createEl("h2", {
      text: t("settings_importexport"),
    });

    const importExportDivSetting1 = new Setting(importExportDiv)
      .setName(t("settings_export"))
      .setDesc(t("settings_export_desc"));
    importExportDivSetting1.settingEl.addClass("setting-need-wrapping");
    importExportDivSetting1
      .addButton(async (button) => {
        button.setButtonText(t("settings_export_basic_and_advanced_button"));
        button.onClick(async () => {
          new ExportSettingsQrCodeModal(
            this.app,
            this.plugin,
            "basic_and_advanced"
          ).open();
        });
      })
      .addButton(async (button) => {
        button.setButtonText(t("settings_export_onedrive_button"));
        button.onClick(async () => {
          new ExportSettingsQrCodeModal(
            this.app,
            this.plugin,
            "onedrive"
          ).open();
        });
      });

    let importSettingVal = "";
    new Setting(importExportDiv)
      .setName(t("settings_import"))
      .setDesc(t("settings_import_desc"))
      .addText((text) =>
        text
          .setPlaceholder("obsidian://ob-sync?func=settings&...")
          .setValue("")
          .onChange((val) => {
            importSettingVal = val;
          })
      )
      .addButton(async (button) => {
        button.setButtonText(t("confirm"));
        button.onClick(async () => {
          if (importSettingVal !== "") {
            // console.debug(importSettingVal);
            try {
              const inputParams = parseUriByHand(importSettingVal);
              const parsed = importQrCodeUri(
                inputParams,
                this.app.vault.getName()
              );
              if (parsed.status === "error") {
                new Notice(parsed.message);
              } else {
                const copied = cloneDeep(parsed.result);
                // new Notice(JSON.stringify(copied))
                this.plugin.settings = Object.assign(
                  {},
                  this.plugin.settings,
                  copied
                );
                this.plugin.saveSettings();
                new Notice(
                  t("protocol_saveqr", {
                    manifestName: this.plugin.manifest.name,
                  })
                );
              }
            } catch (e) {
              new Notice(`${e}`);
            }

            importSettingVal = "";
          } else {
            new Notice(t("settings_import_error_notice"));
            importSettingVal = "";
          }
        });
      });

    //////////////////////////////////////////////////
    // below for debug
    //////////////////////////////////////////////////

    const debugDiv = containerEl.createEl("div");
    debugDiv.createEl("h2", { text: t("settings_debug") });

    new Setting(debugDiv)
      .setName(t("settings_debuglevel"))
      .setDesc(t("settings_debuglevel_desc"))
      .addDropdown(async (dropdown) => {
        dropdown.addOption("info", "info");
        dropdown.addOption("debug", "debug");
        dropdown
          .setValue(this.plugin.settings.currLogLevel ?? "info")
          .onChange(async (val: string) => {
            this.plugin.settings.currLogLevel = val;
            await this.plugin.saveSettings();
            console.info(`the log level is changed to ${val}`);
          });
      });

    new Setting(debugDiv)
      .setName(t("settings_outputsettingsconsole"))
      .setDesc(t("settings_outputsettingsconsole_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("settings_outputsettingsconsole_button"));
        button.onClick(async () => {
          const c = messyConfigToNormal(await this.plugin.loadData());
          console.info(c);
          new Notice(t("settings_outputsettingsconsole_notice"));
        });
      });

    new Setting(debugDiv)
      .setName(t("settings_obfuscatesettingfile"))
      .setDesc(t("settings_obfuscatesettingfile_desc"))
      .addDropdown(async (dropdown) => {
        dropdown
          .addOption("enable", t("enable"))
          .addOption("disable", t("disable"));

        dropdown
          .setValue(
            `${
              this.plugin.settings.obfuscateSettingFile ? "enable" : "disable"
            }`
          )
          .onChange(async (val) => {
            if (val === "enable") {
              this.plugin.settings.obfuscateSettingFile = true;
            } else {
              this.plugin.settings.obfuscateSettingFile = false;
            }
            await this.plugin.saveSettings();
          });
      });

    new Setting(debugDiv)
      .setName(t("settings_viewconsolelog"))
      .setDesc(stringToFragment(t("settings_viewconsolelog_desc")));

    const debugDivExportSyncPlans = new Setting(debugDiv)
      .setName(t("settings_syncplans"))
      .setDesc(t("settings_syncplans_desc"));
    debugDivExportSyncPlans.settingEl.addClass("setting-need-wrapping");
    debugDivExportSyncPlans
      .addButton(async (button) => {
        button.setButtonText(t("settings_syncplans_button_1_only_change"));
        button.onClick(async () => {
          await exportVaultSyncPlansToFiles(
            this.plugin.db,
            this.app.vault,
            this.plugin.vaultRandomID,
            1,
            true
          );
          new Notice(t("settings_syncplans_notice"));
        });
      })
      .addButton(async (button) => {
        button.setButtonText(t("settings_syncplans_button_5_only_change"));
        button.onClick(async () => {
          await exportVaultSyncPlansToFiles(
            this.plugin.db,
            this.app.vault,
            this.plugin.vaultRandomID,
            5,
            true
          );
          new Notice(t("settings_syncplans_notice"));
        });
      })
      .addButton(async (button) => {
        button.setButtonText(t("settings_syncplans_button_1"));
        button.onClick(async () => {
          await exportVaultSyncPlansToFiles(
            this.plugin.db,
            this.app.vault,
            this.plugin.vaultRandomID,
            1,
            false
          );
          new Notice(t("settings_syncplans_notice"));
        });
      })
      .addButton(async (button) => {
        button.setButtonText(t("settings_syncplans_button_5"));
        button.onClick(async () => {
          await exportVaultSyncPlansToFiles(
            this.plugin.db,
            this.app.vault,
            this.plugin.vaultRandomID,
            5,
            false
          );
          new Notice(t("settings_syncplans_notice"));
        });
      })
      .addButton(async (button) => {
        button.setButtonText(t("settings_syncplans_button_all"));
        button.onClick(async () => {
          await exportVaultSyncPlansToFiles(
            this.plugin.db,
            this.app.vault,
            this.plugin.vaultRandomID,
            -1,
            false
          );
          new Notice(t("settings_syncplans_notice"));
        });
      });

    new Setting(debugDiv)
      .setName(t("settings_delsyncplans"))
      .setDesc(t("settings_delsyncplans_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("settings_delsyncplans_button"));
        button.onClick(async () => {
          await clearAllSyncPlanRecords(this.plugin.db);
          new Notice(t("settings_delsyncplans_notice"));
        });
      });

    new Setting(debugDiv)
      .setName(t("settings_delprevsync"))
      .setDesc(t("settings_delprevsync_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("settings_delprevsync_button"));
        button.onClick(async () => {
          await clearAllPrevSyncRecordByVault(
            this.plugin.db,
            this.plugin.vaultRandomID
          );
          new Notice(t("settings_delprevsync_notice"));
        });
      });

    new Setting(debugDiv)
      .setName(t("settings_profiler_results"))
      .setDesc(t("settings_profiler_results_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("settings_profiler_results_button_all"));
        button.onClick(async () => {
          await exportVaultProfilerResultsToFiles(
            this.plugin.db,
            this.app.vault,
            this.plugin.vaultRandomID
          );
          new Notice(t("settings_profiler_results_notice"));
        });
      });

    new Setting(debugDiv)
      .setName(t("settings_profiler_enableprofiler"))
      .setDesc(t("settings_profiler_enableprofiler_desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("enable", t("enable"));
        dropdown.addOption("disable", t("disable"));
        dropdown
          .setValue(
            this.plugin.settings.profiler?.enable ? "enable" : "disable"
          )
          .onChange(async (val: string) => {
            if (this.plugin.settings.profiler === undefined) {
              this.plugin.settings.profiler = DEFAULT_PROFILER_CONFIG;
            }
            this.plugin.settings.profiler.enable = val === "enable";
            await this.plugin.saveSettings();
          });
      });

    new Setting(debugDiv)
      .setName(t("settings_profiler_enabledebugprint"))
      .setDesc(t("settings_profiler_enabledebugprint_desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("enable", t("enable"));
        dropdown.addOption("disable", t("disable"));
        dropdown
          .setValue(
            this.plugin.settings.profiler?.enablePrinting ? "enable" : "disable"
          )
          .onChange(async (val: string) => {
            if (this.plugin.settings.profiler === undefined) {
              this.plugin.settings.profiler = DEFAULT_PROFILER_CONFIG;
            }
            this.plugin.settings.profiler.enablePrinting = val === "enable";
            await this.plugin.saveSettings();
          });
      });

    new Setting(debugDiv)
      .setName(t("settings_profiler_recordsize"))
      .setDesc(t("settings_profiler_recordsize_desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("enable", t("enable"));
        dropdown.addOption("disable", t("disable"));
        dropdown
          .setValue(
            this.plugin.settings.profiler?.recordSize ? "enable" : "disable"
          )
          .onChange(async (val: string) => {
            if (this.plugin.settings.profiler === undefined) {
              this.plugin.settings.profiler = DEFAULT_PROFILER_CONFIG;
            }
            this.plugin.settings.profiler.recordSize = val === "enable";
            await this.plugin.saveSettings();
          });
      });

    new Setting(debugDiv)
      .setName(t("settings_outputbasepathvaultid"))
      .setDesc(t("settings_outputbasepathvaultid_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("settings_outputbasepathvaultid_button"));
        button.onClick(async () => {
          new Notice(this.plugin.getVaultBasePath());
          new Notice(this.plugin.vaultRandomID);
        });
      });

    new Setting(debugDiv)
      .setName(t("settings_resetcache"))
      .setDesc(t("settings_resetcache_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("settings_resetcache_button"));
        button.onClick(async () => {
          await destroyDBs();
          new Notice(t("settings_resetcache_notice"));
          this.plugin.unload();
        });
      });
  }

  hide() {
    const { containerEl } = this;
    containerEl.empty();
    super.hide();
  }
}
