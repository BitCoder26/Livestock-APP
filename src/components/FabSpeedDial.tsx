import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type Ref,
} from 'react';
import { Animated, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import type { ImageRequireSource } from 'react-native';

import { AppIcon, type AppIconName } from './AppIcon';
import { BouncyPressable } from './BouncyPressable';
import { tokens } from '../theme/tokens';
import type { RevealOrigin } from './CircularRevealView';
import { motionDuration } from '../utils/motion';

export type SpeedDialAction = {
  icon?: AppIconName;
  /**
   * PNG drawn in place of an icon, tinted white. Narrowed to a `require()`d
   * asset rather than any image source: it is also passed as `defaultSource`
   * below, which cannot take the multi-resolution array form.
   */
  image?: ImageRequireSource;
  label: string;
  /**
   * Receives the window position of the button that was pressed, so the screen
   * it opens can grow its reveal out of that button rather than out of the FAB
   * two or three slots below it.
   */
  onPress: (origin?: RevealOrigin) => void;
};

type FabSpeedDialProps = {
  accessibilityLabel: string;
  actions: SpeedDialAction[];
  /**
   * Artwork for the button itself, in place of the default plus. Tinted white
   * like the action images. A custom glyph is not a plus, so the open state
   * cross-fades to a close icon rather than rotating this one 45° — a rotated
   * export arrow says nothing, where a rotated plus is an ✕.
   */
  image?: ImageRequireSource;
  bottomOffset?: number;
  /** Exposes the button's positioner so callers can measure it (e.g. onboarding spotlight). */
  positionerRef?: Ref<View>;
};

// The grey every Cancel button in the app is drawn on, and the colour those
// buttons put on it — white would all but vanish on a ground this light.
const FAB_CLOSE_BACKGROUND = '#E5E0E7';
const FAB_CLOSE_ICON = '#544F49';
// Every dial puts down the same amount of ink. plus.svg's path spans its whole
// 375 viewBox, so the + and the ✕ it rotates into are a true 24pt mark. The
// other glyphs carry padding inside their canvas, so each is scaled up by its
// own ratio to land on that same 24pt rather than being given a matching box.
const FAB_GLYPH_INK = 25;
// Artwork PNGs: the mark occupies ~40% of the square, measured off the source.
const FAB_IMAGE_SIZE = Math.round(FAB_GLYPH_INK / 0.4);
const FAB_SIZE = 74;
const ACTION_SIZE = FAB_SIZE;
const ACTION_GAP = 14;
// The artwork PNGs carry ~40% transparent padding inside a square canvas, so
// their box has to be ~2.6x the icons' 24pt for the drawing itself to stand as
// tall as the plus glyph — measured on screen, not guessed.
//
// The files themselves are cut to exactly this size (62 / @2x 124 / @3x 186),
// with the full-resolution art kept in assets/source/. They were originally
// shipped at 2000x2000, which meant a four-megapixel decode for a 62pt button
// and a visible delay before the icons appeared inside the dial. If this
// constant ever changes, re-cut the assets to match rather than letting a
// larger file be scaled down at runtime.
const ACTION_IMAGE = 62;
// Short enough to feel instant, long enough to still read as the actions
// travelling out of the button rather than blinking into place. Below roughly
// 80ms the movement stops registering at this distance and the dial just pops.
// The real floor on perceived speed is not these numbers but React Native's
// <Modal> presentation, which costs its own time before any of this is on
// screen (same cause documented for MODAL_SHEET_ENTRANCE_DURATION in motion.ts).
const OPEN_DURATION = motionDuration(100);
const CLOSE_DURATION = motionDuration(80);
// The glyph swap runs longer than the dial itself. A rotation is legible at
// OPEN_DURATION because the shape is moving; two images trading opacity over
// the same 100ms just look like a cut. Only the custom-image dial needs it —
// the rotating plus reads fine at the dial's own speed.
const MORPH_OPEN_DURATION = motionDuration(260);

/** Distance above the FAB's centre for the nth action, counting from the FAB. */
function offsetForIndex(index: number) {
  return FAB_SIZE / 2 + ACTION_GAP + ACTION_SIZE / 2 + index * (ACTION_SIZE + ACTION_GAP);
}

export function FabSpeedDial({
  accessibilityLabel,
  actions,
  image,
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
  const morph = useRef(new Animated.Value(0)).current;

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

  // Both values are driven from one effect: the dial and the glyph it swaps
  // are one gesture, they just run over different lengths of time.
  useLayoutEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? OPEN_DURATION : CLOSE_DURATION,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !open) {
        setMounted(false);
      }
    });

    Animated.timing(morph, {
      toValue: open ? 1 : 0,
      duration: open ? (image ? MORPH_OPEN_DURATION : OPEN_DURATION) : CLOSE_DURATION,
      useNativeDriver: true,
    }).start();
  }, [image, morph, open, progress]);

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
  // behind a dial that is still expanded. The origin handed on is the pressed
  // button's own centre in window coordinates — the FAB's column, at that
  // action's height up the dial.
  const handleAction = useCallback(
    (action: SpeedDialAction, index: number) => {
      setOpen(false);

      const origin = anchor
        ? {
            x: anchor.x + anchor.width / 2,
            y: anchor.y + anchor.height / 2 - offsetForIndex(index),
          }
        : undefined;

      action.onPress(origin);
    },
    [anchor],
  );

  const rotation = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });
  // The glyph the button opened with fades out as the close mark fades in:
  // one movement, read from both ends.
  const fadeOut = morph.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
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
          {image ? (
            <Image fadeDuration={0} resizeMode="contain" source={image} style={styles.fabImage} />
          ) : (
            <AppIcon name="plus" size={FAB_GLYPH_INK} color="#fff" />
          )}
        </BouncyPressable>

        {/* The action artwork is loaded off the bundle asynchronously the first
            time an <Image> for it mounts, which on a cold dial is a frame or
            two *after* the buttons have already slid into place — so the first
            open showed empty circles that then filled in. Mounting a hidden
            copy here, with the FAB itself, puts the artwork in the image cache
            long before anyone presses +, so the icons are there on frame one.
            It must be laid out at full size to load at all — see `preload`. */}
        <View collapsable={false} pointerEvents="none" style={styles.preload}>
          {actions.map((action) =>
            action.image ? (
              <Image
                key={action.label}
                source={action.image}
                fadeDuration={0}
                resizeMode="contain"
                style={styles.actionImage}
              />
            ) : null,
          )}
        </View>
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
                    transform: [
                      {
                        translateY: progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -offset],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Animated.Text style={[styles.actionLabel, { opacity: progress }]}>
                  {action.label}
                </Animated.Text>
                <BouncyPressable
                  accessibilityLabel={action.label}
                  accessibilityRole="button"
                  containerStyle={styles.actionButton}
                  onPress={() => handleAction(action, index)}
                  pressedScale={0.92}
                  style={({ pressed }) => [styles.actionPressable, pressed && styles.pressed]}
                >
                  {action.image ? (
                    // No `defaultSource` here, tempting as it looks: in a dev
                    // build a require()d asset resolves to a Metro http URI,
                    // which iOS cannot use as a default source — it renders
                    // nothing at all rather than rendering early. The speed
                    // comes from the artwork being cut to ACTION_IMAGE and
                    // warmed below, not from painting it twice.
                    <Image
                      source={action.image}
                      fadeDuration={0}
                      resizeMode="contain"
                      style={styles.actionImage}
                    />
                  ) : action.icon ? (
                    <AppIcon name={action.icon} size={28} color="#fff" />
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
            {/* The grey is a layer fading in over the red rather than a
                backgroundColor animation: `progress` runs on the native
                driver, which animates transform and opacity only. The icon
                cross-fades the same way, since a colour prop cannot tween. */}
            <Animated.View
              pointerEvents="none"
              style={[styles.fabClose, { opacity: morph }]}
            />
            <Animated.View
              style={[styles.fabIcon, image ? null : { transform: [{ rotate: rotation }] }]}
            >
              <Animated.View style={[styles.fabIconLayer, { opacity: fadeOut }]}>
                {image ? (
                  <Image fadeDuration={0} resizeMode="contain" source={image} style={styles.fabImage} />
                ) : (
                  <AppIcon name="plus" size={FAB_GLYPH_INK} color="#fff" />
                )}
              </Animated.View>
              {/* The ✕ is the same plus turned 45°, exactly as on the other
                  dials — not a separate close glyph. It rotates as it fades in,
                  so the export mark gives way to a cross that arrives turning
                  rather than appearing already square. Driven by `morph` so the
                  turn and the fade are the same movement. */}
              <Animated.View
                style={[
                  styles.fabIconLayer,
                  { opacity: morph },
                  image ? { transform: [{ rotate: rotation }] } : null,
                ]}
              >
                <AppIcon name="plus" size={FAB_GLYPH_INK} color={FAB_CLOSE_ICON} />
              </Animated.View>
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
    // The close layer fills the button, so it has to be cut to the circle.
    overflow: 'hidden',
  },
  fabImage: {
    width: FAB_IMAGE_SIZE,
    height: FAB_IMAGE_SIZE,
    tintColor: '#fff',
  },
  // Holds the two glyphs on top of each other so they cross-fade in place,
  // sized to the larger of them so neither is clipped as it turns.
  fabIcon: {
    width: FAB_IMAGE_SIZE,
    height: FAB_IMAGE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabIconLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabClose: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: FAB_CLOSE_BACKGROUND,
  },
  // Laid out at full size — an <Image> with no box never fetches — but behind
  // the FAB and fully transparent, so none of it is ever seen.
  preload: {
    position: 'absolute',
    opacity: 0,
    flexDirection: 'row',
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
  actionPressable: {
    width: '100%',
    height: '100%',
    borderRadius: ACTION_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionImage: {
    width: ACTION_IMAGE,
    height: ACTION_IMAGE,
    tintColor: '#fff',
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
