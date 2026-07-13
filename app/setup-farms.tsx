import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { DesignField } from '../src/components/DesignField';
import { useSetup } from '../src/context/SetupContext';
import { tokens } from '../src/theme/tokens';

export default function SetupFarmsScreen() {
  const router = useRouter();
  const { farmEntities, addFarm, removeFarm } = useSetup();
  const [farmName, setFarmName] = useState('');
  const [holdingId, setHoldingId] = useState('');
  const [address, setAddress] = useState('');
  const [country, setCountry] = useState('');
  const [notes, setNotes] = useState('');
  const [farmPendingDelete, setFarmPendingDelete] = useState<string | null>(null);

  const handleAddFarm = () => {
    addFarm({
      name: farmName,
      holdingId,
      address,
      country,
      notes,
    });

    if (!farmName.trim()) {
      return;
    }

    setFarmName('');
    setHoldingId('');
    setAddress('');
    setCountry('');
    setNotes('');
  };

  const confirmDeleteFarm = () => {
    if (!farmPendingDelete) {
      return;
    }

    removeFarm(farmPendingDelete);
    setFarmPendingDelete(null);
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
      />
      <ScrollView
        contentContainerStyle={[styles.content, farmEntities.length === 0 && styles.emptyContent]}
        showsVerticalScrollIndicator={false}
      >
          <View style={styles.editorCard}>
            <Text style={styles.sectionLabel}>Farm details</Text>

          <DesignField value={farmName} label="Farm name *" onChangeText={setFarmName} />

          <DesignField
            value={holdingId}
            label="Holding ID / Registration No."
            onChangeText={setHoldingId}
          />

          <DesignField value={address} label="Address" onChangeText={setAddress} />
          <DesignField value={country} label="Country" onChangeText={setCountry} />
          <DesignField value={notes} label="Notes" large onChangeText={setNotes} />

          <Pressable
            accessibilityLabel="Add farm"
            accessibilityRole="button"
            onPress={handleAddFarm}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          >
            <AppIcon name="plus" size={16} color="#fff" />
            <Text style={styles.addButtonText}>Add Farm</Text>
          </Pressable>
        </View>

        {farmEntities.length === 0 ? (
          <View style={styles.emptyState}>
            <AppIcon name="pin" size={90} color="#E5E0E7" opacity={1} />
            <Text style={styles.emptyTitle}>Empty</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {farmEntities.map((farm) => (
              <View key={farm.name} style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <View style={styles.itemTitleRow}>
                    <View style={styles.itemIconBadge}>
                      <AppIcon name="pin" size={24} color="#171717" />
                    </View>
                    <View style={styles.itemHeadingCopy}>
                      <Text style={styles.itemTitle}>{farm.name}</Text>
                      <Text style={styles.itemSubtitle}>Livestock holding</Text>
                    </View>
                  </View>
                  <Pressable
                    accessibilityLabel={`Delete ${farm.name}`}
                    accessibilityRole="button"
                    onPress={() => setFarmPendingDelete(farm.name)}
                    style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
                  >
                    <AppIcon name="trash" size={18} color="#fff" />
                  </Pressable>
                </View>

                <View style={styles.itemBody}>
                  {farm.holdingId ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Registration</Text>
                      <Text style={styles.detailValue}>{farm.holdingId}</Text>
                    </View>
                  ) : null}
                  {farm.country ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Country</Text>
                      <Text style={styles.detailValue}>{farm.country}</Text>
                    </View>
                  ) : null}
                  {farm.address ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Address</Text>
                      <Text style={styles.detailValue}>{farm.address}</Text>
                    </View>
                  ) : null}
                </View>

                {farm.notes ? (
                  <View style={styles.notesCard}>
                    <Text style={styles.notesLabel}>Notes</Text>
                    <Text style={styles.itemNotes}>{farm.notes}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      <Modal
        transparent
        animationType="slide"
        visible={farmPendingDelete !== null}
        onRequestClose={() => setFarmPendingDelete(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setFarmPendingDelete(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Delete farm?</Text>
            <Text style={styles.modalText}>
              {farmPendingDelete ? `Are you sure you want to delete ${farmPendingDelete}?` : ''}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                onPress={confirmDeleteFarm}
                style={({ pressed }) => [
                  styles.modalOption,
                  styles.modalOptionActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.modalOptionText, styles.modalOptionTextActive]}>Yes</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setFarmPendingDelete(null)}
                style={({ pressed }) => [styles.modalOption, styles.modalOptionIdle, pressed && styles.pressed]}
              >
                <Text style={styles.modalOptionText}>No</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
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
    backgroundColor: '#F5F3F7',
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
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0E9ED',
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flex: 1,
  },
  itemIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
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
  itemBody: {
    gap: 6,
    alignItems: 'flex-start',
  },
  detailRow: {
    gap: 2,
    alignItems: 'flex-start',
  },
  detailLabel: {
    color: '#8A7F87',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  detailValue: {
    color: tokens.colors.text,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  notesCard: {
    borderRadius: 18,
    backgroundColor: '#F8F6F9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  notesLabel: {
    color: '#8A7F87',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  itemNotes: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
    textAlign: 'left',
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 28,
    gap: 16,
  },
  modalTitle: {
    color: tokens.colors.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalText: {
    color: tokens.colors.textSoft,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalOption: {
    flex: 1,
    minHeight: 52,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  modalOptionActive: {
    backgroundColor: '#FCE5E4',
  },
  modalOptionIdle: {
    backgroundColor: '#F5F3F7',
  },
  modalOptionText: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  modalOptionTextActive: {
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.92,
  },
});
