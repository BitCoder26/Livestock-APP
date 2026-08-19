import AsyncStorage from 'expo-sqlite/kv-store';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from './AppIcon';
import { BouncyPressable } from './BouncyPressable';
import { tokens } from '../theme/tokens';

/**
 * The prompt at the top of the Animals list offering to bring an existing
 * herd or flock in rather than typing it out.
 *
 * Styled as the same promo card as "Need more setup options?" on the Setup tab
 * (see the feedback card in `(tabs)/setup.tsx`) — same opaque pink fill, same
 * pill action, same white dismiss circle — so the app has one recognisable
 * shape for "here is something you might want", rather than a second dialect
 * of the same idea.
 *
 * It stays until the user closes it with the X, and once closed it never comes
 * back — a prompt that reappears is a prompt that gets ignored. The same screen
 * is always reachable from Settings; this is only the nudge for people who have
 * not found it yet.
 */

const DISMISSED_KEY = 'livestockbook.importPrompt.dismissed.v1';

type ImportPromptBubbleProps = {
  onPress: () => void;
};

export function ImportPromptBubble({ onPress }: ImportPromptBubbleProps) {
  // Starts hidden: showing it and then yanking it away a frame later, once
  // storage says it was dismissed, is worse than a beat of nothing.
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let isActive = true;

    const restoreDismissal = async () => {
      try {
        const dismissed = await AsyncStorage.getItem(DISMISSED_KEY);

        if (isActive && dismissed !== 'true') {
          setIsVisible(true);
        }
      } catch {
        // Storage is unreadable — show the prompt. Offering it once too often
        // is a smaller failure than a user never finding import at all.
        if (isActive) {
          setIsVisible(true);
        }
      }
    };

    void restoreDismissal();

    return () => {
      isActive = false;
    };
  }, []);

  if (!isVisible) {
    return null;
  }

  const dismiss = () => {
    setIsVisible(false);
    void AsyncStorage.setItem(DISMISSED_KEY, 'true');
  };

  return (
    <View style={styles.wrapper}>
      <BouncyPressable
        accessibilityLabel="Import your animals"
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        <View style={styles.icon}>
          <AppIcon name="enter-arrow" size={24} color="#171717" />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Got a list of your animals?</Text>
          <Text style={styles.text}>Import them instead of adding one by one.</Text>
        </View>
        <View style={styles.actionButton}>
          <Text style={styles.actionButtonText}>Import</Text>
        </View>
      </BouncyPressable>
      <Pressable
        accessibilityLabel="Dismiss import card"
        accessibilityRole="button"
        hitSlop={10}
        onPress={dismiss}
        style={({ pressed }) => [styles.dismissButton, pressed && styles.cardPressed]}
      >
        <AppIcon name="close" size={10} color="#8A5A55" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    marginTop: 4,
    marginBottom: 4,
  },
  card: {
    minHeight: 84,
    borderRadius: 18,
    backgroundColor: '#FCEAEA',
    paddingLeft: 14,
    paddingRight: 24,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardPressed: {
    opacity: 0.92,
  },
  icon: {
    marginRight: -6,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  text: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
  },
  actionButton: {
    minWidth: 72,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    flexShrink: 0,
    marginRight: 8,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  dismissButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
});
