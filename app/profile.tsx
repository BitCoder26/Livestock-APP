import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { AnimatedPopupCard } from '../src/components/AnimatedPopupCard';
import { DesignField } from '../src/components/DesignField';
import { COUNTRY_OPTIONS, INDUSTRY_OPTIONS, getCountryFlag } from '../src/entities/account';
import { useAccount } from '../src/context/AccountContext';
import { useSubscription } from '../src/context/SubscriptionContext';
import { tokens } from '../src/theme/tokens';

const ACCOUNT_SURFACE_GREY = '#F1EFF3';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, isLoaded, updateField } = useAccount();
  const { isPro } = useSubscription();
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [showIndustryModal, setShowIndustryModal] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState('');
  const [customIndustry, setCustomIndustry] = useState('');

  if (!isLoaded) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <AppTopBar
          title="Profile"
          leftAction={{
            icon: 'back',
            accessibilityLabel: 'Back',
            onPress: () => router.back(),
          }}
        />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={tokens.colors.accent} size="small" />
          <Text style={styles.loadingText}>Loading profile</Text>
        </View>
      </SafeAreaView>
    );
  }

  const planLabel = isPro ? 'Pro' : profile.plan?.trim() || 'Basic';

  useEffect(() => {
    if (!showIndustryModal) {
      setCustomIndustry('');
      return;
    }

    if (INDUSTRY_OPTIONS.includes(profile.industry as (typeof INDUSTRY_OPTIONS)[number])) {
      setCustomIndustry('');
      return;
    }

    setCustomIndustry(profile.industry);
  }, [profile.industry, showIndustryModal]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="Profile"
        leftAction={{
          icon: 'back',
          accessibilityLabel: 'Back',
          onPress: () => router.back(),
        }}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <View style={styles.planSummary}>
            <Text style={styles.planLabel}>Plan: {planLabel}</Text>
          </View>
          <Pressable
            accessibilityLabel="Open upgrade to pro page"
            accessibilityRole="button"
            onPress={() => router.push('/upgrade-to-pro')}
            style={({ pressed }) => [styles.premiumRow, pressed && styles.pressed]}
          >
            <View style={styles.premiumLeftGroup}>
              <AppIcon name="crown" size={20} color="#C8A24A" />
              <Text style={styles.premiumLabel}>Go Pro</Text>
            </View>
          </Pressable>
          <DesignField
            label="Name"
            value={profile.name}
            onChangeText={(value) => updateField('name', value)}
            fieldStyle={styles.formField}
          />
          <DesignField
            label="Email"
            value={profile.email}
            keyboardType="email-address"
            onChangeText={(value) => updateField('email', value)}
            fieldStyle={styles.formField}
          />
          <View style={styles.block}>
            <Text style={styles.optionLabel}>Industry</Text>
            <Pressable
              accessibilityLabel="Select industry"
              accessibilityRole="button"
              onPress={() => setShowIndustryModal(true)}
              style={({ pressed }) => [styles.selectField, pressed && styles.pressed]}
            >
              <Text style={[styles.selectValue, !profile.industry && styles.placeholderValue]}>
                {profile.industry || 'Select industry'}
              </Text>
              <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
            </Pressable>
          </View>
          <View style={styles.block}>
            <Text style={styles.optionLabel}>Country</Text>
            <Pressable
              accessibilityLabel="Select country"
              accessibilityRole="button"
              onPress={() => setShowCountryModal(true)}
              style={({ pressed }) => [styles.selectField, pressed && styles.pressed]}
            >
              <Text style={[styles.selectValue, !profile.country && styles.placeholderValue]}>
                {profile.country || 'Select country'}
              </Text>
              <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <Modal transparent animationType="fade" visible={showCountryModal} onRequestClose={() => setShowCountryModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowCountryModal(false)}>
          <AnimatedPopupCard visible={showCountryModal} style={styles.selectionSheet} onPress={() => undefined}>
            <Text style={styles.selectionTitle}>Select country</Text>
            <ScrollView
              style={styles.selectionScroll}
              contentContainerStyle={styles.selectionScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Pressable
                accessibilityLabel="Select country"
                accessibilityRole="button"
                onPress={() => {
                  updateField('country', '');
                  setShowCountryModal(false);
                  setCountrySearchQuery('');
                }}
                style={[
                  styles.selectionRow,
                  profile.country === '' && styles.selectionRowActive,
                ]}
              >
                <Text
                  style={[
                    styles.selectionText,
                    profile.country === '' && styles.selectionTextActive,
                  ]}
                >
                  Select country
                </Text>
                {profile.country === '' ? <AppIcon name="check" size={18} color={tokens.colors.accentDeep} /> : null}
              </Pressable>
              {COUNTRY_OPTIONS.filter((option) => option.toLowerCase().includes(countrySearchQuery.trim().toLowerCase())).map((option) => (
                <Pressable
                  key={option}
                  accessibilityLabel={option}
                  accessibilityRole="button"
                  onPress={() => {
                    updateField('country', option);
                    setShowCountryModal(false);
                    setCountrySearchQuery('');
                  }}
                  style={[
                    styles.selectionRow,
                    profile.country === option && styles.selectionRowActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.selectionText,
                      profile.country === option && styles.selectionTextActive,
                    ]}
                  >
                    {`${getCountryFlag(option)} ${option}`.trim()}
                  </Text>
                  {profile.country === option ? <AppIcon name="check" size={18} color={tokens.colors.accentDeep} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </AnimatedPopupCard>
        </Pressable>
      </Modal>

      <Modal transparent animationType="fade" visible={showIndustryModal} onRequestClose={() => setShowIndustryModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowIndustryModal(false)}>
          <AnimatedPopupCard visible={showIndustryModal} style={styles.selectionSheet} onPress={() => undefined}>
            <Text style={styles.selectionTitle}>Select industry</Text>
            <ScrollView
              style={styles.selectionScroll}
              contentContainerStyle={styles.selectionScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.selectionCustomBlock}>
                <DesignField
                  label="Type your industry"
                  value={customIndustry}
                  onChangeText={setCustomIndustry}
                  fieldStyle={styles.formField}
                />
                <Pressable
                  accessibilityLabel="Use typed industry"
                  accessibilityRole="button"
                  disabled={customIndustry.trim().length === 0}
                  onPress={() => {
                    const nextIndustry = customIndustry.trim();

                    if (!nextIndustry) {
                      return;
                    }

                    updateField('industry', nextIndustry as typeof profile.industry);
                    setShowIndustryModal(false);
                  }}
                  style={({ pressed }) => [
                    styles.selectionCustomButton,
                    customIndustry.trim().length === 0 && styles.selectionCustomButtonDisabled,
                    pressed && customIndustry.trim().length > 0 && styles.pressed,
                  ]}
                >
                  <Text style={styles.selectionCustomButtonText}>Use typed industry</Text>
                </Pressable>
              </View>
              <Pressable
                accessibilityLabel="Select industry"
                accessibilityRole="button"
                onPress={() => {
                  updateField('industry', '');
                  setShowIndustryModal(false);
                }}
                style={[
                  styles.selectionRow,
                  profile.industry === '' && styles.selectionRowActive,
                ]}
              >
                <Text
                  style={[
                    styles.selectionText,
                    profile.industry === '' && styles.selectionTextActive,
                  ]}
                >
                  Select industry
                </Text>
                {profile.industry === '' ? <AppIcon name="check" size={18} color={tokens.colors.accentDeep} /> : null}
              </Pressable>
              {INDUSTRY_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  accessibilityLabel={option}
                  accessibilityRole="button"
                  onPress={() => {
                    updateField('industry', option);
                    setShowIndustryModal(false);
                  }}
                  style={[
                    styles.selectionRow,
                    profile.industry === option && styles.selectionRowActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.selectionText,
                      profile.industry === option && styles.selectionTextActive,
                    ]}
                  >
                    {option}
                  </Text>
                  {profile.industry === option ? <AppIcon name="check" size={18} color={tokens.colors.accentDeep} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </AnimatedPopupCard>
        </Pressable>
      </Modal>
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
    paddingTop: 30,
    paddingBottom: 44,
    gap: 18,
  },
  section: {
    gap: 14,
  },
  block: {
    gap: 8,
  },
  optionLabel: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  formField: {
    backgroundColor: ACCOUNT_SURFACE_GREY,
    borderWidth: 0,
  },
  selectField: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: ACCOUNT_SURFACE_GREY,
    borderWidth: 0,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectValue: {
    color: '#2b2b2b',
    fontSize: 13,
    fontWeight: '500',
  },
  placeholderValue: {
    color: '#7a7a7a',
  },
  planSummary: {
    paddingHorizontal: 0,
    marginTop: 8,
  },
  planLabel: {
    color: '#666666',
    fontSize: 15,
    fontWeight: '400',
  },
  premiumRow: {
    minHeight: 52,
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  premiumLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flexShrink: 1,
  },
  premiumLabel: {
    color: '#C8A24A',
    fontSize: 15,
    fontWeight: '400',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    justifyContent: 'flex-end',
  },
  selectionSheet: {
    marginHorizontal: 18,
    marginBottom: 28,
    borderRadius: 26,
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 8,
    maxHeight: '78%',
  },
  selectionTitle: {
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  selectionScroll: {
    flexGrow: 0,
  },
  selectionScrollContent: {
    gap: 8,
    paddingBottom: 4,
  },
  selectionSearchBlock: {
    marginBottom: 6,
  },
  selectionCustomBlock: {
    gap: 10,
    marginBottom: 6,
  },
  selectionCustomButton: {
    minHeight: 46,
    borderRadius: 23,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  selectionCustomButtonDisabled: {
    opacity: 0.45,
  },
  selectionCustomButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  selectionRow: {
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: '#F5F3F7',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectionRowActive: {
    backgroundColor: '#FCE5E4',
  },
  selectionText: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  selectionTextActive: {
    color: '#74423F',
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.92,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: tokens.colors.textSoft,
    fontSize: 14,
  },
});
