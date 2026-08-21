import { Platform } from 'react-native';

// Durations across the app are authored against iOS, where Core Animation
// makes a longer transition read as polish. The same numbers on Android land
// as sluggishness instead, so they're scaled down there rather than being
// shortened everywhere — iOS keeps the timing it was tuned for.
//
// Only applies to one-shot transitions. Looping/ambient animations (e.g. the
// onboarding spotlight's pulse) are deliberately left alone: speeding those up
// makes them frantic, not snappier.
const ANDROID_DURATION_SCALE = 0.6;

export function motionDuration(
  iosDuration: number,
  androidDuration = Math.round(iosDuration * ANDROID_DURATION_SCALE),
) {
  return Platform.OS === 'android' ? androidDuration : iosDuration;
}

// Slide-up sheets: the animals filter and sort sheets, and the filter/selection
// screens presented as transparent modals. They were each carrying their own
// 380ms, which is a long time to wait for a list of options you are about to
// tap. Shared so they cannot drift apart from one another.
export const SHEET_ENTRANCE_DURATION = motionDuration(200);

// Sheets hosted inside React Native's <Modal> rather than presented as a
// navigation screen. RN's Modal puts a new UIViewController on screen, and that
// presentation costs real time *before* any of our animation is visible — so a
// Modal-hosted sheet running SHEET_ENTRANCE_DURATION lands noticeably later
// than a screen-hosted one running the same value. This runs shorter so the two
// feel equivalent end to end. Fixing the cause rather than the symptom means
// dropping <Modal> for an in-tree overlay, which would stop the sheet covering
// the tab bar.
export const MODAL_SHEET_ENTRANCE_DURATION = motionDuration(130);
