import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
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

import { AppIcon, type AppIconName } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { AnimatedPopupCard } from '../src/components/AnimatedPopupCard';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { DesignField } from '../src/components/DesignField';
import { InfoModal } from '../src/components/InfoModal';
import {
  CURRENCY_OPTIONS,
  formatCurrencyOption,
  getCurrencyOption,
} from '../src/constants/currencies';
import { DATE_FORMAT_OPTIONS, MEASUREMENT_UNIT_OPTIONS, type AppDateFormat } from '../src/entities/account';
import { useAccount } from '../src/context/AccountContext';
import { useAnimals } from '../src/context/AnimalsContext';
import { useRecords } from '../src/context/RecordsContext';
import { useSetup } from '../src/context/SetupContext';
import {
  buildBackup,
  createBackupFile,
  describeBackupValidationFailure,
  pickBackupFile,
  readBackupFileText,
  shareBackupFile,
  validateBackupText,
  type LivestockBookBackup,
} from '../src/services/backupService';
import { tokens } from '../src/theme/tokens';

const ACCOUNT_SURFACE_GREY = '#F1EFF3';

export default function SettingsScreen() {
  const router = useRouter();
  const { profile, isLoaded, updateField, resetAppData, restoreFromBackup } = useAccount();
  const { animals } = useAnimals();
  const { records } = useRecords();
  const { farmEntities, paddockEntities, groupEntities, medicineEntities } = useSetup();
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [showCurrencyInfo, setShowCurrencyInfo] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [showDateFormatModal, setShowDateFormatModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBackupInfo, setShowBackupInfo] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isPickingBackup, setIsPickingBackup] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<LivestockBookBackup | null>(null);
  const backupInProgress = useRef(false);
  const restoreInProgress = useRef(false);
  const selectedCurrency = getCurrencyOption(profile.currency);
  const selectedCurrencyLabel = selectedCurrency
    ? formatCurrencyOption(selectedCurrency)
    : profile.currency;

  async function handleBackUpData() {
    if (backupInProgress.current) {
      return;
    }

    backupInProgress.current = true;
    setIsBackingUp(true);

    try {
      const backup = buildBackup({
        animals,
        records,
        farmEntities,
        paddockEntities,
        groupEntities,
        medicineEntities,
        profile,
      });
      // Success is only ever reported once this line has actually completed —
      // if writing the file throws, control jumps straight to the catch
      // block below and no confirmation is shown.
      const uri = await createBackupFile(backup);

      await shareBackupFile(uri);
      // Drives the "back up your data" reminder on the Account screen — a
      // full backup counts just as much as a CSV/PDF export does (see
      // export.tsx's handleExport), since either one gets the user's data
      // off-device.
      updateField('lastExportedAt', new Date().toISOString());
      Alert.alert('Backup created', 'Your LivestockBook backup file is ready to save.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong while preparing the backup.';
      Alert.alert('Backup failed', message);
    } finally {
      backupInProgress.current = false;
      setIsBackingUp(false);
    }
  }

  async function handleRestoreData() {
    if (restoreInProgress.current) {
      return;
    }

    restoreInProgress.current = true;
    setIsPickingBackup(true);

    try {
      const picked = await pickBackupFile();

      if (picked.canceled) {
        return;
      }

      const text = await readBackupFileText(picked.uri);
      const validation = validateBackupText(text);

      if (!validation.ok) {
        const { title, message } = describeBackupValidationFailure(validation.reason);
        Alert.alert(title, message);
        return;
      }

      // Nothing about the current data has been touched yet — validation
      // succeeded, so now (and only now) ask for confirmation before
      // anything is replaced.
      setPendingRestore(validation.backup);
    } catch {
      Alert.alert('Restore failed', 'The selected file could not be read. Please try again.');
    } finally {
      setIsPickingBackup(false);
      restoreInProgress.current = false;
    }
  }

  async function handleConfirmRestore() {
    if (!pendingRestore) {
      return;
    }

    setIsRestoring(true);

    try {
      const result = await restoreFromBackup(pendingRestore);

      if (!result.ok) {
        Alert.alert(
          'Restore failed',
          result.reason === 'integrity-error'
            ? 'The backup could not be reconstructed reliably. Your existing data was left unchanged.'
            : 'Your data was left unchanged. Please try again.',
        );
        return;
      }

      setPendingRestore(null);
      Alert.alert('Restore complete', 'Your LivestockBook data has been restored successfully.');
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleResetAppData() {
    setIsSubmitting(true);

    try {
      await resetAppData();
      setShowResetModal(false);
      Alert.alert('App data reset', 'Your local livestock data has been removed from this device.');
    } catch {
      Alert.alert('Reset failed', 'Your data was not completely removed. Please try again.');
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
            <View style={styles.optionLabelRow}>
              <Text style={styles.optionLabel}>Currency</Text>
              <BouncyPressable
                accessibilityLabel="About record currency"
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => setShowCurrencyInfo(true)}
                pressedScale={0.88}
                style={styles.optionInfoButton}
              >
                <AppIcon name="info" size={16} color={tokens.colors.textSoft} />
              </BouncyPressable>
            </View>
            <Pressable
              accessibilityLabel="Select currency"
              accessibilityRole="button"
              onPress={() => {
                setCurrencySearch('');
                setShowCurrencyModal(true);
              }}
              style={({ pressed }) => [styles.selectField, pressed && styles.pressed]}
            >
              <Text numberOfLines={1} style={styles.selectValue}>{selectedCurrencyLabel}</Text>
              <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
            </Pressable>
          </View>

          <View style={styles.block}>
            <Text style={styles.optionLabel}>Default weight units</Text>
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
          <View style={styles.optionLabelRow}>
            <Text style={styles.sectionTitle}>Data & Backup</Text>
            <BouncyPressable
              accessibilityLabel="About backup and restore"
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => setShowBackupInfo(true)}
              pressedScale={0.88}
              style={styles.optionInfoButton}
            >
              <AppIcon name="info" size={16} color={tokens.colors.textSoft} />
            </BouncyPressable>
          </View>
          <DataRow
            icon="export-outline"
            label="Back Up Data"
            busy={isBackingUp}
            busyLabel="Preparing backup..."
            onPress={() => void handleBackUpData()}
          />
          <DataRow
            icon="export-download-outline"
            label="Restore Data"
            busy={isPickingBackup}
            busyLabel="Opening file..."
            onPress={() => void handleRestoreData()}
          />
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
        options={CURRENCY_OPTIONS.map(formatCurrencyOption)}
        selectedValue={selectedCurrencyLabel}
        searchValue={currencySearch}
        onSearchValueChange={setCurrencySearch}
        onSelect={(value) => {
          updateField('currency', value.slice(0, 3));
          setCurrencySearch('');
          setShowCurrencyModal(false);
        }}
        onClose={() => {
          setCurrencySearch('');
          setShowCurrencyModal(false);
        }}
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

      <InfoModal
        visible={showCurrencyInfo}
        onClose={() => setShowCurrencyInfo(false)}
        title="Record currency"
        description="Changes apply to new records only. Existing records keep the currency they were created with."
      />

      <InfoModal
        visible={showBackupInfo}
        onClose={() => setShowBackupInfo(false)}
        title="Backup & Restore"
        description="Back up all your LivestockBook data to a file so it can be restored later or moved to another device. Restoring replaces the data currently stored in the app."
      />

      <Modal
        transparent
        animationType="fade"
        visible={pendingRestore !== null}
        onRequestClose={() => setPendingRestore(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setPendingRestore(null)}>
          <AnimatedPopupCard visible={pendingRestore !== null} style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>Restore backup?</Text>
            <Text style={styles.sheetBody}>
              Restoring this backup will replace the LivestockBook data currently stored on this device. This cannot be undone unless you have another backup.
            </Text>
            <View style={styles.sheetButtons}>
              <SheetButton
                label="Cancel"
                variant="secondary"
                onPress={() => setPendingRestore(null)}
                disabled={isRestoring}
              />
              <SheetButton
                label={isRestoring ? 'Restoring...' : 'Restore'}
                variant="danger"
                onPress={() => void handleConfirmRestore()}
                disabled={isRestoring}
              />
            </View>
          </AnimatedPopupCard>
        </Pressable>
      </Modal>

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
                  icon="search"
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

type DataRowProps = {
  icon: AppIconName;
  label: string;
  onPress: () => void;
  busy?: boolean;
  busyLabel?: string;
};

function DataRow({ icon, label, onPress, busy = false, busyLabel }: DataRowProps) {
  return (
    <BouncyPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.dataRow, pressed && !busy && styles.actionButtonPressed, busy && styles.dataRowBusy]}
    >
      <View style={styles.dataRowIconWrap}>
        {busy ? (
          <ActivityIndicator color={tokens.colors.accent} size="small" />
        ) : (
          <AppIcon name={icon} size={28} color={tokens.colors.accent} />
        )}
      </View>
      <Text style={styles.dataRowLabel}>{busy && busyLabel ? busyLabel : label}</Text>
      <AppIcon name="chevron-right" size={12} color={tokens.colors.textSoft} />
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
  dataRow: {
    minHeight: 54,
    borderRadius: tokens.radius.pill,
    backgroundColor: ACCOUNT_SURFACE_GREY,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
  },
  dataRowBusy: {
    opacity: 0.7,
  },
  dataRowIconWrap: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dataRowLabel: {
    flex: 1,
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
});
