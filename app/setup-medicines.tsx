import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { AnimatedPopupCard } from '../src/components/AnimatedPopupCard';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { DesignField } from '../src/components/DesignField';
import { InfoModal } from '../src/components/InfoModal';
import { useAccount } from '../src/context/AccountContext';
import { type TreatmentKind, useSetup } from '../src/context/SetupContext';
import { tokens } from '../src/theme/tokens';
import { formatDateForDisplay, formatDateForStorage, parseStoredDate } from '../src/utils/dateFormat';

const DOSE_UNITS = ['ml', 'mg', 'g', 'tablet(s)', 'bolus', 'sachet', 'dose'] as const;
const ROUTE_OPTIONS = ['Injection', 'Oral', 'Pour-on', 'Drench', 'Topical', 'Feed', 'Water', 'Other'] as const;

type PickerKey = 'doseUnit' | 'route' | null;
const TREATMENT_TYPES: Array<{ label: string; value: TreatmentKind }> = [
  { label: 'Medicine', value: 'medicine' },
  { label: 'Vaccine', value: 'vaccine' },
];

export default function SetupMedicinesScreen() {
  const router = useRouter();
  const { profile } = useAccount();
  const { medicineEntities, addMedicine, removeMedicine } = useSetup();
  const [treatmentType, setTreatmentType] = useState<TreatmentKind>('medicine');
  const [name, setName] = useState('');
  const [activeIngredient, setActiveIngredient] = useState('');
  const [defaultDose, setDefaultDose] = useState('');
  const [doseUnit, setDoseUnit] = useState<(typeof DOSE_UNITS)[number]>('ml');
  const [defaultRoute, setDefaultRoute] = useState<(typeof ROUTE_OPTIONS)[number]>('Injection');
  const [meatWithdrawalPeriod, setMeatWithdrawalPeriod] = useState('');
  const [milkWithdrawalPeriod, setMilkWithdrawalPeriod] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [supplier, setSupplier] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [notes, setNotes] = useState('');
  const [activePicker, setActivePicker] = useState<PickerKey>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<'expiry' | 'purchase'>('expiry');
  const [showHelp, setShowHelp] = useState(false);
  const [treatmentPendingDelete, setTreatmentPendingDelete] = useState<string | null>(null);

  const groupedTreatments = useMemo(() => ({
    medicines: medicineEntities.filter((entry) => entry.treatmentType === 'medicine'),
    vaccines: medicineEntities.filter((entry) => entry.treatmentType === 'vaccine'),
  }), [medicineEntities]);

  const handleAddMedicine = () => {
    addMedicine({
      treatmentType,
      name,
      activeIngredient,
      defaultDose,
      doseUnit,
      defaultRoute,
      meatWithdrawalPeriod,
      milkWithdrawalPeriod,
      manufacturer,
      batchNumber,
      expiryDate,
      supplier,
      purchaseDate,
      notes,
    });

    if (!name.trim()) {
      return;
    }

    setTreatmentType('medicine');
    setName('');
    setActiveIngredient('');
    setDefaultDose('');
    setDoseUnit('ml');
    setDefaultRoute('Injection');
    setMeatWithdrawalPeriod('');
    setMilkWithdrawalPeriod('');
    setManufacturer('');
    setBatchNumber('');
    setExpiryDate('');
    setSupplier('');
    setPurchaseDate('');
    setNotes('');
  };

  const setPickedDate = datePickerTarget === 'purchase' ? setPurchaseDate : setExpiryDate;
  const pickedDateValue = datePickerTarget === 'purchase' ? purchaseDate : expiryDate;

  const handleDateChange = (event: DateTimePickerEvent, value?: Date) => {
    if (Platform.OS === 'android') {
      if (event.type === 'dismissed') {
        setShowDatePicker(false);
        return;
      }
      if (value) {
        setPickedDate(formatDateForStorage(value));
      }
      setShowDatePicker(false);
      return;
    }

    if (value) {
      setPickedDate(formatDateForStorage(value));
    }

    setShowDatePicker(false);
  };

  const confirmDeleteTreatment = () => {
    if (!treatmentPendingDelete) {
      return;
    }

    removeMedicine(treatmentPendingDelete);
    setTreatmentPendingDelete(null);
  };

  const pickerOptions = activePicker === 'doseUnit' ? [...DOSE_UNITS] : activePicker === 'route' ? [...ROUTE_OPTIONS] : [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="Medicines & Vaccines"
        leftAction={{ icon: 'back', accessibilityLabel: 'Back', onPress: () => router.back() }}
        actions={[
          {
            icon: 'help-circle',
            accessibilityLabel: 'About medicines and vaccines',
            onPress: () => setShowHelp(true),
          },
        ]}
      />
      <ScrollView contentContainerStyle={[styles.content, medicineEntities.length === 0 && styles.emptyContent]} showsVerticalScrollIndicator={false}>
        <View style={styles.editorCard}>
          <View style={styles.block}>
            <Text style={styles.label}>Type</Text>
            <View style={styles.typeRow}>
              {TREATMENT_TYPES.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  onPress={() => setTreatmentType(option.value)}
                  style={({ pressed }) => [styles.typeChip, treatmentType === option.value && styles.typeChipActive, pressed && styles.pressed]}
                >
                  <Text style={[styles.typeChipText, treatmentType === option.value && styles.typeChipTextActive]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <DesignField value={name} label={treatmentType === 'medicine' ? "Medicine name *" : "Vaccine name *"} onChangeText={setName} />
          <DesignField value={activeIngredient} label="Active ingredient" onChangeText={setActiveIngredient} />
          <View style={styles.inlineRow}>
            <View style={styles.inlineGrow}>
              <DesignField value={defaultDose} label="Default dose" onChangeText={setDefaultDose} keyboardType="decimal-pad" />
            </View>
            <View style={styles.inlineUnit}>
              <SelectionField label="Dose unit" value={doseUnit} emptyLabel="Select unit" onPress={() => setActivePicker('doseUnit')} />
            </View>
          </View>
          <SelectionField label="Default route" value={defaultRoute} emptyLabel="Select route" onPress={() => setActivePicker('route')} />
          <DesignField value={meatWithdrawalPeriod} label="Meat withdrawal period" onChangeText={setMeatWithdrawalPeriod} />
          <DesignField value={milkWithdrawalPeriod} label="Milk withdrawal period" onChangeText={setMilkWithdrawalPeriod} />
          <DesignField value={manufacturer} label="Manufacturer" onChangeText={setManufacturer} />
          <DesignField value={batchNumber} label="Batch / Lot number" onChangeText={setBatchNumber} />
          <SelectionField
            label="Expiry date"
            value={formatDateForDisplay(expiryDate, profile.dateFormat)}
            emptyLabel="Select expiry date"
            onPress={() => {
              setDatePickerTarget('expiry');
              setShowDatePicker(true);
            }}
          />
          <DesignField value={supplier} label="Supplier" onChangeText={setSupplier} />
          <SelectionField
            label="Purchase date"
            value={formatDateForDisplay(purchaseDate, profile.dateFormat)}
            emptyLabel="Select purchase date"
            onPress={() => {
              setDatePickerTarget('purchase');
              setShowDatePicker(true);
            }}
          />
          <DesignField value={notes} label="Notes" large onChangeText={setNotes} />

          <BouncyPressable accessibilityRole="button" accessibilityLabel="Add treatment" onPress={handleAddMedicine} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
            <AppIcon name="plus" size={16} color="#fff" />
            <Text style={styles.addButtonText}>{treatmentType === 'medicine' ? 'Add Medicine' : 'Add Vaccine'}</Text>
          </BouncyPressable>
        </View>

        {medicineEntities.length === 0 ? (
          <View style={styles.emptyState}>
            <AppIcon name="medicine" size={90} color="#E5E0E7" opacity={1} />
            <Text style={styles.emptyTitle}>Empty</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {[
              ...groupedTreatments.medicines,
              ...groupedTreatments.vaccines,
            ].map((medicine) => (
              <View key={`${medicine.treatmentType}-${medicine.name}`} style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <View style={styles.itemTitleRow}>
                    <View style={styles.itemIconBadge}>
                      <AppIcon name="medicine" size={22} color="#171717" />
                    </View>
                    <View style={styles.itemHeadingCopy}>
                      <Text style={styles.itemTitle}>{medicine.name}</Text>
                      <Text style={styles.itemSubtitle}>{medicine.treatmentType === 'medicine' ? 'Medicine' : 'Vaccine'}{medicine.activeIngredient ? ` · ${medicine.activeIngredient}` : ''}</Text>
                    </View>
                  </View>
                  <BouncyPressable accessibilityRole="button" accessibilityLabel={`Delete ${medicine.name}`} onPress={() => setTreatmentPendingDelete(medicine.name)} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
                    <AppIcon name="trash" size={28} color="#fff" />
                  </BouncyPressable>
                </View>
                <View style={styles.metaRow}>
                  {medicine.defaultDose ? <Text style={styles.metaPill}>{`${medicine.defaultDose} ${medicine.doseUnit}`}</Text> : null}
                  {medicine.defaultRoute ? <Text style={styles.metaPill}>{medicine.defaultRoute}</Text> : null}
                  {medicine.expiryDate ? <Text style={styles.metaPill}>{formatDateForDisplay(medicine.expiryDate, profile.dateFormat)}</Text> : null}
                </View>
                {medicine.manufacturer ? <Text style={styles.detailText}>{medicine.manufacturer}</Text> : null}
                {medicine.supplier ? <Text style={styles.detailText}>Supplier: {medicine.supplier}</Text> : null}
                {medicine.notes ? <Text style={styles.itemNotes}>{medicine.notes}</Text> : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        transparent
        animationType="fade"
        visible={treatmentPendingDelete !== null}
        onRequestClose={() => setTreatmentPendingDelete(null)}
      >
        <Pressable style={styles.centeredModalBackdrop} onPress={() => setTreatmentPendingDelete(null)}>
          <Pressable style={styles.deleteConfirmCard} onPress={() => undefined}>
            <Text style={styles.deleteConfirmTitle}>Delete treatment?</Text>
            <Text style={styles.deleteConfirmText}>
              {treatmentPendingDelete ? `Are you sure you want to delete ${treatmentPendingDelete}?` : ''}
            </Text>
            <View style={styles.deleteConfirmActions}>
              <BouncyPressable accessibilityRole="button" containerStyle={{ flex: 1 }} onPress={() => setTreatmentPendingDelete(null)} style={({ pressed }) => [styles.deleteCancelButton, pressed && styles.pressed]}>
                <Text style={styles.deleteCancelButtonText}>Cancel</Text>
              </BouncyPressable>
              <BouncyPressable accessibilityRole="button" containerStyle={{ flex: 1 }} onPress={confirmDeleteTreatment} style={({ pressed }) => [styles.deleteConfirmButton, pressed && styles.pressed]}>
                <Text style={styles.deleteConfirmButtonText}>Delete</Text>
              </BouncyPressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent animationType="fade" visible={activePicker !== null} onRequestClose={() => setActivePicker(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setActivePicker(null)}>
          <AnimatedPopupCard visible={activePicker !== null} style={styles.selectionCard} onPress={() => {}}>
            <Text style={styles.selectionTitle}>{activePicker === 'doseUnit' ? 'Select quantity' : 'Select route'}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalList}>
                {pickerOptions.map((option) => {
                  const isSelected = activePicker === 'doseUnit' ? doseUnit === option : defaultRoute === option;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => {
                        if (activePicker === 'doseUnit') setDoseUnit(option as (typeof DOSE_UNITS)[number]);
                        if (activePicker === 'route') setDefaultRoute(option as (typeof ROUTE_OPTIONS)[number]);
                        setActivePicker(null);
                      }}
                      style={({ pressed }) => [styles.selectionRow, isSelected && styles.selectionRowActive, pressed && styles.pressed]}
                    >
                      <Text style={[styles.selectionText, isSelected && styles.selectionTextActive]}>{option}</Text>
                      {isSelected ? <AppIcon name="check" size={16} color={tokens.colors.accent} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </AnimatedPopupCard>
        </Pressable>
      </Modal>

      {showDatePicker && Platform.OS === 'android' ? (
        <DateTimePicker
          value={pickedDateValue ? parseStoredDate(pickedDateValue) ?? new Date() : new Date()}
          mode="date"
          display="default"
          onChange={handleDateChange}
        />
      ) : null}

      <Modal transparent animationType="fade" visible={showDatePicker && Platform.OS === 'ios'} onRequestClose={() => setShowDatePicker(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowDatePicker(false)}>
          <AnimatedPopupCard visible={showDatePicker && Platform.OS === 'ios'} style={styles.modalCard} onPress={() => undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.selectionTitle}>{datePickerTarget === 'purchase' ? 'Select purchase date' : 'Select expiry date'}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Done" onPress={() => setShowDatePicker(false)}>
                <Text style={styles.modalDone}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={pickedDateValue ? parseStoredDate(pickedDateValue) ?? new Date() : new Date()}
              mode="date"
              display="spinner"
              onChange={handleDateChange}
            />
          </AnimatedPopupCard>
        </Pressable>
      </Modal>
      <InfoModal
        visible={showHelp}
        onClose={() => setShowHelp(false)}
        title="Medicines & Vaccines"
        description="Keep a record of every medicine and vaccine you use, including dose, route and withdrawal periods, so you can quickly reuse the details when logging treatment records and stay on top of meat and milk withdrawal times."
      />
    </SafeAreaView>
  );
}

function SelectionField({
  label,
  value,
  emptyLabel,
  onPress,
}: {
  label: string;
  value: string;
  emptyLabel: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.dateField}>
        <Text style={[styles.dateValue, !value && styles.placeholderValue]}>{value || emptyLabel}</Text>
        <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120, gap: 16 },
  typeRow: { flexDirection: 'row', gap: 10 },
  typeChip: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: '#FFFFFF' },
  typeChipActive: { backgroundColor: '#FCE5E4' },
  typeChipText: { color: tokens.colors.text, fontSize: 14, fontWeight: '500' },
  typeChipTextActive: { color: '#74423F' },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
  editorCard: { borderRadius: 24, backgroundColor: '#F5F3F7', padding: 16, gap: 14 },
  block: { gap: 8 },
  label: { color: tokens.colors.text, fontSize: 14, fontWeight: '500' },
  dateField: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateValue: { color: '#2b2b2b', fontSize: 13, fontWeight: '500', flex: 1, paddingRight: 10 },
  placeholderValue: { color: '#7a7a7a' },
  inlineRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-end' },
  inlineGrow: { flex: 1 },
  inlineUnit: { width: 140 },
  addButton: {
    marginTop: 4,
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: tokens.colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  list: { gap: 10 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingTop: 72 },
  emptyTitle: { marginTop: 18, color: '#E5E0E7', fontSize: 29, fontWeight: '700' },
  itemCard: {
    borderRadius: 22,
    backgroundColor: '#fff',
    paddingHorizontal: 15,
    paddingVertical: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, flex: 1 },
  itemIconBadge: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#FCE5E4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemHeadingCopy: { flex: 1, gap: 2, minWidth: 0 },
  itemTitle: { color: tokens.colors.text, fontSize: 16, fontWeight: '700' },
  itemSubtitle: { color: tokens.colors.textSoft, fontSize: 12, fontWeight: '600' },
  deleteButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.accent,
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaPill: {
    borderRadius: 999,
    backgroundColor: '#F8F6F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    color: '#74423F',
    fontSize: 12,
    fontWeight: '700',
  },
  detailText: { color: tokens.colors.text, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  itemNotes: { color: tokens.colors.textSoft, fontSize: 12, fontWeight: '500', lineHeight: 17 },
  centeredModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.46)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  deleteConfirmCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 26,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  deleteConfirmTitle: {
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  deleteConfirmText: {
    marginTop: 8,
    color: tokens.colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    textAlign: 'center',
  },
  deleteConfirmActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  deleteCancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: '#E5E0E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteCancelButtonText: {
    color: '#544F49',
    fontSize: 15,
    fontWeight: '700',
  },
  deleteConfirmButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteConfirmButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.28)', justifyContent: 'flex-end' },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 26,
    maxHeight: '80%',
  },
  selectionCard: {
    marginHorizontal: 18,
    marginBottom: 28,
    borderRadius: 26,
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 8,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  modalDone: { color: tokens.colors.accent, fontSize: 15, fontWeight: '700' },
  selectionTitle: { color: tokens.colors.text, fontSize: 18, fontWeight: '700', marginBottom: 4 },
  modalList: { gap: 8 },
  selectionRow: {
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: '#F5F3F7',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectionRowActive: { backgroundColor: '#FCE5E4' },
  selectionText: { color: tokens.colors.text, fontSize: 14, fontWeight: '500' },
  selectionTextActive: { color: '#74423F' },
  pressed: { opacity: 0.92 },
});
