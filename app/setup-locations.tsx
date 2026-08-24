import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../src/theme/text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { DesignField } from '../src/components/DesignField';
import { InlineDropdown } from '../src/components/InlineDropdown';
import { InfoModal } from '../src/components/InfoModal';
import { useAnimals } from '../src/context/AnimalsContext';
import { useSetup } from '../src/context/SetupContext';
import { tokens } from '../src/theme/tokens';

export default function SetupLocationsScreen() {
  const router = useRouter();
  const { animals } = useAnimals();
  const {
    farms,
    locationEntities,
    addLocation,
    updateLocation,
    removeLocation,
    pendingSetupSelectionTarget,
    resolveSetupSelection,
  } = useSetup();
  const [name, setName] = useState('');
  const [farm, setFarm] = useState('');
  const [notes, setNotes] = useState('');
  const [locationPendingDelete, setLocationPendingDelete] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [editingLocationUid, setEditingLocationUid] = useState<string | null>(null);
  const isEditingLocation = editingLocationUid !== null;

  const resetLocationForm = () => {
    setEditingLocationUid(null);
    setName('');
    setFarm('');
    setNotes('');
  };

  const handleStartEditLocation = (location: (typeof locationEntities)[number]) => {
    setEditingLocationUid(location.uid ?? null);
    setName(location.name);
    setFarm(location.farm);
    setNotes(location.notes);
  };

  const handleSaveLocation = async () => {
    const nextLocationName = name.trim();

    if (!nextLocationName || !farm.trim()) {
      Alert.alert('Required fields missing', 'Enter a location name and select its farm.');
      return;
    }

    const result = editingLocationUid
      ? await updateLocation(editingLocationUid, { name: nextLocationName, farm, notes })
      : await addLocation({ name: nextLocationName, farm, notes });

    if (!result.ok) {
      Alert.alert(
        result.reason === 'duplicate' ? 'Location already exists' : 'Location could not be saved',
        result.reason === 'duplicate' ? 'Use a different location name.' : 'Nothing was changed. Please try again.',
      );
      return;
    }

    if (
      !editingLocationUid &&
      (pendingSetupSelectionTarget === 'fromLocation' || pendingSetupSelectionTarget === 'toLocation')
    ) {
      resolveSetupSelection(nextLocationName);
      router.back();
      return;
    }

    resetLocationForm();
  };

  const confirmDeleteLocation = async () => {
    if (!locationPendingDelete) {
      return;
    }

    if (animals.some((animal) => animal.location.trim().toLowerCase() === locationPendingDelete.trim().toLowerCase())) {
      setLocationPendingDelete(null);
      Alert.alert('Location is in use', 'Move or edit the animals assigned to this location before deleting it.');
      return;
    }

    const result = await removeLocation(locationPendingDelete);
    setLocationPendingDelete(null);

    if (!result.ok) {
      Alert.alert(
        result.reason === 'in-use' ? 'Location is in use' : 'Location could not be deleted',
        result.reason === 'in-use'
          ? 'Move the animals in this location elsewhere before deleting it.'
          : 'Nothing was changed. Please try again.',
      );
      return;
    }

    if (equalsIgnoreCase(name, locationPendingDelete)) {
      resetLocationForm();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="Locations"
        leftAction={{ icon: 'back', accessibilityLabel: 'Back', onPress: () => router.back() }}
        actions={[
          {
            icon: 'help-circle',
            accessibilityLabel: 'About locations',
            onPress: () => setShowHelp(true),
          },
        ]}
      />
      <ScrollView contentContainerStyle={[styles.content, locationEntities.length === 0 && styles.emptyContent]} showsVerticalScrollIndicator={false}>
        <View style={styles.editorCard}>
          <Text style={styles.sectionLabel}>{isEditingLocation ? 'Edit location' : 'Locations'}</Text>

          <DesignField value={name} label="Location name *" placeholder="e.g. North paddock" onChangeText={setName} />
          <View style={styles.block}>
            <Text style={styles.label}>Farm *</Text>
            <InlineDropdown
              accessibilityLabel="Farm *"
              options={farms}
              value={farm === '' ? null : farm}
              placeholder={farms.length === 0 ? 'No farms available' : 'Select farm'}
              onSelect={setFarm}
            />
          </View>
          <DesignField value={notes} label="Notes" placeholder="Add notes about this location" large onChangeText={setNotes} />

          <View style={styles.editorActionsRow}>
            <BouncyPressable
              accessibilityRole="button"
              accessibilityLabel={isEditingLocation ? 'Save location changes' : 'Add location'}
              containerStyle={styles.editorPrimaryButtonWrap}
              onPress={handleSaveLocation}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
            >
              <AppIcon name={isEditingLocation ? 'check' : 'plus'} size={16} color="#fff" />
              <Text style={styles.addButtonText}>{isEditingLocation ? 'Save Changes' : 'Add Location'}</Text>
            </BouncyPressable>
            {isEditingLocation ? (
              <BouncyPressable
                accessibilityRole="button"
                accessibilityLabel="Cancel editing location"
                onPress={resetLocationForm}
                style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </BouncyPressable>
            ) : null}
          </View>
        </View>

        {locationEntities.length === 0 ? (
          <View style={styles.emptyState}>
            <AppIcon name="pin" size={90} color="#E5E0E7" opacity={1} />
            <Text style={styles.emptyTitle}>Empty</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {locationEntities.map((location) => (
              <View key={location.uid ?? location.name} style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <View style={styles.itemTitleRow}>
                    <View style={styles.itemIconBadge}>
                      <AppIcon name="pin" size={32} color="#171717" />
                    </View>
                    <View style={styles.itemHeadingCopy}>
                      <Text style={styles.itemTitle}>{location.name}</Text>
                      <Text style={styles.itemSubtitle}>{location.farm || 'No farm selected'}</Text>
                    </View>
                  </View>
                  <View style={styles.itemActionsRow}>
                    <BouncyPressable accessibilityRole="button" accessibilityLabel={`Edit ${location.name}`} onPress={() => handleStartEditLocation(location)} style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}>
                      <AppIcon name="edit" size={18} color="#171717" />
                    </BouncyPressable>
                    <BouncyPressable accessibilityRole="button" accessibilityLabel={`Delete ${location.name}`} onPress={() => setLocationPendingDelete(location.name)} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
                      <AppIcon name="trash" size={28} color="#fff" />
                    </BouncyPressable>
                  </View>
                </View>
                {location.notes ? <Text style={styles.itemNotes}>{location.notes}</Text> : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        transparent
        animationType="none"
        visible={locationPendingDelete !== null}
        onRequestClose={() => setLocationPendingDelete(null)}
      >
        <Pressable style={styles.centeredModalBackdrop} onPress={() => setLocationPendingDelete(null)}>
          <Pressable style={styles.deleteConfirmCard} onPress={() => undefined}>
            <Text style={styles.deleteConfirmTitle}>Delete location?</Text>
            <Text style={styles.deleteConfirmText}>
              {locationPendingDelete ? `Are you sure you want to delete ${locationPendingDelete}?` : ''}
            </Text>
            <View style={styles.deleteConfirmActions}>
              <BouncyPressable accessibilityRole="button" containerStyle={{ flex: 1 }} onPress={() => setLocationPendingDelete(null)} style={({ pressed }) => [styles.deleteCancelButton, pressed && styles.pressed]}>
                <Text style={styles.deleteCancelButtonText}>Cancel</Text>
              </BouncyPressable>
              <BouncyPressable accessibilityRole="button" containerStyle={{ flex: 1 }} onPress={confirmDeleteLocation} style={({ pressed }) => [styles.deleteConfirmButton, pressed && styles.pressed]}>
                <Text style={styles.deleteConfirmButtonText}>Delete</Text>
              </BouncyPressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <InfoModal
        visible={showHelp}
        onClose={() => setShowHelp(false)}
        title="Locations"
        description="The fields or enclosures within a farm. Use locations to track where animals are kept or grazing and filter records by location."
      />
    </SafeAreaView>
  );
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
  block: { gap: 8 },
  label: { color: tokens.colors.text, fontSize: 14, fontWeight: '500' },
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
