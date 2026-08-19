import { useCallback, useEffect, useRef, useState, type MutableRefObject, type Ref } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon, type AppIconName } from './AppIcon';
import { BouncyPressable } from './BouncyPressable';
import { tokens } from '../theme/tokens';
import { motionDuration } from '../utils/motion';

export type SpeedDialAction = {
  icon?: AppIconName;
  /** Rendered instead of an icon, for glyphs the icon set does not carry. */
  glyph?: string;
  /** Small mark overlaid at the icon's right edge, e.g. a plus for "add many". */
  badge?: AppIconName;
  label: string;
  onPress: () => void;
  /** Visually separates a secondary action such as help from the primary ones. */
  variant?: 'primary' | 'secondary';
};

type FabSpeedDialProps = {
  accessibilityLabel: string;
  actions: SpeedDialAction[];
  bottomOffset?: number;
  /** Exposes the button's positioner so callers can measure it (e.g. onboarding spotlight). */
  positionerRef?: Ref<View>;
};

const FAB_SIZE = 68;
const ACTION_SIZE = FAB_SIZE;
const ACTION_GAP = 14;
const OPEN_DURATION = motionDuration(120);
const CLOSE_DURATION = motionDuration(100);

/** Distance above the FAB's centre for the nth action, counting from the FAB. */
function offsetForIndex(index: number) {
  return FAB_SIZE / 2 + ACTION_GAP + ACTION_SIZE / 2 + index * (ACTION_SIZE + ACTION_GAP);
}

export function FabSpeedDial({
  accessibilityLabel,
  actions,
  bottomOffset,
  positionerRef,
}: FabSpeedDialProps) {
  // `mounted` keeps the modal alive through the closing animation; `open`
  // drives the animation itself. Unmounting on the same tick would cut the
  // slide-back-into-the-FAB short.
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  // The modal's coordinate space is the whole window, while the FAB sits inside
  // the screen above the tab bar. Measuring the real button and placing the
  // modal's copy at those exact window coordinates keeps the + and the X in the
  // same spot instead of the X jumping down by the tab bar's height.
  const [anchor, setAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const anchorRef = useRef<View | null>(null);
  const progress = useRef(new Animated.Value(0)).current;

  const setRefs = useCallback(
    (node: View | null) => {
      anchorRef.current = node;

      if (typeof positionerRef === 'function') {
        positionerRef(node);
      } else if (positionerRef) {
        (positionerRef as MutableRefObject<View | null>).current = node;
      }
    },
    [positionerRef],
  );

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? OPEN_DURATION : CLOSE_DURATION,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !open) {
        setMounted(false);
      }
    });
  }, [open, progress]);

  const handleOpen = useCallback(() => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
    setMounted(true);
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  // Runs the close animation first so the action's screen does not appear
  // behind a dial that is still expanded.
  const handleAction = useCallback((action: SpeedDialAction) => {
    setOpen(false);
    action.onPress();
  }, []);

  const rotation = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  const positionerStyle = [
    styles.positioner,
    bottomOffset === undefined ? null : { bottom: bottomOffset },
  ];

  // Falls back to the static corner placement if the measurement has not
  // landed yet, so the dial is never positioned off-screen.
  const anchoredStyle = anchor
    ? [
        styles.anchored,
        { left: anchor.x, top: anchor.y, width: anchor.width, height: anchor.height },
      ]
    : positionerStyle;

  return (
    <>
      <View
        ref={setRefs}
        collapsable={false}
        style={[positionerStyle, mounted ? styles.hidden : null]}
        pointerEvents={mounted ? 'none' : 'auto'}
      >
        <BouncyPressable
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          containerStyle={styles.fab}
          onPress={handleOpen}
          pressedScale={0.94}
          style={({ pressed }) => [styles.fabPressable, pressed && styles.pressed]}
        >
          <AppIcon name="plus" size={24} color="#fff" />
        </BouncyPressable>
      </View>

      <Modal transparent animationType="none" visible={mounted} onRequestClose={handleClose}>
        <Animated.View style={[styles.shade, { opacity: progress }]}>
          <Pressable
            accessibilityLabel="Close menu"
            accessibilityRole="button"
            onPress={handleClose}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <View pointerEvents="box-none" style={anchoredStyle}>
          {actions.map((action, index) => {
            const offset = offsetForIndex(index);

            return (
              <Animated.View
                key={action.label}
                pointerEvents={open ? 'auto' : 'none'}
                style={[
                  styles.actionRow,
                  {
                    opacity: progress,
                    transform: [
                      {
                        translateY: progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -offset],
                        }),
                      },
                      {
                        scale: progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.4, 1],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Text style={styles.actionLabel}>{action.label}</Text>
                <BouncyPressable
                  accessibilityLabel={action.label}
                  accessibilityRole="button"
                  containerStyle={[
                    styles.actionButton,
                    action.variant === 'secondary' && styles.actionButtonSecondary,
                  ]}
                  onPress={() => handleAction(action)}
                  pressedScale={0.92}
                  style={({ pressed }) => [styles.actionPressable, pressed && styles.pressed]}
                >
                  {action.glyph ? (
                    <Text style={styles.actionGlyph}>{action.glyph}</Text>
                  ) : action.icon ? (
                    <View>
                      <AppIcon name={action.icon} size={28} color="#fff" />
                      {action.badge ? (
                        <View style={styles.actionBadge}>
                          <AppIcon name={action.badge} size={12} color="#fff" />
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </BouncyPressable>
              </Animated.View>
            );
          })}

          <BouncyPressable
            accessibilityLabel="Close menu"
            accessibilityRole="button"
            containerStyle={styles.fab}
            onPress={handleClose}
            pressedScale={0.94}
            style={({ pressed }) => [styles.fabPressable, pressed && styles.pressed]}
          >
            <Animated.View style={{ transform: [{ rotate: rotation }] }}>
              <AppIcon name="plus" size={24} color="#fff" />
            </Animated.View>
          </BouncyPressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  positioner: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: FAB_SIZE,
    height: FAB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabPressable: {
    width: '100%',
    height: '100%',
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Anchored to the FAB's centre so the row grows leftwards while the circle
  // stays in the FAB's column.
  // An explicit width is required: absolutely-positioned children are otherwise
  // sized against the 68pt positioner, and a longer label pushes its circle out
  // past the screen edge instead of extending the row leftwards.
  actionRow: {
    position: 'absolute',
    right: (FAB_SIZE - ACTION_SIZE) / 2,
    width: 300,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  actionButton: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  actionButtonSecondary: {
    backgroundColor: tokens.colors.text,
  },
  actionPressable: {
    width: '100%',
    height: '100%',
    borderRadius: ACTION_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionGlyph: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 34,
  },
  // Sits just off the icon's right edge so the mark reads as "add several"
  // rather than crowding the animal itself.
  actionBadge: {
    position: 'absolute',
    right: -9,
    bottom: -2,
  },
  pressed: {
    opacity: 0.9,
  },
  hidden: {
    opacity: 0,
  },
  anchored: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
