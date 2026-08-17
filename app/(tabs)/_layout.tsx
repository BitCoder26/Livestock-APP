import type { ReactNode } from 'react';
import { useRef } from 'react';

import { Tabs, useLocalSearchParams, useNavigation } from 'expo-router';
import type { ColorValue, GestureResponderEvent } from 'react-native';
import { Animated, Easing, Pressable, View, useWindowDimensions } from 'react-native';

import { AppIcon, AppIconName } from '../../src/components/AppIcon';
import { CircularRevealView } from '../../src/components/CircularRevealView';
import { OnboardingSpotlight } from '../../src/components/OnboardingSpotlight';
import { useOnboarding, type OnboardingStep } from '../../src/context/OnboardingContext';
import { TAB_BAR_STYLE, tokens } from '../../src/theme/tokens';
const TAB_ICON_SIZE = 20;
const ANIMAL_TAB_ICON_SIZE = 21;
const TAB_TRANSITION_DISTANCE_FACTOR = 0.16;
const TAB_TRANSITION_DURATION = 320;
const TAB_TRANSITION_EASING = Easing.bezier(0.2, 0, 0, 1);

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
  const rootNavigation = useNavigation('/');
  const { saveReveal } = useLocalSearchParams<{
    saveReveal?: string;
  }>();
  const { width } = useWindowDimensions();
  const { step, spotlightTarget, finishOnboarding } = useOnboarding();
  const transitionDistance = width * TAB_TRANSITION_DISTANCE_FACTOR;

  const spotlightCopy = spotlightTarget?.step === step ? SPOTLIGHT_COPY[step] : undefined;

  return (
    <CircularRevealView
      key={saveReveal ?? 'tabs'}
      active={Boolean(saveReveal)}
      onComplete={() => {
        if (!saveReveal) {
          return;
        }

        // The save flow is: existing tabs -> add form -> revealed tabs. Keep the
        // revealed tabs as the real destination and silently discard the routes
        // behind them. Popping those routes would trigger iOS's back animation.
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
      }}
    >
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
            opacity: current.progress.interpolate({
              inputRange: [-1, 0, 1],
              outputRange: [0.86, 1, 0.86],
            }),
            transform: [
              {
                translateX: current.progress.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: [-transitionDistance, 0, transitionDistance],
                }),
              },
            ],
          },
        }),
        transitionSpec: {
          animation: 'timing',
          config: {
            duration: TAB_TRANSITION_DURATION,
            easing: TAB_TRANSITION_EASING,
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
    </CircularRevealView>
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
