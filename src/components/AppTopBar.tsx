import type { RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../theme/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, AppIconName } from './AppIcon';
import { BouncyPressable } from './BouncyPressable';
import { tokens } from '../theme/tokens';

type Action = {
  icon: AppIconName;
  accessibilityLabel: string;
  onPress?: () => void;
  color?: string;
  size?: number;
  badge?: boolean;
  // Set when a screen anchors a dropdown to this button: the wrapper View is
  // measured in window coordinates so a Modal-drawn menu can sit under it.
  anchorRef?: RefObject<View | null>;
};

type AppTopBarProps = {
  title: string;
  leftAction?: Action;
  actions?: Action[];
};

export function AppTopBar({ title, leftAction, actions = [] }: AppTopBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 16 }]}>
      <View style={styles.row}>
        <View style={styles.leftGroup}>
          {leftAction ? (
            <BouncyPressable
              accessibilityLabel={leftAction.accessibilityLabel}
              accessibilityRole="button"
              hitSlop={12}
              onPress={leftAction.onPress}
              pressedScale={0.84}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <AppIcon name={leftAction.icon} size={28} color={leftAction.color ?? '#fff'} />
            </BouncyPressable>
          ) : null}
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.actions}>
          {actions.map((action) => {
            const button = (
              <BouncyPressable
                accessibilityLabel={action.accessibilityLabel}
                accessibilityRole="button"
                hitSlop={12}
                onPress={action.onPress}
                pressedScale={0.84}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <AppIcon
                  name={action.icon}
                  size={action.size ?? 28}
                  color={action.color ?? '#fff'}
                />
                {action.badge ? <View style={styles.badgeDot} accessible={false} /> : null}
              </BouncyPressable>
            );

            if (action.anchorRef) {
              return (
                <View key={action.accessibilityLabel} ref={action.anchorRef} collapsable={false}>
                  {button}
                </View>
              );
            }

            return <View key={action.accessibilityLabel}>{button}</View>;
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 82,
    backgroundColor: tokens.colors.accent,
    paddingHorizontal: 26,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  title: {
    color: '#fff',
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 26,
  },
  iconButton: {
    color: '#fff',
    minWidth: 28,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.colors.upgradeGold,
    borderWidth: 1,
    borderColor: tokens.colors.accent,
  },
  pressed: {
    opacity: 0.82,
  },
});
