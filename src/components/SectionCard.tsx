import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../theme/text';

import { tokens } from '../theme/tokens';

type SectionCardProps = {
  title: string;
  subtitle: string;
  rightLabel?: string;
  footer?: ReactNode;
};

export function SectionCard({
  title,
  subtitle,
  rightLabel,
  footer,
}: SectionCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        {rightLabel ? (
          <View style={styles.action}>
            <Text style={styles.actionLabel}>{rightLabel}</Text>
          </View>
        ) : null}
      </View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surface,
    padding: tokens.spacing.md,
    shadowColor: tokens.colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    color: tokens.colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  action: {
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionLabel: {
    color: tokens.colors.surface,
    fontSize: 12,
    fontWeight: '700',
  },
  footer: {
    marginTop: tokens.spacing.sm,
  },
});
