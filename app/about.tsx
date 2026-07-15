import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { AppTopBar } from '../src/components/AppTopBar';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { tokens } from '../src/theme/tokens';

const APP_LOGO = require('../assets/icons/new_logo.png');
const APP_VERSION = '1.0.0';
const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/livestockbook';

function CoffeeCupIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8h11a1 1 0 0 1 1 1v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9a1 1 0 0 1 1-1Zm12 1h1.5a2.5 2.5 0 1 1 0 5H16"
        stroke="#fff"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M8 4c0 1-.6 1.5-1.1 2S5.8 7 5.8 8M12 4c0 1-.6 1.5-1.1 2S9.8 7 9.8 8"
        stroke="#fff"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

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
        <View style={styles.brandBlock}>
          <View style={styles.logoPlate}>
            <Image source={APP_LOGO} style={styles.logoImage} resizeMode="contain" />
          </View>
          <Text style={styles.appName}>LivestockBook</Text>
        </View>
        <View style={styles.textSection}>
          <Text style={styles.version}>Version {APP_VERSION}</Text>
        <Text style={styles.description}>
          LivestockBook helps you keep your animals, records, setup data, and exports organized in one place so daily
          farm management is easier to track and review.
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
          <BouncyPressable
            accessibilityLabel="Buy me a coffee"
            accessibilityRole="button"
            onPress={() => Linking.openURL(BUY_ME_A_COFFEE_URL)}
            style={({ pressed }) => [styles.linkButton, pressed && styles.linkPressed]}
          >
            <View style={styles.linkContent}>
              <CoffeeCupIcon />
              <Text style={styles.linkText}>Buy me a coffee</Text>
            </View>
          </BouncyPressable>
        </View>
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
  brandBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 14,
    marginBottom: 10,
    paddingTop: 8,
  },
  textSection: {
    gap: 14,
  },
  logoPlate: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: 64,
    height: 64,
    borderRadius: 16,
  },
  appName: {
    color: tokens.colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginTop: 0,
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
    width: '100%',
  },
  linkButton: {
    width: '100%',
    backgroundColor: tokens.colors.accent,
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  linkContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
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
