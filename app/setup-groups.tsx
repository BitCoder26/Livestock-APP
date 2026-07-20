import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { AnimatedPopupCard } from '../src/components/AnimatedPopupCard';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { DesignField } from '../src/components/DesignField';
import { InfoModal } from '../src/components/InfoModal';
import { SPECIES_OPTIONS } from '../src/constants/records';
import { getSpeciesThemeByLabel } from '../src/constants/speciesTheme';
import { useSetup } from '../src/context/SetupContext';
import { tokens } from '../src/theme/tokens';

type PickerKey = 'farm' | 'paddocks' | 'species' | null;

export default function SetupGroupsScreen() {
  const router = useRouter();
  const { farms, paddockEntities, groupEntities, addGroup, removeGroup } = useSetup();
  const [name, setName] = useState('');
  const [farm, setFarm] = useState('');
  const [selectedPaddocks, setSelectedPaddocks] = useState<string[]>([]);
  const [species, setSpecies] = useState('');
  const [notes, setNotes] = useState('');
  const [activePicker, setActivePicker] = useState<PickerKey>(null);
  const [displayPicker, setDisplayPicker] = useState<Exclude<PickerKey, null>>('species');
  const [groupPendingDelete, setGroupPendingDelete] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (activePicker) {
      setDisplayPicker(activePicker);
    }
  }, [activePicker]);

  const paddockOptions = useMemo(
    () => paddockEntities.filter((paddock) => !farm || paddock.farm === farm).map((paddock) => paddock.name),
    [farm, paddockEntities],
  );

  const handleAddGroup = () => {
    addGroup({
      name,
      farm,
      paddocks: selectedPaddocks,
      species,
      animals: '',
      notes,
    });

    if (!name.trim()) {
      return;
    }

    setName('');
    setFarm('');
    setSelectedPaddocks([]);
    setSpecies('');
    setNotes('');
  };

  const confirmDeleteGroup = () => {
    if (!groupPendingDelete) {
      return;
    }

    removeGroup(groupPendingDelete);
    setGroupPendingDelete(null);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="Groups"
        leftAction={{ icon: 'back', accessibilityLabel: 'Back', onPress: () => router.back() }}
        actions={[
          {
            icon: 'help-circle',
            accessibilityLabel: 'About groups',
            onPress: () => setShowHelp(true),
          },
        ]}
      />
      <ScrollView contentContainerStyle={[styles.content, groupEntities.length === 0 && styles.emptyContent]} showsVerticalScrollIndicator={false}>
        <View style={styles.editorCard}>
          <Text style={styles.sectionLabel}>Animal groups</Text>

          <DesignField value={name} label="Group name *" onChangeText={setName} />
          <SelectionField
            label="Farm"
            value={farm}
            emptyLabel={farms.length === 0 ? 'No farms available' : 'Select farm'}
            onPress={() => {
              if (farms.length === 0) {
                router.push('/setup-farms');
                return;
              }

              setActivePicker('farm');
            }}
          />
          <Pressable accessibilityLabel="Add farm" accessibilityRole="button" hitSlop={10} onPress={() => router.push('/setup-farms')}>
            <Text style={styles.helperLink}>+ Add Farm</Text>
          </Pressable>
          <SelectionField
            label="Paddock(s)"
            value={formatSelectionSummary(selectedPaddocks, paddockOptions.length === 0 ? 'No paddocks available' : 'Select paddocks')}
            emptyLabel=""
            onPress={() => {
              if (paddockOptions.length === 0) {
                router.push('/setup-paddocks');
                return;
              }

              setActivePicker('paddocks');
            }}
            isPlaceholder={selectedPaddocks.length === 0}
          />
          <Pressable accessibilityLabel="Add paddock" accessibilityRole="button" hitSlop={10} onPress={() => router.push('/setup-paddocks')}>
            <Text style={styles.helperLink}>+ Add Paddock</Text>
          </Pressable>
          <SelectionField label="Species" value={species} emptyLabel="Select species" onPress={() => setActivePicker('species')} />
          <DesignField value={notes} label="Notes" large onChangeText={setNotes} />

          <BouncyPressable accessibilityRole="button" accessibilityLabel="Add group" onPress={handleAddGroup} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
            <AppIcon name="plus" size={16} color="#fff" />
            <Text style={styles.addButtonText}>Add Group</Text>
          </BouncyPressable>
        </View>

        {groupEntities.length === 0 ? (
          <View style={styles.emptyState}>
            <AppIcon name="tag" size={90} color="#E5E0E7" opacity={1} />
            <Text style={styles.emptyTitle}>Empty</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {groupEntities.map((group) => (
              <View key={group.name} style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <View style={styles.itemTitleRow}>
                    <View style={styles.itemIconBadge}>
                      <AppIcon name="tag" size={22} color="#171717" />
                    </View>
                    <View style={styles.itemHeadingCopy}>
                      <Text style={styles.itemTitle}>{group.name}</Text>
                      <Text style={styles.itemSubtitle}>{group.farm || 'No farm selected'}</Text>
                    </View>
                  </View>
                  <BouncyPressable accessibilityRole="button" accessibilityLabel={`Delete ${group.name}`} onPress={() => setGroupPendingDelete(group.name)} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
                    <AppIcon name="trash" size={28} color="#fff" />
                  </BouncyPressable>
                </View>
                <View style={styles.metaRow}>
                  {group.species ? <Text style={styles.metaPill}>{group.species}</Text> : null}
                  {group.paddocks.map((paddock) => (
                    <Text key={paddock} style={styles.metaPill}>{paddock}</Text>
                  ))}
                </View>
                {group.notes ? <Text style={styles.itemNotes}>{group.notes}</Text> : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        transparent
        animationType="fade"
        visible={groupPendingDelete !== null}
        onRequestClose={() => setGroupPendingDelete(null)}
      >
        <Pressable style={styles.centeredModalBackdrop} onPress={() => setGroupPendingDelete(null)}>
          <Pressable style={styles.deleteConfirmCard} onPress={() => undefined}>
            <Text style={styles.deleteConfirmTitle}>Delete group?</Text>
            <Text style={styles.deleteConfirmText}>
              {groupPendingDelete ? `Are you sure you want to delete ${groupPendingDelete}?` : ''}
            </Text>
            <View style={styles.deleteConfirmActions}>
              <BouncyPressable accessibilityRole="button" containerStyle={{ flex: 1 }} onPress={() => setGroupPendingDelete(null)} style={({ pressed }) => [styles.deleteCancelButton, pressed && styles.pressed]}>
                <Text style={styles.deleteCancelButtonText}>Cancel</Text>
              </BouncyPressable>
              <BouncyPressable accessibilityRole="button" containerStyle={{ flex: 1 }} onPress={confirmDeleteGroup} style={({ pressed }) => [styles.deleteConfirmButton, pressed && styles.pressed]}>
                <Text style={styles.deleteConfirmButtonText}>Delete</Text>
              </BouncyPressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent animationType="fade" visible={activePicker !== null} onRequestClose={() => setActivePicker(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setActivePicker(null)}>
          <AnimatedPopupCard visible={activePicker !== null} style={displayPicker === 'species' ? styles.modalCard : styles.selectionCard} onPress={() => {}}>
            {displayPicker === 'species' ? (
              <>
                <View style={styles.speciesModalHeader}>
                  <Text style={styles.speciesModalTitle}>Select Species</Text>
                  <Pressable
                    accessibilityLabel="Close species selector"
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => setActivePicker(null)}
                    style={styles.speciesModalClose}
                  >
                    <AppIcon name="close" size={16} color={tokens.colors.text} />
                  </Pressable>
                </View>
                <ScrollView contentContainerStyle={styles.speciesModalGrid} showsVerticalScrollIndicator={false}>
                  {SPECIES_OPTIONS.map((item) => {
                    const theme = getSpeciesThemeByLabel(item.label);

                    return (
                      <Pressable
                        key={item.label}
                        accessibilityRole="button"
                        onPress={() => {
                          setSpecies(item.label);
                          setActivePicker(null);
                        }}
                        style={({ pressed }) => [
                          styles.speciesModalCard,
                          { backgroundColor: theme.tintBackground },
                          pressed && styles.speciesModalCardPressed,
                        ]}
                      >
                        <AppIcon name={item.icon} size={26} color={theme.icon} />
                        <Text style={[styles.speciesModalCardLabel, { color: theme.text }]}>{item.label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            ) : (
              <>
                <Text style={styles.selectionTitle}>
                  {displayPicker === 'farm' ? 'Select farm' : 'Select paddocks'}
                </Text>
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={styles.modalList}>
                    {displayPicker === 'farm'
                      ? farms.map((option) => {
                          const isSelected = farm === option;
                          return (
                            <Pressable key={option} onPress={() => { setFarm(option); setSelectedPaddocks([]); setActivePicker(null); }} style={({ pressed }) => [styles.selectionRow, isSelected && styles.selectionRowActive, pressed && styles.pressed]}>
                              <Text style={[styles.selectionText, isSelected && styles.selectionTextActive]}>{option}</Text>
                              {isSelected ? <AppIcon name="check" size={16} color={tokens.colors.accent} /> : null}
                            </Pressable>
                          );
                        })
                      : paddockOptions.map((option) => {
                          const isSelected = selectedPaddocks.includes(option);
                          return (
                            <Pressable
                              key={option}
                              onPress={() =>
                                setSelectedPaddocks((current) =>
                                  current.includes(option) ? current.filter((item) => item !== option) : [...current, option],
                                )
                              }
                              style={({ pressed }) => [styles.selectionRow, isSelected && styles.selectionRowActive, pressed && styles.pressed]}
                            >
                              <Text style={[styles.selectionText, isSelected && styles.selectionTextActive]}>{option}</Text>
                              {isSelected ? <AppIcon name="check" size={16} color={tokens.colors.accent} /> : null}
                            </Pressable>
                          );
                        })}
                  </View>
                </ScrollView>
              </>
            )}
            {displayPicker === 'paddocks' ? (
              <BouncyPressable accessibilityRole="button" onPress={() => setActivePicker(null)} style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}>
                <Text style={styles.doneButtonText}>Done</Text>
              </BouncyPressable>
            ) : null}
          </AnimatedPopupCard>
        </Pressable>
      </Modal>
      <InfoModal
        visible={showHelp}
        onClose={() => setShowHelp(false)}
        title="Groups"
        description="Groups let you organise animals into mobs or management groups, tied to a farm, paddocks and species, so you can move, treat and record them together instead of one at a time."
      />
    </SafeAreaView>
  );
}

function SelectionField({
  label,
  value,
  emptyLabel,
  onPress,
  isPlaceholder = false,
}: {
  label: string;
  value: string;
  emptyLabel: string;
  onPress: () => void;
  isPlaceholder?: boolean;
}) {
  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.dateField}>
        <Text style={[styles.dateValue, isPlaceholder && styles.placeholderValue]}>{value || emptyLabel}</Text>
        <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
      </Pressable>
    </View>
  );
}

function formatSelectionSummary(values: string[], emptyLabel: string) {
  if (values.length === 0) return emptyLabel;
  if (values.length <= 2) return values.join(', ');
  return `${values.slice(0, 2).join(', ')} +${values.length - 2}`;
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
  helperLink: { color: tokens.colors.accent, fontSize: 13, fontWeight: '600' },
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
  detailSubtext: { color: tokens.colors.textSoft, fontSize: 12, fontWeight: '500' },
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
  },
  selectionCard: {
    marginHorizontal: 18,
    marginBottom: 28,
    borderRadius: 26,
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 8,
    maxHeight: '70%',
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
  selectionTextActive: { color: '#74423F' },
  speciesModalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 18,
    paddingBottom: 12,
  },
  speciesModalHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  speciesModalTitle: {
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  speciesModalClose: {
    position: 'absolute',
    right: 0,
    top: 0,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  speciesModalCard: {
    width: '48%',
    minHeight: 74,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    paddingLeft: 24,
    paddingRight: 14,
  },
  speciesModalCardLabel: {
    color: '#171717',
    fontSize: 15,
    fontWeight: '500',
  },
  speciesModalCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  doneButton: {
    marginTop: 16,
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.92 },
});
