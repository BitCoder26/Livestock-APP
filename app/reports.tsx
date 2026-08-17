import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppTopBar } from '../src/components/AppTopBar';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { useAccount } from '../src/context/AccountContext';
import { useAnimals } from '../src/context/AnimalsContext';
import { useRecords } from '../src/context/RecordsContext';
import { useSetup } from '../src/context/SetupContext';
import { tokens } from '../src/theme/tokens';
import { buildPdfDocument, createPdfFile, escapeHtml, resolveBusinessBranding, sharePdf } from '../src/utils/pdfExport';
import {
  buildActivitySummary,
  buildFinancialSummary,
  buildHealthSummary,
  buildHerdOverview,
  REPORT_PERIOD_OPTIONS,
  type ActivitySummary,
  type BreakdownRow,
  type FinancialSummary,
  type HealthSummary,
  type HerdOverview,
  type ReportPeriod,
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
  const { records, isLoaded: recordsLoaded } = useRecords();
  const { farmEntities, paddockEntities } = useSetup();
  const [period, setPeriod] = useState<ReportPeriod>('all');
  const sharingInProgress = useRef(false);

  const isLoaded = accountLoaded && animalsLoaded && recordsLoaded;
  const periodSuffix = PERIOD_EMPTY_SUFFIX[period];
  const recordedSuffix = PERIOD_RECORDED_SUFFIX[period];

  const herdOverview = useMemo(
    () => buildHerdOverview(animals, farmEntities, paddockEntities),
    [animals, farmEntities, paddockEntities],
  );
  const activitySummary = useMemo(() => buildActivitySummary(records, period), [records, period]);
  const financialSummary = useMemo(
    () => buildFinancialSummary(records, period, profile.currency),
    [records, period, profile.currency],
  );
  const healthSummary = useMemo(
    () => buildHealthSummary(records, period, animals),
    [records, period, animals],
  );

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/account');
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
        activitySummary,
        financialSummary,
        healthSummary,
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
          <PeriodControl value={period} onChange={setPeriod} />

          <Section title="Livestock Overview">
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
                <BreakdownGroup title="By paddock" rows={herdOverview.byPaddock} />
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

          <Section title="Livestock Sales & Purchases">
            <FinancialTiles summary={financialSummary} periodSuffix={periodSuffix} />
            {financialSummary.excludedRecordCount > 0 ? (
              <Text style={styles.footnote}>
                {financialSummary.excludedRecordCount} record
                {financialSummary.excludedRecordCount === 1 ? '' : 's'} excluded (different currency).
              </Text>
            ) : null}
          </Section>

          <Section title="Health & Treatments">
            {healthSummary.vaccinations === 0 &&
            healthSummary.medications === 0 &&
            healthSummary.healthChecks === 0 &&
            healthSummary.deaths === 0 &&
            healthSummary.animalsInWithdrawal === 0 ? (
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
                <Text style={styles.rowLabel}>
                  {healthSummary.deaths} death{healthSummary.deaths === 1 ? '' : 's'} recorded
                  {recordedSuffix ? ` ${recordedSuffix}` : ''}
                </Text>
                <Text style={styles.rowLabel}>
                  {healthSummary.animalsInWithdrawal === 0
                    ? 'No animals currently in withdrawal.'
                    : `${healthSummary.animalsInWithdrawal} animal${healthSummary.animalsInWithdrawal === 1 ? '' : 's'} currently in withdrawal.`}
                </Text>
              </>
            )}
          </Section>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function PeriodControl({ value, onChange }: { value: ReportPeriod; onChange: (value: ReportPeriod) => void }) {
  return (
    <View style={styles.periodTrack}>
      {REPORT_PERIOD_OPTIONS.map((option) => {
        const isActive = option.value === value;

        return (
          <BouncyPressable
            key={option.value}
            accessibilityLabel={option.label}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            containerStyle={styles.periodOptionWrap}
            onPress={() => onChange(option.value)}
            style={[styles.periodOption, isActive && styles.periodOptionActive]}
          >
            <Text style={[styles.periodOptionText, isActive && styles.periodOptionTextActive]}>{option.label}</Text>
          </BouncyPressable>
        );
      })}
    </View>
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
      {title ? <Text style={styles.breakdownGroupTitle}>{title}</Text> : null}
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

function BreakdownGroup({
  title,
  rows,
  hideEmptyRows = true,
}: {
  title?: string;
  rows: BreakdownRow[];
  hideEmptyRows?: boolean;
}) {
  const visibleRows = hideEmptyRows ? rows.filter((row) => row.count > 0) : rows;

  if (visibleRows.length === 0) {
    return null;
  }

  return (
    <View style={styles.breakdownGroup}>
      {title ? <Text style={styles.breakdownGroupTitle}>{title}</Text> : null}
      {visibleRows.map((row) => (
        <View key={row.label} style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel} numberOfLines={1}>
            {row.label}
          </Text>
          <Text style={styles.breakdownCount}>{row.count}</Text>
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
  if (summary.salesRecordCount === 0 && summary.purchasesRecordCount === 0) {
    return <EmptyState message={`No sales or purchases recorded ${periodSuffix}.`} />;
  }

  const netStyle =
    summary.net > 0 ? styles.netPositive : summary.net < 0 ? styles.netNegative : undefined;

  return (
    <>
      <View style={styles.heroWrap}>
        <Text style={[styles.tileValue, netStyle]}>
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
        ]}
      />
    </>
  );
}

function EmptyState({ message }: { message: string }) {
  return <Text style={styles.emptyText}>{message}</Text>;
}

function formatSignedNumber(value: number) {
  return value > 0 ? `+${value}` : String(value);
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

// Mirrors the on-screen sections (Livestock Overview / Activity / Sales &
// Purchases / Health & Treatments) as a single-page PDF summary — the thing
// a farmer hands to an accountant, vet, or landlord, as opposed to the
// Export tab's row-level PDF/CSV of every individual record or animal.
function buildReportPdfHtml({
  period,
  branding,
  herdOverview,
  activitySummary,
  financialSummary,
  healthSummary,
  periodSuffix,
  recordedSuffix,
}: {
  period: ReportPeriod;
  branding: Parameters<typeof buildPdfDocument>[0]['branding'];
  herdOverview: HerdOverview;
  activitySummary: ActivitySummary;
  financialSummary: FinancialSummary;
  healthSummary: HealthSummary;
  periodSuffix: string;
  recordedSuffix: string;
}) {
  const periodLabel = REPORT_PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? 'All time';
  const countLabel = `${herdOverview.totalActive} active ${herdOverview.totalActive === 1 ? 'animal' : 'animals'}`;

  const hasHerd = herdOverview.totalActive > 0 || herdOverview.soldCount > 0 || herdOverview.deceasedCount > 0;
  const hasActivity = activitySummary.rows.some((row) => row.count > 0);
  const hasFinancials = financialSummary.salesRecordCount > 0 || financialSummary.purchasesRecordCount > 0;
  const hasHealth =
    healthSummary.vaccinations > 0 ||
    healthSummary.medications > 0 ||
    healthSummary.healthChecks > 0 ||
    healthSummary.deaths > 0 ||
    healthSummary.animalsInWithdrawal > 0;

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
       ${renderPdfBreakdown('By paddock', herdOverview.byPaddock)}`
    : renderPdfEmpty('No animals added yet.');

  const activitySectionBody = hasActivity
    ? `${renderPdfBreakdown(null, activitySummary.rows, false)}
       ${renderPdfTiles([
         { label: 'Added', value: String(activitySummary.added) },
         { label: 'Removed', value: String(activitySummary.removed) },
         { label: 'Net change', value: formatSignedNumber(activitySummary.net) },
       ])}`
    : renderPdfEmpty(`No records added ${periodSuffix}.`);

  const financialSectionBody = hasFinancials
    ? `${renderPdfHero(
        formatCurrencySymbolOnly(financialSummary.net, financialSummary.currencyCode),
        'Net recorded',
      )}
       ${renderPdfTiles([
         {
           label: 'Sales',
           value:
             financialSummary.salesRecordCount === 0
               ? 'None'
               : formatCurrencySymbolOnly(financialSummary.salesTotal, financialSummary.currencyCode),
         },
         {
           label: 'Purchases',
           value:
             financialSummary.purchasesRecordCount === 0
               ? 'None'
               : formatCurrencySymbolOnly(financialSummary.purchasesTotal, financialSummary.currencyCode),
         },
       ])}
       ${
         financialSummary.excludedRecordCount > 0
           ? `<p class="pdf-note">${escapeHtml(
               `${financialSummary.excludedRecordCount} record${financialSummary.excludedRecordCount === 1 ? '' : 's'} excluded (different currency).`,
             )}</p>`
           : ''
       }`
    : renderPdfEmpty(`No sales or purchases recorded ${periodSuffix}.`);

  const healthSectionBody = hasHealth
    ? `${renderPdfTiles([
        { label: 'Vaccinations', value: String(healthSummary.vaccinations) },
        { label: 'Medications', value: String(healthSummary.medications) },
        { label: 'Health checks', value: String(healthSummary.healthChecks) },
      ])}
       <p class="pdf-note">${escapeHtml(
         `${healthSummary.deaths} death${healthSummary.deaths === 1 ? '' : 's'} recorded${recordedSuffix ? ` ${recordedSuffix}` : ''}`,
       )}</p>
       <p class="pdf-note">${escapeHtml(
         healthSummary.animalsInWithdrawal === 0
           ? 'No animals currently in withdrawal.'
           : `${healthSummary.animalsInWithdrawal} animal${healthSummary.animalsInWithdrawal === 1 ? '' : 's'} currently in withdrawal.`,
       )}</p>`
    : renderPdfEmpty(`No health records added ${periodSuffix}.`);

  const bodyHtml = `
    ${renderPdfSection('Livestock Overview', herdSectionBody)}
    ${renderPdfSection('Activity', activitySectionBody)}
    ${renderPdfSection('Livestock Sales & Purchases', financialSectionBody)}
    ${renderPdfSection('Health & Treatments', healthSectionBody)}
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

function renderPdfBreakdown(title: string | null, rows: BreakdownRow[], hideEmptyRows = true) {
  const visibleRows = hideEmptyRows ? rows.filter((row) => row.count > 0) : rows;

  if (visibleRows.length === 0) {
    return '';
  }

  return `<div class="pdf-breakdown">
    ${title ? `<div class="pdf-breakdown-title">${escapeHtml(title)}</div>` : ''}
    ${visibleRows
      .map(
        (row) =>
          `<div class="pdf-breakdown-row"><span>${escapeHtml(row.label)}</span><span>${escapeHtml(String(row.count))}</span></div>`,
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
  periodTrack: {
    flexDirection: 'row',
    gap: 10,
  },
  periodOptionWrap: {
    flex: 1,
  },
  periodOption: {
    height: 44,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F3F7',
  },
  periodOptionActive: {
    backgroundColor: tokens.colors.accentSoft,
  },
  periodOptionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8A7F87',
  },
  periodOptionTextActive: {
    color: tokens.colors.text,
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
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  breakdownLabel: {
    fontSize: 14,
    color: tokens.colors.text,
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
