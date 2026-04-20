# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OB Sync is an Obsidian plugin that synchronizes vaults with remote cloud storage services. It supports WebDAV and OneDrive (free tier), with additional services in the Pro version.

## Build & Development Commands

```bash
# Development (watch mode)
npm run dev          # Esbuild, development + watch

# Production build
npm run build        # Esbuild production (runs tsc -noEmit first)

# Code quality
npm run format       # Biome check --write (formatter + linter)

# Tests
npm test             # Mocha with tsx, runs tests/**/*.ts and pro/tests/**/*.ts

# Cleanup
npm run clean        # Remove main.js
```

## Architecture

### Build System

Esbuild (`esbuild.config.mjs`) outputs a single `main.js` bundle. The plugin runs inside Obsidian's browser-like environment — Node.js modules are polyfilled via the `browser` field in `package.json` (path → path-browserify, crypto → crypto-browserify, etc.).

### Core Abstraction: `FakeFs`

All remote and local storage backends implement the abstract `FakeFs` class ([src/fsAll.ts](../src/fsAll.ts)). Key methods: `walk`, `stat`, `mkdir`, `writeFile`, `readFile`, `rename`, `rm`, `checkConnect`.

Implementations:
- `FakeFsWebdav` ([src/fsWebdav.ts](../src/fsWebdav.ts)) — WebDAV protocol
- `FakeFsOnedrive` ([src/fsOnedrive.ts](../src/fsOnedrive.ts)) — Microsoft Graph API
- `FakeFsLocal` ([src/fsLocal.ts](../src/fsLocal.ts)) — Local vault filesystem
- `FakeFsEncrypt` ([src/fsEncrypt.ts](../src/fsEncrypt.ts)) — Encryption wrapper (decorator pattern, wraps any `FakeFs`)
- `FakeFsMock` ([src/fsMock.ts](../src/fsMock.ts)) — In-memory mock for testing

Service selection happens in [src/fsGetter.ts](../src/fsGetter.ts) via a factory function `getClient()`.

### Sync Engine

The sync logic lives in [pro/src/sync.ts](../pro/src/sync.ts) (~73KB). It handles:
- Bidirectional incremental sync with change detection
- Direction modes: bidirectional, pull-only, push-only, pull+delete, push+delete
- Conflict resolution (basic + smart merge via [pro/src/conflictLogic.ts](../pro/src/conflictLogic.ts))
- File copy operations via [src/copyLogic.ts](../src/copyLogic.ts)
- Metadata tracking on remote (`metadataOnRemote`)

### Data Persistence

- **Plugin settings**: Stored via Obsidian's `loadData`/`saveData`, wrapped in base64-encoded "messy config" ([src/configPersist.ts](../src/configPersist.ts))
- **Sync state/history**: IndexedDB via `localforage` ([src/localdb.ts](../src/localdb.ts)) — tracks previous sync records, sync plan history, profiler results
- **DB versioning**: Schema migrations tracked by numeric version codes

### Encryption

Two cipher methods supported: `rclone-base64` and `openssl-base64`. Encryption runs in a Web Worker ([src/encryptRClone.worker.ts](../src/encryptRClone.worker.ts)) to avoid blocking the UI. `FakeFsEncrypt` wraps any `FakeFs` instance to add transparent encryption/decryption.

### Plugin Entry Point

[src/main.ts](../src/main.ts) (~1115 lines) registers the plugin with Obsidian, handling:
- Settings UI via [src/settings.ts](../src/settings.ts)
- Ribbon icons and command palette entries
- Scheduled sync triggers
- OAuth2 flows for OneDrive
- QR code import/export of settings

### Key Conventions

- Paths are normalized to POSIX format (forward slashes) throughout the codebase
- Entity types (`Entity`, `MixedEntity`) in [src/baseTypes.ts](../src/baseTypes.ts) represent files/folders with metadata
- `SUPPORTED_SERVICES_TYPE` is the union type `"webdav" | "onedrive"` — Pro adds more via its own types
- i18n uses [src/i18n.ts](../src/i18n.ts) with translation files in `src/langs/` and `pro/src/langs/`
- Settings are obfuscated with base64 before storage for security

### Testing

Tests use Mocha + tsx runner. Located in `tests/` directory. The `FakeFsMock` class enables unit testing without real remote connections. Test command: `npm test`.
