import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../theme/text';

import { AppIcon } from './AppIcon';
import { tokens } from '../theme/tokens';

type FieldLabelProps = {
  label: string;
  /**
   * Supplied when the field needs explaining. The explanation goes behind an
   * (i) beside the title rather than under the field as helper text: a form
   * where every third field carries a paragraph reads as a manual, and the
   * fields that genuinely need a note are the ones that get skimmed past.
   */
  onInfoPress?: () => void;
  /** Creates a new option for the field without adding another helper row. */
  onAddPress?: () => void;
  addAccessibilityLabel?: string;
};

/** A form-field title with optional contextual info and create-option actions. */
export function FieldLabel({ label, onInfoPress, onAddPress, addAccessibilityLabel }: FieldLabelProps) {
  if (!onInfoPress && !onAddPress) {
    return <Text style={styles.label}>{label}</Text>;
  }

  return (
    <View style={styles.row}>
      <View style={styles.titleGroup}>
        <Text style={styles.label}>{label}</Text>
        {onInfoPress ? (
          <Pressable
            accessibilityLabel={`About ${label}`}
            accessibilityRole="button"
            hitSlop={10}
            onPress={onInfoPress}
          >
            <AppIcon name="info" size={15} color={tokens.colors.textSoft} />
          </Pressable>
        ) : null}
      </View>
      {onAddPress ? (
        <Pressable
          accessibilityLabel={addAccessibilityLabel ?? `Add ${label.replace(/\s*\*$/, '').toLowerCase()}`}
          accessibilityRole="button"
          hitSlop={9}
          onPress={onAddPress}
          style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
        >
          <AppIcon name="plus" size={11} color="#FFFFFF" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  label: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  addButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.accent,
  },
  addButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.94 }],
  },
});
