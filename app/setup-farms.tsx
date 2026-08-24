import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../src/theme/text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { DesignField } from '../src/components/DesignField';
import { InfoModal } from '../src/components/InfoModal';
import { useAnimals } from '../src/context/AnimalsContext';
import { type FarmEntity, type LocationEntity, useSetup } from '../src/context/SetupContext';
import { tokens } from '../src/theme/tokens';

export default function SetupFarmsScreen() {
  const router = useRouter();
  const { animals } = useAnimals();
  const { farmEntities, locationEntities, addFarm, updateFarm, removeFarm, pendingSetupSelectionTarget, resolveSetupSelection } = useSetup();
  const [farmName, setFarmName] = useState('');
  const [holdingId, setHoldingId] = useState('');
  const [notes, setNotes] = useState('');
  const [farmPendingDelete, setFarmPendingDelete] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [editingFarmUid, setEditingFarmUid] = useState<string | null>(null);
  const isEditingFarm = editingFarmUid !== null;

  const resetFarmForm = () => {
    setEditingFarmUid(null);
    setFarmName('');
    setHoldingId('');
    setNotes('');
  };

  const handleStartEditFarm = (farm: (typeof farmEntities)[number]) => {
    setEditingFarmUid(farm.uid ?? null);
    setFarmName(farm.name);
    setHoldingId(farm.holdingId);
    setNotes(farm.notes);
  };

  const handleSaveFarm = async () => {
    const nextFarmName = farmName.trim();

    if (!nextFarmName) {
      Alert.alert('Farm name required', 'Enter a name for the farm.');
      return;
    }

    const result = editingFarmUid
      ? await updateFarm(editingFarmUid, { name: nextFarmName, holdingId, notes })
      : await addFarm({ name: nextFarmName, holdingId, notes });

    if (!result.ok) {
      Alert.alert(
        result.reason === 'duplicate' ? 'Farm already exists' : 'Farm could not be saved',
        result.reason === 'duplicate' ? 'Use a different farm name.' : 'Nothing was changed. Please try again.',
      );
      return;
    }

    if (!editingFarmUid && (pendingSetupSelectionTarget === 'fromFarm' || pendingSetupSelectionTarget === 'toFarm')) {
      resolveSetupSelection(nextFarmName);
      router.back();
      return;
    }

    resetFarmForm();
  };

  const confirmDeleteFarm = async () => {
    if (!farmPendingDelete) {
      return;
    }

    if (animals.some((animal) => animal.farm.trim().toLowerCase() === farmPendingDelete.trim().toLowerCase())) {
      setFarmPendingDelete(null);
      Alert.alert('Farm is in use', 'Move or edit the animals assigned to this farm before deleting it.');
      return;
    }

    const result = await removeFarm(farmPendingDelete);
    setFarmPendingDelete(null);

    if (!result.ok) {
      Alert.alert(
        result.reason === 'in-use' ? 'Farm is in use' : 'Farm could not be deleted',
        result.reason === 'in-use'
          ? 'Delete or reassign the locations belonging to this farm first.'
          : 'Nothing was changed. Please try again.',
      );
      return;
    }

    if (equalsIgnoreCase(farmName, farmPendingDelete)) {
      resetFarmForm();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="Farms"
        leftAction={{
          icon: 'back',
          accessibilityLabel: 'Back',
          onPress: () => router.back(),
        }}
        actions={[
          {
            icon: 'help-circle',
            accessibilityLabel: 'About farms',
            onPress: () => setShowHelp(true),
          },
        ]}
      />
      <ScrollView
        contentContainerStyle={[styles.content, farmEntities.length === 0 && styles.emptyContent]}
        showsVerticalScrollIndicator={false}
      >
          <View style={styles.editorCard}>
            <Text style={styles.sectionLabel}>{isEditingFarm ? 'Edit farm' : 'Farm details'}</Text>

          <DesignField value={farmName} label="Farm name *" placeholder="e.g. Home Farm" onChangeText={setFarmName} />

          <DesignField
            value={holdingId}
            label="Holding ID / Registration No."
            placeholder="Enter holding or registration number"
            onChangeText={setHoldingId}
          />

          <DesignField value={notes} label="Notes" placeholder="Add notes about this farm" large onChangeText={setNotes} />

          <View style={styles.editorActionsRow}>
            <BouncyPressable
              accessibilityLabel={isEditingFarm ? 'Save farm changes' : 'Add farm'}
              accessibilityRole="button"
              containerStyle={styles.editorPrimaryButtonWrap}
              onPress={handleSaveFarm}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
            >
              <AppIcon name={isEditingFarm ? 'check' : 'plus'} size={16} color="#fff" />
              <Text style={styles.addButtonText}>{isEditingFarm ? 'Save Changes' : 'Add Farm'}</Text>
            </BouncyPressable>
            {isEditingFarm ? (
              <BouncyPressable
                accessibilityLabel="Cancel editing farm"
                accessibilityRole="button"
                onPress={resetFarmForm}
                style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </BouncyPressable>
            ) : null}
          </View>
        </View>

        {farmEntities.length === 0 ? (
          <View style={styles.emptyState}>
            <AppIcon name="sprout" size={90} color="#E5E0E7" opacity={1} />
            <Text style={styles.emptyTitle}>Empty</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {farmEntities.map((farm) => {
              const locationCount = getFarmLocationCount(farm, locationEntities);

              return (
              <View key={farm.uid ?? farm.name} style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <View style={styles.itemTitleRow}>
                    <View style={styles.itemIconBadge}>
                      <AppIcon name="sprout" size={32} color="#171717" />
                    </View>
                    <View style={styles.itemHeadingCopy}>
                      <Text style={styles.itemTitle}>{farm.name}</Text>
                      <Text style={styles.itemSubtitle}>{locationCount} {locationCount === 1 ? 'location' : 'locations'}</Text>
                      {farm.holdingId ? <Text style={styles.itemSubtitle}>{farm.holdingId}</Text> : null}
                    </View>
                  </View>
                  <View style={styles.itemActionsRow}>
                    <BouncyPressable
                      accessibilityLabel={`Edit ${farm.name}`}
                      accessibilityRole="button"
                      onPress={() => handleStartEditFarm(farm)}
                      style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
                    >
                      <AppIcon name="edit" size={20} color="#171717" />
                    </BouncyPressable>
                    <BouncyPressable
                      accessibilityLabel={`Delete ${farm.name}`}
                      accessibilityRole="button"
                      onPress={() => setFarmPendingDelete(farm.name)}
                      style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
                    >
                      <AppIcon name="trash" size={28} color="#fff" />
                    </BouncyPressable>
                  </View>
                </View>
                {farm.notes ? <Text style={styles.itemNotes}>{farm.notes}</Text> : null}
              </View>
              );
            })}
          </View>
        )}
      </ScrollView>
      <Modal
        transparent
        animationType="none"
        visible={farmPendingDelete !== null}
        onRequestClose={() => setFarmPendingDelete(null)}
      >
        <Pressable style={styles.centeredModalBackdrop} onPress={() => setFarmPendingDelete(null)}>
          <Pressable style={styles.deleteConfirmCard} onPress={() => undefined}>
            <Text style={styles.deleteConfirmTitle}>Delete farm?</Text>
            <Text style={styles.deleteConfirmText}>
              {farmPendingDelete ? `Are you sure you want to delete ${farmPendingDelete}?` : ''}
            </Text>
            <View style={styles.deleteConfirmActions}>
              <BouncyPressable
                accessibilityRole="button"
                containerStyle={{ flex: 1 }}
                onPress={() => setFarmPendingDelete(null)}
                style={({ pressed }) => [styles.deleteCancelButton, pressed && styles.pressed]}
              >
                <Text style={styles.deleteCancelButtonText}>Cancel</Text>
              </BouncyPressable>
              <BouncyPressable
                accessibilityRole="button"
                containerStyle={{ flex: 1 }}
                onPress={confirmDeleteFarm}
                style={({ pressed }) => [styles.deleteConfirmButton, pressed && styles.pressed]}
              >
                <Text style={styles.deleteConfirmButtonText}>Delete</Text>
              </BouncyPressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <InfoModal
        visible={showHelp}
        onClose={() => setShowHelp(false)}
        title="Farms"
        description="The properties where you keep your livestock. Assign animals and locations to farms so you can track and filter records by location."
      />
    </SafeAreaView>
  );
}

function equalsIgnoreCase(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function getFarmLocationCount(farm: FarmEntity, locations: LocationEntity[]) {
  return locations.filter(
    (location) => (farm.uid && location.farmUid === farm.uid) || equalsIgnoreCase(location.farm, farm.name),
  ).length;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 120,
    gap: 16,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  editorCard: {
    borderRadius: 24,
    backgroundColor: '#EFECF0',
    padding: 16,
    gap: 14,
  },
  sectionLabel: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
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
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  editorActionsRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  editorPrimaryButtonWrap: {
    flex: 1,
  },
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
  cancelButtonText: {
    color: tokens.colors.accentDeep,
    fontSize: 14,
    fontWeight: '700',
  },
  list: {
    gap: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingTop: 72,
    paddingBottom: 0,
  },
  emptyTitle: {
    marginTop: 18,
    color: '#E5E0E7',
    fontSize: 29,
    fontWeight: '700',
  },
  itemCard: {
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 15,
    paddingVertical: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flex: 1,
  },
  itemIconBadge: {
    width: 60,
    height: 60,
    borderRadius: 19,
    backgroundColor: '#FCE5E4',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemHeadingCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  itemTitle: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  itemSubtitle: {
    color: tokens.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
  },
  itemNotes: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
    textAlign: 'left',
  },
  itemActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  editButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.surfaceMuted,
    flexShrink: 0,
  },
  deleteButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.accent,
    flexShrink: 0,
  },
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
  pressed: {
    opacity: 0.92,
  },
});
