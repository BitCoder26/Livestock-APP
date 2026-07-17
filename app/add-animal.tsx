import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, type AppIconName } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { AnimatedPopupCard } from '../src/components/AnimatedPopupCard';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { CircularRevealView } from '../src/components/CircularRevealView';
import { DesignField } from '../src/components/DesignField';
import { SPECIES_OPTIONS } from '../src/constants/records';
import { getSpeciesThemeByLabel } from '../src/constants/speciesTheme';
import { FREE_ANIMAL_LIMIT } from '../src/constants/subscription';
import { useAnimals } from '../src/context/AnimalsContext';
import { useSetup } from '../src/context/SetupContext';
import { useSubscription } from '../src/context/SubscriptionContext';
import type { AnimalAgeUnit, AnimalSex, AnimalStatus, AnimalWeightUnit } from '../src/entities/animal';
import { tokens } from '../src/theme/tokens';

const STATUS_OPTIONS: AnimalStatus[] = ['Active', 'Sold', 'Deceased'];
const WEIGHT_UNITS: AnimalWeightUnit[] = ['kg', 'lb'];

const SPECIES_ICONS: Record<string, AppIconName> = Object.fromEntries(
  SPECIES_OPTIONS.map((item) => [item.label, item.icon]),
) as Record<string, AppIconName>;

type PickerKey = 'status' | 'weightUnit' | 'farm' | 'paddock' | 'group';

