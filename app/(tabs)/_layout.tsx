import type { ReactNode } from 'react';
import { useRef } from 'react';

import { Tabs } from 'expo-router';
import type { ColorValue, GestureResponderEvent } from 'react-native';
import { Animated, Pressable, useWindowDimensions } from 'react-native';

import { AppIcon, AppIconName } from '../../src/components/AppIcon';
import { TAB_BAR_STYLE, tokens } from '../../src/theme/tokens';

const TAB_ICON_COLOR = tokens.colors.muted;
const TAB_ICON_ACTIVE_COLOR = tokens.colors.accent;
const TAB_ICON_SIZE = 24;
const ANIMAL_TAB_ICON_SIZE = 25;

export default function TabsLayout() {
  const { width } = useWindowDimensions();

  return (
    <Tabs
      detachInactiveScreens={false}
      initialRouteName="records"
      screenOptions={{
        animation: 'shift',
        freezeOnBlur: false,
        headerShown: false,
        lazy: false,
        sceneStyle: {
          backgroundColor: tokens.colors.background,
        },
        sceneStyleInterpolator: ({ current }) => ({
          sceneStyle: {
            transform: [
              {
                translateX: current.progress.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: [-width, 0, width],
                }),
              },
            ],
          },
        }),
        transitionSpec: {
          animation: 'timing',
          config: {
            duration: 260,
          },
        },
        tabBarActiveTintColor: TAB_ICON_ACTIVE_COLOR,
        tabBarInactiveTintColor: TAB_ICON_COLOR,
        tabBarButton: (props) => <TabButton {...props} />,
        tabBarItemStyle: {
          paddingTop: 0,
          paddingBottom: 0,
        },
        tabBarStyle: TAB_BAR_STYLE,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="records"
        options={{
          title: 'Records',
          tabBarIcon: ({ color, focused }) => <TabIcon name="records-outline-tab" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="animals"
        options={{
          title: 'Animals',
          tabBarIcon: ({ color, focused }) => <TabIcon name="goat-face-outline" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="setup"
        options={{
          title: 'Setup',
          tabBarIcon: ({ color, focused }) => <TabIcon name="spanner-outline-tab" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="export"
        options={{
          title: 'Export',
          tabBarIcon: ({ color, focused }) => <TabIcon name="export-outline-tab" color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}

function TabIcon({
  name,
  color,
}: {
  name: AppIconName;
  color: ColorValue;
  focused: boolean;
}) {
  return (
    <AppIcon
      name={name}
      size={name === 'goat-face' ? ANIMAL_TAB_ICON_SIZE : TAB_ICON_SIZE}
      color={color}
      opacity={1}
    />
  );
}

type TabButtonProps = {
  accessibilityState?: {
    selected?: boolean;
  };
  accessibilityLabel?: string;
  children?: ReactNode;
  onLongPress?: ((event: GestureResponderEvent) => void) | null;
  onPress?: ((event: GestureResponderEvent) => void) | null;
  testID?: string;
};

function TabButton({
  accessibilityLabel,
  accessibilityState,
  children,
  onLongPress,
  onPress,
  testID,
}: TabButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = (event: GestureResponderEvent) => {
    scale.stopAnimation();
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 0.84,
        duration: 70,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        speed: 24,
        bounciness: 10,
        useNativeDriver: true,
      }),
    ]).start();
    onPress?.(event);
  };

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onLongPress={onLongPress}
      onPress={handlePress}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: 14,
        paddingBottom: 0,
      }}
      testID={testID}
    >
      <Animated.View
        style={{
          alignItems: 'center',
          justifyContent: 'flex-start',
          transform: [{ translateY: -8 }, { scale }],
          gap: 2,
        }}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
