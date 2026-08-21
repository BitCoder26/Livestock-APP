import { useRouter } from 'expo-router';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppTopBar } from '../src/components/AppTopBar';
import { tokens } from '../src/theme/tokens';

const APP_LOGO = require('../assets/logo/about-logo.png');
const APP_VERSION = 'v2.0';

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
    paddingHorizontal: 26,
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
});
