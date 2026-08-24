export const tokens = {
  colors: {
    accent: '#DD6560',
    accentDeep: '#C95A55',
    accentSoft: '#F7E3E1',
    upgradeGold: '#E0A11F',
    background: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceMuted: '#EFECF0',
    text: '#171717',
    textSoft: '#666666',
    muted: '#8A8A8A',
    border: '#E7E0E2',
    success: '#E4EB92',
    warning: '#F1CF4B',
    danger: '#F16A6A',
    shadow: 'rgba(23, 23, 23, 0.12)',
  },
  radius: {
    sm: 12,
    md: 20,
    lg: 28,
    pill: 999,
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 22,
    xl: 28,
  },
  type: {
    title: 18,
    body: 15,
    meta: 12,
  },
} as const;

// One geometry source keeps the list-screen + button and full-screen save
// button identical in size and aligned to the same right/bottom edges.
export const FLOATING_ACTION_BUTTON_SIZE = 74;
export const FLOATING_ACTION_BUTTON_EDGE_OFFSET = 24;
export const FLOATING_ACTION_BUTTON_GLYPH_SIZE = 25;

export const TAB_BAR_STYLE = {
  height: 88,
  paddingTop: 11,
  paddingBottom: 9,
  backgroundColor: '#EAE7EA',
  borderTopColor: '#CCCACC',
};

// Add forms cover the full screen, while list FABs sit in the tab scene above
// this fixed-height bar. This keeps the two button centres at the same window
// coordinate; a safe-area-derived offset left the save tick lower on Android.
export const TAB_ALIGNED_FAB_BOTTOM_OFFSET =
  TAB_BAR_STYLE.height + FLOATING_ACTION_BUTTON_EDGE_OFFSET;

export const ANIMAL_CARD_AVATAR_SIZE = 66;
export const ANIMAL_CARD_AVATAR_RADIUS = 22;
export const ANIMAL_CARD_AVATAR_ICON_SIZE = 35;
