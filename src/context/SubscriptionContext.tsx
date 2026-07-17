import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PACKAGE_TYPE,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesError,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

import {
  DEFAULT_REVENUECAT_OFFERING_ID,
  REVENUECAT_ENTITLEMENT_ID,
} from '../constants/subscription';

type PurchasePlanId = 'monthly' | 'yearly';

type PurchaseResult =
  | { status: 'success'; customerInfo: CustomerInfo }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

type RestoreResult =
  | { status: 'restored'; customerInfo: CustomerInfo }
  | { status: 'not_found'; customerInfo: CustomerInfo }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

type SubscriptionContextValue = {
  configured: boolean;
  loading: boolean;
  purchaseLoading: boolean;
  restoreLoading: boolean;
  storeMode: 'app_store' | 'test_store' | 'disabled';
  isPro: boolean;
  customerInfo: CustomerInfo | null;
  offering: PurchasesOffering | null;
  monthlyPackage: PurchasesPackage | null;
  annualPackage: PurchasesPackage | null;
  activeEntitlementId: string | null;
  refresh: () => Promise<CustomerInfo | null>;
  purchaseSelectedPackage: (plan: PurchasePlanId) => Promise<PurchaseResult>;
  restorePurchases: () => Promise<RestoreResult>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

const IOS_REVENUECAT_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const TEST_REVENUECAT_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const TEST_STORE_FLAG = process.env.EXPO_PUBLIC_REVENUECAT_USE_TEST_STORE === '1';
const REVENUECAT_DIAGNOSTICS_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_REVENUECAT_DIAGNOSTICS === '1';
const REVENUECAT_CANCELLATION_MESSAGE = 'Purchase was cancelled.';

function getRevenueCatConfig() {
  if (Platform.OS !== 'ios') {
    return {
      apiKey: null,
      storeMode: 'disabled' as const,
    };
  }

  if (__DEV__ && TEST_STORE_FLAG) {
    if (TEST_REVENUECAT_API_KEY) {
      return {
        apiKey: TEST_REVENUECAT_API_KEY,
        storeMode: 'test_store' as const,
      };
    }

    return {
      apiKey: null,
      storeMode: 'disabled' as const,
    };
  }

  return {
    apiKey: IOS_REVENUECAT_API_KEY ?? null,
    storeMode: IOS_REVENUECAT_API_KEY ? ('app_store' as const) : ('disabled' as const),
  };
}

export function SubscriptionProvider({ children }: PropsWithChildren) {
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [{ storeMode }] = useState(getRevenueCatConfig);

  useEffect(() => {
    let active = true;
    const { apiKey, storeMode: nextStoreMode } = getRevenueCatConfig();

    const customerInfoListener = (nextCustomerInfo: CustomerInfo) => {
      if (!active) {
        return;
      }

      setCustomerInfo(nextCustomerInfo);
    };

    void (async () => {
      if (!apiKey) {
        if (active) {
          setConfigured(false);
          setLoading(false);
        }
        return;
      }

      try {
        await Purchases.setLogLevel(
          REVENUECAT_DIAGNOSTICS_ENABLED ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO,
        );
        Purchases.setLogHandler((level, message) => {
          const formattedMessage = `[RevenueCat] ${message}`;

          if (!REVENUECAT_DIAGNOSTICS_ENABLED && message.includes(REVENUECAT_CANCELLATION_MESSAGE)) {
            console.info(formattedMessage);
            return;
          }

          switch (level) {
            case LOG_LEVEL.DEBUG:
              console.debug(formattedMessage);
              break;
            case LOG_LEVEL.INFO:
              console.info(formattedMessage);
              break;
            case LOG_LEVEL.WARN:
              console.warn(formattedMessage);
              break;
            case LOG_LEVEL.ERROR:
              console.error(formattedMessage);
              break;
            default:
              console.log(formattedMessage);
          }
        });

        const isConfigured = await Purchases.isConfigured();

        if (!isConfigured) {
          Purchases.configure({
            apiKey,
          });
        }

        Purchases.addCustomerInfoUpdateListener(customerInfoListener);

        if (!active) {
          return;
        }

        setConfigured(true);

        const [nextCustomerInfo, nextOffering] = await Promise.all([
          Purchases.getCustomerInfo(),
          loadCurrentOffering(),
        ]);

        if (!active) {
          return;
        }

        setCustomerInfo(nextCustomerInfo);
        setOffering(nextOffering);
        if (__DEV__) {
          console.log('[revenuecat] initialized', {
            configured: true,
            storeMode: nextStoreMode,
            entitlementId: REVENUECAT_ENTITLEMENT_ID,
            offeringId: nextOffering?.identifier ?? null,
            monthlyPrice: nextOffering?.monthly?.product.priceString ?? null,
            annualPrice: nextOffering?.annual?.product.priceString ?? null,
            activeEntitlement: findActiveEntitlementId(nextCustomerInfo),
          });
        }
      } catch (error) {
        console.warn('[RevenueCat] Failed to initialize subscription state.', error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      Purchases.removeCustomerInfoUpdateListener(customerInfoListener);
    };
  }, []);

  const monthlyPackage = useMemo(
    () =>
      offering?.monthly ??
      offering?.availablePackages.find((entry) => entry.packageType === PACKAGE_TYPE.MONTHLY) ??
      null,
    [offering],
  );

  const annualPackage = useMemo(
    () =>
      offering?.annual ??
      offering?.availablePackages.find((entry) => entry.packageType === PACKAGE_TYPE.ANNUAL) ??
      null,
    [offering],
  );

  const activeEntitlementId = useMemo(() => findActiveEntitlementId(customerInfo), [customerInfo]);
  const isPro = Boolean(activeEntitlementId);

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      configured,
      loading,
      purchaseLoading,
      restoreLoading,
      storeMode,
      isPro,
      customerInfo,
      offering,
      monthlyPackage,
      annualPackage,
      activeEntitlementId,
      refresh: async () => {
        if (!configured) {
          return null;
        }

        try {
          const nextCustomerInfo = await Purchases.getCustomerInfo();
          const nextOffering = await loadCurrentOffering();
          setCustomerInfo(nextCustomerInfo);
          setOffering(nextOffering);
          return nextCustomerInfo;
        } catch (error) {
          console.warn('[RevenueCat] Failed to refresh subscription state.', error);
          return null;
        }
      },
      purchaseSelectedPackage: async (plan) => {
        if (!configured) {
          return {
            status: 'error',
            message: 'Subscriptions are not configured yet. Add the correct RevenueCat API key for the current mode and try again.',
          };
        }

        const selectedPackage = plan === 'monthly' ? monthlyPackage : annualPackage;

        if (!selectedPackage) {
          return {
            status: 'error',
            message: 'This subscription option is not available right now.',
          };
        }

        setPurchaseLoading(true);

        try {
          const result = await Purchases.purchasePackage(selectedPackage);
          setCustomerInfo(result.customerInfo);
          if (__DEV__) {
            console.log('[revenuecat] purchase success', {
              plan,
              productIdentifier: result.productIdentifier,
              activeEntitlement: findActiveEntitlementId(result.customerInfo),
              activeSubscriptions: result.customerInfo.activeSubscriptions,
            });
          }
          return { status: 'success', customerInfo: result.customerInfo };
        } catch (error) {
          const purchasesError = error as PurchasesError;

          if (
            purchasesError.userCancelled === true ||
            purchasesError.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
          ) {
            if (__DEV__) {
              console.log('[revenuecat] purchase cancelled', { plan });
            }
            return { status: 'cancelled' };
          }

          if (__DEV__) {
            console.log('[revenuecat] purchase failed', {
              plan,
              code: purchasesError.code,
              message: purchasesError.message,
            });
          }
          return {
            status: 'error',
            message: purchasesError.message || 'Unable to complete your purchase right now.',
          };
        } finally {
          setPurchaseLoading(false);
        }
      },
      restorePurchases: async () => {
        if (!configured) {
          return {
            status: 'error',
            message: 'Subscriptions are not configured yet. Add the correct RevenueCat API key for the current mode and try again.',
          };
        }

        setRestoreLoading(true);

        try {
          const nextCustomerInfo = await Purchases.restorePurchases();
          setCustomerInfo(nextCustomerInfo);
          if (__DEV__) {
            console.log('[revenuecat] restore result', {
              activeEntitlement: findActiveEntitlementId(nextCustomerInfo),
              activeSubscriptions: nextCustomerInfo.activeSubscriptions,
            });
          }

          if (findActiveEntitlementId(nextCustomerInfo)) {
            return { status: 'restored', customerInfo: nextCustomerInfo };
          }

          return { status: 'not_found', customerInfo: nextCustomerInfo };
        } catch (error) {
          const purchasesError = error as PurchasesError;

          if (
            purchasesError.userCancelled === true ||
            purchasesError.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
          ) {
            if (__DEV__) {
              console.log('[revenuecat] restore cancelled');
            }
            return { status: 'cancelled' };
          }

          if (__DEV__) {
            console.log('[revenuecat] restore failed', {
              code: purchasesError.code,
              message: purchasesError.message,
            });
          }
          return {
            status: 'error',
            message: purchasesError.message || 'Unable to restore purchases right now.',
          };
        } finally {
          setRestoreLoading(false);
        }
      },
    }),
    [
      activeEntitlementId,
      annualPackage,
      configured,
      customerInfo,
      isPro,
      loading,
      monthlyPackage,
      offering,
      purchaseLoading,
      restoreLoading,
      storeMode,
    ],
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);

  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }

  return context;
}

async function loadCurrentOffering() {
  const offerings = await Purchases.getOfferings();

  return offerings.all[DEFAULT_REVENUECAT_OFFERING_ID] ?? offerings.current ?? null;
}

function findActiveEntitlementId(customerInfo: CustomerInfo | null) {
  if (!customerInfo) {
    return null;
  }

  if (customerInfo.entitlements.active[REVENUECAT_ENTITLEMENT_ID]?.isActive) {
    return REVENUECAT_ENTITLEMENT_ID;
  }

  return null;
}
