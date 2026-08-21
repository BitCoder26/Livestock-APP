import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

import { Tabs, useLocalSearchParams, useNavigation } from 'expo-router';
import type { ColorValue, GestureResponderEvent } from 'react-native';
import { Animated, Easing, Pressable, View } from 'react-native';

import { AppIcon, AppIconName } from '../../src/components/AppIcon';
import { OnboardingSpotlight } from '../../src/components/OnboardingSpotlight';
import { useOnboarding, type OnboardingStep } from '../../src/context/OnboardingContext';
import { TAB_BAR_STYLE, tokens } from '../../src/theme/tokens';
const TAB_ICON_SIZE = 20;
const ANIMAL_TAB_ICON_SIZE = 21;
// The four tabs switch instantly — no fade, no slide. They are peers reached by
// a direct tap, and any transition at all only delays the content the user
// already asked for.

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
      'Everything you record is built on your setup — animals live on your farm, and records link back to it. Tap Farms to add yours. Labels let you tag animals so you can record against them together, and Locations and Medicines & Vaccines can be added any time.',
    placement: 'below',
  },
  animal: {
    radius: 34,
    title: 'Add your first animal',
    // The second sentence only makes the herd/flock route known — it is
    // deliberately not a second instruction. Onboarding pushes one action, and
    // a keeper who runs a flock should not have to finish a single-animal
    // detour before discovering the button they actually needed.
    message:
      'Your farm is ready! Tap the + button to add your first animal. The same button can also start a herd or flock, for animals you keep as a group.',
    placement: 'above',
  },
  record: {
    radius: 34,
    // Reached by adding either an animal or a herd/flock, so it must not
    // claim which one — a flock keeper being congratulated on their first
    // animal reads as the app not having noticed what they did.
    title: 'First one added! 🎉',
    message:
      'Now add your first record — births, weights, treatments and more. Happy farming!',
    placement: 'above',
    actionLabel: 'Got it',
  },
};

export default function TabsLayout() {
  const rootNavigation = useNavigation('/');
  const { saveReveal } = useLocalSearchParams<{
    saveReveal?: string;
  }>();
  const { step, spotlightTarget, finishOnboarding } = useOnboarding();

  const spotlightCopy = spotlightTarget?.step === step ? SPOTLIGHT_COPY[step] : undefined;

  // Saving used to bring the tabs back behind a circular reveal growing out of
  // the tick. The animation is gone — a save should land on the list at once —
  // but the route cleanup it used to trigger on completion still has to run.
  //
  // The save flow is: existing tabs -> add form -> tabs. Keep these tabs as the
  // real destination and silently discard the routes behind them. Popping those
  // routes would trigger iOS's back animation, which is the thing being avoided.
  useEffect(() => {
    if (!saveReveal) {
      return;
    }

    const rootState = rootNavigation.getState();

    if (!rootState) {
      return;
    }

    const activeRoute = rootState.routes[rootState.index];
    const activeParams = (activeRoute.params ?? {}) as Record<string, unknown>;
    const {
      saveReveal: _saveReveal,
      saveTarget: _saveTarget,
      newAnimalUid: _newAnimalUid,
      newRecordId: _newRecordId,
      ...retainedParams
    } = activeParams;

    rootNavigation.dispatch({
      type: 'RESET',
      payload: {
        index: 0,
        routes: [
          {
            ...activeRoute,
            params: Object.keys(retainedParams).length > 0 ? retainedParams : undefined,
          },
        ],
      },
    });
  }, [rootNavigation, saveReveal]);

  return (
    <View style={{ flex: 1 }}>
    <Tabs
    detachInactiveScreens={false}
    initialRouteName="records"
    screenOptions={{
      animation: 'none',
      freezeOnBlur: false,
      headerShown: false,
      lazy: false,
      sceneStyle: {
        backgroundColor: tokens.colors.background,
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
      toValue: 0.95,
      duration: 90,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      stiffness: 420,
      damping: 30,
      mass: 0.7,
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
