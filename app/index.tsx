import { Redirect } from 'expo-router';

import { useOnboarding } from '../src/context/OnboardingContext';

export default function Index() {
  const { isReady, step } = useOnboarding();

  if (!isReady) {
    return null;
  }

  switch (step) {
    case 'welcome':
      return <Redirect href="/welcome" />;
    case 'setup':
      return <Redirect href="/(tabs)/setup" />;
    case 'animal':
      return <Redirect href="/(tabs)/animals" />;
    default:
      return <Redirect href="/(tabs)/records" />;
  }
}
