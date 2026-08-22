import { StyleSheet, View } from 'react-native';
import { Text } from '../theme/text';

type RecordKindChipProps = {
  /** Title-cased kind: Individual, Herd, Flock, Batch… */
  label: string;
  /**
   * How the badge is filled. A group record gets a soft grey ground so it
   * carries at a glance down a long list; an individual one stays on the
   * card's own white behind a grey outline, because that is the ordinary case
   * and does not need announcing. Both stay in grey and both keep the same
   * box, so a list mixing the two reads as one pair rather than two designs.
   */
  tone?: 'group' | 'individual';
  /**
   * 'card' is the compact badge the record list uses beside the date.
   * 'form' is the same badge one step up in size, for the Add Record screens
   * where it stands alone rather than sitting in a row of other chips.
   */
  size?: 'card' | 'form';
};

/** The outline and the label on an individual badge. */
const GREY = '#6F6873';
/** A group badge's ground, and the darker grey its label needs to sit on it. */
const GREY_FILL = '#ECE9EF';
const GREY_INK = '#4C4653';

/**
 * Says whether a record belongs to one animal or to a group. Set in the card's
 * own meta size and weight, matching the date and the animal summary beside
 * it, so the badge reads as part of the card's text rather than as a separate
 * voice. Shared so the Add Record screens label themselves with exactly the
 * badge the saved record will carry in the list.
 */
export function RecordKindChip({ label, tone = 'group', size = 'card' }: RecordKindChipProps) {
  const individual = tone === 'individual';

  return (
    <View style={[styles.chip, individual && styles.chipIndividual, size === 'form' && styles.chipForm]}>
      <Text style={[styles.text, individual && styles.textIndividual, size === 'form' && styles.textForm]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Both tones carry a border, the filled one in its own ground colour, so the
  // two are the same height to the pixel and a mixed list never jitters.
  chip: {
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 3,
    backgroundColor: GREY_FILL,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GREY_FILL,
    flexShrink: 0,
  },
  chipIndividual: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CFC7CC',
  },
  chipForm: {
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  text: {
    color: GREY_INK,
    fontSize: 13,
    fontWeight: '500',
  },
  textIndividual: {
    color: GREY,
  },
  textForm: {
    fontSize: 15,
  },
});
