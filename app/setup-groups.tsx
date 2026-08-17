import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';

import { AppIcon } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { DesignField } from '../src/components/DesignField';
import { InfoModal } from '../src/components/InfoModal';
import { useAnimals } from '../src/context/AnimalsContext';
import { type GroupEntity, useSetup } from '../src/context/SetupContext';
import type { Animal } from '../src/entities/animal';
import { tokens } from '../src/theme/tokens';

export default function SetupGroupsScreen() {
  const router = useRouter();
  const { animals } = useAnimals();
  const { groupEntities, addGroup, updateGroup, removeGroup } = useSetup();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [groupPendingDelete, setGroupPendingDelete] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [editingGroupUid, setEditingGroupUid] = useState<string | null>(null);
  const isEditingGroup = editingGroupUid !== null;

  const resetGroupForm = () => {
    setEditingGroupUid(null);
    setName('');
    setNotes('');
  };

  const handleStartEditGroup = (group: GroupEntity) => {
    setEditingGroupUid(group.uid ?? null);
    setName(group.name);
    setNotes(group.notes);
  };

  const handleSaveGroup = async () => {
    if (!name.trim()) {
      Alert.alert('Group name required', 'Enter a name for the group.');
      return;
    }

    const result = editingGroupUid
      ? await updateGroup(editingGroupUid, { name, animals: '', notes })
      : await addGroup({ name, animals: '', notes });

    if (!result.ok) {
      Alert.alert(
        result.reason === 'duplicate' ? 'Group already exists' : 'Group could not be saved',
        result.reason === 'duplicate' ? 'Use a different group name.' : 'Please try again.',
      );
      return;
    }

    resetGroupForm();
  };

  const confirmDeleteGroup = async () => {
    if (!groupPendingDelete) {
      return;
    }

    if (animals.some((animal) => animal.group.trim().toLowerCase() === groupPendingDelete.trim().toLowerCase())) {
      setGroupPendingDelete(null);
      Alert.alert('Group is in use', 'Remove or reassign the animals in this group before deleting it.');
      return;
    }

    const result = await removeGroup(groupPendingDelete);
    setGroupPendingDelete(null);

    if (!result.ok) {
      Alert.alert('Group could not be deleted', 'Nothing was changed. Please try again.');
      return;
    }

    if (equalsIgnoreCase(name, groupPendingDelete)) {
      resetGroupForm();
    }
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
          <Text style={styles.sectionLabel}>{isEditingGroup ? 'Edit group' : 'Animal groups'}</Text>

          <DesignField value={name} label="Group name *" onChangeText={setName} />
          <DesignField value={notes} label="Notes" large onChangeText={setNotes} />

          <View style={styles.editorActionsRow}>
            <BouncyPressable
              accessibilityRole="button"
              accessibilityLabel={isEditingGroup ? 'Save group changes' : 'Add group'}
              containerStyle={styles.editorPrimaryButtonWrap}
              onPress={handleSaveGroup}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
            >
              <AppIcon name={isEditingGroup ? 'check' : 'plus'} size={16} color="#fff" />
              <Text style={styles.addButtonText}>{isEditingGroup ? 'Save Changes' : 'Add Group'}</Text>
            </BouncyPressable>
            {isEditingGroup ? (
              <BouncyPressable
                accessibilityRole="button"
                accessibilityLabel="Cancel editing group"
                onPress={resetGroupForm}
                style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </BouncyPressable>
            ) : null}
          </View>
        </View>

        {groupEntities.length === 0 ? (
          <View style={styles.emptyState}>
            <AppIcon name="tag" size={90} color="#E5E0E7" opacity={1} />
            <Text style={styles.emptyTitle}>Empty</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {groupEntities.map((group) => {
              const animalCount = getGroupAnimalCount(group, animals);

              return (
              <View key={group.uid ?? group.name} style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <View style={styles.itemTitleRow}>
                    <View style={styles.itemIconBadge}>
                      <AppIcon name="tag" size={22} color="#171717" />
                    </View>
                    <View style={styles.itemHeadingCopy}>
                      <Text style={styles.itemTitle}>{group.name}</Text>
                      <Text style={styles.itemSubtitle}>{animalCount} {animalCount === 1 ? 'animal' : 'animals'}</Text>
                    </View>
                  </View>
                  <View style={styles.itemActionsRow}>
                    <BouncyPressable accessibilityRole="button" accessibilityLabel={`Edit ${group.name}`} onPress={() => handleStartEditGroup(group)} style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}>
                      <AppIcon name="edit" size={18} color="#171717" />
                    </BouncyPressable>
                    <BouncyPressable accessibilityRole="button" accessibilityLabel={`Delete ${group.name}`} onPress={() => setGroupPendingDelete(group.name)} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
                      <AppIcon name="trash" size={28} color="#fff" />
                    </BouncyPressable>
                  </View>
                </View>
                {group.notes ? <Text style={styles.itemNotes}>{group.notes}</Text> : null}
              </View>
              );
            })}
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
      <InfoModal
        visible={showHelp}
        onClose={() => setShowHelp(false)}
        title="Groups"
        description="Organise animals into groups so you can move, treat and record them together. Groups are flexible — animals can move between farms or paddocks without leaving the group, and you can mix species when needed."
      />
    </SafeAreaView>
  );
}

function getGroupAnimalCount(group: GroupEntity, animals: Animal[]) {
  return animals.filter(
    (animal) => (group.uid && animal.groupUid === group.uid) || equalsIgnoreCase(animal.group, group.name),
  ).length;
}

function equalsIgnoreCase(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  content: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 120, gap: 16 },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
  editorCard: { borderRadius: 24, backgroundColor: '#F5F3F7', padding: 16, gap: 14 },
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
  cancelButton: { minHeight: 50, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { color: tokens.colors.textSoft, fontSize: 14, fontWeight: '700' },
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