export function AddAnimalScreen() {
  const router = useRouter();
  const { species, animalId: selectedAnimalId, reveal } = useLocalSearchParams<{ species?: string; animalId?: string; reveal?: string }>();
  const { animals, addAnimal, updateAnimal, deleteAnimal } = useAnimals();
  const { farms, paddocks, groups } = useSetup();
  const { isPro } = useSubscription();
  const existingAnimal = selectedAnimalId
    ? animals.find((animal) => animal.id === selectedAnimalId)
    : undefined;

  const [selectedSpecies, setSelectedSpecies] = useState(species ?? existingAnimal?.species ?? 'Cattle');
  const activeSpecies = selectedSpecies;
  const speciesIcon = SPECIES_ICONS[activeSpecies] ?? 'cow';
  const [animalId, setAnimalId] = useState(existingAnimal?.id ?? '');
  const [name, setName] = useState(existingAnimal?.name ?? '');
  const [selectedSex, setSelectedSex] = useState<AnimalSex>(normalizeAnimalSex(existingAnimal?.sex));
  const [dateOfBirth, setDateOfBirth] = useState(existingAnimal?.dateOfBirth ?? '');
  const [breed, setBreed] = useState(existingAnimal?.breed ?? '');
  const [status, setStatus] = useState<AnimalStatus>(existingAnimal?.status ?? 'Active');
  const [weight, setWeight] = useState(existingAnimal?.weight ?? '');
  const [weightUnit, setWeightUnit] = useState<AnimalWeightUnit>(existingAnimal?.weightUnit ?? 'kg');
  const [farm, setFarm] = useState(existingAnimal?.farm ?? '');
  const [paddock, setPaddock] = useState(existingAnimal?.paddock ?? '');
  const [group, setGroup] = useState(existingAnimal?.group ?? '');
  const [notes, setNotes] = useState(existingAnimal?.notes ?? '');
  const [imageUris, setImageUris] = useState<string[]>(existingAnimal?.imageUris?.slice(0, 1) ?? []);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showSpeciesPicker, setShowSpeciesPicker] = useState(false);
  const [activePicker, setActivePicker] = useState<PickerKey | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const parsedDateOfBirth = useMemo(() => parseDateValue(dateOfBirth), [dateOfBirth]);
  const derivedAge = useMemo(() => {
    if (!parsedDateOfBirth) {
      return null;
    }

    return getDerivedAge(parsedDateOfBirth, new Date());
  }, [parsedDateOfBirth]);

  const handleSave = () => {
    if (!activeSpecies.trim()) {
      Alert.alert('Species required', 'Please select a species first.');
      return;
    }

    if (!animalId.trim()) {
      Alert.alert('Animal ID required', 'Please enter the primary animal ID / tag.');
      return;
    }

    const derivedAgeParts = parsedDateOfBirth ? getAgeParts(parsedDateOfBirth, new Date()) : null;

    const payload = {
      id: animalId.trim(),
      species: activeSpecies,
      sex: selectedSex,
      name: name.trim(),
      ageValue: derivedAgeParts?.value ?? '',
      ageUnit: derivedAgeParts?.unit ?? ('days old' satisfies AnimalAgeUnit),
      breed: breed.trim(),
      dateOfBirth: dateOfBirth.trim(),
      weight: weight.trim(),
      weightUnit,
      status,
      farm: farm.trim(),
      paddock: paddock.trim(),
      group: group.trim(),
      notes: notes.trim(),
      imageUris: imageUris.length > 0 ? imageUris : undefined,
    };

    if (existingAnimal) {
      updateAnimal(existingAnimal.id, payload);
      router.dismissTo({
        pathname: '/animal-timeline',
        params: { animalId: payload.id },
      });
    } else {
      if (!isPro && animals.length >= FREE_ANIMAL_LIMIT) {
        router.push({
          pathname: '/upgrade-to-pro',
          params: { limitType: 'animals' },
        });
        return;
      }

      addAnimal(payload);
      router.replace('/(tabs)/animals');
    }
  };

  const handleDateChange = (event: DateTimePickerEvent, nextDate?: Date) => {
    if (Platform.OS === 'android') {
      if (event.type === 'dismissed') {
        setShowDatePicker(false);
        return;
      }

      if (nextDate) {
        setDateOfBirth(formatDate(nextDate));
      }

      setShowDatePicker(false);
      return;
    }

    if (nextDate) {
      setDateOfBirth(formatDate(nextDate));
    }
  };

  const handleAddImages = async () => {
    if (imageUris.length >= 1) {
      Alert.alert('Image limit reached', 'You can attach only 1 profile picture.');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permission required', 'Permission to access the photo library is required.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
      allowsMultipleSelection: false,
      selectionLimit: 1,
    });

    if (result.canceled) {
      return;
    }

    const nextUri = result.assets[0]?.uri;

    if (!nextUri) {
      return;
    }

    setImageUris([nextUri]);
  };

  const handleRemoveImage = (uri: string) => {
    setImageUris((current) => current.filter((item) => item !== uri));
  };

  const pickerOptions = getPickerOptions(activePicker, farms, paddocks, groups);

  const handleDeleteAnimal = () => {
    if (!existingAnimal) {
      return;
    }

    setShowDeleteConfirm(true);
  };

  const confirmDeleteAnimal = () => {
    if (!existingAnimal) {
      return;
    }

    setShowDeleteConfirm(false);
    deleteAnimal(existingAnimal.id);
    router.replace('/(tabs)/animals');
  };

  return (
    <CircularRevealView active={reveal === '1'}>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title={existingAnimal ? 'Edit Animal' : 'Add Animal'}
        leftAction={{
          icon: 'back',
          accessibilityLabel: 'Back',
          onPress: () => router.back(),
        }}
        actions={
          existingAnimal
            ? [
                {
                  icon: 'trash',
                  accessibilityLabel: 'Delete animal',
                  onPress: handleDeleteAnimal,
                  size: 28,
                },
              ]
            : []
        }
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.formCard}>
          <View style={styles.block}>
            <Text style={styles.label}>Selected Species *</Text>
            <Pressable
              accessibilityLabel="Select species"
              accessibilityRole="button"
              onPress={() => setShowSpeciesPicker(true)}
              style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
            >
              <View style={styles.fieldWithIcon}>
                <AppIcon name={speciesIcon} size={20} color={tokens.colors.text} />
                <Text style={styles.dateValue}>{activeSpecies}</Text>
              </View>
              <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
            </Pressable>
          </View>

          <DesignField value={animalId} label="Animal ID / Tag *" onChangeText={setAnimalId} />
          <Text style={styles.helperText}>The primary identifier.</Text>

          <DesignField value={name} label="Name" onChangeText={setName} />

          <View style={styles.block}>
            <Text style={styles.label}>Sex</Text>
            <View style={styles.sexTabs}>
              <SexOption
                label="Female"
                active={selectedSex === 'female'}
                onPress={() => setSelectedSex('female')}
              />
              <SexOption
                label="Male"
                active={selectedSex === 'male'}
                onPress={() => setSelectedSex('male')}
              />
            </View>
          </View>

          <View style={styles.block}>
            <Text style={styles.label}>Date of Birth</Text>
            <Pressable
              accessibilityLabel="Select date of birth"
              accessibilityRole="button"
              onPress={() => setShowDatePicker(true)}
              style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
            >
              <Text style={[styles.dateValue, !dateOfBirth && styles.placeholderValue]}>
                {dateOfBirth || 'Select date of birth'}
              </Text>
              <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
            </Pressable>
            {derivedAge ? <Text style={styles.helperText}>Age: {derivedAge}</Text> : null}
          </View>

          <DesignField value={breed} label="Breed" onChangeText={setBreed} />

          <View style={styles.block}>
            <Text style={styles.label}>Status *</Text>
            <Pressable
              accessibilityLabel="Select status"
              accessibilityRole="button"
              onPress={() => setActivePicker('status')}
              style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
            >
              <Text style={styles.dateValue}>{status}</Text>
              <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
            </Pressable>
          </View>

          <View style={styles.inlineRow}>
            <View style={styles.inlineGrow}>
              <DesignField value={weight} label="Weight" onChangeText={setWeight} keyboardType="decimal-pad" />
            </View>
            <View style={styles.inlineUnit}>
              <View style={styles.block}>
                <Text style={styles.label}>Unit</Text>
                <Pressable
                  accessibilityLabel="Select weight unit"
                  accessibilityRole="button"
                  onPress={() => setActivePicker('weightUnit')}
                  style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
                >
                  <Text style={styles.dateValue}>{weightUnit}</Text>
                  <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
                </Pressable>
              </View>
            </View>
          </View>

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
          <Pressable accessibilityRole="button" onPress={() => router.push('/setup-farms')}>
            <Text style={styles.helperLink}>+ Add Farm</Text>
          </Pressable>

          <SelectionField
            label="Paddock"
            value={paddock}
            emptyLabel={paddocks.length === 0 ? 'No paddocks available' : 'Select paddock'}
            onPress={() => {
              if (paddocks.length === 0) {
                router.push('/setup-paddocks');
                return;
              }

              setActivePicker('paddock');
            }}
          />
          <Pressable accessibilityRole="button" onPress={() => router.push('/setup-paddocks')}>
            <Text style={styles.helperLink}>+ Add Paddock</Text>
          </Pressable>

          <SelectionField
            label="Group"
            value={group}
            emptyLabel={groups.length === 0 ? 'No groups available' : 'Select group'}
            onPress={() => {
              if (groups.length === 0) {
                router.push('/setup-groups');
                return;
              }

              setActivePicker('group');
            }}
          />
          <Pressable accessibilityRole="button" onPress={() => router.push('/setup-groups')}>
            <Text style={styles.helperLink}>+ Add Group</Text>
          </Pressable>

          <DesignField value={notes} label="Notes" large onChangeText={setNotes} />

          <Pressable
            accessibilityLabel="Add profile picture"
            accessibilityRole="button"
            onPress={handleAddImages}
            style={({ pressed }) => [styles.photoButton, pressed && styles.pressed]}
          >
            <View style={styles.photoCopy}>
              <AppIcon name="image-add" size={22} color={tokens.colors.accent} />
              <Text style={styles.photoText}>
                {imageUris.length === 0 ? 'Profile picture' : 'Profile picture 1/1'}
              </Text>
            </View>
            <View style={styles.fieldChevron}>
              <AppIcon name="chevron-right" size={12} color="#EFEFEF" />
            </View>
          </Pressable>
          {imageUris.length > 0 ? (
            <View style={styles.imageGrid}>
              {imageUris.map((uri) => (
                <View key={uri} style={styles.imageCard}>
                  <Image source={{ uri }} style={styles.imagePreview} />
                  <Pressable
                    accessibilityLabel="Remove image"
                    accessibilityRole="button"
                    onPress={() => handleRemoveImage(uri)}
                    style={styles.removeImageButton}
                  >
                    <AppIcon name="close" size={14} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <BouncyPressable
          accessibilityLabel="Save animal"
          accessibilityRole="button"
          onPress={handleSave}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <AppIcon name="save" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>Save Animal</Text>
        </BouncyPressable>
      </ScrollView>

      {showDatePicker && Platform.OS === 'android' ? (
        <DateTimePicker
          mode="date"
          display="default"
          value={parsedDateOfBirth ?? new Date()}
          onChange={handleDateChange}
        />
      ) : null}

      <Modal
        animationType="fade"
        transparent
        visible={showDeleteConfirm}
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <Pressable style={styles.centeredModalBackdrop} onPress={() => setShowDeleteConfirm(false)}>
          <Pressable style={styles.deleteConfirmCard} onPress={() => undefined}>
            <Text style={styles.deleteConfirmTitle}>Delete animal?</Text>
            <Text style={styles.deleteConfirmText}>This action cannot be undone.</Text>
            <View style={styles.deleteConfirmActions}>
              <BouncyPressable
                accessibilityLabel="Cancel delete"
                accessibilityRole="button"
                containerStyle={{ flex: 1 }}
                onPress={() => setShowDeleteConfirm(false)}
                style={({ pressed }) => [styles.deleteCancelButton, pressed && styles.pressed]}
              >
                <Text style={styles.deleteCancelButtonText}>Cancel</Text>
              </BouncyPressable>
              <BouncyPressable
                accessibilityLabel="Confirm delete animal"
                accessibilityRole="button"
                containerStyle={{ flex: 1 }}
                onPress={confirmDeleteAnimal}
                style={({ pressed }) => [styles.deleteConfirmButton, pressed && styles.pressed]}
              >
                <Text style={styles.deleteConfirmButtonText}>Delete</Text>
              </BouncyPressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={showSpeciesPicker}
        onRequestClose={() => setShowSpeciesPicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowSpeciesPicker(false)}>
          <AnimatedPopupCard visible={showSpeciesPicker} style={styles.modalCard} onPress={() => undefined}>
            <View style={styles.speciesModalHeader}>
              <Text style={styles.speciesModalTitle}>Select Species</Text>
            </View>

            <ScrollView contentContainerStyle={styles.speciesModalGrid} showsVerticalScrollIndicator={false}>
              {SPECIES_OPTIONS.map((item) => (
                (() => {
                  const theme = getSpeciesThemeByLabel(item.label);

                  return (
                    <Pressable
                      key={item.label}
                      accessibilityRole="button"
                      onPress={() => {
                        setSelectedSpecies(item.label);
                        setShowSpeciesPicker(false);
                      }}
                      style={({ pressed }) => [
                        styles.speciesModalCard,
                        {
                          backgroundColor: theme.chipBackground,
                          borderColor: theme.chipBorder,
                        },
                        pressed && styles.speciesModalCardPressed,
                      ]}
                    >
                      <AppIcon name={item.icon} size={26} color={theme.icon} />
                      <Text style={[styles.speciesModalCardLabel, { color: theme.text }]}>{item.label}</Text>
                    </Pressable>
                  );
                })()
              ))}
            </ScrollView>
          </AnimatedPopupCard>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={showDatePicker && Platform.OS === 'ios'}
        onRequestClose={() => setShowDatePicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowDatePicker(false)}>
          <AnimatedPopupCard visible={showDatePicker && Platform.OS === 'ios'} style={styles.modalCard} onPress={() => undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select date of birth</Text>
              <Pressable
                accessibilityLabel="Done"
                accessibilityRole="button"
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={styles.modalDone}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              mode="date"
              display="spinner"
              value={parsedDateOfBirth ?? new Date()}
              onChange={handleDateChange}
            />
          </AnimatedPopupCard>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={activePicker !== null}
        onRequestClose={() => setActivePicker(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setActivePicker(null)}>
          <AnimatedPopupCard visible={activePicker !== null} style={styles.selectionCard} onPress={() => undefined}>
            <Text style={styles.selectionTitle}>{getPickerTitle(activePicker)}</Text>
            {pickerOptions.map((option) => {
              const activeValue = getPickerValue(activePicker, status, weightUnit, farm, paddock, group);

              return (
                <Pressable
                  key={option}
                  accessibilityLabel={option}
                  accessibilityRole="button"
                  onPress={() => {
                    applyPickerSelection(option, activePicker, setStatus, setWeightUnit, setFarm, setPaddock, setGroup);
                    setActivePicker(null);
                  }}
                  style={({ pressed }) => [
                    styles.selectionRow,
                    option === activeValue && styles.selectionRowActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.selectionText, option === activeValue && styles.selectionTextActive]}>
                    {option}
                  </Text>
                  {option === activeValue ? <AppIcon name="check" size={16} color={tokens.colors.accent} /> : null}
                </Pressable>
              );
            })}
          </AnimatedPopupCard>
        </Pressable>
      </Modal>
      </SafeAreaView>
    </CircularRevealView>
  );
}

export default AddAnimalScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 18,
    paddingBottom: 36,
    gap: 18,
  },
  formCard: {
    borderRadius: 24,
    backgroundColor: '#F5F3F7',
    padding: 16,
    gap: 14,
  },
  block: {
    gap: 8,
  },
  label: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  helperText: {
    marginTop: -6,
    color: tokens.colors.textSoft,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 18,
  },
  helperLink: {
    color: tokens.colors.accent,
    fontSize: 13,
    fontWeight: '700',
    marginTop: -6,
  },
  radioRow: {
    flexDirection: 'row',
    gap: 12,
  },
  sexTabs: {
    flexDirection: 'row',
    gap: 12,
  },
  inlineRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-end',
  },
  inlineGrow: {
    flex: 1,
  },
  inlineUnit: {
    width: 112,
  },
  dateField: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateValue: {
    color: '#2b2b2b',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    paddingRight: 10,
  },
  placeholderValue: {
    color: '#7a7a7a',
  },
  fieldWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  fieldChevron: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sexOption: {
    flex: 1,
    minHeight: 52,
    borderRadius: 24,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  sexOptionActive: {
    backgroundColor: '#FCE5E4',
  },
  sexOptionCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flex: 1,
  },
  sexOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colors.text,
  },
  sexOptionTextActive: {
    fontWeight: '700',
  },
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
  speciesModalCard: {
    width: '48%',
    minHeight: 74,
    borderRadius: 16,
    backgroundColor: '#F5F3F7',
    borderWidth: 1,
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
  photoButton: {
    minHeight: 54,
    borderRadius: 22,
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  photoCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  photoText: {
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  imageGrid: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  imageCard: {
    width: 88,
    height: 88,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#fff',
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  removeImageButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    justifyContent: 'flex-end',
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
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 26,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  modalDone: {
    color: tokens.colors.accent,
    fontSize: 16,
    fontWeight: '700',
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
    backgroundColor: '#FCE5E4',
  },
  selectionText: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  selectionTextActive: {
    color: '#74423F',
    fontWeight: '700',
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 27,
    backgroundColor: tokens.colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.92,
  },
});

type SexOptionProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

function SexOption({ label, active, onPress }: SexOptionProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sexOption,
        active && styles.sexOptionActive,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.sexOptionCopy}>
        <Text style={[styles.sexOptionText, active && styles.sexOptionTextActive]}>{label}</Text>
      </View>
    </Pressable>
  );
}

type SelectionFieldProps = {
  label: string;
  value: string;
  emptyLabel: string;
  onPress: () => void;
};

function SelectionField({ label, value, emptyLabel, onPress }: SelectionFieldProps) {
  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={styles.dateField}>
        <Text style={[styles.dateValue, !value && styles.placeholderValue]}>{value || emptyLabel}</Text>
        <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
      </Pressable>
    </View>
  );
}

function getDerivedAge(dateOfBirth: Date, now: Date) {
  const ageParts = getAgeParts(dateOfBirth, now);

  if (!ageParts) {
    return null;
  }

  return `${ageParts.value} ${ageParts.unit}`;
}

function getAgeParts(dateOfBirth: Date, now: Date): { value: string; unit: AnimalAgeUnit } | null {
  if (dateOfBirth > now) {
    return null;
  }

  const millisDiff = now.getTime() - dateOfBirth.getTime();
  const totalDays = Math.floor(millisDiff / (1000 * 60 * 60 * 24));
  const totalMonths = (now.getFullYear() - dateOfBirth.getFullYear()) * 12 + (now.getMonth() - dateOfBirth.getMonth());
  const fullMonths =
    now.getDate() >= dateOfBirth.getDate() ? totalMonths : Math.max(0, totalMonths - 1);
  const fullYears = Math.floor(fullMonths / 12);

  if (fullYears >= 1) {
    return { value: String(fullYears), unit: 'years old' };
  }

  if (fullMonths >= 1) {
    return { value: String(fullMonths), unit: 'months old' };
  }

  return { value: String(Math.max(totalDays, 0)), unit: 'days old' };
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function normalizeAnimalSex(sex: unknown): AnimalSex {
  return sex === 'male' ? 'male' : 'female';
}

function parseDateValue(value: string) {
  const [dayPart, monthPart, yearPart] = value.trim().split(/\s+/);

  if (!dayPart || !monthPart || !yearPart) {
    return null;
  }

  const day = Number(dayPart);
  const year = Number(yearPart);
  const month = MONTH_INDEX[monthPart.toLowerCase()];

  if (!Number.isFinite(day) || !Number.isFinite(year) || month === undefined) {
    return null;
  }

  return new Date(year, month, day);
}

function getPickerTitle(picker: PickerKey | null) {
  switch (picker) {
    case 'status':
      return 'Select status';
    case 'weightUnit':
      return 'Select unit';
    case 'farm':
      return 'Select farm';
    case 'paddock':
      return 'Select paddock';
    case 'group':
      return 'Select group';
    default:
      return '';
  }
}

function getPickerOptions(picker: PickerKey | null, farms: string[], paddocks: string[], groups: string[]) {
  switch (picker) {
    case 'status':
      return STATUS_OPTIONS;
    case 'weightUnit':
      return WEIGHT_UNITS;
    case 'farm':
      return farms;
    case 'paddock':
      return paddocks;
    case 'group':
      return groups;
    default:
      return [];
  }
}

function getPickerValue(
  picker: PickerKey | null,
  status: AnimalStatus,
  weightUnit: AnimalWeightUnit,
  farm: string,
  paddock: string,
  group: string,
) {
  switch (picker) {
    case 'status':
      return status;
    case 'weightUnit':
      return weightUnit;
    case 'farm':
      return farm;
    case 'paddock':
      return paddock;
    case 'group':
      return group;
    default:
      return '';
  }
}

function applyPickerSelection(
  option: string,
  picker: PickerKey | null,
  setStatus: (value: AnimalStatus) => void,
  setWeightUnit: (value: AnimalWeightUnit) => void,
  setFarm: (value: string) => void,
  setPaddock: (value: string) => void,
  setGroup: (value: string) => void,
) {
  switch (picker) {
    case 'status':
      setStatus(option as AnimalStatus);
      break;
    case 'weightUnit':
      setWeightUnit(option as AnimalWeightUnit);
      break;
    case 'farm':
      setFarm(option);
      break;
    case 'paddock':
      setPaddock(option);
      break;
    case 'group':
      setGroup(option);
      break;
  }
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};
