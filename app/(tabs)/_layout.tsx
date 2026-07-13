import type { ReactNode } from 'react';

import { Tabs } from 'expo-router';
import type { ColorValue, GestureResponderEvent } from 'react-native';
import { Pressable, View } from 'react-native';

import { AppIcon, AppIconName } from '../../src/components/AppIcon';
import { TAB_BAR_STYLE, tokens } from '../../src/theme/tokens';

const TAB_ICON_COLOR = tokens.colors.muted;
const TAB_ICON_ACTIVE_COLOR = tokens.colors.accent;
const TAB_ICON_SIZE = 24;
const ANIMAL_TAB_ICON_SIZE = 28;

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="records"
      screenOptions={{
        headerShown: false,
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
          tabBarIcon: ({ color, focused }) => <TabIcon name="records_" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="animals"
        options={{
          title: 'Animals',
          tabBarIcon: ({ color, focused }) => <TabIcon name="animal_" color={color} focused={focused} />,
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
      size={name === 'animal_' ? ANIMAL_TAB_ICON_SIZE : TAB_ICON_SIZE}
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
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onLongPress={onLongPress}
      onPress={onPress}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: 14,
        paddingBottom: 0,
      }}
      testID={testID}
    >
      <View
        style={{
          alignItems: 'center',
          justifyContent: 'flex-start',
          transform: [{ translateY: -8 }],
          gap: 2,
        }}
      >
        {children}
      </View>
    </Pressable>
  );
}
