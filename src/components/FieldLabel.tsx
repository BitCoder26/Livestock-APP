import { Pressable, StyleSheet, Text, View } from 'react-native';

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
};

/** The title above a form field, with an optional (i) that opens its note. */
export function FieldLabel({ label, onInfoPress }: FieldLabelProps) {
  if (!onInfoPress) {
    return <Text style={styles.label}>{label}</Text>;
  }

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityLabel={`About ${label}`}
        accessibilityRole="button"
        hitSlop={10}
        onPress={onInfoPress}
      >
        <AppIcon name="info" size={15} color={tokens.colors.textSoft} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
});
