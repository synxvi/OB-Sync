# ob-sync 插件架构说明

> 版本：0.5.25  
> 基于：[remotely-save](https://github.com/remotely-save/remotely-save)  
> 精简目标：只保留 **WebDAV** 和 **OneDrive** 两个后端，移除付费/账号限制

---

## 目录结构

```
ob-sync-plugin/
├── main.js           # 构建产物，安装到 Obsidian 用
├── manifest.json     # 插件元数据
├── styles.css        # 插件样式
└── source/           # 源码（本目录）
    ├── ARCHITECTURE.md    # 本文档
    ├── package.json       # Node.js 项目配置 & 依赖
    ├── tsconfig.json      # TypeScript 编译配置
    ├── esbuild.config.mjs # esbuild 构建脚本（主用）
    ├── biome.json         # 代码格式化配置
    ├── manifest.json      # 插件元数据
    ├── versions.json      # 版本兼容性记录
    ├── src/               # 核心源码
    └── pro/src/           # 原付费功能源码（已改为内置）
```

---

## 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                      Obsidian 主程序                     │
│  插件生命周期: onload → loadSettings → prepareDB → UI  │
└────────────────────────┬────────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │      main.ts        │  ← 插件入口，Plugin 子类
              │  ObsSyncPlugin │
              └──────────┬──────────┘
                         │
        ┌────────────────┼──────────────────┐
        │                │                  │
   ┌────▼────┐    ┌──────▼──────┐    ┌─────▼──────┐
   │settings │    │  localdb    │    │  syncer()  │
   │ .ts     │    │  .ts        │    │ pro/sync.ts│
   │ 设置界面 │    │ IndexedDB   │    │ 同步核心   │
   └─────────┘    └─────────────┘    └─────┬──────┘
                                           │
              ┌────────────────────────────┤
              │                            │
       ┌──────▼──────┐              ┌──────▼──────┐
       │  FakeFsLocal│              │ FakeFsEncrypt│
       │  本地文件系统│              │ 加密层(透传) │
       └─────────────┘              └──────┬───────┘
                                           │
                              ┌────────────▼──────────────┐
                              │        FakeFs (抽象基类)   │
                              │        fsAll.ts            │
                              └────────────┬──────────────┘
                                           │
                           ┌───────────────┴───────────────┐
                           │                               │
                  ┌────────▼────────┐             ┌────────▼────────┐
                  │  FakeFsOnedrive │             │  FakeFsWebdav   │
                  │  fsOnedrive.ts  │             │  fsWebdav.ts    │
                  │  OneDrive 后端  │             │  WebDAV 后端    │
                  └─────────────────┘             └─────────────────┘
```

---

## 核心模块详解

### 入口层

#### `src/main.ts` — 插件主类
Obsidian Plugin 子类 `ObsSyncPlugin`，负责：
- **生命周期**：`onload()` 初始化，`onunload()` 清理
- **配置管理**：`loadSettings()` / `saveSettings()`，通过 `obfuscateSettingFile=false` 保存明文 JSON
- **同步触发**：手动、定时、保存时自动触发同步
- **OAuth 回调**：处理 OneDrive 授权回调 URI
- **UI 注册**：命令面板、状态栏、Ribbon 图标

#### `src/settings.ts` — 设置面板
实现 `ObsSyncSettingTab`（Obsidian SettingTab），展示所有用户可配置项：
- 当前后端选择（WebDAV / OneDrive）
- 后端连接参数
- 同步行为（方向、冲突策略、定时间隔等）
- 调试 / 导出工具

---

### 文件系统抽象层

#### `src/fsAll.ts` — 抽象基类 `FakeFs`
定义所有后端必须实现的统一接口：

| 方法 | 说明 |
|------|------|
| `walk()` | 全量列出所有文件和文件夹 |
| `walkPartial()` | 增量列出（OneDrive delta，WebDAV 全量） |
| `stat(key)` | 获取单个文件元数据 |
| `mkdir(key)` | 创建目录 |
| `writeFile(key, content, mtime, ctime)` | 上传文件 |
| `readFile(key)` | 下载文件 |
| `rename(key1, key2)` | 重命名/移动 |
| `rm(key)` | 删除 |
| `checkConnect()` | 连通性测试 |
| `getUserDisplayName()` | 获取已登录用户名 |
| `revokeAuth()` | 撤销授权 |

#### `src/fsOnedrive.ts` — OneDrive 后端
- 使用 **Microsoft Graph API** + **MSAL**（`@azure/msal-node`）认证
- OAuth2 PKCE 授权流程，通过 Obsidian URI 回调
- 支持 **Delta API** 增量同步（`walkPartial` 使用 deltaLink）
- Access Token 自动刷新，80 天强制过期重新授权

#### `src/fsWebdav.ts` — WebDAV 后端
- 使用 `webdav` npm 包，支持 Basic / Digest 认证
- 递归模式可配置（`manual_1` / `manual_infinity`）
- 支持自定义 HTTP Headers（用于需要特殊鉴权的服务器）

#### `src/fsEncrypt.ts` — 加密层 `FakeFsEncrypt`
装饰器模式，包裹任意 `FakeFs` 实现。当 `password=""` 时完全透传（不加密）。  
**本版本已移除密码设置界面，永远以透传模式运行。**

#### `src/fsGetter.ts` — 后端工厂
根据 `settings.serviceType` 返回对应的 `FakeFs` 实例：

```typescript
getClient(settings, vaultName, saveUpdatedConfigFunc): FakeFs
// serviceType = "onedrive" → FakeFsOnedrive
// serviceType = "webdav"   → FakeFsWebdav
```

#### `src/fsLocal.ts` — 本地文件系统
通过 Obsidian `FileSystemAdapter` 访问本地 vault，统一封装为 `FakeFsLocal`。

---

### 同步核心层

#### `pro/src/sync.ts` — 同步引擎 `syncer()`
整个同步流程的核心，约 2500 行。主要阶段：

```
1. 预检 (preflight)
   └─ 检查连接、Pro 权限（本版本永远返回 true）

2. 列举 (listing)
   ├─ 本地 walk（fsLocal）
   ├─ 远端 walkPartial（fsRemote）
   └─ 读取历史同步记录（localdb）

3. 决策 (decision making)
   ├─ 对每个文件/文件夹生成 MixedEntity
   ├─ 比较 local / remote / prevSync 三方状态
   └─ 生成 DecisionTypeForMixedEntity（20+ 种决策类型）

4. 执行 (execution)
   ├─ push：本地 → 远端（writeFile / mkdir）
   ├─ pull：远端 → 本地（readFile）
   ├─ delete：同步删除
   └─ smart_conflict：调用 conflictLogic.ts 合并

5. 记录 (bookkeeping)
   └─ 更新 localdb 同步历史
```

#### `pro/src/conflictLogic.ts` — 智能冲突处理
当两端均有修改（冲突）时：
- **Markdown 小文件**（< 1 MB）：使用 **diff3** 算法（`node-diff3`）三方合并
- **大文件或非 Markdown**：保存两份，对其中一份重命名加时间戳后缀

#### `pro/src/account.ts` — Pro 权限检查（存根）
原始版本需要在线验证 Pro 账号，已替换为始终返回 `true` 的存根函数：

```typescript
export const checkProRunnableAndFixInplace = async (...) => {
  return true; // 所有功能内置，无需 Pro 验证
};
```

---

### 数据持久化层

#### `src/localdb.ts` — 本地数据库
使用 **localforage**（基于 IndexedDB）存储：
- 每次同步后各文件的元数据快照（`prevSync`）
- 最近同步时间、失败时间
- 插件版本记录

数据存储在 vault 的 `.obsidian/plugins/ob-sync/` 的 IndexedDB 中，不是 `data.json`。

#### `src/configPersist.ts` — 配置持久化
提供 `normalConfigToMessy` / `messyConfigToNormal` 两个函数，用于 base64 混淆配置文件。  
**本版本已将 `obfuscateSettingFile` 默认设为 `false`，data.json 以明文 JSON 保存。**

---

### 辅助模块

| 文件 | 说明 |
|------|------|
| `src/baseTypes.ts` | 所有核心类型定义（`Entity`、`MixedEntity`、`ObsSyncPluginSettings` 等） |
| `src/baseTypesObs.ts` | Obsidian 相关类型扩展 |
| `src/misc.ts` | 通用工具函数（字符串、时间、路径处理等） |
| `src/i18n.ts` | 国际化框架，根据 Obsidian 语言设置选择语言包 |
| `pro/src/langs/*.json` | 语言包（en / zh_cn / zh_tw） |
| `src/obsFolderLister.ts` | 遍历本地 vault 文件夹，处理忽略规则 |
| `src/importExport.ts` | QR Code 导入/导出配置功能 |
| `src/debugMode.ts` | 导出同步计划历史到文件（调试用） |
| `src/profiler.ts` | 性能分析器（可选开启） |
| `src/metadataOnRemote.ts` | 远端元数据文件管理 |
| `src/copyLogic.ts` | 文件复制辅助逻辑 |
| `src/syncAlgoV3Notice.ts` | 首次使用新版同步算法时的提示弹窗 |
| `src/encryptRClone.ts` | rclone-base64 加密实现（保留，但不启用） |
| `src/encryptOpenSSL.ts` | openssl-base64 加密实现（保留，但不启用） |
| `src/encryptRClone.worker.ts` | rclone 加密的 Web Worker 实现 |
| `pro/src/localdb.ts` | Pro 功能专用 DB 操作（重复文件清理等） |
| `pro/src/clearDupFiles.ts` | 重复文件检测与清理 |
| `pro/src/settingsClearDupFiles.ts` | 重复文件清理的设置 UI |

---

## 数据流：一次完整同步

```
用户点击同步 / 定时触发
    │
    ▼
main.ts: triggerSync()
    │
    ▼
pro/src/sync.ts: syncer()
    ├── fsLocal.walk()          读取本地所有文件状态
    ├── fsRemote.walkPartial()  读取远端变更（OneDrive delta / WebDAV 全量）
    ├── localdb.getXxx()        读取上次同步快照
    │
    ├── 三方比较，生成决策列表
    │     每个文件 → DecisionTypeForMixedEntity
    │     ├── local_is_modified_then_push  → 上传
    │     ├── remote_is_modified_then_pull → 下载
    │     ├── conflict_modified_then_smart_conflict → diff3 合并
    │     ├── local_is_deleted_thus_also_delete_remote → 远端删除
    │     └── ... (20+ 种决策)
    │
    ├── 并发执行所有决策（p-queue 控制并发数）
    │
    └── localdb.upsertXxx()     更新同步历史
```

---

## 配置文件（data.json）

安装并配置插件后，`data.json` 以明文 JSON 保存，关键字段说明：

```jsonc
{
  "serviceType": "onedrive",     // 当前使用的后端：onedrive 或 webdav
  "onedrive": {
    "accessToken": "...",        // OAuth2 访问令牌
    "refreshToken": "...",       // 刷新令牌
    "accessTokenExpiresAtTime": 1234567890,
    "deltaLink": "...",          // OneDrive 增量同步游标
    "remoteBaseDir": "",         // 远端同步根目录（空=vault同名目录）
    "emptyFile": "skip"          // 空文件处理：skip 或 error
  },
  "webdav": {
    "address": "https://...",
    "username": "...",
    "password": "...",
    "authType": "basic",         // basic 或 digest
    "depth": "manual_1",
    "remoteBaseDir": ""
  },
  "conflictAction": "keep_newer",  // 冲突策略：keep_newer / keep_larger / smart_conflict
  "syncDirection": "bidirectional",
  "autoRunEveryMilliseconds": -1,  // -1 表示不自动运行
  "obfuscateSettingFile": false,   // false = 明文保存（本版本默认值）
  "password": "",                  // 加密密码（本版本不使用）
  "ignorePaths": [],               // 忽略路径列表
  "onlyAllowPaths": []             // 白名单路径（空=全部同步）
}
```

---

## 构建说明

```bash
# 安装依赖
npm install

# 生产构建（推荐）
node esbuild.config.mjs production

# 开发构建（监听模式）
node esbuild.config.mjs --watch
```

构建产物：根目录下的 `main.js`。

### 关键 esbuild 配置说明
- **target**: `es2020`（p-queue 依赖 BigInt 字面量语法）
- **external**: 同时列出 `"url"` 和 `"node:url"` 两种格式（新版 npm 包使用 `node:` URL scheme）
- **inline-worker**: 使用 `esbuild-plugin-inline-worker` 将 `encryptRClone.worker.ts` 内联为 blob URL

---

## 安装方法

将 `ob-sync-plugin/` 目录下的三个文件（不含 `source/`）复制到：

```
<你的 Vault>/.obsidian/plugins/ob-sync/
    ├── main.js
    ├── manifest.json
    └── styles.css
```

然后在 Obsidian → 设置 → 社区插件 → 已安装插件 中找到 **OB Sync** 并启用。

---

## 与原版 remotely-save 的差异

| 项目 | remotely-save 原版 | ob-sync |
|------|-------------------|---------|
| 支持后端 | S3/Dropbox/WebDAV/OneDrive/Pcloud/Box | WebDAV + OneDrive |
| smart_conflict | 需要 Pro 账号 | 内置，无需账号 |
| data.json | base64 混淆 | 明文 JSON |
| 密码/加密设置 | 有 | 已移除 |
| Pro 账号系统 | 有 | 已移除（存根始终返回 true） |
| S3/Dropbox 导出配置 | 有 | 已移除 |
