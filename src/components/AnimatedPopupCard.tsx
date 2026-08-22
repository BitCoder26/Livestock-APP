import { useEffect, useRef } from 'react';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { Animated, Easing, Pressable } from 'react-native';

import { FAST_MOTION_DURATION } from '../utils/motion';

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
    Animated.timing(entrance, {
      toValue: 1,
      duration: FAST_MOTION_DURATION,
      easing: Easing.out(Easing.cubic),
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
