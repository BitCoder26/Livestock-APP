import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View, type TextStyle } from 'react-native';
import { Text } from '../src/theme/text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppTopBar } from '../src/components/AppTopBar';
import { SegmentedToggle } from '../src/components/SegmentedToggle';
import { useAccount } from '../src/context/AccountContext';
import { useAnimals } from '../src/context/AnimalsContext';
import { useCollectives } from '../src/context/CollectivesContext';
import { useRecords } from '../src/context/RecordsContext';
import { useSetup } from '../src/context/SetupContext';
import { tokens } from '../src/theme/tokens';
import { buildPdfDocument, createPdfFile, escapeHtml, resolveBusinessBranding, sharePdf } from '../src/utils/pdfExport';
import {
  buildActivitySummary,
  buildCollectiveOverview,
  buildFinancialSummary,
  buildHealthSummary,
  buildHerdOverview,
  buildProductionSummary,
  buildSetupSummary,
  REPORT_PERIOD_OPTIONS,
  type ActivitySummary,
  type BreakdownRow,
  type CollectiveOverview,
  type FinancialSummary,
  type HealthSummary,
  type HerdOverview,
  type ProductionSummary,
  type ReportPeriod,
  type SetupSummary,
} from '../src/utils/reports';

const PERIOD_EMPTY_SUFFIX: Record<ReportPeriod, string> = {
  all: 'yet',
  year: 'this year',
  month: 'this month',
};

// Used adverbially inline ("3 deaths recorded {phrase}") rather than after
// "No records added" — "yet" only reads correctly in the negative form, so
// this drops to an empty string for "All time" instead.
const PERIOD_RECORDED_SUFFIX: Record<ReportPeriod, string> = {
  all: '',
  year: 'this year',
  month: 'this month',
};

