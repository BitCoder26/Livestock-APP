import {
  Manrope_200ExtraLight,
  Manrope_300Light,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { PostHogProvider } from 'posthog-react-native';
import { useEffect } from 'react';

import { CollectivesProvider } from '../src/context/CollectivesContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorFallback } from '../src/components/AppErrorFallback';
import { AccountProvider, useAccount } from '../src/context/AccountContext';
import { AnimalsProvider, useAnimals } from '../src/context/AnimalsContext';
import { OnboardingProvider, useOnboarding } from '../src/context/OnboardingContext';
import { RecordsProvider, useRecords } from '../src/context/RecordsContext';
import { SetupProvider, useSetup } from '../src/context/SetupContext';
import { SubscriptionProvider, useSubscription } from '../src/context/SubscriptionContext';
import { FAST_MOTION_DURATION } from '../src/utils/motion';

// Keep the branded native launch screen in place while the local stores and
// subscription state initialise. Calling this at module scope prevents the
// splash screen from auto-hiding before React has had a chance to render.
void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: FAST_MOTION_DURATION, fade: true });

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    // A startup failure must reveal the recovery UI instead of leaving the
    // native launch screen covering it indefinitely.
    SplashScreen.hide();
  }, []);

  return <AppErrorFallback error={error} onRetry={retry} />;
}

export default function RootLayout() {
  return (
    <PostHogProvider
      apiKey={process.env.EXPO_PUBLIC_POSTHOG_API_KEY}
      options={{ host: process.env.EXPO_PUBLIC_POSTHOG_HOST }}
    >
      <SafeAreaProvider>
        <SubscriptionProvider>
          <SetupProvider>
            <AnimalsProvider>
              <CollectivesProvider>
              <RecordsProvider>
                <AccountProvider>
                  <OnboardingProvider>
                    <AppDataGate />
                  </OnboardingProvider>
                </AccountProvider>
              </RecordsProvider>
              </CollectivesProvider>
            </AnimalsProvider>
          </SetupProvider>
        </SubscriptionProvider>
      </SafeAreaProvider>
    </PostHogProvider>
  );
}

