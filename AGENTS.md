# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Architecture notes

## PDF generation

All PDF export/branding logic (business logo resolution, shared header/CSS styling, file creation, share-sheet handoff) lives in `src/utils/pdfExport.ts` — one module used by both the Export tab (row/table PDFs) and Reports (summary PDF), so every PDF the app produces reads as one consistent document. Add a new PDF surface by calling `buildPdfDocument({ extraStyles, bodyHtml, ... })` with layout-specific CSS/markup, not by duplicating the header/branding code.

`expo-print`'s PDF generation goes through WKWebView's iOS print pipeline, which — confirmed by hand, not just by spec-reading — **ignores page-break CSS entirely**: neither `page-break-before`/`page-break-inside` nor the modern `break-before`/`break-inside` have any effect, on a `<table>` or on a wrapping `<div>`. Two consequences to keep in mind on any row-table PDF (`buildPdfHtml` in `(tabs)/export.tsx`):
- A table's `<thead>` does not repeat on continuation pages — a long export's page 2+ has no column headers, and there is currently no known fix short of generating each page as a separate print job and merging the PDFs (a real dependency addition, not attempted). Manually chunking rows into per-page `<table>`s with a forced page-break was tried first and produced byte-identical output to the unchunked version — proof the break hint was simply not honored, not that the chunk size was wrong.
- Because rows can't be forced to split at a chosen point, don't rely on a specific row count landing on a specific page — pagination is purely automatic content-overflow, matching this engine's own layout, not any CSS instruction.

## Backup & Restore

`src/services/backupService.ts` is the single source of truth for the backup file format (`backupFormatVersion`, currently `2`) and for building/validating/restoring backups. Its schema is derived directly from the live entity types (`Animal`, `Collective`, `RecordEntry`, `FarmEntity`, `LocationEntity`, `LabelEntity`, `MedicineEntity`) rather than a hand-rolled second shape — extending an entity automatically flows into future backups with no changes needed here.

Version `2` added `data.collectives` (herds and flocks). A version `1` file still restores — a missing `collectives` key reads as an empty list, not a malformed file — while a version `2` file opened by an older build is refused outright with the "update the app" message rather than silently restoring without every herd and flock. Collective uids are preserved verbatim on restore, never regenerated: a collective record points at one through `collectiveUid`, and a `CollectiveCountEvent` can carry the `recordId` that caused it, so new uids would cut every group loose from its own records.

Restore is transactional: `AccountContext.restoreFromBackup` snapshots current state, writes the new state via one `AsyncStorage.multiSet` (animals/collectives/records/setup) plus `saveAccountProfile`, and rolls back to the snapshot on any failure. Every store in that write must sit on the same engine (`expo-sqlite/kv-store`) or it cannot join the transaction. This requires each data context to expose a persistence-free "sync local state" escape hatch, used only by restore (the write itself already happened via the cross-context `multiSet`):
- `AnimalsContext`: `getAnimalsSnapshot` / `replaceAnimalsFromTransaction`
- `CollectivesContext`: `getCollectivesSnapshot` / `replaceCollectivesFromTransaction`
- `RecordsContext`: `getRecordsSnapshot` / `replaceRecordsFromTransaction`
- `SetupContext`: `replaceSetupFromTransaction`

These contexts also export their internal normalization helpers (`normalizeStoredAnimal`, `normalizeStoredCollective`, `normalizeStoredSetup`, `isStoredAnimal`, `isStoredCollective`, `isStoredRecord`, `isStoredSetup`, `ensureUniqueRecordIds`) so `backupService` reuses the exact same logic the app already applies when loading its own storage on launch. Don't reimplement a parallel validation/normalization path when restoring — extend the shared one.

Anything that resets or erases app data has to cover the same stores as the backup, or a "Reset app data" leaves orphans behind: `resetAppData` and `deleteAccount` in `AccountContext` clear animals, collectives, records and setup together.

**Photos travel only when the backup is an archive.** `imageUris` on `Animal`, `Collective` and `RecordEntry` (and `profile.businessLogoUri`) are file paths into the app's document directory — the four directories in `src/utils/imageStorage.ts`. A plain `.json` backup carries the paths but not the bytes; switching on "Include photos in backup" (Settings, stored device-locally under `livestockbook.backupIncludePhotos.v1`) produces a `.zip` instead, holding `backup.json` plus a `photos/<directory>/<filename>` tree. Both shapes restore through the same path — `readBackupSource` sniffs the file's leading bytes rather than trusting its extension, since a file handed over by a messaging app often arrives misnamed.

The archive is written by `src/utils/zipArchive.ts`, hand-rolled against `expo-file-system`'s file handles rather than a zip library, and stored rather than deflated. Both choices are about memory: a JS zip library assembles the archive as one buffer, and at a measured ~250KB per stored photo a thousand-animal farm is ~250MB, which iOS kills the app for long before it finishes. Writing through a handle holds one photo at a time regardless of how many there are. Deflating is pointless work on JPEG and PNG. The format is the classic 32-bit one — no Zip64 — so it refuses rather than corrupts past 4GB or 65,535 entries.

Only photos the data actually references are collected, so orphaned files in the image directories are left behind rather than inflating the archive. On restore, photos are written back **after** the data has landed, and their failures are reported rather than thrown: the records are the irreplaceable half and are already safe by then. An entry whose path is not one of the four known image directories is skipped, so a hand-edited archive cannot place files anywhere it likes.

