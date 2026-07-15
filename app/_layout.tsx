import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AccountProvider } from '../src/context/AccountContext';
import { AnimalsProvider } from '../src/context/AnimalsContext';
import { RecordsProvider } from '../src/context/RecordsContext';
import { SetupProvider } from '../src/context/SetupContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SetupProvider>
        <AnimalsProvider>
          <RecordsProvider>
            <AccountProvider>
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
                  name="add-record"
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
                  name="records-filter"
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
              </Stack>
            </AccountProvider>
          </RecordsProvider>
        </AnimalsProvider>
      </SetupProvider>
    </SafeAreaProvider>
  );
}
