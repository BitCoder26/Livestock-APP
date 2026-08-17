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
    Animated.spring(entrance, {
      toValue: 1,
      stiffness: 360,
      damping: 31,
      mass: 0.8,
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
