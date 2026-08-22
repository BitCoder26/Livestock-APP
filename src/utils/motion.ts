import { Platform } from 'react-native';

// Interactive motion is intentionally near-instant throughout the app. Sixty
// milliseconds is long enough for Animated callbacks and interpolation to run
// predictably, while remaining short enough that navigation, sheets and cards
// never hold up the user's next action.
export const FAST_MOTION_DURATION = 60;
// Ambient motion still needs enough frames to remain visible rather than flash.
export const FAST_AMBIENT_MOTION_DURATION = 240;

const ANDROID_DURATION_SCALE = 0.6;

export function motionDuration(
  iosDuration: number,
  androidDuration = Math.round(iosDuration * ANDROID_DURATION_SCALE),
) {
  const authoredDuration = Platform.OS === 'android' ? androidDuration : iosDuration;
  return Math.min(authoredDuration, FAST_MOTION_DURATION);
}

// Slide-up sheets: the animals filter and sort sheets, and the filter/selection
// screens presented as transparent modals. They were each carrying their own
// 380ms, which is a long time to wait for a list of options you are about to
// tap. Shared so they cannot drift apart from one another.
export const SHEET_ENTRANCE_DURATION = FAST_MOTION_DURATION;

// Sheets hosted inside React Native's <Modal> rather than presented as a
// navigation screen. RN's Modal puts a new UIViewController on screen, and that
// presentation costs real time *before* any of our animation is visible — so a
// Modal-hosted sheet running SHEET_ENTRANCE_DURATION lands noticeably later
// than a screen-hosted one running the same value. This runs shorter so the two
// feel equivalent end to end. Fixing the cause rather than the symptom means
// dropping <Modal> for an in-tree overlay, which would stop the sheet covering
// the tab bar.
export const MODAL_SHEET_ENTRANCE_DURATION = FAST_MOTION_DURATION;
