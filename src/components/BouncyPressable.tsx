import { useEffect, useRef } from 'react';
import type { GestureResponderEvent, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { Animated, Easing, Pressable } from 'react-native';

import { FAST_MOTION_DURATION } from '../utils/motion';

type BouncyPressableProps = PressableProps & {
  containerStyle?: StyleProp<ViewStyle>;
  pressedScale?: number;
  onPressDelayMs?: number;
};

export function BouncyPressable({
  containerStyle,
  onPress,
  onPressDelayMs = 0,
  onPressIn,
  onPressOut,
  pressedScale = 0.97,
  ...props
}: BouncyPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const delayedPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (delayedPressRef.current) {
        clearTimeout(delayedPressRef.current);
      }
    };
  }, []);

  const handlePressIn = (event: GestureResponderEvent) => {
    scale.stopAnimation();
    Animated.timing(scale, {
      toValue: pressedScale,
      duration: FAST_MOTION_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    scale.stopAnimation();
    Animated.timing(scale, {
      toValue: 1,
      duration: FAST_MOTION_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    onPressOut?.(event);
  };

  const handlePress = (event: GestureResponderEvent) => {
    if (!onPress || delayedPressRef.current) {
      return;
    }

    if (onPressDelayMs <= 0) {
      onPress(event);
      return;
    }

    delayedPressRef.current = setTimeout(() => {
      delayedPressRef.current = null;
      onPress(event);
    }, onPressDelayMs);
  };

  return (
    <Animated.View style={[containerStyle, { transform: [{ scale }] }]}>
      <Pressable
        {...props}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      />
    </Animated.View>
  );
}
