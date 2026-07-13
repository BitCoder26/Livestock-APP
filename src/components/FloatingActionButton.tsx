import { Pressable, StyleSheet } from 'react-native';

import { AppIcon } from './AppIcon';
import { tokens } from '../theme/tokens';

type FloatingActionButtonProps = {
  accessibilityLabel: string;
  onPress?: () => void;
};

export function FloatingActionButton({
  accessibilityLabel,
  onPress,
}: FloatingActionButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <AppIcon name="plus" size={24} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  pressed: {
    opacity: 0.9,
  },
});
