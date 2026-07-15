import type { ReactNode } from 'react';
import { useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { tokens } from '../theme/tokens';

const TAB_ROUTES = ['/(tabs)/records', '/(tabs)/animals', '/(tabs)/setup', '/(tabs)/export'] as const;
const SWIPE_CAPTURE_DISTANCE = 18;
const SWIPE_TRIGGER_DISTANCE = 64;

export function TabSwipeView({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const swipeHandledRef = useRef(false);

  const activeIndex = useMemo(() => {
    const normalizedPath = pathname.startsWith('/(tabs)/')
      ? pathname
      : `/(tabs)/${pathname.split('/').filter(Boolean).pop() ?? 'records'}`;
    const matchIndex = TAB_ROUTES.indexOf(normalizedPath as (typeof TAB_ROUTES)[number]);
    return matchIndex >= 0 ? matchIndex : 0;
  }, [pathname]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > SWIPE_CAPTURE_DISTANCE &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2,
        onPanResponderGrant: () => {
          swipeHandledRef.current = false;
        },
        onPanResponderRelease: (_, gestureState) => {
          if (swipeHandledRef.current) {
            return;
          }

          let nextIndex = activeIndex;

          if (gestureState.dx <= -SWIPE_TRIGGER_DISTANCE && activeIndex < TAB_ROUTES.length - 1) {
            nextIndex = activeIndex + 1;
          } else if (gestureState.dx >= SWIPE_TRIGGER_DISTANCE && activeIndex > 0) {
            nextIndex = activeIndex - 1;
          }

          if (nextIndex !== activeIndex) {
            swipeHandledRef.current = true;
            router.replace(TAB_ROUTES[nextIndex]);
          }
        },
      }),
    [activeIndex, router],
  );

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: tokens.colors.background,
  },
});
