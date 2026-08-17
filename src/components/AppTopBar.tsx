import { StyleSheet, Text, View } from 'react-native';
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
};

type AppTopBarProps = {
  title: string;
  leftAction?: Action;
  actions?: Action[];
};

export function AppTopBar({ title, leftAction, actions = [] }: AppTopBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 6 }]}>
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
              <AppIcon name={leftAction.icon} size={24} />
            </BouncyPressable>
          ) : null}
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.actions}>
          {actions.map((action) => {
            return (
              <BouncyPressable
                key={action.accessibilityLabel}
                accessibilityLabel={action.accessibilityLabel}
                accessibilityRole="button"
                hitSlop={12}
                onPress={action.onPress}
                pressedScale={0.84}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <AppIcon
                  name={action.icon}
                  size={action.size ?? (action.icon === 'filter' ? 28 : 24)}
                  color={action.color ?? '#fff'}
                />
                {action.badge ? <View style={styles.badgeDot} accessible={false} /> : null}
              </BouncyPressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 72,
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
    gap: 18,
  },
  iconButton: {
    color: '#fff',
    minWidth: 24,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: tokens.colors.accent,
  },
  pressed: {
    opacity: 0.82,
  },
});
