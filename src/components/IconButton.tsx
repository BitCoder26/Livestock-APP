import { Pressable, StyleSheet, ViewStyle } from 'react-native';

import { AppIcon, AppIconName } from './AppIcon';
import { tokens } from '../theme/tokens';

type IconButtonProps = {
  icon: AppIconName;
  accessibilityLabel: string;
  onPress?: () => void;
  variant?: 'light' | 'surface';
  style?: ViewStyle;
};

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = 'light',
  style,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'light' ? styles.light : styles.surface,
        pressed && styles.pressed,
        style,
      ]}
    >
      <AppIcon
        name={icon}
        size={icon === 'filter' ? 24 : 20}
        opacity={variant === 'light' ? 0.95 : 1}
        color={variant === 'light' ? '#fff' : undefined}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 42,
    height: 42,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  light: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  surface: {
    backgroundColor: tokens.colors.surface,
    shadowColor: tokens.colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  pressed: {
    opacity: 0.82,
  },
});
