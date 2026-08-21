import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, AppIconName } from './AppIcon';
import { AppTopBar } from './AppTopBar';
import { BouncyPressable } from './BouncyPressable';
import { SetupCollectionKey, useSetup } from '../context/SetupContext';
import { tokens } from '../theme/tokens';

type SetupCollectionScreenProps = {
  title: string;
  icon: AppIconName;
  collection: SetupCollectionKey;
};

export function SetupCollectionScreen({ title, icon, collection }: SetupCollectionScreenProps) {
  const router = useRouter();
  const { locations, labels, medicines, addItem, removeItem } = useSetup();
  const [draftValue, setDraftValue] = useState('');
  const itemsByCollection = { locations, labels, medicines } satisfies Record<Exclude<SetupCollectionKey, 'farms'>, string[]>;
  const items = collection === 'farms' ? [] : itemsByCollection[collection];
  const handleAdd = async () => {
    const result = await addItem(collection, draftValue);
    if (!result.ok) {
      Alert.alert('Item could not be added', 'Check the value and try again.');
      return;
    }
    setDraftValue('');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title={title}
        leftAction={{
          icon: 'back',
          accessibilityLabel: 'Back',
          onPress: () => router.back(),
        }}
      />
      <ScrollView
        contentContainerStyle={[styles.content, items.length === 0 && styles.emptyContent]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.editorCard}>
          <Text style={styles.sectionLabel}>{title}</Text>
          <View style={styles.entryRow}>
            <TextInput
              accessibilityLabel={`Add ${title}`}
              placeholder={`Add ${title.slice(0, -1)}`}
              placeholderTextColor="#8b8b8b"
              style={styles.input}
              value={draftValue}
              onChangeText={setDraftValue}
              onSubmitEditing={() => void handleAdd()}
              returnKeyType="done"
            />
            <BouncyPressable
              accessibilityLabel={`Add ${title}`}
              accessibilityRole="button"
              onPress={() => void handleAdd()}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
            >
              <AppIcon name="plus" size={16} color="#fff" />
              <Text style={styles.addButtonText}>Add</Text>
            </BouncyPressable>
          </View>
        </View>
        {items.length === 0 ? (
          <View style={styles.emptyState}>
            <AppIcon name={icon} size={90} color="#E5E0E7" opacity={1} />
            <Text style={styles.emptyTitle}>Empty</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {items.map((item) => (
              <View key={item} style={styles.itemRow}>
                <View style={styles.itemCopy}>
                  <AppIcon name={icon} size={18} color={tokens.colors.accent} />
                  <Text style={styles.itemText}>{item}</Text>
                </View>
                <BouncyPressable
                  accessibilityLabel={`Remove ${item}`}
                  accessibilityRole="button"
                  onPress={() => void removeItem(collection, item)}
                  style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
                >
                  <AppIcon name="trash" size={28} color="#fff" />
                </BouncyPressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
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
    gap: 10,
  },
  sectionLabel: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  entryRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  addButton: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: tokens.colors.accent,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  list: {
    gap: 10,
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
  itemRow: {
    minHeight: 56,
    borderRadius: 22,
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  itemText: {
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  removeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.accent,
  },
  pressed: {
    opacity: 0.92,
  },
});
