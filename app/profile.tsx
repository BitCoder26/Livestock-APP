import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { AnimatedPopupCard } from '../src/components/AnimatedPopupCard';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { DesignField } from '../src/components/DesignField';
import { InfoModal } from '../src/components/InfoModal';
import { COUNTRY_OPTIONS, INDUSTRY_OPTIONS, getCountryFlag } from '../src/entities/account';
import { useAccount } from '../src/context/AccountContext';
import { useSubscription } from '../src/context/SubscriptionContext';
import { tokens } from '../src/theme/tokens';
import { filterAccessibleImageUris, persistBusinessLogo } from '../src/utils/imageStorage';

const ACCOUNT_SURFACE_GREY = '#F1EFF3';

export default function ProfileScreen() {
  const router = useRouter();
  const { previewPro } = useLocalSearchParams<{ previewPro?: string }>();
  const { profile, isLoaded, updateField } = useAccount();
  const { customerInfo, isPro, loading: subscriptionLoading } = useSubscription();
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [showIndustryModal, setShowIndustryModal] = useState(false);
  const [showBrandingInfo, setShowBrandingInfo] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState('');
  const [customIndustry, setCustomIndustry] = useState('');

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

  const logoUri = filterAccessibleImageUris([profile.businessLogoUri])[0];

  const handleAddLogo = async () => {
    // No permission request before launching. launchImageLibraryAsync presents
    // the system photo picker, which runs out of process and hands back only
    // the chosen image — the app never gets library access, so none is needed
    // (Expo SDK 57: "No permissions request is necessary for launching the
    // image library"). Asking anyway cost an async round-trip before the picker
    // could even start opening, and put a permission dialog in front of the
    // very first photo. Worse, a user who had denied library access was refused
    // outright here despite the picker working perfectly well without it.
    //
    // The documented exception is videos on iOS; these pickers are images only.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
      allowsMultipleSelection: false,
      selectionLimit: 1,
    });

    if (result.canceled) {
      return;
    }

    const nextUri = result.assets[0]?.uri;

    if (!nextUri) {
      return;
    }

    try {
      const storedUri = await persistBusinessLogo(nextUri);
      updateField('businessLogoUri', storedUri);
    } catch {
      Alert.alert('Image unavailable', 'The selected image could not be saved. Please choose it again.');
    }
  };

  const handleRemoveLogo = () => {
    updateField('businessLogoUri', undefined);
  };

  if (!isLoaded || subscriptionLoading) {
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

  const displayedIsPro = isPro || (__DEV__ && previewPro === '1');

  const handleManageSubscription = async () => {
    const managementURL = customerInfo?.managementURL;

    if (!managementURL) {
      Alert.alert(
        'Manage Subscription',
        __DEV__ && previewPro === '1'
          ? 'This is a Pro layout preview. No subscription was purchased.'
          : 'Your subscription management page is unavailable right now. Please try again later.',
      );
      return;
    }

    try {
      await Linking.openURL(managementURL);
    } catch {
      Alert.alert('Manage Subscription', 'Unable to open your subscription management page right now.');
    }
  };

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
        {displayedIsPro ? (
          <View style={styles.section}>
            <Pressable
              accessibilityLabel="Manage subscription"
              accessibilityRole="link"
              onPress={() => void handleManageSubscription()}
              style={({ pressed }) => [styles.premiumRow, pressed && styles.pressed]}
            >
              <View style={styles.premiumLeftGroup}>
                <AppIcon name="settings" size={20} color={tokens.colors.accent} />
                <Text style={styles.manageSubscriptionLabel}>Manage Subscription</Text>
              </View>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal details</Text>
          <DesignField
            label="Name"
            value={profile.name}
            onChangeText={(value) => updateField('name', value)}
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

        <View style={styles.section}>
          <View style={styles.optionLabelRow}>
            <Text style={styles.sectionTitle}>Branding</Text>
            <BouncyPressable
              accessibilityLabel="About branding"
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => setShowBrandingInfo(true)}
              pressedScale={0.88}
              style={styles.optionInfoButton}
            >
              <AppIcon name="info" size={16} color={tokens.colors.textSoft} />
            </BouncyPressable>
          </View>
          <DesignField
            label="Business / Farm name"
            value={profile.businessName ?? ''}
            onChangeText={(value) => updateField('businessName', value)}
            fieldStyle={styles.formField}
          />
          <DesignField
            label="Address"
            value={profile.businessAddress ?? ''}
            onChangeText={(value) => updateField('businessAddress', value)}
            fieldStyle={styles.formField}
            large
          />
          <Pressable
            accessibilityLabel="Add business logo"
            accessibilityRole="button"
            onPress={() => void handleAddLogo()}
            style={({ pressed }) => [styles.photoButton, pressed && styles.pressed]}
          >
            <View style={styles.photoCopy}>
              <AppIcon name="image-add" size={22} color={tokens.colors.accent} />
              <Text style={styles.photoText}>{logoUri ? 'Change logo' : 'Add logo'}</Text>
            </View>
            <View style={styles.fieldChevron}>
              <AppIcon name="chevron-right-minimal" size={18} color="#171717" />
            </View>
          </Pressable>
          {logoUri ? (
            <View style={styles.imageCard}>
              <Image source={{ uri: logoUri }} style={styles.imagePreview} onError={handleRemoveLogo} />
              <Pressable
                accessibilityLabel="Remove logo"
                accessibilityRole="button"
                onPress={handleRemoveLogo}
                style={styles.removeImageButton}
              >
                <AppIcon name="close" size={14} color="#fff" />
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <Modal transparent animationType="none" visible={showCountryModal} onRequestClose={() => setShowCountryModal(false)}>
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

      <Modal transparent animationType="none" visible={showIndustryModal} onRequestClose={() => setShowIndustryModal(false)}>
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

      <InfoModal
        visible={showBrandingInfo}
        onClose={() => setShowBrandingInfo(false)}
        title="Branding"
        description="Shown on the header of your exported PDFs alongside LivestockBook. Leave blank to keep the header LivestockBook-only."
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
    paddingTop: 30,
    paddingBottom: 44,
    gap: 18,
  },
  section: {
    gap: 14,
  },
  sectionTitle: {
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  optionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  optionInfoButton: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: {
    gap: 8,
  },
  fieldChevron: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoButton: {
    minHeight: 54,
    borderRadius: 22,
    backgroundColor: ACCOUNT_SURFACE_GREY,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  photoCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  photoText: {
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  imageCard: {
    width: 108,
    height: 108,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: ACCOUNT_SURFACE_GREY,
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  removeImageButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
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
  manageSubscriptionLabel: {
    color: tokens.colors.accent,
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
    backgroundColor: tokens.colors.accent,
  },
  selectionText: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  selectionTextActive: {
    color: '#fff',
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
