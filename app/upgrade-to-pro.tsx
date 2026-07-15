import { useRouter } from 'expo-router';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { AppTopBar } from '../src/components/AppTopBar';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { tokens } from '../src/theme/tokens';

export default function UpgradeToProScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppTopBar
        title="Upgrade to Pro"
        leftAction={{
          icon: 'back',
          accessibilityLabel: 'Back',
          onPress: () => router.back(),
        }}
      />
      <View style={styles.content}>
        <Text style={styles.title}>Upgrade to Pro</Text>
        <Text style={styles.body}>
          This page is ready as a placeholder for your future upgrade flow.
        </Text>
        <BouncyPressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>Back to account</Text>
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
  content: {
    flex: 1,
    padding: 24,
    gap: 18,
    justifyContent: 'center',
  },
  title: {
    color: tokens.colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  body: {
    color: tokens.colors.textSoft,
    fontSize: 16,
    lineHeight: 24,
  },
  button: {
    minHeight: 54,
    borderRadius: 27,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.92,
  },
});