**Lists draw thumbnails, detail screens draw the photo.** `ensureThumbnail` keeps a 256px copy of every photo in `photo-thumbnails/`, and the `useThumbnailUri` hook is what card avatars use — a screen of animal cards otherwise decodes one 1600px JPEG per row, which is what makes a long list stutter. Measured on device: 591KB → 11KB, 482KB → 12KB, 101KB → 14KB.

Thumbnails are a derived cache, never data. They live outside the four image directories, so `describeStoredImage` does not recognise them, `imageFileFor` refuses to write to their directory, and `collectBackupPhotos` (which only gathers photos the records actually reference) leaves them out of backups. Deleting the whole directory costs nothing: a missing thumbnail is generated the next time that photo is displayed, and until then the full-size photo is drawn instead. That same lazy path is how photos taken before thumbnails existed get filled in — as they are browsed, rather than by re-encoding a farm's entire library at launch.

**Stored photo paths are re-pointed at the current container on every read**, by `resolveStoredImageUri` inside `filterAccessibleImageUris`. iOS names the app's data container with a UUID that changes on device migration or restore-from-backup: the files come across, the absolute path they were saved under does not. Rebuilding the path from the two stable parts — the directory name and the filename — is what keeps a photo attached across that. Without it the reference doesn't merely fail to render; the old code fed the dead path straight into an existence check and wrote the filtered list back to storage, so the *reference itself* was deleted on the next load and the photo was orphaned permanently. Anything that reads `imageUris` off storage has to go through this helper — `RecordsContext` applies it on load precisely because View Record renders `record.imageUris[0]` directly.

The backup deliberately excludes: subscription `plan` (always sourced from RevenueCat/`SubscriptionContext`, never a backup file — restoring an old `plan` value would be meaningless since `accountStorage.loadAccountProfile` already normalizes any stored `'Pro'` back to `'Basic'` on load), and the `lastExportedAt` / `backupNudgeSnoozedUntil` reminder timestamps (device-local bookkeeping, not portable configuration). The same reasoning excludes the three device-local UI keys — `livestockbook.onboarding.v1`, `livestockbook.reviewGateState.v2` and `livestockbook.importPrompt.dismissed.v1` — which describe what this device has been shown, not what the farm holds.

`expo-document-picker` was added as a new native dependency for Restore's file picker — after `npm install` on a machine that hasn't rebuilt since, it needs `pod install` plus a fresh native build (see the `ios-native-build-fixes` project memory for the required Xcode 26.0.1 patches that also need to be in place).

## Record types

`src/constants/records.ts` holds two canonical lists. `RECORD_TYPES` covers records belonging to individually identified animals; `COLLECTIVE_RECORD_TYPES` covers records belonging to a herd or flock. Add/Edit Record's type chips, the Records filter screen, the Export tab's type filter, and Reports' Activity breakdown all derive their lists from these — `ALL_RECORD_TYPES` is the union, deduplicated, and the two filter screens narrow it further through `deriveRecordTypeOptions` (types actually present in the user's records, so a sheep keeper is never offered Egg Production).

`Count` was removed entirely, including the `headCount` field on `RecordEntry` and its dedicated species/farm/paddock/head-count form section — don't reintroduce it without deliberately restoring that retired UI from git history.

**The stored type is canonical and never varies; only its wording does.** A flock's Births record is labelled `Hatch` for poultry, but it is still stored as `Births`, so a hatch and a lambing group together in Reports and in the filter. That wording lives in `collectiveRecordTypeLabel`, and `recordTypeHeadline` (in `src/utils/recordCollectives.ts`) is what every card, timeline and list actually renders — never `record.type` directly. `recordTypeHeadline` also resolves `Other` to the free-text title the keeper typed, which is the whole point of that type.

Types renamed after shipping go in `LEGACY_RECORD_TYPE_RENAMES`, applied by `migrateLegacyRecordTypes` on load in `RecordsContext` (it rewrites the `Type: detail` prefix in `title` too, or View Record's prefix-stripping keeps showing the dead name). `Average Weight` → `Weight` and `Count Correction` → `Headcount` went through this route.

### Collective-only shapes worth knowing

- **`Headcount`** is the one count-changing type that asks for a *total* rather than a quantity. `affectedCount` holds a **signed delta** on it, not a head count — anything reading `affectedCount` as a quantity has to branch on `isHeadcountRecord` first, or it renders "-12 of the flock". The typed figure lives in `newCount`. Its stored `CollectiveCountEventReason` stays `Correction`, deliberately: that is the honest word on the flock's timeline whatever the button said.
- **`Egg Production`** is the only poultry-gated type (`POULTRY_SPECIES` / `collectiveRecordTypesForSpecies`). `Feed` deliberately is *not* gated — bought feed is the largest input cost on most farms whatever the species.
- **`cost`** on `RecordEntry` is carried by `Feed` and `Other`, and is kept apart from `purchasePrice` so Reports can answer "what did I spend on stock" and "what did it cost to keep them" separately. `Other` is also the only type that may be saved with no animal selected — it is where a farm-level expense goes.

## Navigation animation

Root `Stack` `screenOptions` use `animation: 'simple_push'`, not `'slide_from_right'`. The latter renders as an iOS "card" push — a dimmed background and a rounded-corner peel visible during the transition — which read to users as an unwanted animation glitch (most noticeable at the top-right corner when popping back). `simple_push` gives the same directional slide without that effect.
