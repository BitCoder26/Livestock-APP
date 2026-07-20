import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { AnimatedPopupCard } from '../src/components/AnimatedPopupCard';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { DesignField } from '../src/components/DesignField';
import { DATE_FORMAT_OPTIONS, MEASUREMENT_UNIT_OPTIONS, type AppDateFormat } from '../src/entities/account';
import { useAccount } from '../src/context/AccountContext';
import { tokens } from '../src/theme/tokens';

const ACCOUNT_SURFACE_GREY = '#F1EFF3';
const CURRENCY_OPTIONS = ['GBP', 'USD', 'EUR', 'AUD', 'CAD', 'NZD', 'ZAR', 'Other'] as const;

export default function SettingsScreen() {
  const router = useRouter();
  const { profile, isLoaded, updateField, resetAppData } = useAccount();
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [showDateFormatModal, setShowDateFormatModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState('GBP');

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

  if (!isLoaded) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <AppTopBar
          title="Settings"
          leftAction={{
            icon: 'back',
            accessibilityLabel: 'Back',
            onPress: () => router.back(),
          }}
        />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={tokens.colors.accent} size="small" />
          <Text style={styles.loadingText}>Loading settings</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="Settings"
        leftAction={{
          icon: 'back',
          accessibilityLabel: 'Back',
          onPress: () => router.back(),
        }}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.block}>
            <Text style={styles.optionLabel}>Currency</Text>
            <Pressable
              accessibilityLabel="Select currency"
              accessibilityRole="button"
              onPress={() => setShowCurrencyModal(true)}
              style={({ pressed }) => [styles.selectField, pressed && styles.pressed]}
            >
              <Text style={styles.selectValue}>{selectedCurrency}</Text>
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

          <View style={styles.block}>
            <Text style={styles.optionLabel}>Date format</Text>
            <Pressable
              accessibilityLabel="Select date format"
              accessibilityRole="button"
              onPress={() => setShowDateFormatModal(true)}
              style={({ pressed }) => [styles.selectField, pressed && styles.pressed]}
            >
              <Text style={styles.selectValue}>{profile.dateFormat}</Text>
              <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Danger Zone</Text>
          <ActionButton
            label="Reset app data"
            variant="danger"
            onPress={() => setShowResetModal(true)}
          />
        </View>
      </ScrollView>

      <SelectionModal
        visible={showCurrencyModal}
        title="Select currency"
        options={[...CURRENCY_OPTIONS]}
        selectedValue={selectedCurrency}
        onSelect={(value) => {
          setSelectedCurrency(value);
          setShowCurrencyModal(false);
        }}
        onClose={() => setShowCurrencyModal(false)}
      />

      <SelectionModal
        visible={showDateFormatModal}
        title="Select date format"
        options={[...DATE_FORMAT_OPTIONS]}
        selectedValue={profile.dateFormat}
        onSelect={(value) => {
          updateField('dateFormat', value as AppDateFormat);
          setShowDateFormatModal(false);
        }}
        onClose={() => setShowDateFormatModal(false)}
      />

      <Modal transparent animationType="fade" visible={showResetModal} onRequestClose={() => setShowResetModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowResetModal(false)}>
          <AnimatedPopupCard visible={showResetModal} style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>Reset app data</Text>
            <Text style={styles.sheetBody}>
              This will remove your animals, records, setup items, and filters from this device. Your profile and preferences will stay in place.
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

    </SafeAreaView>
  );
}

type SelectionModalProps = {
  visible: boolean;
  title: string;
  options: string[];
  selectedValue: string;
  onSelect: (value: string) => void;
  onClose: () => void;
  clearLabel?: string;
  customValue?: string;
  onCustomValueChange?: (value: string) => void;
  customLabel?: string;
  customPlaceholder?: string;
  customSubmitLabel?: string;
  searchValue?: string;
  onSearchValueChange?: (value: string) => void;
  optionLabelPrefix?: (option: string) => string;
};