function AppDataGate() {
  const [fontsLoaded] = useFonts({
    Manrope_200ExtraLight,
    Manrope_300Light,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  const { isLoaded: setupLoaded } = useSetup();
  const { isLoaded: animalsLoaded } = useAnimals();
  const { isLoaded: recordsLoaded } = useRecords();
  const { isLoaded: accountLoaded } = useAccount();
  const { isReady: onboardingReady } = useOnboarding();
  const { loading: subscriptionLoading } = useSubscription();
  const isAppReady =
    fontsLoaded &&
    setupLoaded &&
    animalsLoaded &&
    recordsLoaded &&
    accountLoaded &&
    onboardingReady &&
    !subscriptionLoading;

  useEffect(() => {
    if (isAppReady) {
      SplashScreen.hide();
    }
  }, [isAppReady]);

  if (!isAppReady) {
    return null;
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
                      screenOptions={{
                        headerShown: false,
                        contentStyle: { backgroundColor: '#F7F5F6' },
                        animation: 'simple_push',
                        animationDuration: FAST_MOTION_DURATION,
                      }}
                    >
                      <Stack.Screen
                        name="(tabs)"
                        options={({ route }) => {
                          const isSaveReveal = Boolean(
                            (route.params as { saveReveal?: string } | undefined)?.saveReveal,
                          );

                          return isSaveReveal
                            ? {
                                animation: 'none',
                                contentStyle: { backgroundColor: 'transparent' },
                                gestureEnabled: false,
                                presentation: 'transparentModal',
                              }
                            : {
                                animation: 'none',
                                contentStyle: { backgroundColor: '#F7F5F6' },
                                gestureEnabled: true,
                                presentation: 'card',
                              };
                        }}
                      />
                      <Stack.Screen
                        name="account"
                        options={{
                          animation: 'none',
                          contentStyle: { backgroundColor: '#F7F5F6' },
                          presentation: 'card',
                        }}
                      />
                      <Stack.Screen
                        name="welcome"
                        options={{
                          animation: 'fade',
                          animationDuration: FAST_MOTION_DURATION,
                          gestureEnabled: false,
                        }}
                      />
                      {/* The add screens open with no transition at all: the
                          circular reveal that used to cover this handover was
                          removed, and a push slide in its place would only put
                          a different wait in front of the form. */}
                      <Stack.Screen
                        name="add-record"
                        options={{ animation: 'none' }}
                      />
                      <Stack.Screen
                        name="add-collective"
                        options={{ animation: 'none' }}
                      />
                      <Stack.Screen
                        name="add-collective-record"
                        options={{ animation: 'none' }}
                      />
                      {/* Reached from the Animals tab or from a record's
                          animal selector — either way it is the same add
                          screen, so it appears the same way the other add
                          screens do. It used to open as a fullScreenModal from
                          the selector, which slid up from the bottom and read
                          as a different kind of screen than the one the same
                          button opens everywhere else. */}
                      <Stack.Screen
                        name="add-animal"
                        options={{ animation: 'none' }}
                      />
                      <Stack.Screen
                        name="view-record"
                        options={{
                          animation: 'simple_push',
                          animationDuration: FAST_MOTION_DURATION,
                          contentStyle: { backgroundColor: '#F7F5F6' },
                          presentation: 'card',
                        }}
                      />
                      <Stack.Screen
                        name="edit-record"
                        options={{
                          animation: 'simple_push',
                          animationDuration: FAST_MOTION_DURATION,
                          contentStyle: { backgroundColor: '#F7F5F6' },
                          presentation: 'card',
                        }}
                      />
                      <Stack.Screen
                        name="records-filter"
                        options={{
                          animation: 'none',
                          contentStyle: { backgroundColor: 'transparent' },
                          presentation: 'transparentModal',
                        }}
                      />
                      <Stack.Screen
                        name="select-record-animal"
                        options={{
                          animation: 'none',
                          contentStyle: { backgroundColor: 'transparent' },
                          presentation: 'transparentModal',
                        }}
                      />
                      <Stack.Screen
                        name="select-mother-animal"
                        options={({ route }) => ({
                          animation: 'simple_push',
                          animationDuration: FAST_MOTION_DURATION,
                          presentation:
                            (route.params as { source?: string } | undefined)?.source === 'add-record'
                              ? 'fullScreenModal'
                              : 'card',
                        })}
                      />
                      <Stack.Screen
                        name="upgrade-to-pro"
                        options={{
                          animation: 'none',
                          contentStyle: { backgroundColor: 'transparent' },
                          presentation: 'transparentModal',
                        }}
                      />
                      <Stack.Screen
                        name="setup-farms"
                        options={({ route }) => ({
                          animation: 'none',
                          contentStyle: { backgroundColor: '#F7F5F6' },
                          presentation:
                            ['add-animal', 'add-record'].includes(
                              (route.params as { source?: string } | undefined)?.source ?? '',
                            )
                              ? 'fullScreenModal'
                              : 'card',
                        })}
                      />
                      <Stack.Screen
                        name="setup-locations"
                        options={({ route }) => ({
                          animation: 'none',
                          contentStyle: { backgroundColor: '#F7F5F6' },
                          presentation:
                            ['add-animal', 'add-record'].includes(
                              (route.params as { source?: string } | undefined)?.source ?? '',
                            )
                              ? 'fullScreenModal'
                              : 'card',
                        })}
                      />
                      <Stack.Screen
                        name="setup-labels"
                        options={({ route }) => ({
                          animation: 'none',
                          contentStyle: { backgroundColor: '#F7F5F6' },
                          presentation:
                            ['add-animal', 'add-record'].includes(
                              (route.params as { source?: string } | undefined)?.source ?? '',
                            )
                              ? 'fullScreenModal'
                              : 'card',
                        })}
                      />
                      <Stack.Screen
                        name="setup-medicines"
                        options={({ route }) => ({
                          animation: 'none',
                          contentStyle: { backgroundColor: '#F7F5F6' },
                          presentation:
                            (route.params as { source?: string } | undefined)?.source === 'add-record'
                              ? 'fullScreenModal'
                              : 'card',
                        })}
                      />
      </Stack>
    </>
  );
}