export default function ReportsScreen() {
  const router = useRouter();
  const { profile, isLoaded: accountLoaded } = useAccount();
  const { animals, isLoaded: animalsLoaded } = useAnimals();
  const { collectives, isLoaded: collectivesLoaded } = useCollectives();
  const { records, isLoaded: recordsLoaded } = useRecords();
  const { farmEntities, locationEntities, labelEntities, medicineEntities } = useSetup();
  const [period, setPeriod] = useState<ReportPeriod>('all');
  const sharingInProgress = useRef(false);

  const isLoaded = accountLoaded && animalsLoaded && collectivesLoaded && recordsLoaded;
  const periodSuffix = PERIOD_EMPTY_SUFFIX[period];
  const recordedSuffix = PERIOD_RECORDED_SUFFIX[period];

  const herdOverview = useMemo(
    () => buildHerdOverview(animals, farmEntities, locationEntities, labelEntities),
    [animals, farmEntities, locationEntities, labelEntities],
  );
  const collectiveOverview = useMemo(
    () => buildCollectiveOverview(collectives, farmEntities, locationEntities, labelEntities),
    [collectives, farmEntities, locationEntities, labelEntities],
  );
  const activitySummary = useMemo(() => buildActivitySummary(records, period), [records, period]);
  const financialSummary = useMemo(
    () => buildFinancialSummary(records, period, profile.currency),
    [records, period, profile.currency],
  );
  const productionSummary = useMemo(() => buildProductionSummary(records, period), [records, period]);
  const healthSummary = useMemo(
    () => buildHealthSummary(records, period, animals, collectives),
    [records, period, animals, collectives],
  );
  const setupSummary = useMemo(
    () =>
      buildSetupSummary({
        farms: farmEntities,
        locations: locationEntities,
        labels: labelEntities,
        medicines: medicineEntities,
        animals,
        collectives,
        records,
        dateFormat: profile.dateFormat,
      }),
    [
      farmEntities,
      locationEntities,
      labelEntities,
      medicineEntities,
      animals,
      collectives,
      records,
      profile.dateFormat,
    ],
  );

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/records');
  };

  const handleShare = async () => {
    if (sharingInProgress.current) {
      return;
    }

    sharingInProgress.current = true;

    try {
      const branding = await resolveBusinessBranding(profile);
      const html = buildReportPdfHtml({
        period,
        branding,
        herdOverview,
        collectiveOverview,
        activitySummary,
        financialSummary,
        productionSummary,
        healthSummary,
        setupSummary,
        periodSuffix,
        recordedSuffix,
      });
      const uri = await createPdfFile(html);
      await sharePdf(uri);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong while preparing the report.';
      Alert.alert('Share failed', message);
    } finally {
      sharingInProgress.current = false;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="Reports"
        leftAction={{ icon: 'back', accessibilityLabel: 'Back', onPress: handleBack }}
        actions={[{ icon: 'share-outline', accessibilityLabel: 'Share report', onPress: handleShare }]}
      />

      {!isLoaded ? null : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <SegmentedToggle<ReportPeriod>
            options={REPORT_PERIOD_OPTIONS.map((option) => ({
              key: option.value,
              label: option.label,
            }))}
            value={period}
            onChange={setPeriod}
          />

          <Section title="Individual Animals">
            {herdOverview.totalActive === 0 && herdOverview.soldCount === 0 && herdOverview.deceasedCount === 0 ? (
              <EmptyState message="No animals added yet." />
            ) : (
              <>
                <HeroStat value={herdOverview.totalActive} label="Active Animals" />
                <TileRow
                  boxed
                  tiles={[
                    { label: 'Active', value: String(herdOverview.totalActive) },
                    { label: 'Sold', value: String(herdOverview.soldCount) },
                    { label: 'Deceased', value: String(herdOverview.deceasedCount) },
                  ]}
                />
                <BreakdownGroup title="By species" rows={herdOverview.bySpecies} />
                <BreakdownGroup title="By breed" rows={herdOverview.byBreed} />
                <BreakdownGroup title="By sex" rows={herdOverview.bySex} />
                <BreakdownGroup title="By farm" rows={herdOverview.byFarm} />
                <BreakdownGroup title="By location" rows={herdOverview.byLocation} />
                <BreakdownGroup title="By label" rows={herdOverview.byLabel} />
                <BreakdownGroup title="By source" rows={herdOverview.bySource} />
              </>
            )}
          </Section>

          <Section title="Herds & Flocks">
            {collectiveOverview.totalGroups === 0 ? (
              <EmptyState message="No herds or flocks added yet." />
            ) : (
              <>
                <HeroStat value={collectiveOverview.totalHead} label="Animals in Herds & Flocks" />
                <TileRow
                  boxed
                  tiles={[
                    { label: 'Groups', value: String(collectiveOverview.totalGroups) },
                    { label: 'Active', value: String(collectiveOverview.activeGroups) },
                    { label: 'Inactive', value: String(collectiveOverview.inactiveGroups) },
                  ]}
                />
                <BreakdownGroup title="By herd or flock" rows={collectiveOverview.byGroup} hideEmptyRows={false} />
                <BreakdownGroup title="By species" rows={collectiveOverview.bySpecies} />
                <BreakdownGroup title="By breed" rows={collectiveOverview.byBreed} />
                <BreakdownGroup title="By farm" rows={collectiveOverview.byFarm} />
                <BreakdownGroup title="By location" rows={collectiveOverview.byLocation} />
                <BreakdownGroup title="By label" rows={collectiveOverview.byLabel} />
                <BreakdownGroup title="By purpose" rows={collectiveOverview.byPurpose} />
                {collectiveOverview.inactiveHead > 0 ? (
                  <Text style={styles.footnote}>
                    {collectiveOverview.inactiveHead} animal
                    {collectiveOverview.inactiveHead === 1 ? '' : 's'} in inactive groups, not counted above.
                  </Text>
                ) : null}
              </>
            )}
          </Section>

          <Section title="Activity">
            {activitySummary.rows.every((row) => row.count === 0) ? (
              <EmptyState message={`No records added ${periodSuffix}.`} />
            ) : (
              <>
                <BreakdownGroup rows={activitySummary.rows} hideEmptyRows={false} />
                <TileRow
                  title="Records"
                  boxed
                  tiles={[
                    { label: 'Individual', value: String(activitySummary.individualRecords) },
                    { label: 'Herd & flock', value: String(activitySummary.collectiveRecords) },
                    { label: 'Total', value: String(activitySummary.totalRecords) },
                  ]}
                />
                <TileRow
                  title="Animals"
                  boxed
                  tiles={[
                    { label: 'Added', value: String(activitySummary.added) },
                    { label: 'Removed', value: String(activitySummary.removed) },
                    { label: 'Net change', value: formatSignedNumber(activitySummary.net) },
                  ]}
                />
              </>
            )}
          </Section>

          <Section title="Sales, Purchases & Costs">
            <FinancialTiles summary={financialSummary} periodSuffix={periodSuffix} />
            {financialSummary.costsRecordCount > 0 ? (
              <TileRow
                title="Costs"
                boxed
                tiles={[
                  {
                    label: 'Feed',
                    value: formatCurrencySymbolOnly(financialSummary.feedCostsTotal, financialSummary.currencyCode),
                  },
                  {
                    label: 'Other',
                    value: formatCurrencySymbolOnly(financialSummary.otherCostsTotal, financialSummary.currencyCode),
                  },
                ]}
              />
            ) : null}
            <BreakdownGroup
              title="Sales by buyer"
              rows={financialSummary.byBuyer}
              formatCountValue={(value) => formatCurrencySymbolOnly(value, financialSummary.currencyCode)}
            />
            <BreakdownGroup
              title="Purchases by seller"
              rows={financialSummary.bySeller}
              formatCountValue={(value) => formatCurrencySymbolOnly(value, financialSummary.currencyCode)}
            />
            {financialSummary.excludedRecordCount > 0 ? (
              <Text style={styles.footnote}>
                {financialSummary.excludedRecordCount} record
                {financialSummary.excludedRecordCount === 1 ? '' : 's'} excluded (different currency).
              </Text>
            ) : null}
          </Section>

          <Section title="Feed & Production">
            {productionSummary.feedRecordCount === 0 && productionSummary.eggRecordCount === 0 ? (
              <EmptyState message={`No feed or egg records added ${periodSuffix}.`} />
            ) : (
              <>
                {productionSummary.feedRecordCount > 0 ? (
                  <>
                    <BreakdownGroup title="Feed recorded" rows={productionSummary.feedByUnit} />
                    <BreakdownGroup title="Feed records by type" rows={productionSummary.feedByType} />
                  </>
                ) : null}
                {productionSummary.eggRecordCount > 0 ? (
                  <TileRow
                    title="Eggs"
                    boxed
                    tiles={[
                      { label: 'Collected', value: formatCount(productionSummary.eggsCollected) },
                      { label: 'Damaged', value: formatCount(productionSummary.eggsDamaged) },
                      { label: 'Sellable', value: formatCount(productionSummary.eggsSellable) },
                    ]}
                  />
                ) : null}
              </>
            )}
          </Section>

          <Section title="Health & Treatments">
            {healthSummary.vaccinations === 0 &&
            healthSummary.medications === 0 &&
            healthSummary.healthChecks === 0 &&
            healthSummary.deaths === 0 &&
            healthSummary.animalsInWithdrawal === 0 &&
            healthSummary.collectivesInWithdrawal === 0 ? (
              <EmptyState message={`No health records added ${periodSuffix}.`} />
            ) : (
              <>
                <TileRow
                  boxed
                  tiles={[
                    { label: 'Vaccinations', value: String(healthSummary.vaccinations) },
                    { label: 'Medications', value: String(healthSummary.medications) },
                    { label: 'Health checks', value: String(healthSummary.healthChecks) },
                  ]}
                />
                <BreakdownGroup title="Medicines & vaccines used" rows={healthSummary.treatmentsByProduct} />
                <BreakdownGroup title="By route" rows={healthSummary.byRoute} />
                <BreakdownGroup title="Health check results" rows={healthSummary.healthCheckStatuses} />
                <BreakdownGroup title="Deaths by cause" rows={healthSummary.deathsByCause} />
                <BreakdownGroup title="Disposal method" rows={healthSummary.deathsByDisposal} />
                <Text style={styles.rowLabel}>
                  {healthSummary.deaths} death{healthSummary.deaths === 1 ? '' : 's'} recorded
                  {recordedSuffix ? ` ${recordedSuffix}` : ''}
                </Text>
                <Text style={styles.rowLabel}>
                  {healthSummary.vetVisits} health check{healthSummary.vetVisits === 1 ? '' : 's'} with the vet seen
                  {recordedSuffix ? ` ${recordedSuffix}` : ''}
                </Text>
                <Text style={styles.rowLabel}>
                  {healthSummary.animalsInWithdrawal === 0
                    ? 'No animals currently in withdrawal.'
                    : `${healthSummary.animalsInWithdrawal} animal${healthSummary.animalsInWithdrawal === 1 ? '' : 's'} currently in withdrawal.`}
                </Text>
                <Text style={styles.rowLabel}>
                  {healthSummary.collectivesInWithdrawal === 0
                    ? 'No herds or flocks currently in withdrawal.'
                    : `${healthSummary.collectivesInWithdrawal} herd${healthSummary.collectivesInWithdrawal === 1 ? '' : 's'} or flock${healthSummary.collectivesInWithdrawal === 1 ? '' : 's'} currently in withdrawal.`}
                </Text>
              </>
            )}
          </Section>

          <Section title="Farm Setup">
            {setupSummary.farmCount === 0 &&
            setupSummary.locationCount === 0 &&
            setupSummary.labelCount === 0 &&
            setupSummary.medicineCount === 0 &&
            setupSummary.vaccineCount === 0 ? (
              <EmptyState message="Nothing set up yet." />
            ) : (
              <>
                <TileRow
                  boxed
                  tiles={[
                    { label: 'Farms', value: String(setupSummary.farmCount) },
                    { label: 'Locations', value: String(setupSummary.locationCount) },
                    { label: 'Labels', value: String(setupSummary.labelCount) },
                  ]}
                />
                <TileRow
                  boxed
                  tiles={[
                    { label: 'Medicines', value: String(setupSummary.medicineCount) },
                    { label: 'Vaccines', value: String(setupSummary.vaccineCount) },
                  ]}
                />
                <BreakdownGroup
                  title="Farms · animals kept"
                  rows={setupSummary.farms}
                  hideEmptyRows={false}
                />
                <BreakdownGroup
                  title="Locations · animals kept"
                  rows={setupSummary.locations}
                  hideEmptyRows={false}
                />
                <BreakdownGroup
                  title="Labels · animals carrying"
                  rows={setupSummary.labels}
                  hideEmptyRows={false}
                />
                <BreakdownGroup
                  title="Medicines · times used"
                  rows={setupSummary.medicines}
                  hideEmptyRows={false}
                />
                <BreakdownGroup
                  title="Vaccines · times used"
                  rows={setupSummary.vaccines}
                  hideEmptyRows={false}
                />
              </>
            )}
          </Section>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function HeroStat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.heroWrap}>
      <Text style={styles.heroValue}>{value}</Text>
      <Text style={styles.heroLabel}>{label}</Text>
    </View>
  );
}

