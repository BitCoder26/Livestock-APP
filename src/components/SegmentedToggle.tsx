import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../theme/text';

import { tokens } from '../theme/tokens';
import { FAST_MOTION_DURATION } from '../utils/motion';

export type SegmentedToggleOption<T extends string> = {
  key: T;
  label: string;
  accessibilityLabel?: string;
  // Shown after the label in a lighter weight. Only pass a figure the keeper
  // can read without knowing which filters are applied — a count that moves
  // with a filter belongs next to the list it describes, not in the toggle.
  count?: number;
};

type SegmentedToggleProps<T extends string> = {
  options: SegmentedToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

// One track holding equal-width halves, with the accent thumb sliding between
// them. Two standalone pills read as two separate buttons and resize as the
// selection moves, because each hugged its own label; a shared track keeps the
// pair still and makes the either/or obvious.
export function SegmentedToggle<T extends string>({ options, value, onChange }: SegmentedToggleProps<T>) {
  const [trackWidth, setTrackWidth] = useState(0);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.key === value),
  );
  const segmentWidth = trackWidth > 0 ? (trackWidth - TRACK_PADDING * 2) / options.length : 0;
  const offset = useRef(new Animated.Value(0)).current;
  // The thumb only animates once it knows how far a segment is — before the
  // first layout it would slide in from zero on the very first render.
  const hasMeasured = useRef(false);

  useEffect(() => {
    const target = segmentWidth * selectedIndex;

    if (!hasMeasured.current) {
      if (segmentWidth > 0) {
        hasMeasured.current = true;
      }
      offset.setValue(target);
      return;
    }

    Animated.timing(offset, {
      toValue: target,
      duration: FAST_MOTION_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [offset, segmentWidth, selectedIndex]);

  return (
    <View
      style={styles.track}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          accessible={false}
          pointerEvents="none"
          style={[
            styles.thumb,
            { width: segmentWidth, transform: [{ translateX: offset }] },
          ]}
        />
      ) : null}
      {options.map((option) => {
        const selected = option.key === value;

        return (
          <Pressable
            key={option.key}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.key)}
            style={({ pressed }) => [styles.segment, pressed && styles.pressed]}
          >
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              numberOfLines={1}
              style={[styles.label, selected ? styles.labelActive : styles.labelIdle]}
            >
              {option.label}
              {option.count === undefined ? null : (
                <Text style={selected ? styles.countActive : styles.countIdle}>{`  ${option.count}`}</Text>
              )}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const TRACK_PADDING = 4;
const SEGMENT_HEIGHT = 42;

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(221, 101, 96, 0.14)',
    borderRadius: SEGMENT_HEIGHT / 2 + TRACK_PADDING,
    padding: TRACK_PADDING,
  },
  thumb: {
    position: 'absolute',
    left: TRACK_PADDING,
    top: TRACK_PADDING,
    height: SEGMENT_HEIGHT,
    borderRadius: SEGMENT_HEIGHT / 2,
    backgroundColor: tokens.colors.accent,
  },
  segment: {
    flex: 1,
    minWidth: 0,
    height: SEGMENT_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  labelActive: {
    color: '#fff',
  },
  labelIdle: {
    color: '#8A7F87',
  },
  countActive: {
    color: 'rgba(255, 255, 255, 0.78)',
    fontWeight: '600',
  },
  countIdle: {
    color: '#A79DA3',
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.82,
  },
});
