import MaskedView from '@react-native-masked-view/masked-view';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';

const BUTTON_DIAMETER = 68;
const BUTTON_RIGHT = 24;
const BUTTON_BOTTOM_ABOVE_TAB_BAR = 112;
const REVEAL_DURATION = 650;

export function CircularRevealView({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const { width, height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(active ? 0 : 1)).current;
  // MaskedView keeps hit-testing broken for its content even once the mask
  // visually covers the whole screen, so it must be unmounted once the
  // reveal finishes rather than left wrapping the screen forever.
  const [isRevealing, setIsRevealing] = useState(active);

  useEffect(() => {
    if (!active) {
      progress.setValue(1);
      setIsRevealing(false);
      return;
    }

    setIsRevealing(true);
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: REVEAL_DURATION,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });

    animation.start(({ finished }) => {
      if (finished) {
        setIsRevealing(false);
      }
    });

    return () => {
      animation.stop();
    };
  }, [active, progress]);

  if (!isRevealing) {
    return <View style={styles.content}>{children}</View>;
  }

  const radius = BUTTON_DIAMETER / 2;
  const centerX = width - BUTTON_RIGHT - radius;
  const centerY = height - BUTTON_BOTTOM_ABOVE_TAB_BAR - radius;
  const farthestX = Math.max(centerX, width - centerX);
  const farthestY = Math.max(centerY, height - centerY);
  const targetScale = Math.hypot(farthestX, farthestY) / radius;

  return (
    <MaskedView
      androidRenderingMode="software"
      style={styles.content}
      maskElement={
        <View style={styles.mask}>
          <Animated.View
            style={[
              styles.circle,
              {
                left: centerX - radius,
                top: centerY - radius,
                transform: [
                  {
                    scale: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, targetScale],
                    }),
                  },
                ],
              },
            ]}
          />
        </View>
      }
    >
      <View style={styles.content}>{children}</View>
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  mask: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  circle: {
    position: 'absolute',
    width: BUTTON_DIAMETER,
    height: BUTTON_DIAMETER,
    borderRadius: BUTTON_DIAMETER / 2,
    backgroundColor: '#000',
  },
});
