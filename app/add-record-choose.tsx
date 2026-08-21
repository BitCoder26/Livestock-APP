import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { InfoModal } from '../src/components/InfoModal';
import { tokens } from '../src/theme/tokens';

const HELP_DESCRIPTION =
  'A record for an individual animal is attached to the tags you pick, and shows up on each of those animals’ timelines.\n\n' +
  'A record for a herd or flock is attached to the group instead, because the animals in it are not identified individually. It says how many animals it affected rather than which ones, and the types on offer differ to match — deaths, births, sales and purchases are plural and move the group’s head count, weight is an average across the group, and a correction exists for putting a miscount right.\n\n' +
  'Pick whichever matches how the animals themselves are kept: it is the same choice you made when you added them.';

export default function AddRecordChooseScreen() {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/records');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="Add record"
        leftAction={{ icon: 'back', accessibilityLabel: 'Back', onPress: handleBack }}
        actions={[
          {
            icon: 'help-circle',
            accessibilityLabel: 'How records work',
            onPress: () => setShowHelp(true),
          },
        ]}
      />

      <View style={styles.content}>
        <Text style={styles.lead}>What is this record for?</Text>

        <BouncyPressable
          accessibilityLabel="Add a record for an individual animal"
          accessibilityRole="button"
          onPress={() => router.replace('/add-record')}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <View style={styles.cardIcon}>
            <AppIcon name="cow-head" size={26} color={tokens.colors.text} />
          </View>
          <View style={styles.cardCopy}>
            <Text style={styles.cardTitle}>Individual animals</Text>
            <Text style={styles.cardText}>
              Attached to the tags you pick, and shown on each animal&apos;s timeline.
            </Text>
          </View>
          <AppIcon name="chevron-right-minimal" size={18} color="#171717" />
        </BouncyPressable>

        <BouncyPressable
          accessibilityLabel="Add a record for a herd or flock"
          accessibilityRole="button"
          onPress={() => router.replace('/add-collective-record')}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <View style={styles.cardIcon}>
            <AppIcon name="animals3" size={26} color={tokens.colors.text} />
          </View>
          <View style={styles.cardCopy}>
            <Text style={styles.cardTitle}>A herd or flock</Text>
            <Text style={styles.cardText}>
              Says how many animals it affected, and can move the group&apos;s head count.
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
        title="Which kind of record?"
        description={HELP_DESCRIPTION}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: tokens.colors.background },
  content: { paddingHorizontal: 26, paddingTop: 18, gap: 14 },
  lead: { color: tokens.colors.textSoft, fontSize: 13, fontWeight: '600', marginBottom: 2 },
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
  cardPressed: { opacity: 0.85 },
  cardIcon: { width: 34, alignItems: 'center' },
  cardCopy: { flex: 1, gap: 3 },
  cardTitle: { color: tokens.colors.text, fontSize: 16, fontWeight: '700' },
  cardText: { color: tokens.colors.textSoft, fontSize: 13, lineHeight: 18 },
  footnote: { color: tokens.colors.textSoft, fontSize: 12, marginTop: 4 },
});
