import type { ReactNode } from 'react';
import { useRef } from 'react';

import { Tabs } from 'expo-router';
import type { ColorValue, GestureResponderEvent } from 'react-native';
import { Animated, Pressable, View, useWindowDimensions } from 'react-native';

import { AppIcon, AppIconName } from '../../src/components/AppIcon';
import { OnboardingSpotlight } from '../../src/components/OnboardingSpotlight';
import { useOnboarding, type OnboardingStep } from '../../src/context/OnboardingContext';
import { TAB_BAR_STYLE, tokens } from '../../src/theme/tokens';
const TAB_ICON_SIZE = 20;
const ANIMAL_TAB_ICON_SIZE = 21;

type SpotlightCopy = {
  radius: number;
  title: string;
  message: string;
  placement: 'above' | 'below';
  actionLabel?: string;
};

// Rendered here, above the Tabs navigator, so the dim covers the whole
// screen including the bottom tab bar. Screens measure their highlight
// target and publish it via OnboardingContext.
const SPOTLIGHT_COPY: Partial<Record<OnboardingStep, SpotlightCopy>> = {
  setup: {
    radius: 18,
    title: 'First, set up your farm',
    message:
      'Everything you record is built on your setup — animals live on your farm, and records link back to it. Tap Farms to add yours. Groups let you sort your animals into mobs you manage together, and Paddocks and Medicines & Vaccines can be added any time.',
    placement: 'below',
  },
  animal: {
    radius: 34,
    title: 'Add your first animal',
    message: 'Your farm is ready! Tap the + button to add your first animal.',
    placement: 'above',
  },
  record: {
    radius: 34,
    title: 'First animal added! 🎉',
    message:
      'Now that you have added your first animal, add your first record — births, weights, treatments and more. Happy farming!',
    placement: 'above',
    actionLabel: 'Got it',
  },
};

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const { step, spotlightTarget, finishOnboarding } = useOnboarding();

  const spotlightCopy = spotlightTarget?.step === step ? SPOTLIGHT_COPY[step] : undefined;

  return (
    <View style={{ flex: 1 }}>
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
        tabBarActiveTintColor: tokens.colors.accent,
        tabBarInactiveTintColor: tokens.colors.muted,
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
          tabBarIcon: ({ color, focused }) => <TabIcon name="records_" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="animals"
        options={{
          title: 'Animals',
          tabBarIcon: ({ color, focused }) => <TabIcon name="goat-face" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="setup"
        options={{
          title: 'Setup',
          tabBarIcon: ({ color, focused }) => <TabIcon name="spanner_" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="export"
        options={{
          title: 'Export',
          tabBarIcon: ({ color, focused }) => <TabIcon name="export_" color={color} focused={focused} />,
        }}
      />
    </Tabs>
      <OnboardingSpotlight
        visible={spotlightCopy !== undefined}
        targetRect={spotlightTarget?.rect ?? null}
        radius={spotlightCopy?.radius ?? 18}
        title={spotlightCopy?.title ?? ''}
        message={spotlightCopy?.message ?? ''}
        placement={spotlightCopy?.placement ?? 'below'}
        actionLabel={spotlightCopy?.actionLabel}
        onAction={finishOnboarding}
      />
    </View>
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

  const handlePressIn = () => {
    scale.stopAnimation();
    Animated.timing(scale, {
      toValue: 0.92,
      duration: 70,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      speed: 26,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onLongPress={onLongPress}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
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
          transform: [{ translateY: -12 }, { scale }],
          gap: 2,
        }}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
