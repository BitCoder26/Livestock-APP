import { useEffect, useRef } from 'react';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { Animated, Pressable } from 'react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type AnimatedPopupCardProps = Omit<PressableProps, 'style'> & {
  visible: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AnimatedPopupCard({
  visible,
  style,
  ...props
}: AnimatedPopupCardProps) {
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    entrance.stopAnimation();

    if (!visible) {
      entrance.setValue(0);
      return;
    }

    entrance.setValue(0);
    // This spring is the popup's whole entrance. The Modals wrapping these
    // cards are deliberately animationType="none": RN's Modal fade is a fixed
    // ~300ms that used to play *before* this spring even started, so every
    // dropdown cost the fade plus the spring. With the fade gone the card is
    // the only thing animating, so it is tuned to arrive quickly and settle
    // almost immediately — critically damped rather than bouncy, since a
    // dropdown that overshoots reads as slower than one that simply appears.
    Animated.spring(entrance, {
      toValue: 1,
      stiffness: 520,
      damping: 38,
      mass: 0.7,
      useNativeDriver: true,
    }).start();

    return () => entrance.stopAnimation();
  }, [entrance, visible]);

  return (
    <AnimatedPressable
      {...props}
      style={[
        style,
        {
          opacity: entrance,
          transform: [
            {
              translateY: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [14, 0],
              }),
            },
            {
              scale: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [0.97, 1],
              }),
            },
          ],
        },
      ]}
    />
  );
}
