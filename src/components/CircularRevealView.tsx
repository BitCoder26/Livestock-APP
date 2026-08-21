import MaskedView from '@react-native-masked-view/masked-view';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { motionDuration } from '../utils/motion';

const BUTTON_DIAMETER = 68;
const BUTTON_RIGHT = 24;
const BUTTON_BOTTOM_ABOVE_TAB_BAR = 112;
// Drives both directions of the add flow: the button revealing the form, and
// the save tick revealing the tabs again.
//
// Stepped down from the 650/350 this shipped with, checked on screen at each
// step. The reveal stops being watchable well before it stops being measurable,
// so keep treating this as a value to lower deliberately one step at a time
// rather than one to tune by reasoning about the numbers — around 300ms the
// circle reads as a flash rather than as the screen growing out of the button.
const REVEAL_DURATION = motionDuration(420, 260);
// Ease-in-out. This is load-bearing and must not become an ease-out: the circle
// scales ~24x to clear the screen, so an ease-out throws its edge past the
// screen edges within roughly the first 15% of the duration and spends the rest
// growing invisibly off-screen. That is what made the reveal look like it had
// been deleted entirely, at every duration it was tried at.
const REVEAL_EASING = Easing.inOut(Easing.cubic);

/** Window coordinates of the point the reveal grows out of. */
export type RevealOrigin = { x: number; y: number };

/**
 * Serializes an origin into route params, so the button that was pressed on one
 * screen can tell the screen it opens where to grow the circle from.
 */
export function revealOriginParams(origin?: RevealOrigin) {
  return origin ? { revealX: String(Math.round(origin.x)), revealY: String(Math.round(origin.y)) } : {};
}

/** Reads back what `revealOriginParams` wrote. */
export function parseRevealOrigin(revealX?: string, revealY?: string): RevealOrigin | undefined {
  const x = Number(revealX);
  const y = Number(revealY);

  return Number.isFinite(x) && Number.isFinite(y) && revealX && revealY ? { x, y } : undefined;
}

export function CircularRevealView({
  active,
  origin,
  children,
  onComplete,
}: {
  active: boolean;
  /**
   * Where the circle starts. Defaults to the floating action button's own
   * corner, which is right for a reveal triggered by the FAB itself; a speed
   * dial passes the action the user actually pressed, which sits well above it.
   */
  origin?: RevealOrigin;
  children: ReactNode;
  onComplete?: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(active ? 0 : 1)).current;
  const surfaceOpacity = useRef(new Animated.Value(active ? 0 : 1)).current;
  // MaskedView keeps hit-testing broken for its content even once the mask
  // visually covers the whole screen, so it must be unmounted once the
  // reveal finishes rather than left wrapping the screen forever.
  const [isRevealing, setIsRevealing] = useState(active);
  const [hasCompletedReveal, setHasCompletedReveal] = useState(false);
  const onCompleteRef = useRef(onComplete);

  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!active) {
      progress.setValue(1);
      surfaceOpacity.setValue(1);
      setIsRevealing(false);
      setHasCompletedReveal(false);
      return;
    }

    setHasCompletedReveal(false);
    setIsRevealing(true);
    progress.setValue(0);
    surfaceOpacity.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: REVEAL_DURATION,
      easing: REVEAL_EASING,
      useNativeDriver: true,
    });

    // MaskedView can briefly paint its unmasked child before the mask layer is
    // applied, so the reveal is held invisible until the mask exists. That wait
    // used to be a fixed two frames, guessed rather than observed; it is now one
    // frame, which is all the mask needs to be mounted and is half the dead time
    // in front of an animation this short.
    const frame = requestAnimationFrame(() => {
      surfaceOpacity.setValue(1);
      animation.start(({ finished }) => {
        if (finished) {
          setHasCompletedReveal(true);
          setIsRevealing(false);
          onCompleteRef.current?.();
        }
      });
    });

    return () => {
      cancelAnimationFrame(frame);
      animation.stop();
    };
  }, [active, progress, surfaceOpacity]);

  if ((!active || hasCompletedReveal) && !isRevealing) {
    return <View style={styles.content}>{children}</View>;
  }

  // When an already-mounted route receives `active`, React renders once before
  // the effect above can reset the animated values. Keep that transitional
  // render invisible so a fully revealed destination cannot flash first.
  const revealOpacity = active && !isRevealing ? 0 : surfaceOpacity;

  const radius = BUTTON_DIAMETER / 2;
  const centerX = origin ? origin.x : width - BUTTON_RIGHT - radius;
  const centerY = origin ? origin.y : height - BUTTON_BOTTOM_ABOVE_TAB_BAR - radius;
  const farthestX = Math.max(centerX, width - centerX);
  const farthestY = Math.max(centerY, height - centerY);
  const targetScale = Math.hypot(farthestX, farthestY) / radius;

  return (
    <Animated.View style={[styles.content, { opacity: revealOpacity }]}>
      <MaskedView
        androidRenderingMode="software"
        style={styles.content}
        maskElement={
          <View style={styles.mask}>
            <Animated.View
              style={[
                styles.circle,
                {
                  left: centerX - radius,
                  top: centerY - radius,
                  transform: [
                    {
                      scale: progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, targetScale],
                      }),
                    },
                  ],
                },
              ]}
            />
          </View>
        }
      >
        <View style={styles.content}>{children}</View>
      </MaskedView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  mask: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  circle: {
    position: 'absolute',
    width: BUTTON_DIAMETER,
    height: BUTTON_DIAMETER,
    borderRadius: BUTTON_DIAMETER / 2,
    backgroundColor: '#000',
  },
});
