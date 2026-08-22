import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../src/theme/text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { InfoModal } from '../src/components/InfoModal';
import { tokens } from '../src/theme/tokens';

const HELP_DESCRIPTION =
  'Add an individual animal when it has its own tag and you want its own history — cattle, and most sheep and goats, are identified individually.\n\n' +
  'Add a herd or flock when you keep animals as one unit and do not tag them individually — poultry are never identified individually, and pigs carry a herd mark rather than an individual number.\n\n' +
  'A herd or flock records how many animals it holds, and that number changes through dated entries as animals are bought, born, sold or lost — so you can always see what you had on a given date.';

export default function AddChooseScreen() {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/animals');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="Add"
        leftAction={{ icon: 'back', accessibilityLabel: 'Back', onPress: handleBack }}
        actions={[
          {
            icon: 'help-circle',
            accessibilityLabel: 'How adding animals works',
            onPress: () => setShowHelp(true),
          },
        ]}
      />

      <View style={styles.content}>
        <Text style={styles.lead}>What are you adding?</Text>

        <BouncyPressable
          accessibilityLabel="Add an individual animal"
          accessibilityRole="button"
          onPress={() => router.replace('/add-animal')}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <View style={styles.cardIcon}>
            <AppIcon name="cow-head" size={26} color={tokens.colors.text} />
          </View>
          <View style={styles.cardCopy}>
            <Text style={styles.cardTitle}>Individual animal</Text>
            <Text style={styles.cardText}>
              Has its own tag and its own history. Best for cattle, sheep and goats.
            </Text>
          </View>
          <AppIcon name="chevron-right-minimal" size={18} color="#171717" />
        </BouncyPressable>

        <BouncyPressable
          accessibilityLabel="Add a herd or flock"
          accessibilityRole="button"
          onPress={() => router.replace('/add-collective')}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <View style={styles.cardIcon}>
            <AppIcon name="animals3" size={26} color={tokens.colors.text} />
          </View>
          <View style={styles.cardCopy}>
            <Text style={styles.cardTitle}>Herd or flock</Text>
            <Text style={styles.cardText}>
              Kept and recorded as one unit, with a head count. Best for poultry and pigs.
            </Text>
          </View>
          <AppIcon name="chevron-right-minimal" size={18} color="#171717" />
        </BouncyPressable>

        <Text style={styles.footnote}>
          Not sure? Tap the question mark at the top for an explanation.
        </Text>
      </View>

      <InfoModal
        visible={showHelp}
        onClose={() => setShowHelp(false)}
        title="Individual animals, herds and flocks"
        description={HELP_DESCRIPTION}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  content: {
    paddingHorizontal: 26,
    paddingTop: 18,
    gap: 14,
  },
  lead: {
    color: tokens.colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  card: {
    minHeight: 92,
    borderRadius: 20,
    backgroundColor: tokens.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardIcon: {
    width: 34,
    alignItems: 'center',
  },
  cardCopy: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  cardText: {
    color: tokens.colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  footnote: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    marginTop: 4,
  },
});
