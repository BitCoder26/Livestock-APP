import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { FREE_ANIMAL_LIMIT, FREE_RECORD_LIMIT } from '../src/constants/subscription';
import { useSubscription } from '../src/context/SubscriptionContext';
import { tokens } from '../src/theme/tokens';

const PERKS = ['Unlimited animals', 'Unlimited records'];
const PRIVACY_POLICY_URL = 'https://livestockbook.app/privacy.html';
const TERMS_OF_USE_URL = 'https://livestockbook.app/terms.html';

type PlanId = 'monthly' | 'yearly';

type Plan = {
  id: PlanId;
  label: string;
  price: string | null;
  cadence: string;
  badge?: string;
  eyebrow?: string;
  compareAtPrice?: string | null;
};

function formatStorePrice(price: string | null | undefined) {
  return price?.replace(/^US\s*(?=\$)/u, '') ?? null;
}

function formatComparePrice(value: number, currencyCode: string | null | undefined) {
  if (!currencyCode) {
    return null;
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay: 'narrowSymbol',
    }).format(value).replace(/^US\s*(?=\$)/u, '');
  } catch {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode })
        .format(value)
        .replace(/^US\s*(?=\$)/u, '');
    } catch {
      return `${value.toFixed(2)} ${currencyCode}`;
    }
  }
}

const POP_IN_SPEED = 18;
const POP_IN_BOUNCINESS = 7;
const POP_OUT_DURATION = 170;

