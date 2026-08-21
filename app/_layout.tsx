import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PostHogProvider } from 'posthog-react-native';

import { CollectivesProvider } from '../src/context/CollectivesContext';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorFallback } from '../src/components/AppErrorFallback';
import { AccountProvider, useAccount } from '../src/context/AccountContext';
import { AnimalsProvider, useAnimals } from '../src/context/AnimalsContext';
import { OnboardingProvider, useOnboarding } from '../src/context/OnboardingContext';
import { RecordsProvider, useRecords } from '../src/context/RecordsContext';
import { SetupProvider, useSetup } from '../src/context/SetupContext';
import { SubscriptionProvider, useSubscription } from '../src/context/SubscriptionContext';

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
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
  const { isLoaded: setupLoaded } = useSetup();
  const { isLoaded: animalsLoaded } = useAnimals();
  const { isLoaded: recordsLoaded } = useRecords();
  const { isLoaded: accountLoaded } = useAccount();
  const { isReady: onboardingReady } = useOnboarding();
  const { loading: subscriptionLoading } = useSubscription();

  if (!setupLoaded || !animalsLoaded || !recordsLoaded || !accountLoaded || !onboardingReady || subscriptionLoading) {
    return (
      <View style={styles.loadingScreen}>
        <StatusBar style="dark" />
        <ActivityIndicator size="small" color="#E5635F" />
        <Text style={styles.loadingText}>Loading LivestockBook</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
                      screenOptions={{
                        headerShown: false,
                        contentStyle: { backgroundColor: '#F7F5F6' },
                        animation: 'simple_push',
                        // Short enough to feel immediate, long enough to still
                        // read as a movement. Below roughly 150ms the slide
                        // stops registering as direction and becomes a flicker,
                        // which is worse than having no animation at all.
                        // react-native-screens honours animationDuration for
                        // simple_push on both platforms.
                        animationDuration: 160,
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
                          animationDuration: 280,
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
                          animationDuration: 280,
                          contentStyle: { backgroundColor: '#F7F5F6' },
                          presentation: 'card',
                        }}
                      />
                      <Stack.Screen
                        name="edit-record"
                        options={{
                          animation: 'simple_push',
                          animationDuration: 280,
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
                          animationDuration: 280,
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

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#F7F5F6',
  },
  loadingText: {
    color: '#8A7F87',
    fontSize: 14,
    fontWeight: '600',
  },
});
