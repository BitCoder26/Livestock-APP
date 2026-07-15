import { Pressable, StyleSheet, Text, View } from 'react-native';
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
              onPress={leftAction.onPress}
              style={styles.iconButton}
            >
              <AppIcon name={leftAction.icon} size={24} />
            </BouncyPressable>
          ) : null}
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.actions}>
          {actions.map((action) => {
            const ActionButton = action.icon === 'filter' || action.icon === 'settings' ? BouncyPressable : Pressable;

            return (
              <ActionButton
                key={action.accessibilityLabel}
                accessibilityLabel={action.accessibilityLabel}
                accessibilityRole="button"
                onPress={action.onPress}
                style={styles.iconButton}
              >
                <AppIcon
                  name={action.icon}
                  size={action.size ?? (action.icon === 'filter' ? 28 : 24)}
                  color={action.color ?? '#fff'}
                />
              </ActionButton>
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
    gap: 14,
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
});
