# SVG Icon Set

This app keeps the imported livestock design icons as SVG-only assets under `assets/icons/svg`.

Notes:

- The external source folder also contained many PNG variants, but those were intentionally not imported.
- The generic `Copy of M...svg` filenames have been renamed into semantic names such as `records.svg`, `cow-head.svg`, `filter-list.svg`, `tools.svg`, and `plus.svg`.
- UI icons are wired through `src/components/AppIcon.tsx`.
- The root `assets/*.png` files are still Expo launcher and splash placeholders, not the in-app icon system.