function TileRow({
  title,
  tiles,
  boxed = false,
}: {
  title?: string;
  tiles: { label: string; value: string; muted?: boolean; valueStyle?: TextStyle }[];
  boxed?: boolean;
}) {
  return (
    <View style={styles.tileGroup}>
      {title ? <GroupHeading title={title} /> : null}
      <View style={boxed ? styles.tileRowBoxed : styles.tileRow}>
        {tiles.map((tile, index) =>
          boxed ? (
            <View key={tile.label} style={[styles.tile, styles.tileBoxed]}>
              <Text style={[styles.tileValue, tile.muted && styles.tileValueMuted, tile.valueStyle]}>
                {tile.value}
              </Text>
              <Text style={styles.tileLabel}>{tile.label}</Text>
            </View>
          ) : (
            <View key={tile.label} style={styles.tileWrap}>
              {index > 0 ? <View style={styles.tileDivider} /> : null}
              <View style={styles.tile}>
                <Text style={[styles.tileValue, tile.muted && styles.tileValueMuted, tile.valueStyle]}>
                  {tile.value}
                </Text>
                <Text style={styles.tileLabel}>{tile.label}</Text>
              </View>
            </View>
          ),
        )}
      </View>
    </View>
  );
}

// Every small-caps heading is followed by its own rule, which is what marks
// where one breakdown ends and the next begins — the section titles are large
// enough to separate themselves.
function GroupHeading({ title }: { title: string }) {
  return (
    <>
      <Text style={styles.breakdownGroupTitle}>{title}</Text>
      <View style={styles.groupRule} />
    </>
  );
}

