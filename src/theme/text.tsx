import { forwardRef } from 'react';
import { StyleSheet, Text as RNText, TextInput as RNTextInput } from 'react-native';
import type { TextInputProps, TextProps, TextStyle } from 'react-native';

// Manrope ships one static face per weight rather than a single variable
// family, so `fontWeight` alone cannot pick the right file — iOS would
// synthesise a fake bold out of Regular instead. Screens keep writing plain
// weights; these wrappers resolve them to the real face at render time.
const FAMILY_BY_WEIGHT: Record<string, string> = {
  '100': 'Manrope_200ExtraLight',
  '200': 'Manrope_200ExtraLight',
  '300': 'Manrope_300Light',
  '400': 'Manrope_400Regular',
  '500': 'Manrope_500Medium',
  '600': 'Manrope_600SemiBold',
  '700': 'Manrope_700Bold',
  '800': 'Manrope_800ExtraBold',
  '900': 'Manrope_800ExtraBold',
  normal: 'Manrope_500Medium',
  bold: 'Manrope_700Bold',
};

// Body copy sits at 500, not 400: Manrope's Regular reads lighter than the
// system face it replaces, and this app is read at arm's length in a barn.
const DEFAULT_WEIGHT = '500';

export function manropeTextStyle(style: TextProps['style']): TextStyle {
  const flattened = (StyleSheet.flatten(style) ?? {}) as TextStyle;

  // A style that names its own family (an icon font, say) is left alone.
  if (flattened.fontFamily) {
    return flattened;
  }

  const weight = flattened.fontWeight ? String(flattened.fontWeight) : DEFAULT_WEIGHT;

  return {
    ...flattened,
    fontFamily: FAMILY_BY_WEIGHT[weight] ?? FAMILY_BY_WEIGHT[DEFAULT_WEIGHT],
    // Cleared so iOS cannot synthesise weight on top of the face we picked.
    fontWeight: undefined,
  };
}

// Every screen imports Text and TextInput from here rather than from React
// Native directly. React 19 removed defaultProps for function components and
// RN's Text is no longer a forwardRef object, so there is no global hook left
// to patch — one shared wrapper is what keeps the family in a single place.
export const Text = forwardRef<RNText, TextProps>(function AppText({ style, ...props }, ref) {
  return <RNText ref={ref} {...props} style={manropeTextStyle(style)} />;
});

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function AppTextInput(
  { style, ...props },
  ref,
) {
  return <RNTextInput ref={ref} {...props} style={manropeTextStyle(style)} />;
});

// Same names as types too, so `useRef<TextInput>(null)` keeps working.
export type Text = RNText;
export type TextInput = RNTextInput;
