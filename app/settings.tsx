import AsyncStorage from 'expo-sqlite/kv-store';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import type { ImageRequireSource } from 'react-native';
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
import { useCollectives } from '../src/context/CollectivesContext';
import { useRecords } from '../src/context/RecordsContext';
import { useSetup } from '../src/context/SetupContext';
import {
  buildBackup,
  collectBackupPhotos,
  createBackupArchive,
  createBackupFile,
  describeBackupValidationFailure,
  pickBackupFile,
  readBackupSource,
  restoreArchivePhotos,
  shareBackupArchive,
  shareBackupFile,
  totalPhotoBytes,
  validateBackupText,
  type BackupSource,
  type LivestockBookBackup,
} from '../src/services/backupService';
import { tokens } from '../src/theme/tokens';

const ACCOUNT_SURFACE_GREY = '#F1EFF3';

// Whether backups carry photos. Device-local rather than part of the account
// profile: it describes how this phone makes a backup file, not anything about
// the farm, and it is exactly the kind of choice that should not travel to a
// new device inside the backup it controls.
const INCLUDE_PHOTOS_KEY = 'livestockbook.backupIncludePhotos.v1';

// Above this, a backup is too big for email (25MB is the common ceiling) and
// awkward for messaging apps, so the size is put in front of the user before
// the file is made rather than after.
const LARGE_BACKUP_WARNING_BYTES = 25 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes <= 0) {
    return '0 MB';
  }

  const megabytes = bytes / (1024 * 1024);

  if (megabytes < 0.1) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`;
}

// Data & Backup rows carry the same mark size as the rows on the Account
// screen they are reached from — the two lists read as one set of options,
// not as two sizes of button.
const DATA_ROW_ICON = 20;
// The bundled artwork is drawn at 40% of its square canvas (measured off the
// files), so its box has to be that much wider for the mark inside it to
// stand the same height as a drawn icon beside it.
const DATA_ROW_IMAGE = Math.round(DATA_ROW_ICON / 0.45);

export default function SettingsScreen() {
  const router = useRouter();
  const { profile, isLoaded, updateField, resetAppData, restoreFromBackup } = useAccount();
  const { animals } = useAnimals();
  const { collectives } = useCollectives();
  const { records } = useRecords();
  const { farmEntities, locationEntities, labelEntities, medicineEntities } = useSetup();
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
  const [pendingArchive, setPendingArchive] = useState<BackupSource['archive'] | null>(null);
  const [includePhotos, setIncludePhotos] = useState(false);
  const backupInProgress = useRef(false);
  const restoreInProgress = useRef(false);
  const selectedCurrency = getCurrencyOption(profile.currency);
  const selectedCurrencyLabel = selectedCurrency
    ? formatCurrencyOption(selectedCurrency)
    : profile.currency;

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(INCLUDE_PHOTOS_KEY);

        if (active && stored === 'true') {
          setIncludePhotos(true);
        }
      } catch {
        // Leave it off — the smaller backup is the safer default.
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // Recomputed from the live data rather than cached: photos are added and
  // removed constantly, and a stale figure here would misstate the size of a
  // file the user is about to try to email.
  const backupPhotos = useMemo(
    () => collectBackupPhotos({
      animals,
      collectives,
      records,
      farmEntities,
      locationEntities,
      labelEntities,
      medicineEntities,
      profile,
    }),
    [animals, collectives, records, farmEntities, locationEntities, labelEntities, medicineEntities, profile],
  );
  const photoBytes = useMemo(() => totalPhotoBytes(backupPhotos), [backupPhotos]);

  function toggleIncludePhotos(next: boolean) {
    setIncludePhotos(next);
    void AsyncStorage.setItem(INCLUDE_PHOTOS_KEY, next ? 'true' : 'false');
  }

  async function handleBackUpData() {
    if (backupInProgress.current) {
      return;
    }

    backupInProgress.current = true;
    setIsBackingUp(true);

    try {
      const backup = buildBackup({
        animals,
        collectives,
        records,
        farmEntities,
        locationEntities,
        labelEntities,
        medicineEntities,
        profile,
      });
      // Success is only ever reported once this line has actually completed —
      // if writing the file throws, control jumps straight to the catch
      // block below and no confirmation is shown.
      const withPhotos = includePhotos && backupPhotos.length > 0;

      if (withPhotos && photoBytes > LARGE_BACKUP_WARNING_BYTES) {
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'This backup will be large',
            `${backupPhotos.length} photos add ${formatBytes(photoBytes)}. A file this size is usually too big to email — save it to Files or a cloud drive instead.`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continue', onPress: () => resolve(true) },
            ],
          );
        });

        if (!proceed) {
          return;
        }
      }

      const uri = withPhotos
        ? await createBackupArchive(backup, backupPhotos)
        : await createBackupFile(backup);

      if (withPhotos) {
        await shareBackupArchive(uri);
      } else {
        await shareBackupFile(uri);
      }
      // Drives the "back up your data" reminder on the Account screen — a
      // full backup counts just as much as a CSV/PDF export does (see
      // export.tsx's handleExport), since either one gets the user's data
      // off-device.
      updateField('lastExportedAt', new Date().toISOString());
      Alert.alert(
        'Backup created',
        includePhotos && backupPhotos.length > 0
          ? `Your backup includes ${backupPhotos.length} ${backupPhotos.length === 1 ? 'photo' : 'photos'} and is ready to save.`
          : 'Your LivestockBook backup file is ready to save.',
      );
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

      const source = await readBackupSource(picked.uri);
      const validation = validateBackupText(source.text);

      if (!validation.ok) {
        const { title, message } = describeBackupValidationFailure(validation.reason);
        Alert.alert(title, message);
        return;
      }

      setPendingArchive(source.archive ?? null);

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
      // Photos go back on disk *before* the records land. Restoring the data
      // re-normalizes every entity, and that normalization drops any photo
      // reference whose file is not on disk (see filterAccessibleImageUris) —
      // so writing the photos afterwards would leave the archive's pictures
      // sitting there with nothing pointing at them, which is the exact
      // failure this feature exists to prevent. If the data restore fails
      // after this point, the rollback leaves these files unreferenced, which
      // costs some disk and nothing else.
      let photoNote = '';

      if (pendingArchive && pendingArchive.photoEntries.length > 0) {
        try {
          const { restored, skipped } = restoreArchivePhotos(
            pendingArchive.uri,
            pendingArchive.photoEntries,
          );
          photoNote =
            skipped > 0
              ? ` ${restored} of ${restored + skipped} photos were restored.`
              : ` ${restored} ${restored === 1 ? 'photo was' : 'photos were'} restored.`;
        } catch {
          photoNote = ' The photos in this backup could not be restored.';
        }
      }

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
      setPendingArchive(null);
      Alert.alert('Restore complete', `Your LivestockBook data has been restored successfully.${photoNote}`);
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
            image={require('../assets/import.png')}
            label="Import Animals"
            onPress={() => router.push('/import-animals')}
          />
          <View style={styles.photoToggleRow}>
            <Text style={styles.photoToggleTitle}>Include photos in backup</Text>
            <Switch
              accessibilityLabel="Include photos in backup"
              accessibilityRole="switch"
              disabled={backupPhotos.length === 0}
              ios_backgroundColor="#E5E0E7"
              onValueChange={toggleIncludePhotos}
              style={styles.photoToggleSwitch}
              thumbColor="#fff"
              trackColor={{ false: '#E5E0E7', true: tokens.colors.accent }}
              value={includePhotos && backupPhotos.length > 0}
            />
          </View>
          <DataRow
            image={require('../assets/backup.png')}
            label="Back Up Data"
            busy={isBackingUp}
            busyLabel="Preparing backup..."
            onPress={() => void handleBackUpData()}
          />
          <DataRow
            image={require('../assets/restore.png')}
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
        animationType="none"
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

      <Modal transparent animationType="none" visible={showResetModal} onRequestClose={() => setShowResetModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowResetModal(false)}>
          <AnimatedPopupCard visible={showResetModal} style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>Reset app data</Text>
            <Text style={styles.sheetBody}>
              This will remove your animals, herds and flocks, records, setup items, and filters from this device. Your profile and preferences will stay in place.
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
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
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
  /** Either a drawn icon or bundled artwork, tinted the same accent either way. */
  icon?: AppIconName;
  image?: ImageRequireSource;
  label: string;
  onPress: () => void;
  busy?: boolean;
  busyLabel?: string;
};

function DataRow({ icon, image, label, onPress, busy = false, busyLabel }: DataRowProps) {
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
        ) : image ? (
          <Image resizeMode="contain" source={image} style={styles.dataRowImage} />
        ) : icon ? (
          <AppIcon name={icon} size={DATA_ROW_ICON} color={tokens.colors.accent} />
        ) : null}
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
  photoToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  photoToggleTitle: {
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  photoToggleSwitch: {
    alignSelf: 'center',
  },
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
    backgroundColor: tokens.colors.accent,
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
    color: '#fff',
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
    width: DATA_ROW_IMAGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dataRowImage: {
    width: DATA_ROW_IMAGE,
    height: DATA_ROW_IMAGE,
    tintColor: tokens.colors.accent,
  },
  dataRowLabel: {
    flex: 1,
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
});
