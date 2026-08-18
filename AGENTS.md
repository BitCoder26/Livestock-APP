# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Architecture notes

## PDF generation

All PDF export/branding logic (business logo resolution, shared header/CSS styling, file creation, share-sheet handoff) lives in `src/utils/pdfExport.ts` — one module used by both the Export tab (row/table PDFs) and Reports (summary PDF), so every PDF the app produces reads as one consistent document. Add a new PDF surface by calling `buildPdfDocument({ extraStyles, bodyHtml, ... })` with layout-specific CSS/markup, not by duplicating the header/branding code.

`expo-print`'s PDF generation goes through WKWebView's iOS print pipeline, which — confirmed by hand, not just by spec-reading — **ignores page-break CSS entirely**: neither `page-break-before`/`page-break-inside` nor the modern `break-before`/`break-inside` have any effect, on a `<table>` or on a wrapping `<div>`. Two consequences to keep in mind on any row-table PDF (`buildPdfHtml` in `(tabs)/export.tsx`):
- A table's `<thead>` does not repeat on continuation pages — a long export's page 2+ has no column headers, and there is currently no known fix short of generating each page as a separate print job and merging the PDFs (a real dependency addition, not attempted). Manually chunking rows into per-page `<table>`s with a forced page-break was tried first and produced byte-identical output to the unchunked version — proof the break hint was simply not honored, not that the chunk size was wrong.
- Because rows can't be forced to split at a chosen point, don't rely on a specific row count landing on a specific page — pagination is purely automatic content-overflow, matching this engine's own layout, not any CSS instruction.

## Backup & Restore

`src/services/backupService.ts` is the single source of truth for the backup file format (`backupFormatVersion`, currently `1`) and for building/validating/restoring backups. Its schema is derived directly from the live entity types (`Animal`, `RecordEntry`, `FarmEntity`, `PaddockEntity`, `GroupEntity`, `MedicineEntity`) rather than a hand-rolled second shape — extending an entity automatically flows into future backups with no changes needed here.

Restore is transactional: `AccountContext.restoreFromBackup` snapshots current state, writes the new state via one `AsyncStorage.multiSet` (animals/records/setup) plus `saveAccountProfile`, and rolls back to the snapshot on any failure. This requires each data context to expose a persistence-free "sync local state" escape hatch, used only by restore (the write itself already happened via the cross-context `multiSet`):
- `AnimalsContext`: `getAnimalsSnapshot` / `replaceAnimalsFromTransaction`
- `RecordsContext`: `getRecordsSnapshot` / `replaceRecordsFromTransaction`
- `SetupContext`: `replaceSetupFromTransaction`

These contexts also export their internal normalization helpers (`normalizeStoredAnimal`, `normalizeStoredSetup`, `isStoredAnimal`, `isStoredRecord`, `isStoredSetup`, `ensureUniqueRecordIds`) so `backupService` reuses the exact same logic the app already applies when loading its own storage on launch. Don't reimplement a parallel validation/normalization path when restoring — extend the shared one.

The backup deliberately excludes: subscription `plan` (always sourced from RevenueCat/`SubscriptionContext`, never a backup file — restoring an old `plan` value would be meaningless since `accountStorage.loadAccountProfile` already normalizes any stored `'Pro'` back to `'Basic'` on load), and the `lastExportedAt` / `backupNudgeSnoozedUntil` reminder timestamps (device-local bookkeeping, not portable configuration).

`expo-document-picker` was added as a new native dependency for Restore's file picker — after `npm install` on a machine that hasn't rebuilt since, it needs `pod install` plus a fresh native build (see the `ios-native-build-fixes` project memory for the required Xcode 26.0.1 patches that also need to be in place).

## Record types

`RECORD_TYPES` in `src/constants/records.ts` is canonical — Add/Edit Record's type chips, the Records filter screen, and Reports' Activity breakdown all derive their lists from it. `Count` was removed entirely, including the `headCount` field on `RecordEntry` and its dedicated species/farm/paddock/head-count form section — don't reintroduce it without deliberately restoring that retired UI from git history.

## Navigation animation

Root `Stack` `screenOptions` use `animation: 'simple_push'`, not `'slide_from_right'`. The latter renders as an iOS "card" push — a dimmed background and a rounded-corner peel visible during the transition — which read to users as an unwanted animation glitch (most noticeable at the top-right corner when popping back). `simple_push` gives the same directional slide without that effect.
