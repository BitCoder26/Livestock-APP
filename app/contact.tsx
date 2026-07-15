import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppTopBar } from '../src/components/AppTopBar';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { tokens } from '../src/theme/tokens';

const CONTACT_EMAIL = 'contact@livestockbook.app';

export default function ContactScreen() {
  const router = useRouter();

  const handleEmailPress = async () => {
    const emailUrl = `mailto:${CONTACT_EMAIL}`;

    try {
      const canOpenEmail = await Linking.canOpenURL(emailUrl);

      if (!canOpenEmail) {
        throw new Error('No email app is available.');
      }

      await Linking.openURL(emailUrl);
    } catch {
      Alert.alert(
        'Email app unavailable',
        `Please email us directly at ${CONTACT_EMAIL}.`,
      );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="Contact"
        leftAction={{
          icon: 'back',
          accessibilityLabel: 'Back',
          onPress: () => router.back(),
        }}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>We'd love to hear from you</Text>
        <Text style={styles.body}>
          Send us questions, support requests, or ideas and we'll get back to you by email.
        </Text>
        <Text style={styles.email}>{CONTACT_EMAIL}</Text>

        <BouncyPressable
          accessibilityLabel="Email LivestockBook"
          accessibilityRole="button"
          onPress={() => void handleEmailPress()}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>Email us</Text>
        </BouncyPressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 120,
  },
  title: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },
  body: {
    color: '#383838',
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '400',
    marginBottom: 14,
  },
  email: {
    color: '#4a4a4a',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
    marginBottom: 24,
  },
  button: {
    borderRadius: 999,
    backgroundColor: tokens.colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
