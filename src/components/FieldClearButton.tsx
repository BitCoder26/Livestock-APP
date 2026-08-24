import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet } from 'react-native';

import { tokens } from '../theme/tokens';
import { AppIcon } from './AppIcon';

type FieldClearButtonProps = {
  accessibilityLabel: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

/** A quiet in-field action that clears a selected value without opening it. */
export function FieldClearButton({ accessibilityLabel, onPress, style }: FieldClearButtonProps) {
  return (
    <Pressable
      accessibilityHint="Clears the current selection"
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.button, style, pressed && styles.buttonPressed]}
    >
      <AppIcon name="close" size={16} color={tokens.colors.textSoft} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    backgroundColor: tokens.colors.surfaceMuted,
  },
});
