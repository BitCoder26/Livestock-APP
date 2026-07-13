import { StyleSheet, Text, View } from 'react-native';

import { AppIconName } from './AppIcon';
import { IconButton } from './IconButton';
import { tokens } from '../theme/tokens';

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: Array<{
    icon: AppIconName;
    accessibilityLabel: string;
  }>;
};

export function AppHeader({ title, subtitle, actions = [] }: AppHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.topRow}>
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {actions.length ? (
          <View style={styles.actions}>
            {actions.map((action) => (
              <IconButton
                key={action.accessibilityLabel}
                icon={action.icon}
                accessibilityLabel={action.accessibilityLabel}
              />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 98,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.colors.accent,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: 14,
    paddingBottom: 12,
    marginBottom: tokens.spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
    flex: 1,
    marginTop: 30,
  },
  copy: {
    flex: 1,
    justifyContent: 'center',
    gap: 6,
  },
  title: {
    color: tokens.colors.surface,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    alignSelf: 'center',
  },
});
