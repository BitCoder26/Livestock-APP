import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { DesignField } from '../src/components/DesignField';
import { useSetup } from '../src/context/SetupContext';
import { tokens } from '../src/theme/tokens';

const AREA_UNITS = ['hectares', 'acres'] as const;

type PickerKey = 'farm' | 'areaUnit' | null;

export default function SetupPaddocksScreen() {
  const router = useRouter();
  const { farms, paddockEntities, addPaddock, removePaddock } = useSetup();
  const [name, setName] = useState('');
  const [farm, setFarm] = useState('');
  const [area, setArea] = useState('');
  const [areaUnit, setAreaUnit] = useState<(typeof AREA_UNITS)[number]>('hectares');
  const [notes, setNotes] = useState('');
  const [activePicker, setActivePicker] = useState<PickerKey>(null);
  const [paddockPendingDelete, setPaddockPendingDelete] = useState<string | null>(null);

  const handleAddPaddock = () => {
    addPaddock({
      name,
      farm,
      area,
      areaUnit,
      notes,
    });

    if (!name.trim()) {
      return;
    }

    setName('');
    setFarm('');
    setArea('');
    setAreaUnit('hectares');
    setNotes('');
  };

  const confirmDeletePaddock = () => {
    if (!paddockPendingDelete) {
      return;
    }

    removePaddock(paddockPendingDelete);
    setPaddockPendingDelete(null);
  };

  const pickerOptions =
    activePicker === 'farm'
      ? farms
      : activePicker === 'areaUnit'
        ? [...AREA_UNITS]
        : [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="Paddocks"
        leftAction={{ icon: 'back', accessibilityLabel: 'Back', onPress: () => router.back() }}
      />
      <ScrollView contentContainerStyle={[styles.content, paddockEntities.length === 0 && styles.emptyContent]} showsVerticalScrollIndicator={false}>
        <View style={styles.editorCard}>
          <Text style={styles.sectionLabel}>Paddocks</Text>

          <DesignField value={name} label="Paddock name *" onChangeText={setName} />
          <SelectionField
            label="Farm *"
            value={farm}
            emptyLabel={farms.length === 0 ? 'No farms available' : 'Select farm'}
            onPress={() => setActivePicker('farm')}
          />
          <View style={styles.inlineRow}>
            <View style={styles.inlineGrow}>
              <DesignField value={area} label="Area" onChangeText={setArea} keyboardType="decimal-pad" />
            </View>
            <View style={styles.inlineUnit}>
              <SelectionField label="Area unit" value={areaUnit} emptyLabel="Select unit" onPress={() => setActivePicker('areaUnit')} />
            </View>
          </View>
          <DesignField value={notes} label="Notes" large onChangeText={setNotes} />

          <Pressable accessibilityRole="button" accessibilityLabel="Add paddock" onPress={handleAddPaddock} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
            <AppIcon name="plus" size={16} color="#fff" />
            <Text style={styles.addButtonText}>Add Paddock</Text>
          </Pressable>
        </View>

        {paddockEntities.length === 0 ? (
          <View style={styles.emptyState}>
            <AppIcon name="sprout" size={90} color="#E5E0E7" opacity={1} />
            <Text style={styles.emptyTitle}>Empty</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {paddockEntities.map((paddock) => (
              <View key={paddock.name} style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <View style={styles.itemTitleRow}>
                    <View style={styles.itemIconBadge}>
                      <AppIcon name="sprout" size={22} color="#171717" />
                    </View>
                    <View style={styles.itemHeadingCopy}>
                      <Text style={styles.itemTitle}>{paddock.name}</Text>
                      <Text style={styles.itemSubtitle}>{paddock.farm || 'No farm selected'}</Text>
                    </View>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${paddock.name}`} onPress={() => setPaddockPendingDelete(paddock.name)} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
                    <AppIcon name="trash" size={17} color="#fff" />
                  </Pressable>
                </View>
                <View style={styles.metaRow}>
                  {paddock.area ? <Text style={styles.metaPill}>{`${paddock.area} ${paddock.areaUnit}`}</Text> : null}
                </View>
                {paddock.notes ? <Text style={styles.itemNotes}>{paddock.notes}</Text> : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        transparent
        animationType="fade"
        visible={paddockPendingDelete !== null}
        onRequestClose={() => setPaddockPendingDelete(null)}
      >
        <Pressable style={styles.centeredModalBackdrop} onPress={() => setPaddockPendingDelete(null)}>
          <Pressable style={styles.deleteConfirmCard} onPress={() => undefined}>
            <Text style={styles.deleteConfirmTitle}>Delete paddock?</Text>
            <Text style={styles.deleteConfirmText}>
              {paddockPendingDelete ? `Are you sure you want to delete ${paddockPendingDelete}?` : ''}
            </Text>
            <View style={styles.deleteConfirmActions}>
              <Pressable accessibilityRole="button" onPress={() => setPaddockPendingDelete(null)} style={({ pressed }) => [styles.deleteCancelButton, pressed && styles.pressed]}>
                <Text style={styles.deleteCancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={confirmDeletePaddock} style={({ pressed }) => [styles.deleteConfirmButton, pressed && styles.pressed]}>
                <Text style={styles.deleteConfirmButtonText}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent animationType="fade" visible={activePicker !== null} onRequestClose={() => setActivePicker(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setActivePicker(null)}>
          <Pressable style={styles.selectionCard} onPress={() => {}}>
            <Text style={styles.selectionTitle}>
              {activePicker === 'farm' ? 'Select farm' : 'Select area unit'}
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalList}>
                {pickerOptions.map((option) => {
                  const isSelected =
                    activePicker === 'farm' ? farm === option : areaUnit === option;
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="button"
                      onPress={() => {
                        if (activePicker === 'farm') setFarm(option);
                        if (activePicker === 'areaUnit') setAreaUnit(option as (typeof AREA_UNITS)[number]);
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
          </Pressable>
        </Pressable>
      </Modal>
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
  content: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 120, gap: 16 },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
  editorCard: { borderRadius: 24, backgroundColor: '#F5F3F7', padding: 16, gap: 14 },
  sectionLabel: { color: tokens.colors.text, fontSize: 16, fontWeight: '700' },
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
  selectionCard: {
    marginHorizontal: 18,
    marginBottom: 28,
    borderRadius: 26,
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 8,
  },
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
  selectionTextActive: { color: '#74423F', fontWeight: '700' },
  pressed: { opacity: 0.92 },
});
