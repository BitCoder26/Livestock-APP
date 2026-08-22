import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../src/theme/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';

import { AppIcon } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { DesignField } from '../src/components/DesignField';
import { InfoModal } from '../src/components/InfoModal';
import { useAnimals } from '../src/context/AnimalsContext';
import { type LabelEntity, useSetup } from '../src/context/SetupContext';
import type { Animal } from '../src/entities/animal';
import { tokens } from '../src/theme/tokens';

export default function SetupLabelsScreen() {
  const router = useRouter();
  const { animals } = useAnimals();
  const { labelEntities, addLabel, updateLabel, removeLabel } = useSetup();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [labelPendingDelete, setLabelPendingDelete] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [editingLabelUid, setEditingLabelUid] = useState<string | null>(null);
  const isEditingLabel = editingLabelUid !== null;

  const resetLabelForm = () => {
    setEditingLabelUid(null);
    setName('');
    setNotes('');
  };

  const handleStartEditLabel = (label: LabelEntity) => {
    setEditingLabelUid(label.uid ?? null);
    setName(label.name);
    setNotes(label.notes);
  };

  const handleSaveLabel = async () => {
    if (!name.trim()) {
      Alert.alert('Label name required', 'Enter a name for the label.');
      return;
    }

    const result = editingLabelUid
      ? await updateLabel(editingLabelUid, { name, animals: '', notes })
      : await addLabel({ name, animals: '', notes });

    if (!result.ok) {
      Alert.alert(
        result.reason === 'duplicate' ? 'Label already exists' : 'Label could not be saved',
        result.reason === 'duplicate' ? 'Use a different label name.' : 'Please try again.',
      );
      return;
    }

    resetLabelForm();
  };

  const confirmDeleteLabel = async () => {
    if (!labelPendingDelete) {
      return;
    }

    if (animals.some((animal) => animal.labels.some((entry) => equalsIgnoreCase(entry, labelPendingDelete)))) {
      setLabelPendingDelete(null);
      Alert.alert('Label is in use', 'Remove this label from its animals before deleting it.');
      return;
    }

    const result = await removeLabel(labelPendingDelete);
    setLabelPendingDelete(null);

    if (!result.ok) {
      Alert.alert('Label could not be deleted', 'Nothing was changed. Please try again.');
      return;
    }

    if (equalsIgnoreCase(name, labelPendingDelete)) {
      resetLabelForm();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="Labels"
        leftAction={{ icon: 'back', accessibilityLabel: 'Back', onPress: () => router.back() }}
        actions={[
          {
            icon: 'help-circle',
            accessibilityLabel: 'About labels',
            onPress: () => setShowHelp(true),
          },
        ]}
      />
      <ScrollView contentContainerStyle={[styles.content, labelEntities.length === 0 && styles.emptyContent]} showsVerticalScrollIndicator={false}>
        <View style={styles.editorCard}>
          <Text style={styles.sectionLabel}>{isEditingLabel ? 'Edit label' : 'Animal labels'}</Text>

          <DesignField value={name} label="Label name *" onChangeText={setName} />
          <DesignField value={notes} label="Notes" large onChangeText={setNotes} />

          <View style={styles.editorActionsRow}>
            <BouncyPressable
              accessibilityRole="button"
              accessibilityLabel={isEditingLabel ? 'Save label changes' : 'Add label'}
              containerStyle={styles.editorPrimaryButtonWrap}
              onPress={handleSaveLabel}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
            >
              <AppIcon name={isEditingLabel ? 'check' : 'plus'} size={16} color="#fff" />
              <Text style={styles.addButtonText}>{isEditingLabel ? 'Save Changes' : 'Add Label'}</Text>
            </BouncyPressable>
            {isEditingLabel ? (
              <BouncyPressable
                accessibilityRole="button"
                accessibilityLabel="Cancel editing label"
                onPress={resetLabelForm}
                style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </BouncyPressable>
            ) : null}
          </View>
        </View>

        {labelEntities.length === 0 ? (
          <View style={styles.emptyState}>
            <AppIcon name="tag" size={90} color="#E5E0E7" opacity={1} />
            <Text style={styles.emptyTitle}>Empty</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {labelEntities.map((label) => {
              const animalCount = getLabelAnimalCount(label, animals);

              return (
              <View key={label.uid ?? label.name} style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <View style={styles.itemTitleRow}>
                    <View style={styles.itemIconBadge}>
                      <AppIcon name="tag" size={32} color="#171717" />
                    </View>
                    <View style={styles.itemHeadingCopy}>
                      <Text style={styles.itemTitle}>{label.name}</Text>
                      <Text style={styles.itemSubtitle}>{animalCount} {animalCount === 1 ? 'animal' : 'animals'}</Text>
                    </View>
                  </View>
                  <View style={styles.itemActionsRow}>
                    <BouncyPressable accessibilityRole="button" accessibilityLabel={`Edit ${label.name}`} onPress={() => handleStartEditLabel(label)} style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}>
                      <AppIcon name="edit" size={18} color="#171717" />
                    </BouncyPressable>
                    <BouncyPressable accessibilityRole="button" accessibilityLabel={`Delete ${label.name}`} onPress={() => setLabelPendingDelete(label.name)} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
                      <AppIcon name="trash" size={28} color="#fff" />
                    </BouncyPressable>
                  </View>
                </View>
                {label.notes ? <Text style={styles.itemNotes}>{label.notes}</Text> : null}
              </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal
        transparent
        animationType="none"
        visible={labelPendingDelete !== null}
        onRequestClose={() => setLabelPendingDelete(null)}
      >
        <Pressable style={styles.centeredModalBackdrop} onPress={() => setLabelPendingDelete(null)}>
          <Pressable style={styles.deleteConfirmCard} onPress={() => undefined}>
            <Text style={styles.deleteConfirmTitle}>Delete label?</Text>
            <Text style={styles.deleteConfirmText}>
              {labelPendingDelete ? `Are you sure you want to delete ${labelPendingDelete}?` : ''}
            </Text>
            <View style={styles.deleteConfirmActions}>
              <BouncyPressable accessibilityRole="button" containerStyle={{ flex: 1 }} onPress={() => setLabelPendingDelete(null)} style={({ pressed }) => [styles.deleteCancelButton, pressed && styles.pressed]}>
                <Text style={styles.deleteCancelButtonText}>Cancel</Text>
              </BouncyPressable>
              <BouncyPressable accessibilityRole="button" containerStyle={{ flex: 1 }} onPress={confirmDeleteLabel} style={({ pressed }) => [styles.deleteConfirmButton, pressed && styles.pressed]}>
                <Text style={styles.deleteConfirmButtonText}>Delete</Text>
              </BouncyPressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <InfoModal
        visible={showHelp}
        onClose={() => setShowHelp(false)}
        title="Labels"
        description={
          'Labels let you create your own groups of animals for any purpose. An animal can have ' +
          'multiple labels, allowing groups to overlap — for example, “Milking cows”, “Mothers” or ' +
          '“Young stock”. You can then add records to all animals with a label at once. Labels are ' +
          'separate from herds, flocks, farms, locations and species.'
        }
      />
    </SafeAreaView>
  );
}

function getLabelAnimalCount(label: LabelEntity, animals: Animal[]) {
  return animals.filter(
    (animal) =>
      (label.uid && animal.labelUids?.includes(label.uid)) ||
      animal.labels.some((entry) => equalsIgnoreCase(entry, label.name)),
  ).length;
}

function equalsIgnoreCase(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  content: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 120, gap: 16 },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
  editorCard: { borderRadius: 24, backgroundColor: '#EFECF0', padding: 16, gap: 14 },
  sectionLabel: { color: tokens.colors.text, fontSize: 16, fontWeight: '700' },
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
  editorActionsRow: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 12 },
  editorPrimaryButtonWrap: { flex: 1 },
  // Same translucent red as Clear filter: a secondary action that belongs to
  // the accent family without competing with the solid Save button.
  cancelButton: {
    minHeight: 50,
    paddingHorizontal: 22,
    borderRadius: 25,
    backgroundColor: 'rgba(221, 101, 96, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: { color: tokens.colors.accentDeep, fontSize: 14, fontWeight: '700' },
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
    width: 60,
    height: 60,
    borderRadius: 19,
    backgroundColor: '#FCE5E4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemHeadingCopy: { flex: 1, gap: 2, minWidth: 0 },
  itemTitle: { color: tokens.colors.text, fontSize: 16, fontWeight: '700' },
  itemSubtitle: { color: tokens.colors.textSoft, fontSize: 12, fontWeight: '600' },
  itemActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.surfaceMuted,
  },
  deleteButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.accent,
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
  pressed: { opacity: 0.92 },
});