function BreakdownGroup({
  title,
  rows,
  hideEmptyRows = true,
  formatCountValue = formatCount,
}: {
  title?: string;
  rows: BreakdownRow[];
  hideEmptyRows?: boolean;
  /** Rows that report money rather than head count say so in the figure. */
  formatCountValue?: (value: number) => string;
}) {
  const visibleRows = hideEmptyRows ? rows.filter((row) => row.count > 0) : rows;

  if (visibleRows.length === 0) {
    return null;
  }

  return (
    <View style={styles.breakdownGroup}>
      {title ? <GroupHeading title={title} /> : null}
      {visibleRows.map((row) => (
        <View key={row.label} style={styles.breakdownRow}>
          <View style={styles.breakdownLabelWrap}>
            <Text style={styles.breakdownLabel} numberOfLines={1}>
              {row.label}
            </Text>
            {row.detail ? <Text style={styles.breakdownDetail}>{row.detail}</Text> : null}
          </View>
          <Text style={styles.breakdownCount}>{formatCountValue(row.count)}</Text>
        </View>
      ))}
    </View>
  );
}

function FinancialTiles({
  summary,
  periodSuffix,
}: {
  summary: ReturnType<typeof buildFinancialSummary>;
  periodSuffix: string;
}) {
  if (
    summary.salesRecordCount === 0 &&
    summary.purchasesRecordCount === 0 &&
    summary.costsRecordCount === 0
  ) {
    return <EmptyState message={`No sales, purchases or costs recorded ${periodSuffix}.`} />;
  }

  const netStyle =
    summary.net > 0 ? styles.netPositive : summary.net < 0 ? styles.netNegative : undefined;

  return (
    <>
      <View style={styles.heroWrap}>
        {/* Shrinks rather than wraps: a six-figure total at 40pt would other-
            wise break across two lines and stop reading as one number. */}
        <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.heroValue, netStyle]}>
          {formatCurrencySymbolOnly(summary.net, summary.currencyCode)}
        </Text>
        <Text style={styles.heroLabel}>Net recorded</Text>
      </View>
      <TileRow
        boxed
        tiles={[
          {
            label: 'Sales',
            value:
              summary.salesRecordCount === 0
                ? 'None'
                : formatCurrencySymbolOnly(summary.salesTotal, summary.currencyCode),
            muted: summary.salesRecordCount === 0,
          },
          {
            label: 'Purchases',
            value:
              summary.purchasesRecordCount === 0
                ? 'None'
                : formatCurrencySymbolOnly(summary.purchasesTotal, summary.currencyCode),
            muted: summary.purchasesRecordCount === 0,
          },
          {
            label: 'Costs',
            value:
              summary.costsRecordCount === 0
                ? 'None'
                : formatCurrencySymbolOnly(summary.costsTotal, summary.currencyCode),
            muted: summary.costsRecordCount === 0,
          },
        ]}
      />
    </>
  );
}

