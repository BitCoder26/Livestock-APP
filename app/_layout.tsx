import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PostHogProvider } from 'posthog-react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorFallback } from '../src/components/AppErrorFallback';
import { AccountProvider } from '../src/context/AccountContext';
import { AnimalsProvider } from '../src/context/AnimalsContext';
import { OnboardingProvider } from '../src/context/OnboardingContext';
import { RecordsProvider } from '../src/context/RecordsContext';
import { SetupProvider } from '../src/context/SetupContext';
import { SubscriptionProvider } from '../src/context/SubscriptionContext';

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
              <RecordsProvider>
                <AccountProvider>
                  <OnboardingProvider>
                    <StatusBar style="dark" />
                    <Stack
                      screenOptions={{
                        headerShown: false,
                        contentStyle: { backgroundColor: '#F7F5F6' },
                        animation: 'slide_from_right',
                        animationDuration: 280,
                      }}
                    >
                      <Stack.Screen
                        name="welcome"
                        options={{
                          animation: 'fade',
                          animationDuration: 280,
                          gestureEnabled: false,
                        }}
                      />
                      <Stack.Screen
                        name="add-record"
                        options={({ route }) =>
                          (route.params as { reveal?: string } | undefined)?.reveal === '1'
                            ? {
                                animation: 'none',
                                contentStyle: { backgroundColor: '#F7F5F6' },
                                presentation: 'card',
                              }
                            : {
                                animation: 'slide_from_right',
                                animationDuration: 280,
                              }
                        }
                      />
                      <Stack.Screen
                        name="add-animal"
                        options={({ route }) =>
                          (route.params as { reveal?: string } | undefined)?.reveal === '1'
                            ? {
                                animation: 'none',
                                contentStyle: { backgroundColor: 'transparent' },
                                presentation: 'transparentModal',
                              }
                            : {
                                animation: 'slide_from_right',
                                animationDuration: 280,
                              }
                        }
                      />
                      <Stack.Screen
                        name="view-record"
                        options={{
                          animation: 'slide_from_right',
                          animationDuration: 280,
                          contentStyle: { backgroundColor: '#F7F5F6' },
                          presentation: 'card',
                        }}
                      />
                      <Stack.Screen
                        name="edit-record"
                        options={{
                          animation: 'slide_from_right',
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
                        name="upgrade-to-pro"
                        options={{
                          animation: 'none',
                          contentStyle: { backgroundColor: 'transparent' },
                          presentation: 'transparentModal',
                        }}
                      />
                      <Stack.Screen
                        name="setup-farms"
                        options={{
                          animation: 'slide_from_right',
                          animationDuration: 280,
                          contentStyle: { backgroundColor: '#F7F5F6' },
                          presentation: 'card',
                        }}
                      />
                      <Stack.Screen
                        name="setup-paddocks"
                        options={{
                          animation: 'slide_from_right',
                          animationDuration: 280,
                          contentStyle: { backgroundColor: '#F7F5F6' },
                          presentation: 'card',
                        }}
                      />
                      <Stack.Screen
                        name="setup-groups"
                        options={{
                          animation: 'slide_from_right',
                          animationDuration: 280,
                          contentStyle: { backgroundColor: '#F7F5F6' },
                          presentation: 'card',
                        }}
                      />
                      <Stack.Screen
                        name="setup-medicines"
                        options={{
                          animation: 'slide_from_right',
                          animationDuration: 280,
                          contentStyle: { backgroundColor: '#F7F5F6' },
                          presentation: 'card',
                        }}
                      />
                    </Stack>
                  </OnboardingProvider>
                </AccountProvider>
              </RecordsProvider>
            </AnimalsProvider>
          </SetupProvider>
        </SubscriptionProvider>
      </SafeAreaProvider>
    </PostHogProvider>
  );
}
