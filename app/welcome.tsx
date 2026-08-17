import { Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { useOnboarding } from '../src/context/OnboardingContext';
import { tokens } from '../src/theme/tokens';

export default function WelcomeScreen() {
  const { startSetup } = useOnboarding();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.hero}>
        <Image
          source={require('../assets/icons/goats_coloured.jpg')}
          style={styles.heroImage}
          resizeMode="contain"
        />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>Welcome to LivestockBook</Text>
        <Text style={styles.subtitle}>
          The easy way to keep your herd&apos;s records straight — births, weights, treatments and
          movements — so you stay compliant and ready for inspection day.
        </Text>
      </View>
      <View style={styles.footer}>
        <BouncyPressable
          accessibilityLabel="Next"
          accessibilityRole="button"
          onPress={startSetup}
          style={({ pressed }) => [styles.nextButton, pressed && styles.nextButtonPressed]}
        >
          <Text style={styles.nextButtonText}>Next</Text>
          <AppIcon name="chevron-right-minimal" size={18} color="#FFFFFF" />
        </BouncyPressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  hero: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  heroImage: {
    width: '100%',
    height: 260,
  },
  copy: {
    paddingHorizontal: 28,
    paddingTop: 30,
    gap: 12,
  },
  title: {
    color: tokens.colors.text,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: tokens.colors.textSoft,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    textAlign: 'center',
  },
  footer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingBottom: 18,
  },
  nextButton: {
    minHeight: 56,
    borderRadius: 28,
    backgroundColor: tokens.colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  nextButtonPressed: {
    opacity: 0.92,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