function EmptyState({ message }: { message: string }) {
  return <Text style={styles.emptyText}>{message}</Text>;
}

function formatSignedNumber(value: number) {
  return value > 0 ? `+${formatCount(value)}` : formatCount(value);
}

// Most figures in a report are whole animals, but feed quantities are typed
// freely and add up to fractions — rounding to two places keeps "12.5 kg"
// while stopping a float's tail from ending up on the page.
function formatCount(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

// Symbol + amount only (e.g. "£2,222.00") — unlike the shared
// formatCurrencyAmount helper used on individual records (which appends the
// currency code, useful there since records can each carry a different
// currency), every tile in this section is already the same base currency
// by construction (see buildFinancialSummary), so the code would just be
// repeated noise three times in a row.
function formatCurrencySymbolOnly(value: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode.trim().toUpperCase() || 'GBP',
      currencyDisplay: 'narrowSymbol',
    }).format(value);
  } catch {
    return String(value);
  }
}

// Mirrors the on-screen sections (Individual Animals / Herds & Flocks /
// Activity / Sales, Purchases & Costs / Feed & Production / Health &
// Treatments / Farm Setup) as a PDF summary — the thing a farmer hands to an
// accountant, vet, or landlord, as opposed to the Export tab's row-level
// PDF/CSV of every individual record or animal.
function buildReportPdfHtml({
  period,
  branding,
  herdOverview,
  collectiveOverview,
  activitySummary,
  financialSummary,
  productionSummary,
  healthSummary,
  setupSummary,
  periodSuffix,
  recordedSuffix,
}: {
  period: ReportPeriod;
  branding: Parameters<typeof buildPdfDocument>[0]['branding'];
  herdOverview: HerdOverview;
  collectiveOverview: CollectiveOverview;
  activitySummary: ActivitySummary;
  financialSummary: FinancialSummary;
  productionSummary: ProductionSummary;
  healthSummary: HealthSummary;
  setupSummary: SetupSummary;
  periodSuffix: string;
  recordedSuffix: string;
}) {
  const periodLabel = REPORT_PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? 'All time';
  const totalHead = herdOverview.totalActive + collectiveOverview.totalHead;
  const countLabel = `${totalHead} active ${totalHead === 1 ? 'animal' : 'animals'}`;
  const money = (value: number) => formatCurrencySymbolOnly(value, financialSummary.currencyCode);

  const hasHerd = herdOverview.totalActive > 0 || herdOverview.soldCount > 0 || herdOverview.deceasedCount > 0;
  const hasCollectives = collectiveOverview.totalGroups > 0;
  const hasActivity = activitySummary.rows.some((row) => row.count > 0);
  const hasFinancials =
    financialSummary.salesRecordCount > 0 ||
    financialSummary.purchasesRecordCount > 0 ||
    financialSummary.costsRecordCount > 0;
  const hasProduction = productionSummary.feedRecordCount > 0 || productionSummary.eggRecordCount > 0;
  const hasHealth =
    healthSummary.vaccinations > 0 ||
    healthSummary.medications > 0 ||
    healthSummary.healthChecks > 0 ||
    healthSummary.deaths > 0 ||
    healthSummary.animalsInWithdrawal > 0 ||
    healthSummary.collectivesInWithdrawal > 0;
  const hasSetup =
    setupSummary.farmCount > 0 ||
    setupSummary.locationCount > 0 ||
    setupSummary.labelCount > 0 ||
    setupSummary.medicineCount > 0 ||
    setupSummary.vaccineCount > 0;

  const herdSectionBody = hasHerd
    ? `${renderPdfHero(herdOverview.totalActive, 'Active Animals')}
       ${renderPdfTiles([
         { label: 'Active', value: String(herdOverview.totalActive) },
         { label: 'Sold', value: String(herdOverview.soldCount) },
         { label: 'Deceased', value: String(herdOverview.deceasedCount) },
       ])}
       ${renderPdfBreakdown('By species', herdOverview.bySpecies)}
       ${renderPdfBreakdown('By breed', herdOverview.byBreed)}
       ${renderPdfBreakdown('By sex', herdOverview.bySex)}
       ${renderPdfBreakdown('By farm', herdOverview.byFarm)}
       ${renderPdfBreakdown('By location', herdOverview.byLocation)}
       ${renderPdfBreakdown('By label', herdOverview.byLabel)}
       ${renderPdfBreakdown('By source', herdOverview.bySource)}`
    : renderPdfEmpty('No animals added yet.');

  const collectiveSectionBody = hasCollectives
    ? `${renderPdfHero(collectiveOverview.totalHead, 'Animals in Herds & Flocks')}
       ${renderPdfTiles([
         { label: 'Groups', value: String(collectiveOverview.totalGroups) },
         { label: 'Active', value: String(collectiveOverview.activeGroups) },
         { label: 'Inactive', value: String(collectiveOverview.inactiveGroups) },
       ])}
       ${renderPdfBreakdown('By herd or flock', collectiveOverview.byGroup, false)}
       ${renderPdfBreakdown('By species', collectiveOverview.bySpecies)}
       ${renderPdfBreakdown('By breed', collectiveOverview.byBreed)}
       ${renderPdfBreakdown('By farm', collectiveOverview.byFarm)}
       ${renderPdfBreakdown('By location', collectiveOverview.byLocation)}
       ${renderPdfBreakdown('By label', collectiveOverview.byLabel)}
       ${renderPdfBreakdown('By purpose', collectiveOverview.byPurpose)}
       ${
         collectiveOverview.inactiveHead > 0
           ? `<p class="pdf-note">${escapeHtml(
               `${collectiveOverview.inactiveHead} animal${collectiveOverview.inactiveHead === 1 ? '' : 's'} in inactive groups, not counted above.`,
             )}</p>`
           : ''
       }`
    : renderPdfEmpty('No herds or flocks added yet.');

  const activitySectionBody = hasActivity
    ? `${renderPdfBreakdown(null, activitySummary.rows, false)}
       ${renderPdfTiles([
         { label: 'Individual records', value: String(activitySummary.individualRecords) },
         { label: 'Herd & flock records', value: String(activitySummary.collectiveRecords) },
         { label: 'Total records', value: String(activitySummary.totalRecords) },
       ])}
       ${renderPdfTiles([
         { label: 'Animals added', value: formatCount(activitySummary.added) },
         { label: 'Animals removed', value: formatCount(activitySummary.removed) },
         { label: 'Net change', value: formatSignedNumber(activitySummary.net) },
       ])}`
    : renderPdfEmpty(`No records added ${periodSuffix}.`);

  const financialSectionBody = hasFinancials
    ? `${renderPdfHero(money(financialSummary.net), 'Net recorded')}
       ${renderPdfTiles([
         {
           label: 'Sales',
           value: financialSummary.salesRecordCount === 0 ? 'None' : money(financialSummary.salesTotal),
         },
         {
           label: 'Purchases',
           value: financialSummary.purchasesRecordCount === 0 ? 'None' : money(financialSummary.purchasesTotal),
         },
         {
           label: 'Costs',
           value: financialSummary.costsRecordCount === 0 ? 'None' : money(financialSummary.costsTotal),
         },
       ])}
       ${
         financialSummary.costsRecordCount > 0
           ? renderPdfTiles([
               { label: 'Feed costs', value: money(financialSummary.feedCostsTotal) },
               { label: 'Other costs', value: money(financialSummary.otherCostsTotal) },
             ])
           : ''
       }
       ${renderPdfBreakdown('Sales by buyer', financialSummary.byBuyer, true, money)}
       ${renderPdfBreakdown('Purchases by seller', financialSummary.bySeller, true, money)}
       ${
         financialSummary.excludedRecordCount > 0
           ? `<p class="pdf-note">${escapeHtml(
               `${financialSummary.excludedRecordCount} record${financialSummary.excludedRecordCount === 1 ? '' : 's'} excluded (different currency).`,
             )}</p>`
           : ''
       }`
    : renderPdfEmpty(`No sales, purchases or costs recorded ${periodSuffix}.`);

  const productionSectionBody = hasProduction
    ? `${renderPdfBreakdown('Feed recorded', productionSummary.feedByUnit)}
       ${renderPdfBreakdown('Feed records by type', productionSummary.feedByType)}
       ${
         productionSummary.eggRecordCount > 0
           ? renderPdfTiles([
               { label: 'Eggs collected', value: formatCount(productionSummary.eggsCollected) },
               { label: 'Eggs damaged', value: formatCount(productionSummary.eggsDamaged) },
               { label: 'Eggs sellable', value: formatCount(productionSummary.eggsSellable) },
             ])
           : ''
       }`
    : renderPdfEmpty(`No feed or egg records added ${periodSuffix}.`);

  const healthSectionBody = hasHealth
    ? `${renderPdfTiles([
        { label: 'Vaccinations', value: String(healthSummary.vaccinations) },
        { label: 'Medications', value: String(healthSummary.medications) },
        { label: 'Health checks', value: String(healthSummary.healthChecks) },
      ])}
       ${renderPdfBreakdown('Medicines & vaccines used', healthSummary.treatmentsByProduct)}
       ${renderPdfBreakdown('By route', healthSummary.byRoute)}
       ${renderPdfBreakdown('Health check results', healthSummary.healthCheckStatuses)}
       ${renderPdfBreakdown('Deaths by cause', healthSummary.deathsByCause)}
       ${renderPdfBreakdown('Disposal method', healthSummary.deathsByDisposal)}
       <p class="pdf-note">${escapeHtml(
         `${healthSummary.deaths} death${healthSummary.deaths === 1 ? '' : 's'} recorded${recordedSuffix ? ` ${recordedSuffix}` : ''}`,
       )}</p>
       <p class="pdf-note">${escapeHtml(
         `${healthSummary.vetVisits} health check${healthSummary.vetVisits === 1 ? '' : 's'} with the vet seen${recordedSuffix ? ` ${recordedSuffix}` : ''}`,
       )}</p>
       <p class="pdf-note">${escapeHtml(
         healthSummary.animalsInWithdrawal === 0
           ? 'No animals currently in withdrawal.'
           : `${healthSummary.animalsInWithdrawal} animal${healthSummary.animalsInWithdrawal === 1 ? '' : 's'} currently in withdrawal.`,
       )}</p>
       <p class="pdf-note">${escapeHtml(
         healthSummary.collectivesInWithdrawal === 0
           ? 'No herds or flocks currently in withdrawal.'
           : `${healthSummary.collectivesInWithdrawal} herd${healthSummary.collectivesInWithdrawal === 1 ? '' : 's'} or flock${healthSummary.collectivesInWithdrawal === 1 ? '' : 's'} currently in withdrawal.`,
       )}</p>`
    : renderPdfEmpty(`No health records added ${periodSuffix}.`);

  const setupSectionBody = hasSetup
    ? `${renderPdfTiles([
        { label: 'Farms', value: String(setupSummary.farmCount) },
        { label: 'Locations', value: String(setupSummary.locationCount) },
        { label: 'Labels', value: String(setupSummary.labelCount) },
        { label: 'Medicines', value: String(setupSummary.medicineCount) },
        { label: 'Vaccines', value: String(setupSummary.vaccineCount) },
      ])}
       ${renderPdfBreakdown('Farms · animals kept', setupSummary.farms, false)}
       ${renderPdfBreakdown('Locations · animals kept', setupSummary.locations, false)}
       ${renderPdfBreakdown('Labels · animals carrying', setupSummary.labels, false)}
       ${renderPdfBreakdown('Medicines · times used', setupSummary.medicines, false)}
       ${renderPdfBreakdown('Vaccines · times used', setupSummary.vaccines, false)}`
    : renderPdfEmpty('Nothing set up yet.');

  const bodyHtml = `
    ${renderPdfSection('Individual Animals', herdSectionBody)}
    ${renderPdfSection('Herds & Flocks', collectiveSectionBody)}
    ${renderPdfSection('Activity', activitySectionBody)}
    ${renderPdfSection('Sales, Purchases & Costs', financialSectionBody)}
    ${renderPdfSection('Feed & Production', productionSectionBody)}
    ${renderPdfSection('Health & Treatments', healthSectionBody)}
    ${renderPdfSection('Farm Setup', setupSectionBody)}
  `;

  return buildPdfDocument({
    title: 'Farm Report',
    branding,
    countLabel,
    filterSummary: [`Period: ${periodLabel}`],
    extraStyles: `
        .pdf-section {
          margin-bottom: 26px;
        }
        .pdf-section h2 {
          font-size: 16px;
          margin: 0 0 12px;
        }
        .pdf-hero {
          text-align: center;
          padding: 4px 0 16px;
        }
        .pdf-hero .value {
          font-size: 34px;
          font-weight: 700;
        }
        .pdf-hero .label {
          margin-top: 2px;
          font-size: 12px;
          color: #8a7f87;
        }
        .pdf-tiles {
          display: flex;
          gap: 10px;
          margin-bottom: 14px;
        }
        .pdf-tile {
          flex: 1;
          background: #f5f3f7;
          border-radius: 12px;
          text-align: center;
          padding: 10px 6px;
        }
        .pdf-tile .value {
          font-size: 16px;
          font-weight: 700;
        }
        .pdf-tile .label {
          margin-top: 2px;
          font-size: 10px;
          color: #8a7f87;
        }
        .pdf-breakdown {
          margin-bottom: 12px;
        }
        .pdf-breakdown-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: #8a7f87;
          margin-bottom: 6px;
        }
        .pdf-breakdown-row {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          padding: 4px 0;
          border-bottom: 1px solid #eee8ec;
        }
        .pdf-breakdown-detail {
          display: block;
          font-size: 11px;
          color: #8a7f87;
        }
        .pdf-note {
          font-size: 12px;
          color: #5f5f5f;
          margin: 4px 0 0;
        }
        .pdf-empty {
          font-size: 13px;
          font-style: italic;
          color: #8a7f87;
        }
    `,
    bodyHtml,
  });
}

