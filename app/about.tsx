import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppTopBar } from '../src/components/AppTopBar';
import { tokens } from '../src/theme/tokens';

const APP_VERSION = '1.0.0';
const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/thomaskoukouris';

export default function AboutScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="About"
        leftAction={{
          icon: 'back',
          accessibilityLabel: 'Back',
          onPress: () => router.back(),
        }}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.appName}>Livestock Tracker</Text>
        <Text style={styles.version}>Version {APP_VERSION}</Text>
        <Text style={styles.description}>
          Livestock Tracker helps you keep your animals, records, setup data, and exports organized in one place so
          daily farm management is easier to track and review.
        </Text>
        <Text style={styles.author}>Developed by: Thomas Koukouris</Text>
        <Text style={styles.location}>Based in the UK</Text>
        <Text style={styles.supportText}>
          The best way to support the app is by upgrading to Pro and sharing it with other farmers.
        </Text>
        <Text style={styles.supportText}>
          If you'd like to support development further, you can also buy me a coffee. Every contribution helps fund
          new features, improvements, and ongoing maintenance.
        </Text>
        <View style={styles.buttonStack}>
          <Pressable
            accessibilityLabel="Upgrade to Pro"
            accessibilityRole="button"
            onPress={() => router.push('/settings')}
            style={({ pressed }) => [styles.linkButton, pressed && styles.linkPressed]}
          >
            <Text style={styles.linkText}>Upgrade to Pro</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Buy me a coffee"
            accessibilityRole="button"
            onPress={() => Linking.openURL(BUY_ME_A_COFFEE_URL)}
            style={({ pressed }) => [styles.linkButton, pressed && styles.linkPressed]}
          >
            <Text style={styles.linkText}>☕ Buy me a coffee</Text>
          </Pressable>
        </View>
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
    gap: 14,
  },
  appName: {
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: '500',
  },
  version: {
    color: tokens.colors.accentDeep,
    fontSize: 15,
    fontWeight: '600',
  },
  description: {
    color: '#383838',
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '400',
  },
  author: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  location: {
    color: '#4a4a4a',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
  },
  supportText: {
    color: '#4a4a4a',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
  },
  buttonStack: {
    gap: 12,
    alignSelf: 'flex-start',
  },
  linkButton: {
    backgroundColor: tokens.colors.accent,
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  linkPressed: {
    opacity: 0.9,
  },
  linkText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
