# Livestock App Handoff

Purpose: attach this document or the generated PDF in the next chat so the next assistant can continue with the right context immediately.

## Current Situation

- The working workspace is `/Users/admin/Documents/Livestock APP` and it is currently an empty Git repository.
- A separate folder exists at `/Users/admin/Documents/projects/livestock-app` containing design assets in an `Icons` directory.
- The app designs were supplied as screenshots for a mobile livestock management app.
- No verified app source code, framework setup, backend, or test suite was found in the current workspace during this session.
- Safe assumption for the next chat: this is a fresh build unless the user provides or grants access to an existing codebase.

## Product Goal

- Build a mobile livestock management app from the provided designs and icon assets.
- Get it live as fast as possible without introducing fragile architecture or known bug risk.
- Prioritize correctness in records, animals, exports, setup/reference data, media attachments, and navigation.

## Screens In The Designs

- Records list
- Records filter modal
- Add record form
- Animal selection modal
- Animals list
- Animal timeline/detail history
- Add animal form
- Species selection modal
- Setup dashboard
- Farms list
- Add farm form
- Export for records
- Export for animals
- Settings screen

## Core Domain Objects

- Animal
- Record
- Farm
- Field/Paddock
- Group
- Medicine
- Preferences
- Export outputs (PDF and spreadsheet)

## High-Risk Areas

- Validation and business rules
- Export correctness
- Photo permissions and storage
- Offline/local data consistency
- Conditional record-type forms

## Recommended Build Sequence

1. Freeze v1 scope to the screens shown in the designs.
2. Choose delivery target and technical stack.
3. Set up repo standards, CI, tests, and environments.
4. Normalize icon assets from the external `Icons` folder.
5. Build the design system and shared components.
6. Define the data model, validation rules, and navigation architecture.
7. Implement setup/reference data flows.
8. Build animals flows.
9. Build records flows.
10. Build export flows.
11. Build settings/support screens.
12. Add analytics, crash reporting, and QA seed data.
13. Run automated and manual testing.
14. Prepare store assets and release builds.
15. Launch with monitoring and hotfix readiness.

## Best Immediate Next Step

In the next chat, ask the assistant to either scaffold the app in `/Users/admin/Documents/Livestock APP` from scratch using the designs, or inspect an existing codebase if you provide its exact location and grant access.