function renderPdfSection(title: string, bodyHtml: string) {
  return `<div class="pdf-section"><h2>${escapeHtml(title)}</h2>${bodyHtml}</div>`;
}

function renderPdfHero(value: string | number, label: string) {
  return `<div class="pdf-hero"><div class="value">${escapeHtml(String(value))}</div><div class="label">${escapeHtml(label)}</div></div>`;
}

function renderPdfTiles(tiles: { label: string; value: string }[]) {
  return `<div class="pdf-tiles">${tiles
    .map(
      (tile) =>
        `<div class="pdf-tile"><div class="value">${escapeHtml(tile.value)}</div><div class="label">${escapeHtml(tile.label)}</div></div>`,
    )
    .join('')}</div>`;
}

function renderPdfBreakdown(
  title: string | null,
  rows: BreakdownRow[],
  hideEmptyRows = true,
  formatCountValue: (value: number) => string = formatCount,
) {
  const visibleRows = hideEmptyRows ? rows.filter((row) => row.count > 0) : rows;

  if (visibleRows.length === 0) {
    return '';
  }

  return `<div class="pdf-breakdown">
    ${title ? `<div class="pdf-breakdown-title">${escapeHtml(title)}</div>` : ''}
    ${visibleRows
      .map(
        (row) =>
          `<div class="pdf-breakdown-row"><span>${escapeHtml(row.label)}${
            row.detail ? `<span class="pdf-breakdown-detail">${escapeHtml(row.detail)}</span>` : ''
          }</span><span>${escapeHtml(formatCountValue(row.count))}</span></div>`,
      )
      .join('')}
  </div>`;
}

