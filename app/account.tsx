import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { AnimatedPopupCard } from '../src/components/AnimatedPopupCard';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { DesignField } from '../src/components/DesignField';
import { COUNTRY_OPTIONS, INDUSTRY_OPTIONS, MEASUREMENT_UNIT_OPTIONS } from '../src/entities/account';
import { useAccount } from '../src/context/AccountContext';
import { tokens } from '../src/theme/tokens';

const ACCOUNT_SURFACE_GREY = '#F1EFF3';

export default function AccountScreen() {
  const router = useRouter();
  const { profile, isLoaded, updateField, resetAppData, changePassword, signOutAllDevices, deleteAccount } = useAccount();
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [showIndustryModal, setShowIndustryModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmitPassword = useMemo(
    () =>
      currentPassword.trim().length > 0 &&
      nextPassword.trim().length > 0 &&
      confirmPassword.trim().length > 0 &&
      nextPassword === confirmPassword,
    [confirmPassword, currentPassword, nextPassword],
  );

  async function handleResetAppData() {
    setIsSubmitting(true);

    try {
      await resetAppData();
      setShowResetModal(false);
      Alert.alert('App data reset', 'Your local livestock data has been removed from this device.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignOutAllDevices() {
    Alert.alert(
      'Sign out of all devices',
      'This should revoke every active session once a real auth backend is connected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => {
            void (async () => {
              const result = await signOutAllDevices();
              Alert.alert('Sign out of all devices', result.message);
            })();
          },
        },
      ],
    );
  }

  async function handleChangePassword() {
    if (!canSubmitPassword) {
      Alert.alert('Check passwords', 'Enter your current password and make sure the new passwords match.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await changePassword(currentPassword, nextPassword);
      setShowPasswordModal(false);
      setCurrentPassword('');
      setNextPassword('');
      setConfirmPassword('');
      Alert.alert('Change password', result.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmation.trim() !== 'DELETE') {
      Alert.alert('Type DELETE', 'To delete the account, type DELETE exactly as shown.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await deleteAccount();
      setShowDeleteModal(false);
      setDeleteConfirmation('');
      Alert.alert('Account deleted', result.message, [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isLoaded) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <AppTopBar
          title="Account"
          leftAction={{
            icon: 'back',
            accessibilityLabel: 'Back',
            onPress: () => router.back(),
          }}
        />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={tokens.colors.accent} size="small" />
          <Text style={styles.loadingText}>Loading account</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="Account"
        leftAction={{
          icon: 'back',
          accessibilityLabel: 'Back',
          onPress: () => router.back(),
        }}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal</Text>
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
            <Text style={styles.optionLabel}>Plan</Text>
            <Pressable
              accessibilityLabel="Open upgrade to pro page"
              accessibilityRole="button"
              onPress={() => router.push('/upgrade-to-pro')}
              style={({ pressed }) => [styles.selectField, pressed && styles.pressed]}
            >
              <Text style={styles.selectValue}>{profile.plan || 'Basic'}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
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
            <Text style={styles.optionLabel}>Default units</Text>
            <View style={styles.optionWrap}>
              {MEASUREMENT_UNIT_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  accessibilityLabel={option}
                  accessibilityRole="button"
                  onPress={() => updateField('measurementUnits', option)}
                  style={({ pressed }) => [
                    styles.optionChip,
                    profile.measurementUnits === option && styles.optionChipSelected,
                    pressed && styles.optionChipPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      profile.measurementUnits === option && styles.optionTextSelected,
                    ]}
                  >
                    {option}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          <ActionButton
            label="Change password"
            textVariant="subtle"
            onPress={() => setShowPasswordModal(true)}
          />
          <ActionButton
            label="Sign out of all devices"
            textVariant="subtle"
            onPress={() => void handleSignOutAllDevices()}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Danger Zone</Text>
          <ActionButton
            label="Reset app data"
            variant="danger"
            onPress={() => setShowResetModal(true)}
          />
          <ActionButton
            label="Delete account"
            variant="danger"
            onPress={() => setShowDeleteModal(true)}
          />
        </View>
      </ScrollView>

      <Modal transparent animationType="fade" visible={showPasswordModal} onRequestClose={() => setShowPasswordModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowPasswordModal(false)}>
          <AnimatedPopupCard visible={showPasswordModal} style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>Change password</Text>
            <Text style={styles.sheetBody}>
              This UI is ready. Once you connect a real auth backend, this action can update the password for the account everywhere.
            </Text>
            <View style={styles.modalFields}>
              <DesignField
                label="Current password"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                fieldStyle={styles.formField}
              />
              <DesignField
                label="New password"
                value={nextPassword}
                onChangeText={setNextPassword}
                fieldStyle={styles.formField}
              />
              <DesignField
                label="Confirm new password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                fieldStyle={styles.formField}
              />
            </View>
            <View style={styles.sheetButtons}>
              <SheetButton label="Cancel" variant="secondary" onPress={() => setShowPasswordModal(false)} />
              <SheetButton
                label={isSubmitting ? 'Saving...' : 'Change password'}
                onPress={() => void handleChangePassword()}
                disabled={!canSubmitPassword || isSubmitting}
              />
            </View>
          </AnimatedPopupCard>
        </Pressable>
      </Modal>

      <Modal transparent animationType="fade" visible={showCountryModal} onRequestClose={() => setShowCountryModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowCountryModal(false)}>
          <AnimatedPopupCard visible={showCountryModal} style={styles.selectionSheet} onPress={() => undefined}>
            <Text style={styles.selectionTitle}>Select country</Text>
            <ScrollView
              style={styles.selectionScroll}
              contentContainerStyle={styles.selectionScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {COUNTRY_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  accessibilityLabel={option}
                  accessibilityRole="button"
                  onPress={() => {
                    updateField('country', option);
                    setShowCountryModal(false);
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
                    {option}
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

      <Modal transparent animationType="fade" visible={showResetModal} onRequestClose={() => setShowResetModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowResetModal(false)}>
          <AnimatedPopupCard visible={showResetModal} style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>Reset app data</Text>
            <Text style={styles.sheetBody}>
              This will remove your animals, records, setup items, and filters from this device. Your account details will stay in place.
            </Text>
            <View style={styles.sheetButtons}>
              <SheetButton label="Cancel" variant="secondary" onPress={() => setShowResetModal(false)} />
              <SheetButton
                label={isSubmitting ? 'Resetting...' : 'Reset app data'}
                variant="danger"
                onPress={() => void handleResetAppData()}
                disabled={isSubmitting}
              />
            </View>
          </AnimatedPopupCard>
        </Pressable>
      </Modal>

      <Modal transparent animationType="fade" visible={showDeleteModal} onRequestClose={() => setShowDeleteModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowDeleteModal(false)}>
          <AnimatedPopupCard visible={showDeleteModal} style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>Delete account</Text>
            <Text style={styles.deleteWarning}>
              This is permanent. Deleting the account will clear local livestock data on this device, remove your saved account details, and should permanently erase the account from your backend once one is connected.
            </Text>
            <Text style={styles.deleteInstruction}>Type DELETE to confirm.</Text>
            <DesignField
              label="Confirmation"
              value={deleteConfirmation}
              onChangeText={setDeleteConfirmation}
              fieldStyle={styles.confirmationField}
            />
            <View style={styles.sheetButtons}>
              <SheetButton label="Cancel" variant="secondary" onPress={() => setShowDeleteModal(false)} />
              <SheetButton
                label={isSubmitting ? 'Deleting...' : 'Delete account'}
                variant="danger"
                onPress={() => void handleDeleteAccount()}
                disabled={deleteConfirmation.trim() !== 'DELETE' || isSubmitting}
              />
            </View>
          </AnimatedPopupCard>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'default' | 'danger';
  textVariant?: 'default' | 'subtle';
};

function ActionButton({ label, onPress, variant = 'default', textVariant = 'default' }: ActionButtonProps) {
  const isDanger = variant === 'danger';
  const isSubtle = textVariant === 'subtle';

  return (
    <BouncyPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        isDanger && styles.actionButtonDanger,
        pressed && styles.actionButtonPressed,
      ]}
    >
      <>
        <Text
          style={[
            styles.actionText,
            isSubtle && styles.actionTextSubtle,
            isDanger && styles.actionTextDanger,
          ]}
        >
          {label}
        </Text>
        <View style={styles.actionChevron}>
          <AppIcon name="chevron-right" size={12} color={isDanger ? '#FFFFFF' : '#EFEFEF'} />
        </View>
      </>
    </BouncyPressable>
  );
}

type SheetButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'default' | 'secondary' | 'danger';
};

function SheetButton({ label, onPress, disabled = false, variant = 'default' }: SheetButtonProps) {
  return (
    <BouncyPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      containerStyle={{ flex: 1 }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sheetButton,
        variant === 'secondary' && styles.sheetButtonSecondary,
        variant === 'danger' && styles.sheetButtonDanger,
        disabled && styles.sheetButtonDisabled,
        pressed && !disabled && styles.actionButtonPressed,
      ]}
    >
      <Text
        style={[
          styles.sheetButtonText,
          variant === 'secondary' && styles.sheetButtonTextSecondary,
        ]}
      >
        {label}
      </Text>
    </BouncyPressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  content: {
    padding: 18,
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
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    borderRadius: 999,
    backgroundColor: ACCOUNT_SURFACE_GREY,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  optionChipSelected: {
    backgroundColor: '#FCE5E4',
  },
  optionChipPressed: {
    opacity: 0.92,
  },
  optionText: {
    color: '#555',
    fontSize: 13,
    fontWeight: '600',
  },
  optionTextSelected: {
    color: '#74423F',
    fontWeight: '700',
  },
  actionButton: {
    minHeight: 54,
    borderRadius: 27,
    backgroundColor: ACCOUNT_SURFACE_GREY,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  actionButtonDanger: {
    backgroundColor: '#C95656',
  },
  actionButtonPressed: {
    opacity: 0.92,
  },
  pressed: {
    opacity: 0.92,
  },
  actionText: {
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  actionTextSubtle: {
    fontWeight: '500',
  },
  actionTextDanger: {
    color: '#fff',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 26,
    gap: 14,
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
  selectionScroll: {
    flexGrow: 0,
  },
  selectionScrollContent: {
    gap: 8,
    paddingBottom: 4,
  },
  sheetTitle: {
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  selectionTitle: {
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
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
  sheetBody: {
    color: '#444',
    fontSize: 14,
    lineHeight: 21,
  },
  deleteWarning: {
    color: '#8F2F2F',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
  deleteInstruction: {
    color: tokens.colors.text,
    fontSize: 13,
    fontWeight: '500',
  },
  modalFields: {
    gap: 12,
  },
  sheetButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmationField: {
    backgroundColor: ACCOUNT_SURFACE_GREY,
  },
  sheetButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 27,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  sheetButtonSecondary: {
    backgroundColor: '#F5F3F7',
    shadowOpacity: 0,
    elevation: 0,
  },
  sheetButtonDanger: {
    backgroundColor: '#C95656',
  },
  sheetButtonDisabled: {
    opacity: 0.45,
  },
  sheetButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  sheetButtonTextSecondary: {
    color: tokens.colors.text,
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
  actionChevron: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
