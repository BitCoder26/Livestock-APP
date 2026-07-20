import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { tokens } from '../theme/tokens';

export type SpotlightRect = { x: number; y: number; width: number; height: number };

type SpotlightSize = { width: number; height: number };

type OnboardingSpotlightProps = {
  visible: boolean;
  /** Target measured with measureInWindow (window coordinates). */
  targetRect?: SpotlightRect | null;
  /** Border radius of the highlighted element. */
  radius?: number;
  title: string;
  message: string;
  placement?: 'above' | 'below';
  actionLabel?: string;
  onAction?: () => void;
};

const HOLE_PADDING = 7;

export function OnboardingSpotlight({
  visible,
  targetRect,
  radius = 18,
  title,
  message,
  placement = 'below',
  actionLabel,
  onAction,
}: OnboardingSpotlightProps) {
  const containerRef = useRef<View>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<SpotlightSize | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  const rect = resolveRect({ origin, size, targetRect });
  const showOverlay = visible && rect !== null && size !== null;

  useEffect(() => {
    if (!showOverlay) {
      fade.setValue(0);
      pulse.setValue(0);
      return;
    }

    Animated.timing(fade, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();

    // Frame callbacks can be throttled (e.g. backgrounded web tabs), which
    // would leave the overlay stuck transparent — snap it visible regardless.
    const fadeFallback = setTimeout(() => fade.setValue(1), 400);

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 820, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 820, useNativeDriver: true }),
      ]),
    );
    pulseLoop.start();

    return () => {
      clearTimeout(fadeFallback);
      pulseLoop.stop();
    };
  }, [fade, pulse, showOverlay]);

  const handleLayout = () => {
    containerRef.current?.measureInWindow((x, y, width, height) => {
      setOrigin({ x, y });
      setSize({ width, height });
    });
  };

  return (
    <View
      ref={containerRef}
      pointerEvents={showOverlay ? 'box-none' : 'none'}
      style={StyleSheet.absoluteFill}
      onLayout={handleLayout}
    >
      {showOverlay ? (
        <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { opacity: fade }]}>
          {buildDimPanels(rect).map((panel, index) => (
            <Pressable key={index} style={[styles.touchBlocker, panel]} onPress={() => undefined} />
          ))}
          <Svg pointerEvents="none" style={styles.dimSvg} width={size.width} height={size.height}>
            <Path d={buildDimPath(rect, size, radius)} fill={DIM_COLOR} fillRule="evenodd" />
          </Svg>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ring,
              {
                left: rect.x - HOLE_PADDING,
                top: rect.y - HOLE_PADDING,
                width: rect.width + HOLE_PADDING * 2,
                height: rect.height + HOLE_PADDING * 2,
                borderRadius: radius + HOLE_PADDING,
                transform: [
                  {
                    scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }),
                  },
                ],
              },
            ]}
          />
          <View
            pointerEvents="box-none"
            style={[
              styles.tooltip,
              placement === 'below'
                ? { top: rect.y + rect.height + HOLE_PADDING + 16 }
                : { bottom: size.height - rect.y + HOLE_PADDING + 16 },
            ]}
          >
            <Text style={styles.tooltipTitle}>{title}</Text>
            <Text style={styles.tooltipMessage}>{message}</Text>
            {actionLabel ? (
              <Pressable
                accessibilityLabel={actionLabel}
                accessibilityRole="button"
                onPress={onAction}
                style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              >
                <Text style={styles.actionButtonText}>{actionLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

function resolveRect({
  origin,
  size,
  targetRect,
}: {
  origin: { x: number; y: number } | null;
  size: SpotlightSize | null;
  targetRect?: SpotlightRect | null;
}): SpotlightRect | null {
  if (!size || !targetRect || !origin) {
    return null;
  }

  return {
    x: targetRect.x - origin.x,
    y: targetRect.y - origin.y,
    width: targetRect.width,
    height: targetRect.height,
  };
}

function buildDimPanels(rect: SpotlightRect) {
  const holeX = rect.x - HOLE_PADDING;
  const holeY = rect.y - HOLE_PADDING;
  const holeWidth = rect.width + HOLE_PADDING * 2;
  const holeHeight = rect.height + HOLE_PADDING * 2;

  return [
    { left: 0, right: 0, top: 0, height: Math.max(holeY, 0) },
    { left: 0, right: 0, top: holeY + holeHeight, bottom: 0 },
    { left: 0, width: Math.max(holeX, 0), top: holeY, height: holeHeight },
    { left: holeX + holeWidth, right: 0, top: holeY, height: holeHeight },
  ] as const;
}

const DIM_COLOR = 'rgba(20, 12, 16, 0.55)';

// Full-screen rect with a rounded-rect hole punched out via even-odd fill.
function buildDimPath(rect: SpotlightRect, size: SpotlightSize, radius: number) {
  const x = rect.x - HOLE_PADDING;
  const y = rect.y - HOLE_PADDING;
  const w = rect.width + HOLE_PADDING * 2;
  const h = rect.height + HOLE_PADDING * 2;
  const r = Math.min(radius + HOLE_PADDING, w / 2, h / 2);

  return [
    `M0 0H${size.width}V${size.height}H0Z`,
    `M${x + r} ${y}`,
    `H${x + w - r}`,
    `A${r} ${r} 0 0 1 ${x + w} ${y + r}`,
    `V${y + h - r}`,
    `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
    `H${x + r}`,
    `A${r} ${r} 0 0 1 ${x} ${y + h - r}`,
    `V${y + r}`,
    `A${r} ${r} 0 0 1 ${x + r} ${y}`,
    'Z',
  ].join('');
}

const styles = StyleSheet.create({
  touchBlocker: {
    position: 'absolute',
  },
  dimSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  ring: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: tokens.colors.accent,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  tooltip: {
    position: 'absolute',
    left: 20,
    right: 20,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 18,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  tooltipTitle: {
    color: tokens.colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  tooltipMessage: {
    marginTop: 6,
    color: tokens.colors.textSoft,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  actionButton: {
    marginTop: 14,
    minHeight: 46,
    borderRadius: 23,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonPressed: {
    opacity: 0.9,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