function renderPdfEmpty(message: string) {
  return `<p class="pdf-empty">${escapeHtml(message)}</p>`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  content: {
    paddingHorizontal: 26,
    paddingTop: 14,
    paddingBottom: 120,
    gap: 22,
  },
  section: {
    gap: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  heroWrap: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  heroValue: {
    fontSize: 40,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  heroLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.muted,
    marginTop: 2,
  },
  netPositive: {
    color: '#86A43D',
  },
  netNegative: {
    color: tokens.colors.danger,
  },
  tileGroup: {
    gap: 8,
  },
  tileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tileRowBoxed: {
    flexDirection: 'row',
    gap: 10,
  },
  tileWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tileDivider: {
    width: StyleSheet.hairlineWidth,
    height: 32,
    backgroundColor: tokens.colors.border,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  tileBoxed: {
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.surfaceMuted,
  },
  tileValue: {
    fontSize: 18,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  tileValueMuted: {
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.muted,
  },
  tileLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: tokens.colors.muted,
    textAlign: 'center',
  },
  breakdownGroup: {
    gap: 8,
  },
  breakdownGroupTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  // A full pixel in a grey a step darker than the card borders: at hairline
  // weight in tokens.colors.border the line all but disappeared between the
  // rows it is meant to be separating.
  groupRule: {
    height: 1,
    backgroundColor: '#D3CBD0',
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  breakdownLabelWrap: {
    flexShrink: 1,
    gap: 1,
  },
  breakdownLabel: {
    fontSize: 14,
    color: tokens.colors.text,
    flexShrink: 1,
  },
  breakdownDetail: {
    fontSize: 12,
    color: tokens.colors.muted,
    flexShrink: 1,
  },
  breakdownCount: {
    fontSize: 14,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  rowLabel: {
    fontSize: 13,
    color: tokens.colors.textSoft,
  },
  footnote: {
    fontSize: 12,
    color: tokens.colors.muted,
  },
  emptyText: {
    fontSize: 13,
    color: tokens.colors.muted,
    fontStyle: 'italic',
  },
});
