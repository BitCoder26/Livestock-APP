import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, Image, Modal, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Text } from '../src/theme/text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, type AppIconName } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { SPECIES_OPTIONS } from '../src/constants/records';
import { getSpeciesThemeByLabel, getSpeciesThemeByTone } from '../src/constants/speciesTheme';
import { useAccount } from '../src/context/AccountContext';
import { useAnimals } from '../src/context/AnimalsContext';
import { useCollectives } from '../src/context/CollectivesContext';
import { type RecordImpactChange, useRecords } from '../src/context/RecordsContext';
import { type FarmEntity, type LocationEntity, useSetup } from '../src/context/SetupContext';
import { formatCurrencyAmount } from '../src/entities/account';
import type { Animal, AnimalTone } from '../src/entities/animal';
import { getCollectiveCount, type Collective } from '../src/entities/collective';
import type { RecordEntry } from '../src/entities/record';
import {
  ANIMAL_CARD_AVATAR_ICON_SIZE,
  ANIMAL_CARD_AVATAR_RADIUS,
  ANIMAL_CARD_AVATAR_SIZE,
  tokens,
} from '../src/theme/tokens';
import { formatDateForDisplay } from '../src/utils/dateFormat';
import { useThumbnailUri } from '../src/utils/useThumbnailUri';
import { findRecordAnimals } from '../src/utils/recordAnimals';
import {
  changesHeadCount,
  collectiveLabel,
  findRecordCollective,
  isCollectiveRecord,
} from '../src/utils/recordCollectives';
import { getRecordDisplayTitle, resolveFarmName, resolveLocationName } from '../src/utils/recordLocations';
import { getStructuredDetailLabels, stripStructuredDetailLines } from '../src/utils/recordNotes';

const SCREEN_WIDTH = Dimensions.get('window').width;

const SPECIES_ICONS = new Map<string, AppIconName>(
  SPECIES_OPTIONS.map((item) => [item.label, item.icon]),
);

