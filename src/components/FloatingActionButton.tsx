import type { Ref } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppIcon, type AppIconName } from './AppIcon';
import { BouncyPressable } from './BouncyPressable';
import {
  FLOATING_ACTION_BUTTON_EDGE_OFFSET,
  FLOATING_ACTION_BUTTON_GLYPH_SIZE,
  FLOATING_ACTION_BUTTON_SIZE,
  tokens,
} from '../theme/tokens';

type FloatingActionButtonProps = {
  accessibilityLabel: string;
  onPress?: () => void;
  icon?: AppIconName;
  bottomOffset?: number;
  /** Exposes the button's positioner so callers can measure it (e.g. onboarding spotlight). */
  positionerRef?: Ref<View>;
};

export function FloatingActionButton({
  accessibilityLabel,
  onPress,
  icon = 'plus',
  bottomOffset,
  positionerRef,
}: FloatingActionButtonProps) {
  return (
    <View
      ref={positionerRef}
      collapsable={false}
      style={[styles.positioner, bottomOffset === undefined ? null : { bottom: bottomOffset }]}
    >
      <BouncyPressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        containerStyle={styles.button}
        onPress={onPress}
        pressedScale={0.94}
        style={({ pressed }) => [styles.buttonPressable, pressed && styles.pressed]}
      >
        <AppIcon name={icon} size={FLOATING_ACTION_BUTTON_GLYPH_SIZE} color="#fff" />
      </BouncyPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  positioner: {
    position: 'absolute',
    right: FLOATING_ACTION_BUTTON_EDGE_OFFSET,
    bottom: FLOATING_ACTION_BUTTON_EDGE_OFFSET,
    width: FLOATING_ACTION_BUTTON_SIZE,
    height: FLOATING_ACTION_BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    width: FLOATING_ACTION_BUTTON_SIZE,
    height: FLOATING_ACTION_BUTTON_SIZE,
    borderRadius: FLOATING_ACTION_BUTTON_SIZE / 2,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  buttonPressable: {
    width: '100%',
    height: '100%',
    borderRadius: FLOATING_ACTION_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.9,
  },
});
