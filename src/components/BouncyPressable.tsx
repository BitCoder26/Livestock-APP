import { useRef } from 'react';
import type { GestureResponderEvent, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { Animated, Pressable } from 'react-native';

type BouncyPressableProps = PressableProps & {
  containerStyle?: StyleProp<ViewStyle>;
};

export function BouncyPressable({
  containerStyle,
  onPress,
  onPressIn,
  onPressOut,
  ...props
}: BouncyPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const isAnimatingRef = useRef(false);

  const handlePressIn = (event: GestureResponderEvent) => {
    if (!isAnimatingRef.current) {
      scale.stopAnimation();
      Animated.timing(scale, {
        toValue: 0.965,
        duration: 70,
        useNativeDriver: true,
      }).start();
    }
    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    if (!isAnimatingRef.current) {
      Animated.spring(scale, {
        toValue: 1,
        speed: 28,
        bounciness: 8,
        useNativeDriver: true,
      }).start();
    }
    onPressOut?.(event);
  };

  const handlePress = (event: GestureResponderEvent) => {
    if (!isAnimatingRef.current) {
      isAnimatingRef.current = true;
      scale.stopAnimation();
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.035,
          duration: 75,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 70,
          useNativeDriver: true,
        }),
      ]).start(() => {
        isAnimatingRef.current = false;
      });
    }

    onPress?.(event);
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