export default function ViewRecordScreen() {
  const router = useRouter();
  const { recordId } = useLocalSearchParams<{ recordId?: string }>();
  const { profile } = useAccount();
  const { records, deleteRecord, previewDeleteRecordImpact } = useRecords();
  const { animals } = useAnimals();
  const { collectives, syncRecordCountEvent } = useCollectives();
  const { farmEntities, locationEntities } = useSetup();

  const record = useMemo(
    () => (recordId ? records.find((entry) => entry.id === recordId) ?? null : null),
    [recordId, records],
  );

  const relatedAnimals = useMemo(() => {
    if (!record || isCollectiveRecord(record)) {
      return [];
    }

    return findRecordAnimals(record, animals);
  }, [animals, record]);

  const relatedCollective = useMemo(
    () => (record ? findRecordCollective(record, collectives) : null),
    [collectives, record],
  );

  const primaryImageUri = record?.imageUris?.[0] ?? null;
  const singleRelatedAnimal = relatedAnimals.length === 1 ? relatedAnimals[0] : null;
  // Deleting an animal keeps its records, which carry frozen `animal` and
  // `animalTag` text. So a record can name an animal that no longer resolves —
  // it still gets a card, the same way a record for a deleted herd does.
  const namedMissingAnimal = Boolean(
    record &&
      !isCollectiveRecord(record) &&
      relatedAnimals.length === 0 &&
      (record.animal?.trim() || record.animalTag?.trim()),
  );
  const visibleDetails = record ? getVisibleRecordDetails(record) : '';

  // The dropdown is drawn in a Modal so it can escape the ScrollView's
  // clipping, which puts it in the window's coordinate space — so the top bar
  // button is measured and the menu placed at those coordinates.
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [actionsAnchor, setActionsAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const moreRef = useRef<View | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteImpact, setDeleteImpact] = useState<RecordImpactChange[]>([]);

  const birthAnimal = useMemo(
    () => (record?.type === 'Birth' ? findRecordAnimals(record, animals)[0] ?? null : null),
    [animals, record],
  );

  const openActionsMenu = () => {
    moreRef.current?.measureInWindow((x, y, width, height) => {
      setActionsAnchor({ x, y, width, height });
    });
    setShowActionsMenu(true);
  };

  const handleEditRecord = () => {
    if (!record) {
      return;
    }

    setShowActionsMenu(false);
    router.push(
      isCollectiveRecord(record)
        ? { pathname: '/add-collective-record', params: { recordId: record.id } }
        : { pathname: '/edit-record', params: { recordId: record.id } },
    );
  };

  const handleDeleteRecord = () => {
    if (!record) {
      return;
    }

    setShowActionsMenu(false);
    setDeleteImpact(isCollectiveRecord(record) ? [] : previewDeleteRecordImpact(record.id));
    setShowDeleteConfirm(true);
  };

  // Mirrors the edit screens: a herd/flock record has to undo its own head
  // count event first, while a single-animal record is deleted by the Records
  // tab so the row can play its exit animation on the way out.
  const confirmDeleteRecord = async () => {
    if (!record) {
      return;
    }

    setShowDeleteConfirm(false);

    if (isCollectiveRecord(record)) {
      await syncRecordCountEvent(record.id, null);
      const result = await deleteRecord(record.id);

      if (!result.ok) {
        Alert.alert('Could not delete', 'This record could not be deleted. Please try again.');
        return;
      }
    }

    router.replace({
      pathname: '/(tabs)/records',
      params: { deletingRecordId: record.id },
    });
  };

  const handleShareRecord = async () => {
    if (!record) {
      Alert.alert('Record not found', 'There is no record to share right now.');
      return;
    }

    const shareSections = [
      record.type,
      getDisplayTitle(record, farmEntities, locationEntities),
      ...buildSummaryDetails(
        record,
        !isCollectiveRecord(record) && relatedAnimals.length === 0 && !namedMissingAnimal,
        profile.dateFormat,
        profile.currency,
        farmEntities,
        locationEntities,
      ).map((item) => `${item.label}: ${item.value}`),
      visibleDetails ? `Details: ${visibleDetails}` : '',
    ].filter(Boolean);

    try {
      await Share.share({
        title: record.type,
        message: shareSections.join('\n'),
      });
    } catch {
      Alert.alert('Share unavailable', 'Unable to open the share sheet right now.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="View Record"
        leftAction={{
          icon: 'back',
          accessibilityLabel: 'Back',
          onPress: () => router.back(),
        }}
        actions={
          record
            ? [
                {
                  icon: 'more-vertical',
                  accessibilityLabel: 'Record options',
                  onPress: openActionsMenu,
                  size: 28,
                  anchorRef: moreRef,
                },
              ]
            : []
        }
      />
      <ScrollView contentContainerStyle={[styles.content, !record ? styles.contentEmpty : undefined]} showsVerticalScrollIndicator={false}>
        {record ? (
          <View style={styles.summarySection}>
            <View style={styles.summaryHeader}>
              <View style={styles.summaryHeaderMain}>
                {primaryImageUri ? <Image source={{ uri: primaryImageUri }} style={styles.summaryProfileImage} /> : null}
                <View style={styles.summaryIdentity}>
                  <Text style={styles.summaryId}>{record.type}</Text>
                  <Text style={styles.summaryName}>{getDisplayTitle(record, farmEntities, locationEntities)}</Text>
                  <Text style={styles.summaryMeta}>{getSummaryMeta(record, profile.dateFormat)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.summaryDetails}>
              {buildSummaryDetails(
                record,
                !isCollectiveRecord(record) && relatedAnimals.length === 0 && !namedMissingAnimal,
                profile.dateFormat,
                profile.currency,
                farmEntities,
                locationEntities,
              ).map((item) => (
                <SummaryDetail key={item.label} label={item.label} value={item.value} />
              ))}
            </View>

            {isCollectiveRecord(record) ? (
              <View style={styles.singleAnimalSection}>
                <Text style={styles.animalsTitle}>Herd or flock</Text>
                <CollectiveNavigationRow record={record} collective={relatedCollective} />
              </View>
            ) : singleRelatedAnimal ? (
              <View style={styles.singleAnimalSection}>
                <Text style={styles.animalsTitle}>Animal</Text>
                <AnimalNavigationRow animal={singleRelatedAnimal} />
              </View>
            ) : relatedAnimals.length > 1 ? (
              <View style={styles.animalsSection}>
                <Text style={styles.animalsTitle}>{`Animals (${relatedAnimals.length})`}</Text>
                <View style={styles.animalsList}>
                  {relatedAnimals.map((animal) => (
                    <AnimalNavigationRow key={animal.uid} animal={animal} />
                  ))}
                </View>
              </View>
            ) : namedMissingAnimal ? (
              <View style={styles.singleAnimalSection}>
                <Text style={styles.animalsTitle}>Animal</Text>
                <MissingAnimalRow record={record} />
              </View>
            ) : null}

            {visibleDetails ? (
              <View style={styles.summaryNotes}>
                <Text style={styles.summaryLabel}>Details</Text>
                <Text style={styles.summaryNotesText}>{visibleDetails}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <AppIcon name="records_" size={80} color="#E5E0E7" opacity={1} />
            <Text style={styles.emptyTitle}>Record not found</Text>
            <Text style={styles.emptyText}>Return and open a record card again.</Text>
          </View>
        )}
      </ScrollView>

      <Modal
        animationType="none"
        transparent
        visible={showActionsMenu}
        onRequestClose={() => setShowActionsMenu(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setShowActionsMenu(false)}>
          <View
            style={[
              styles.menuCard,
              actionsAnchor
                ? {
                    top: actionsAnchor.y + actionsAnchor.height + 6,
                    right: Math.max(12, SCREEN_WIDTH - (actionsAnchor.x + actionsAnchor.width)),
                  }
                : styles.menuFallback,
            ]}
          >
            <BouncyPressable
              accessibilityLabel="Share record"
              accessibilityRole="button"
              onPress={() => {
                setShowActionsMenu(false);
                void handleShareRecord();
              }}
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
            >
              <View style={styles.menuIcon}>
                <AppIcon name="share-outline" size={24} color={tokens.colors.text} />
              </View>
              <Text style={styles.menuText}>Share</Text>
            </BouncyPressable>
            <BouncyPressable
              accessibilityLabel="Edit record"
              accessibilityRole="button"
              onPress={handleEditRecord}
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
            >
              <View style={styles.menuIcon}>
                <AppIcon name="edit" size={24} color={tokens.colors.text} />
              </View>
              <Text style={styles.menuText}>Edit</Text>
            </BouncyPressable>
            <BouncyPressable
              accessibilityLabel="Delete record"
              accessibilityRole="button"
              onPress={handleDeleteRecord}
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
            >
              <View style={styles.menuIcon}>
                <AppIcon name="trash" size={24} color={tokens.colors.danger} />
              </View>
              <Text style={[styles.menuText, styles.menuTextDanger]}>Delete</Text>
            </BouncyPressable>
          </View>
        </Pressable>
      </Modal>

      {/* No animation: confirming routes straight back to the list, and RN's
          Modal fade is a fixed ~300ms that plays over the top of that
          transition. Dismissing instantly hands the screen back immediately. */}
      <Modal
        animationType="none"
        transparent
        visible={showDeleteConfirm}
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <Pressable style={styles.centeredModalBackdrop} onPress={() => setShowDeleteConfirm(false)}>
          <Pressable style={styles.deleteConfirmCard} onPress={() => undefined}>
            <Text style={styles.deleteConfirmTitle}>Delete record?</Text>
            <Text style={styles.deleteConfirmText}>
              {record && isCollectiveRecord(record) && changesHeadCount(record.type)
                ? 'The head count change this record made is undone with it. This action cannot be undone.'
                : 'This action cannot be undone.'}
            </Text>
            {record?.type === 'Birth' ? (
              <Text style={styles.deleteConfirmText}>
                {birthAnimal
                  ? `${birthAnimal.name.trim() || birthAnimal.id} (${birthAnimal.id}) will stay in your Animals list, but will no longer be linked to a birth or mother record.`
                  : 'The animal this record created (if it still exists) will stay in your Animals list, but will no longer be linked to a birth or mother record.'}
              </Text>
            ) : null}
            {deleteImpact.length > 0 ? (
              <View style={styles.impactList}>
                {deleteImpact.map((change, index) => (
                  <Text key={`${change.animalUid}-${change.dimension}-${index}`} style={styles.impactLine}>
                    {formatImpactLine(change)}
                  </Text>
                ))}
              </View>
            ) : null}
            <View style={styles.deleteConfirmActions}>
              <BouncyPressable
                accessibilityLabel="Cancel delete"
                accessibilityRole="button"
                containerStyle={{ flex: 1 }}
                onPress={() => setShowDeleteConfirm(false)}
                style={({ pressed }) => [styles.deleteCancelButton, pressed && styles.cardPressed]}
              >
                <Text style={styles.deleteCancelButtonText}>Cancel</Text>
              </BouncyPressable>
              <BouncyPressable
                accessibilityLabel="Confirm delete record"
                accessibilityRole="button"
                containerStyle={{ flex: 1 }}
                onPress={() => void confirmDeleteRecord()}
                style={({ pressed }) => [styles.deleteConfirmButton, pressed && styles.cardPressed]}
              >
                <Text style={styles.deleteConfirmButtonText}>Delete</Text>
              </BouncyPressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function formatImpactLine(change: RecordImpactChange) {
  const dimensionLabel =
    change.dimension === 'weight' ? 'weight' : change.dimension === 'location' ? 'location' : 'status';

  return `${change.animalLabel}'s ${dimensionLabel} will change from ${change.before} to ${change.after}.`;
}

function SummaryDetail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryDetail}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value.trim() || 'Not set'}</Text>
    </View>
  );
}

function AnimalNavigationRow({ animal }: { animal: Animal }) {
  const router = useRouter();

  return (
    <BouncyPressable
      accessibilityRole="button"
      accessibilityLabel={`View animal ${animal.name.trim() || animal.id}`}
      onPress={() =>
        router.push({
          pathname: '/animal-timeline',
          params: { animalUid: animal.uid },
        })
      }
      style={({ pressed }) => [styles.animalRow, pressed && styles.cardPressed]}
    >
      <AnimalAvatar animal={animal} />
      <View style={styles.animalCopy}>
        <Text style={styles.animalName}>{animal.name.trim() || 'Unnamed animal'}</Text>
        <Text style={styles.animalMeta}>{`${animal.id} • ${animal.species}`}</Text>
      </View>
      <AppIcon name="chevron-right-bold" size={22} color={tokens.colors.text} />
    </BouncyPressable>
  );
}

function CollectiveNavigationRow({
  record,
  collective,
}: {
  record: RecordEntry;
  collective: Collective | null;
}) {
  const router = useRouter();
  const label = collective
    ? collectiveLabel(collective)
    : record.collectiveName?.trim() || record.collectiveId?.trim() || 'Herd or flock';
  const species = collective?.species ?? record.species;
  const theme = getSpeciesThemeByLabel(species);
  const icon = SPECIES_ICONS.get(species) ?? 'animals3';

  // A deleted collective leaves the record readable but with nowhere to go.
  if (!collective) {
    return (
      <View style={styles.animalRow}>
        <View style={[styles.speciesIconBadge, { backgroundColor: theme.chipBackground }]}>
          <AppIcon name={icon} size={ANIMAL_CARD_AVATAR_ICON_SIZE} color={theme.icon} />
        </View>
        <View style={styles.animalCopy}>
          <Text style={styles.animalName}>{label}</Text>
          <Text style={styles.animalMeta}>No longer on this farm</Text>
        </View>
      </View>
    );
  }

  return (
    <BouncyPressable
      accessibilityRole="button"
      accessibilityLabel={`View herd or flock ${label}`}
      onPress={() =>
        router.push({ pathname: '/view-collective', params: { collectiveUid: collective.uid } })
      }
      style={({ pressed }) => [styles.animalRow, pressed && styles.cardPressed]}
    >
      <View style={[styles.speciesIconBadge, { backgroundColor: theme.chipBackground }]}>
        <AppIcon name={icon} size={ANIMAL_CARD_AVATAR_ICON_SIZE} color={theme.icon} />
      </View>
      <View style={styles.animalCopy}>
        <Text style={styles.animalName}>{label}</Text>
        <Text style={styles.animalMeta}>
          {`${collective.species} • ${getCollectiveCount(collective)} animals`}
        </Text>
      </View>
      <AppIcon name="chevron-right-bold" size={22} color={tokens.colors.text} />
    </BouncyPressable>
  );
}

// A deleted animal leaves the record readable but with nowhere to go — the
// same shape CollectiveNavigationRow uses for a deleted herd or flock.
function MissingAnimalRow({ record }: { record: RecordEntry }) {
  const theme = getSpeciesThemeByLabel(record.species);
  const name = record.animal?.trim();
  const tag = record.animalTag?.trim();
  const label = name || tag || 'Animal';
  // The tag only earns a place in the meta when the name is carrying the title
  // line — otherwise it is already the label and would read twice.
  const meta = name && tag ? `${tag} • No longer on this farm` : 'No longer on this farm';

  return (
    <View style={styles.animalRow}>
      <View style={[styles.speciesIconBadge, { backgroundColor: theme.chipBackground }]}>
        <AppIcon
          name={SPECIES_ICONS.get(record.species) ?? 'animals3'}
          size={ANIMAL_CARD_AVATAR_ICON_SIZE}
          color={theme.icon}
        />
      </View>
      <View style={styles.animalCopy}>
        <Text style={styles.animalName}>{label}</Text>
        <Text style={styles.animalMeta}>{meta}</Text>
      </View>
    </View>
  );
}

function AnimalAvatar({ animal }: { animal: Animal }) {
  // A row in the record's animal list, so it draws the thumbnail.
  const imageUri = useThumbnailUri(animal.showImageOnCard ? animal.imageUris?.[0] : null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [animal.uid, imageUri]);

  if (imageUri && !imageFailed) {
    return <Image source={{ uri: imageUri }} style={styles.animalPhoto} onError={() => setImageFailed(true)} />;
  }

  const theme = getSpeciesThemeByTone(animal.tone);

  return (
    <View style={[styles.speciesIconBadge, { backgroundColor: theme.chipBackground }] }>
      <AppIcon
        name={getSpeciesIconName(animal.species, animal.tone)}
        size={ANIMAL_CARD_AVATAR_ICON_SIZE}
        color={theme.icon}
      />
    </View>
  );
}

function getDisplayTitle(record: RecordEntry, farms: FarmEntity[], locations: LocationEntity[]) {
  const cleanedTitle = stripRecordType(getRecordDisplayTitle(record, farms, locations), record.type);
  return cleanedTitle || record.recordTitle?.trim() || 'Untitled record';
}

function getSummaryMeta(record: RecordEntry, dateFormat: Parameters<typeof formatDateForDisplay>[1]) {
  return [formatDateForDisplay(record.date, dateFormat).trim(), record.species.trim()].filter(Boolean).join(' • ') || 'Record details';
}

function buildSummaryDetails(
  record: RecordEntry,
  includeAnimalFallback: boolean,
  dateFormat: Parameters<typeof formatDateForDisplay>[1],
  fallbackCurrencyCode: string,
  farms: FarmEntity[],
  locations: LocationEntity[],
) {
  return [
    { label: 'Date', value: formatDateForDisplay(record.date, dateFormat) },
    ...(includeAnimalFallback
      ? [
          { label: 'Animal(s)', value: record.animal },
          { label: 'Animal ID / Tag', value: record.animalTag },
        ]
      : []),
    { label: 'Species', value: record.species },
    // Headcount stores a signed delta here rather than a quantity, and shows
    // it as "Change" among its own details instead.
    ...(record.affectedCount?.trim() && record.type !== 'Headcount'
      ? [{ label: 'Animals Affected', value: record.affectedCount.trim() }]
      : []),
    ...getTypeSpecificDetails(record, fallbackCurrencyCode, farms, locations),
  ].filter((item) => item.value.trim().length > 0);
}

function getVisibleRecordDetails(record: RecordEntry) {
  return stripStructuredDetailLines(record.details, getStructuredDetailLabels(record.type)).trim();
}

function getTypeSpecificDetails(
  record: RecordEntry,
  fallbackCurrencyCode: string,
  farms: FarmEntity[],
  locations: LocationEntity[],
) {
  const currencyCode = getRecordCurrencyCode(record, fallbackCurrencyCode);

  switch (record.type) {
    case 'Movement':
      return [
        { label: 'From Farm', value: resolveFarmName(record.fromFarmUid, record.fromFarm, farms) },
        { label: 'From Location', value: resolveLocationName(record.fromLocationUid, record.fromLocation, locations) },
        { label: 'To Farm', value: resolveFarmName(record.toFarmUid, record.toFarm, farms) },
        { label: 'To Location', value: resolveLocationName(record.toLocationUid, record.toLocation, locations) },
      ];
    case 'Vaccination':
    case 'Medication':
      return [
        { label: 'Medicine / Vaccine', value: record.medicine ?? '' },
        { label: 'Dose', value: formatDose(record) },
        { label: 'Route', value: record.route ?? '' },
        { label: 'Meat Withdrawal', value: record.withdrawal ?? '' },
        { label: 'Milk Withdrawal', value: record.milkWithdrawal ?? '' },
        { label: 'Batch / Lot No.', value: record.batchNumber ?? '' },
        { label: 'Expiry Date', value: record.expiryDate ?? '' },
      ];
    case 'Weight':
      return [
        // A collective weighs a sample, so its Weight record is an average and
        // says so; an individual's is just its weight.
        { label: record.collectiveUid ? 'Average Weight' : 'Weight', value: formatWeight(record) },
        { label: 'Sample Size', value: record.sampleSize ?? '' },
      ];
    case 'Feed':
      return [
        { label: 'Feed Type', value: record.feedType ?? '' },
        { label: 'Quantity', value: formatFeedQuantity(record) },
        { label: 'Cost', value: record.cost ? formatCurrencyAmount(record.cost, currencyCode) : '' },
      ];
    case 'Egg Production':
      return [
        { label: 'Eggs Collected', value: record.eggsCollected ?? '' },
        { label: 'Damaged / Cracked', value: record.eggsDamaged ?? '' },
      ];
    case 'Headcount':
      return [
        { label: 'New Headcount', value: record.newCount ?? '' },
        { label: 'Change', value: formatCountChange(record.affectedCount) },
      ];
    case 'Other':
      return [{ label: 'Cost', value: record.cost ? formatCurrencyAmount(record.cost, currencyCode) : '' }];
    case 'Health Check':
      return [
        { label: 'Health Status', value: record.healthStatus ?? '' },
        { label: 'Diagnosis', value: record.conditionDiagnosis ?? '' },
        { label: 'Vet Seen', value: record.vetSeen ?? '' },
      ];
    case 'Death':
    case 'Deaths':
      return [
        { label: 'Cause of Death', value: record.causeOfDeath ?? '' },
        { label: 'Disposal Method', value: record.disposalMethod ?? '' },
      ];
    case 'Birth':
      return [
        { label: 'Mother', value: record.motherName ?? '' },
        { label: 'Birth Tag / ID', value: record.birthTagId ?? '' },
        { label: 'Birth Species', value: record.birthSpecies ?? '' },
        { label: 'Birth Breed', value: record.birthBreed ?? '' },
        { label: 'Birth Sex', value: capitalize(record.birthSex ?? '') },
        { label: 'Birth Weight', value: formatBirthWeight(record) },
      ];
    case 'Sale':
      return [
        { label: 'Buyer', value: record.buyer ?? '' },
        { label: 'Sale Price', value: record.salePrice ? formatCurrencyAmount(record.salePrice, currencyCode) : '' },
        { label: 'Destination', value: record.destination ?? '' },
      ];
    case 'Purchase':
      return [
        { label: 'Seller', value: record.seller ?? '' },
        { label: 'Purchase Price', value: record.purchasePrice ? formatCurrencyAmount(record.purchasePrice, currencyCode) : '' },
        { label: 'Source Farm', value: record.sourceFarm ?? '' },
      ];
    default:
      return [];
  }
}

function getRecordCurrencyCode(record: RecordEntry, fallbackCurrencyCode: string) {
  if (record.currencyCode?.trim()) {
    return record.currencyCode.trim();
  }

  const legacyPriceLine = record.details
    .split(/\n+/)
    .find((line) => /^(?:Sale|Purchase) Price:/i.test(line.trim()));
  const legacyCurrencyCode = legacyPriceLine?.match(/\b[A-Z]{3}\b/)?.[0];

  return legacyCurrencyCode ?? fallbackCurrencyCode;
}

function formatDose(record: RecordEntry) {
  const parts = [record.dose?.trim() ?? '', record.doseUnit?.trim() ?? ''].filter(Boolean);
  return parts.join(' ');
}

/**
 * A Headcount's stored delta, shown with its sign so the direction is plain.
 * A zero delta is a real result, not a missing one — the keeper counted and
 * the app was already right — so it says so rather than rendering blank.
 */
function formatCountChange(affectedCount: string | undefined) {
  const delta = Number.parseInt(affectedCount?.trim() ?? '', 10);

  if (!Number.isFinite(delta)) {
    return '';
  }

  if (delta === 0) {
    return 'No change';
  }

  return delta > 0 ? `+${delta}` : String(delta);
}

function formatFeedQuantity(record: RecordEntry) {
  return [record.feedQuantity?.trim() ?? '', record.feedUnit?.trim() ?? ''].filter(Boolean).join(' ');
}

function formatWeight(record: RecordEntry) {
  const parts = [record.weight?.trim() ?? '', record.weightUnit?.trim() ?? ''].filter(Boolean);
  return parts.join(' ');
}

function formatBirthWeight(record: RecordEntry) {
  const parts = [record.birthWeight?.trim() ?? '', record.birthWeightUnit?.trim() ?? ''].filter(Boolean);
  return parts.join(' ');
}

function capitalize(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : '';
}

function stripRecordType(title: string, type: string) {
  const trimmedTitle = title.trim();
  const prefix = `${type.trim()}:`;
  return trimmedTitle.startsWith(prefix) ? trimmedTitle.slice(prefix.length).trim() : trimmedTitle;
}

function getSpeciesIconName(species: string, tone: AnimalTone) {
  const normalized = species.trim().toLowerCase();

  if (normalized.includes('cattle') || normalized.includes('cow')) return 'cow-copy';
  if (normalized.includes('sheep')) return 'sheep-black';
  if (normalized.includes('pig')) return 'pig';
  if (normalized.includes('goat')) return 'goat';
  if (normalized.includes('chicken')) return 'chicken';
  if (normalized.includes('duck')) return 'duck';
  if (normalized.includes('turkey')) return 'turkey';
  if (normalized.includes('goose')) return 'goose';
  if (normalized.includes('donkey')) return 'donkey';
  if (normalized.includes('horse')) return 'horse';
  if (normalized.includes('buffalo') || normalized.includes('bison')) return 'bison';
  if (normalized.includes('rabbit')) return 'rabbit';
  if (normalized.includes('alpaca')) return 'alpaca';
  if (normalized.includes('llama')) return 'llama';
  if (normalized.includes('camel')) return 'camel';
  if (normalized.includes('ostrich')) return 'ostrich';

  return getToneFallback(tone);
}

function getToneFallback(tone: AnimalTone) {
  switch (tone) {
    case 'pig':
      return 'pig';
    case 'sheep':
      return 'sheep-black';
    case 'goat':
      return 'goat';
    case 'poultry':
      return 'chicken';
    case 'equine':
      return 'horse';
    case 'camelid':
      return 'camel';
    case 'neutral':
      return 'animals';
    default:
      return 'cow-copy';
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 40,
    gap: 16,
  },
  contentEmpty: {
    flexGrow: 1,
  },
  summarySection: {
    paddingHorizontal: 4,
    paddingTop: 2,
    paddingBottom: 16,
    gap: 16,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  summaryHeaderMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  summaryIdentity: {
    flex: 1,
    gap: 3,
    paddingTop: 4,
  },
  summaryProfileImage: {
    width: 78,
    height: 78,
    borderRadius: 20,
    backgroundColor: tokens.colors.surfaceMuted,
  },
  summaryId: {
    color: tokens.colors.text,
    fontSize: 23,
    fontWeight: '700',
  },
  summaryName: {
    color: tokens.colors.textSoft,
    fontSize: 15,
    fontWeight: '500',
  },
  summaryMeta: {
    color: tokens.colors.text,
    fontSize: 13,
    fontWeight: '500',
  },
  summaryDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 18,
    rowGap: 15,
  },
  summaryDetail: {
    width: '47%',
    gap: 3,
  },
  summaryLabel: {
    color: tokens.colors.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  summaryValue: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  singleAnimalSection: {
    gap: 8,
  },
  animalsSection: {
    gap: 12,
  },
  animalsTitle: {
    color: tokens.colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  animalsList: {
    gap: 10,
  },
  animalRow: {
    backgroundColor: tokens.colors.surface,
    borderRadius: 18,
    minHeight: 84,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#DDD5D3',
    shadowColor: '#3B2B28',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  animalPhoto: {
    width: ANIMAL_CARD_AVATAR_SIZE,
    height: ANIMAL_CARD_AVATAR_SIZE,
    borderRadius: ANIMAL_CARD_AVATAR_RADIUS,
    backgroundColor: tokens.colors.surfaceMuted,
  },
  // Matches the animal card's species badge on the Animals tab.
  speciesIconBadge: {
    width: ANIMAL_CARD_AVATAR_SIZE,
    height: ANIMAL_CARD_AVATAR_SIZE,
    borderRadius: ANIMAL_CARD_AVATAR_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  animalCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  animalName: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  animalMeta: {
    color: tokens.colors.textSoft,
    fontSize: 13,
    fontWeight: '500',
  },
  summaryNotes: {
    gap: 5,
  },
  summaryNotesText: {
    color: tokens.colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 8,
  },
  emptyTitle: {
    marginTop: 12,
    color: '#E5E0E7',
    fontSize: 29,
    fontWeight: '700',
  },
  emptyText: {
    color: '#E5E0E7',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  cardPressed: {
    opacity: 0.92,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
  menuCard: {
    position: 'absolute',
    minWidth: 176,
    borderRadius: 16,
    backgroundColor: '#fff',
    paddingVertical: 6,
    paddingHorizontal: 6,
    gap: 2,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  menuFallback: {
    top: 120,
    right: 16,
  },
  menuRow: {
    minHeight: 44,
    borderRadius: 11,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  menuRowPressed: {
    backgroundColor: tokens.colors.surfaceMuted,
  },
  menuText: {
    flex: 1,
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  menuIcon: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTextDanger: {
    color: tokens.colors.danger,
  },
  centeredModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
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
  impactList: {
    marginTop: 12,
    gap: 6,
  },
  impactLine: {
    color: tokens.colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
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
});
