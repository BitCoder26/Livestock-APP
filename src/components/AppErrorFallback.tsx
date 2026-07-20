import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { tokens } from '../theme/tokens';

type AppErrorFallbackProps = {
  error: Error;
  onRetry: () => void | Promise<void>;
};

export function AppErrorFallback({ error, onRetry }: AppErrorFallbackProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>LivestockBook</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            Try again first. If this keeps happening, close and reopen the app.
          </Text>
          {error.message ? <Text style={styles.detail}>{error.message}</Text> : null}
          <Pressable onPress={onRetry} style={styles.button}>
            <Text style={styles.buttonLabel}>Try again</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F5F6',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingVertical: 28,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    shadowColor: tokens.colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: tokens.colors.accentDeep,
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  body: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: tokens.colors.textSoft,
  },
  detail: {
    marginTop: 16,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.muted,
  },
  button: {
    alignSelf: 'flex-start',
    marginTop: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accent,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
