import { StyleSheet, Text, View } from 'react-native';

import { tokens } from '../theme/tokens';

type ChipTone = 'accent' | 'accentSoft' | 'neutral' | 'success' | 'warning' | 'danger';

type ChipProps = {
  label: string;
  tone?: ChipTone;
};

const toneStyles: Record<ChipTone, { backgroundColor: string; color: string }> = {
  accent: { backgroundColor: tokens.colors.accent, color: tokens.colors.surface },
  accentSoft: { backgroundColor: tokens.colors.accentSoft, color: tokens.colors.accentDeep },
  neutral: { backgroundColor: tokens.colors.surface, color: tokens.colors.textSoft },
  success: { backgroundColor: tokens.colors.success, color: tokens.colors.text },
  warning: { backgroundColor: tokens.colors.warning, color: tokens.colors.text },
  danger: { backgroundColor: tokens.colors.danger, color: tokens.colors.surface },
};

export function Chip({ label, tone = 'neutral' }: ChipProps) {
  return (
    <View style={[styles.chip, { backgroundColor: toneStyles[tone].backgroundColor }]}>
      <Text style={[styles.label, { color: toneStyles[tone].color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
});