export default function UpgradeToProScreen() {
  const router = useRouter();
  const { limitType, autotest, debug } = useLocalSearchParams<{
    limitType?: 'animals' | 'records';
    autotest?: 'purchase-monthly' | 'purchase-yearly' | 'restore';
    debug?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const {
    activeEntitlementId,
    annualPackage,
    customerInfo,
    configured,
    loading,
    offering,
    monthlyPackage,
    purchaseLoading,
    purchaseSelectedPackage,
    refresh,
    restoreLoading,
    restorePurchases,
    storeMode,
  } = useSubscription();
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('yearly');
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const entrance = useRef(new Animated.Value(0)).current;
  const hasRunAutotest = useRef(false);
  const isLargeLayout = width >= 700;

  useEffect(() => {
    entrance.setValue(0);
    Animated.spring(entrance, {
      toValue: 1,
      speed: POP_IN_SPEED,
      bounciness: POP_IN_BOUNCINESS,
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const handleBack = () => {
    Animated.timing(entrance, {
      toValue: 0,
      duration: POP_OUT_DURATION,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        return;
      }

      if (router.canGoBack()) {
        router.back();
        return;
      }

      router.replace('/(tabs)/records');
    });
  };

  const monthlyProduct = monthlyPackage?.product;
  const annualProduct = annualPackage?.product;
  const yearlyCompareAtPrice =
    monthlyProduct && annualProduct && monthlyProduct.price * 12 > annualProduct.price
      ? formatComparePrice(monthlyProduct.price * 12, annualProduct.currencyCode ?? monthlyProduct.currencyCode)
      : null;

  const plans: Plan[] = [
    {
      id: 'monthly',
      label: 'Monthly',
      price: formatStorePrice(monthlyPackage?.product.priceString),
      cadence: '/month',
      eyebrow: 'Most flexible',
    },
    {
      id: 'yearly',
      label: 'Yearly',
      price: formatStorePrice(annualPackage?.product.priceString),
      cadence: '/year',
      badge: 'Best Value',
      compareAtPrice: yearlyCompareAtPrice,
    },
  ];

  const limitMessage =
    limitType === 'animals'
      ? `Free plan includes up to ${FREE_ANIMAL_LIMIT} animals. Upgrade to keep adding more without removing any existing data.`
      : limitType === 'records'
        ? `Free plan includes up to ${FREE_RECORD_LIMIT} records. Upgrade to keep adding more without removing any existing data.`
        : null;

  const handleUpgrade = async () => {
    setTestStatus(`Purchasing ${selectedPlan} package...`);
    const result = await purchaseSelectedPackage(selectedPlan);

    if (result.status === 'success') {
      setTestStatus(`Purchase succeeded. Active entitlement: ${activeEntitlementId ?? 'pro'}`);

      if (!autotest) {
        Alert.alert('Subscription active', 'LivestockBook Pro is now unlocked on this device.');
        handleBack();
      }
      return;
    }

    if (result.status === 'cancelled') {
      setTestStatus('Purchase was cancelled.');
      return;
    }

    if (result.status === 'error') {
      setTestStatus(`Purchase failed: ${result.message}`);
      Alert.alert('Purchase unavailable', result.message);
    }
  };

  const handleRestorePurchases = async () => {
    setTestStatus('Restoring purchases...');
    const result = await restorePurchases();

    if (result.status === 'restored') {
      setTestStatus(`Restore succeeded. Active entitlement: ${activeEntitlementId ?? 'pro'}`);

      if (!autotest) {
        Alert.alert('Purchases restored', 'Your Pro access has been restored.');
        handleBack();
      }
      return;
    }

    if (result.status === 'not_found') {
      setTestStatus('Restore completed but no active purchase was found.');
      Alert.alert('No purchases found', 'No active Pro subscription was found for this App Store account.');
      return;
    }

    if (result.status === 'cancelled') {
      setTestStatus('Restore was cancelled.');
      return;
    }

    if (result.status === 'error') {
      setTestStatus(`Restore failed: ${result.message}`);
      Alert.alert('Restore unavailable', result.message);
    }
  };

  useEffect(() => {
    if (!__DEV__ || !autotest || hasRunAutotest.current || loading) {
      return;
    }

    if (!configured) {
      setTestStatus('RevenueCat not configured.');
      hasRunAutotest.current = true;
      return;
    }

    if (autotest === 'purchase-monthly' && !monthlyPackage) {
      setTestStatus('Monthly package unavailable.');
      hasRunAutotest.current = true;
      return;
    }

    if (autotest === 'purchase-yearly' && !annualPackage) {
      setTestStatus('Yearly package unavailable.');
      hasRunAutotest.current = true;
      return;
    }

    hasRunAutotest.current = true;

    void (async () => {
      await refresh();

      if (autotest === 'purchase-monthly') {
        setSelectedPlan('monthly');
        await purchaseSelectedPackage('monthly').then((result) => {
          if (result.status === 'success') {
            setTestStatus(`Monthly purchase succeeded. Entitlement: ${result.customerInfo.entitlements.active.pro?.identifier ?? 'pro'}`);
          } else if (result.status === 'cancelled') {
            setTestStatus('Monthly purchase cancelled.');
          } else {
            setTestStatus(`Monthly purchase failed: ${result.message}`);
          }
        });
        return;
      }

      if (autotest === 'purchase-yearly') {
        setSelectedPlan('yearly');
        await purchaseSelectedPackage('yearly').then((result) => {
          if (result.status === 'success') {
            setTestStatus(`Yearly purchase succeeded. Entitlement: ${result.customerInfo.entitlements.active.pro?.identifier ?? 'pro'}`);
          } else if (result.status === 'cancelled') {
            setTestStatus('Yearly purchase cancelled.');
          } else {
            setTestStatus(`Yearly purchase failed: ${result.message}`);
          }
        });
        return;
      }

      await restorePurchases().then((result) => {
        if (result.status === 'restored') {
          setTestStatus(`Restore succeeded. Entitlement: ${result.customerInfo.entitlements.active.pro?.identifier ?? 'pro'}`);
        } else if (result.status === 'not_found') {
          setTestStatus('Restore found no active Pro purchase.');
        } else if (result.status === 'cancelled') {
          setTestStatus('Restore cancelled.');
        } else {
          setTestStatus(`Restore failed: ${result.message}`);
        }
      });
    })();
  }, [annualPackage, autotest, configured, loading, monthlyPackage, purchaseSelectedPackage, refresh, restorePurchases]);

  const showDiagnostics = __DEV__ && (debug === '1' || Boolean(autotest));

  return (
    <View style={styles.overlay}>
      <Animated.View pointerEvents="none" style={[styles.backdrop, { opacity: entrance }]} />
      <Animated.View
        style={[
          styles.popCard,
          {
            opacity: entrance,
            transform: [
              {
                scale: entrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.9, 1],
                }),
              },
            ],
          },
        ]}
      >
        <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
          <View style={[styles.closeRow, { paddingTop: insets.top + 2 }, isLargeLayout && styles.closeRowWide]}>
            <BouncyPressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              onPress={handleBack}
              style={styles.closeButton}
            >
              <AppIcon name="close" size={20} color={tokens.colors.text} />
            </BouncyPressable>
          </View>

          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.body}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom + 18, 24) },
              isLargeLayout && styles.scrollContentWide,
            ]}
          >
            <View style={styles.content}>
              <View style={styles.heroBlock}>
                <View style={styles.crownPlate}>
                  <AppIcon name="crown" size={22} color="#C8A24A" />
                </View>
                <Text style={styles.heroTitle}>LivestockBook Pro</Text>
                <Text style={styles.heroLead}>Manage your entire farm without limits and stay compliant as your farm grows.</Text>
                {limitMessage ? <Text style={styles.limitNote}>{limitMessage}</Text> : null}
              </View>

              <View style={styles.perksCard}>
                <Text style={styles.perksTitle}>Included with LivestockBook Pro</Text>
                {PERKS.map((perk) => (
                  <View key={perk} style={styles.perkRow}>
                    <AppIcon name="check-circle" size={18} color={tokens.colors.accent} />
                    <Text style={styles.perkText}>{perk}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.imagePlaceholder}>
                <Image
                  source={require('../assets/icons/goats_color.jpg')}
                  style={styles.imagePlaceholderImage}
                  resizeMode="cover"
                />
              </View>

              <View style={styles.pricingBlock}>
                <View style={styles.pricingRow}>
                  {plans.map((plan) => {
                    const isSelected = plan.id === selectedPlan;

                    return (
                      <BouncyPressable
                        key={plan.id}
                        accessibilityLabel={`${plan.label} plan${plan.price ? `, ${plan.price}${plan.cadence}` : ''}`}
                        accessibilityRole="button"
                        onPress={() => setSelectedPlan(plan.id)}
                        containerStyle={styles.planCardContainer}
                        style={[styles.planCard, isSelected && styles.planCardSelected]}
                      >
                        {plan.badge ? (
                          <View style={styles.planBadge}>
                            <Text style={styles.planBadgeText}>{plan.badge}</Text>
                          </View>
                        ) : null}
                        <View style={styles.planRow}>
                          <View style={styles.planTextGroup}>
                            <Text style={[styles.planLabel, isSelected && styles.planLabelSelected]}>
                              {plan.label}
                            </Text>
                            {plan.eyebrow ? <Text style={styles.planEyebrow}>{plan.eyebrow}</Text> : null}
                            {plan.compareAtPrice ? (
                              <Text style={styles.planComparePrice} numberOfLines={1}>
                                {plan.compareAtPrice}
                              </Text>
                            ) : null}
                            <Text
                              style={[styles.planPrice, isSelected && styles.planPriceSelected]}
                              numberOfLines={1}
                            >
                              {plan.price ?? 'Unavailable'}
                              <Text style={styles.planCadence}>{plan.cadence}</Text>
                            </Text>
                          </View>
                          {isSelected ? (
                            <AppIcon name="check-circle" size={22} color={tokens.colors.accent} />
                          ) : (
                            <View style={styles.tickEmpty} />
                          )}
                        </View>
                      </BouncyPressable>
                    );
                  })}
                </View>
                <Text style={styles.taxNote}>Tax deductible expense</Text>
              </View>

              {showDiagnostics ? (
                <View style={styles.diagnosticsCard}>
                  <Text style={styles.diagnosticsTitle}>RevenueCat Diagnostics</Text>
                  <Text style={styles.diagnosticsText}>Configured: {configured ? 'yes' : 'no'}</Text>
                  <Text style={styles.diagnosticsText}>Store mode: {storeMode}</Text>
                  <Text style={styles.diagnosticsText}>Offering: {offering?.identifier ?? 'none'}</Text>
                  <Text style={styles.diagnosticsText}>Monthly price: {monthlyPackage?.product.priceString ?? 'none'}</Text>
                  <Text style={styles.diagnosticsText}>Yearly price: {annualPackage?.product.priceString ?? 'none'}</Text>
                  <Text style={styles.diagnosticsText}>Active entitlement: {activeEntitlementId ?? 'none'}</Text>
                  <Text style={styles.diagnosticsText}>Active subscriptions: {customerInfo?.activeSubscriptions.join(', ') || 'none'}</Text>
                  {testStatus ? <Text style={styles.diagnosticsStatus}>{testStatus}</Text> : null}
                </View>
              ) : null}
            </View>
          </ScrollView>

          <View
            style={[
              styles.footerArea,
              { paddingBottom: Math.max(insets.bottom + 10, 16) },
              isLargeLayout && styles.footerAreaWide,
            ]}
          >
            <BouncyPressable
              accessibilityLabel="Upgrade to Pro"
              accessibilityRole="button"
              disabled={
                loading ||
                purchaseLoading ||
                !configured ||
                (selectedPlan === 'monthly' ? !monthlyPackage : !annualPackage)
              }
              onPress={() => void handleUpgrade()}
              style={({ pressed }) => [
                styles.upgradeButton,
                pressed && styles.pressed,
                (loading || purchaseLoading || !configured) && styles.upgradeButtonDisabled,
              ]}
            >
              {purchaseLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.upgradeButtonText}>Upgrade to Pro</Text>
              )}
            </BouncyPressable>
            <BouncyPressable
              accessibilityLabel="Restore Purchases"
              accessibilityRole="button"
              disabled={loading || restoreLoading || !configured}
              onPress={() => void handleRestorePurchases()}
              style={({ pressed }) => [styles.restoreButton, pressed && styles.pressed]}
            >
              {restoreLoading ? (
                <ActivityIndicator color={tokens.colors.accentDeep} size="small" />
              ) : (
                <Text style={styles.restoreButtonText}>Restore Purchases</Text>
              )}
            </BouncyPressable>
            <View style={styles.legalRow}>
              <Text
                accessibilityRole="link"
                onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
                style={styles.legalLink}
              >
                Privacy Policy
              </Text>
              <Text style={styles.legalDivider}>•</Text>
              <Text
                accessibilityRole="link"
                onPress={() => Linking.openURL(TERMS_OF_USE_URL)}
                style={styles.legalLink}
              >
                Terms of Use
              </Text>
            </View>
            {__DEV__ && !configured ? (
              <Text style={styles.helperText}>
                Add `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` to enable purchases.
              </Text>
            ) : null}
          </View>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  popCard: {
    flex: 1,
    backgroundColor: '#fff',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  closeRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 26,
  },
  closeRowWide: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 3,
  },
  scrollContentWide: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  content: {
    gap: 6,
  },
  heroBlock: {
    alignItems: 'center',
    gap: 3,
  },
  crownPlate: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FBF2DC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  heroTitle: {
    color: tokens.colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  heroLead: {
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 3,
    marginBottom: 7,
    paddingHorizontal: 6,
  },
  limitNote: {
    color: tokens.colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 6,
    paddingHorizontal: 8,
  },
  perksCard: {
    backgroundColor: tokens.colors.surfaceMuted,
    borderRadius: tokens.radius.md,
    padding: 12,
    gap: 6,
    marginBottom: 10,
  },
  perksTitle: {
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  perkText: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  imagePlaceholder: {
    width: '100%',
    aspectRatio: 1672 / 941,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surfaceMuted,
    overflow: 'hidden',
    marginBottom: 18,
  },
  imagePlaceholderImage: {
    width: '100%',
    height: '100%',
  },
  pricingBlock: {
    gap: 6,
  },
  taxNote: {
    color: tokens.colors.muted,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 6,
  },
  pricingRow: {
    flexDirection: 'row',
    gap: 12,
  },
  planCardContainer: {
    flex: 1,
  },
  planCard: {
    borderRadius: tokens.radius.md,
    borderWidth: 2,
    borderColor: tokens.colors.border,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  planCardSelected: {
    borderColor: tokens.colors.accent,
    backgroundColor: tokens.colors.accentSoft,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  planTextGroup: {
    flex: 1,
    gap: 6,
  },
  tickEmpty: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: tokens.colors.border,
  },
  planBadge: {
    position: 'absolute',
    top: -11,
    alignSelf: 'center',
    backgroundColor: tokens.colors.accent,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  planBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  planLabel: {
    color: tokens.colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  planLabelSelected: {
    color: tokens.colors.accentDeep,
  },
  planEyebrow: {
    color: tokens.colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  planComparePrice: {
    color: tokens.colors.muted,
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'line-through',
  },
  planPrice: {
    color: tokens.colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  planPriceSelected: {
    color: tokens.colors.accentDeep,
  },
  planCadence: {
    fontSize: 11,
    fontWeight: '600',
  },
  upgradeButton: {
    minHeight: 52,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeButtonDisabled: {
    opacity: 0.72,
  },
  upgradeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  restoreButton: {
    minHeight: 50,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(221, 101, 96, 0.14)',
  },
  restoreButtonText: {
    color: tokens.colors.accentDeep,
    fontSize: 14,
    fontWeight: '800',
  },
  footerArea: {
    paddingHorizontal: 22,
    paddingTop: 10,
    gap: 10,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.colors.border,
  },
  footerAreaWide: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  helperText: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  legalLink: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  legalDivider: {
    color: tokens.colors.muted,
    fontSize: 12,
  },
  diagnosticsCard: {
    backgroundColor: '#F7F3E8',
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  diagnosticsTitle: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  diagnosticsText: {
    color: tokens.colors.text,
    fontSize: 12,
    lineHeight: 16,
  },
  diagnosticsStatus: {
    color: tokens.colors.accentDeep,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    marginTop: 6,
  },
  pressed: {
    opacity: 0.92,
  },
});
