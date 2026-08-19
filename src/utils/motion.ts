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
