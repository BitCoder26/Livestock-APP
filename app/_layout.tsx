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
                  animation: 'fade',
                }}
              />
            </AccountProvider>
          </RecordsProvider>
        </AnimalsProvider>
      </SetupProvider>
    </SafeAreaProvider>
  );
}