function SelectionModal({ visible, title, options, selectedValue, onSelect, onClose, clearLabel, customValue, onCustomValueChange, customLabel, customPlaceholder, customSubmitLabel, searchValue, onSearchValueChange, optionLabelPrefix }: SelectionModalProps) {
  const trimmedCustomValue = customValue?.trim() ?? '';
  const normalizedSearch = searchValue?.trim().toLowerCase() ?? '';
  const filteredOptions = normalizedSearch.length === 0
    ? options
    : options.filter((option) => option.toLowerCase().includes(normalizedSearch));

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <AnimatedPopupCard visible={visible} style={styles.selectionSheet} onPress={() => undefined}>
          <Text style={styles.selectionTitle}>{title}</Text>
          <ScrollView
            style={styles.selectionScroll}
            contentContainerStyle={styles.selectionScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {onSearchValueChange ? (
              <View style={styles.selectionSearchBlock}>
                <DesignField
                  label="Search"
                  value={searchValue ?? ''}
                  onChangeText={onSearchValueChange}
                  fieldStyle={styles.formField}
                />
              </View>
            ) : null}
            {onCustomValueChange ? (
              <View style={styles.selectionCustomBlock}>
                <DesignField
                  label={customLabel ?? 'Custom value'}
                  value={customValue ?? ''}
                  onChangeText={onCustomValueChange}
                  fieldStyle={styles.formField}
                />
                <BouncyPressable
                  accessibilityLabel={customSubmitLabel ?? 'Save custom value'}
                  accessibilityRole="button"
                  disabled={trimmedCustomValue.length === 0}
                  onPress={() => {
                    if (trimmedCustomValue.length === 0) {
                      return;
                    }

                    onSelect(trimmedCustomValue);
                  }}
                  style={({ pressed }) => [
                    styles.selectionCustomButton,
                    trimmedCustomValue.length === 0 && styles.selectionCustomButtonDisabled,
                    pressed && trimmedCustomValue.length > 0 && styles.actionButtonPressed,
                  ]}
                >
                  <Text style={styles.selectionCustomButtonText}>{customSubmitLabel ?? 'Use custom industry'}</Text>
                </BouncyPressable>
              </View>
            ) : null}
            {clearLabel ? (
              <Pressable
                accessibilityLabel={clearLabel}
                accessibilityRole="button"
                onPress={() => onSelect('')}
                style={[
                  styles.selectionRow,
                  selectedValue === '' && styles.selectionRowActive,
                ]}
              >
                <Text
                  style={[
                    styles.selectionText,
                    selectedValue === '' && styles.selectionTextActive,
                  ]}
                >
                  {clearLabel}
                </Text>
                {selectedValue === '' ? <AppIcon name="check" size={18} color={tokens.colors.accentDeep} /> : null}
              </Pressable>
            ) : null}
            {filteredOptions.map((option) => (
              <Pressable
                key={option}
                accessibilityLabel={option}
                accessibilityRole="button"
                onPress={() => onSelect(option)}
                style={[
                  styles.selectionRow,
                  selectedValue === option && styles.selectionRowActive,
                ]}
              >
                <Text
                  style={[
                    styles.selectionText,
                    selectedValue === option && styles.selectionTextActive,
                  ]}
                >
                  {optionLabelPrefix ? `${optionLabelPrefix(option)} ${option}`.trim() : option}
                </Text>
                {selectedValue === option ? <AppIcon name="check" size={18} color={tokens.colors.accentDeep} /> : null}
              </Pressable>
            ))}
          </ScrollView>
        </AnimatedPopupCard>
      </Pressable>
    </Modal>
  );
}

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'default' | 'danger';
};

function ActionButton({ label, onPress, variant = 'default' }: ActionButtonProps) {
  const isDanger = variant === 'danger';

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
    paddingHorizontal: 26,
    paddingTop: 18,
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
  },
  sheetBody: {
    color: '#444',
    fontSize: 14,
    lineHeight: 21,
  },
  sheetButtons: {
    flexDirection: 'row',
    gap: 12,
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
