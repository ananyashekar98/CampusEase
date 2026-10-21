import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, typography } from '../theme/theme';

// Without this, an unhandled render error anywhere in the tree unmounts the
// whole app and the screen just goes blank/white — there's nothing else to
// look at and no way to recover except reloading the page. This catches that
// error, shows what actually broke, and lets the user retry without losing
// their whole session (they don't get logged out, they just re-render).
//
// Wrap the whole app once (in App.js) for a last-resort net, AND wrap
// individual heavy/data-driven screens for a more targeted fallback — a crash
// in one tab shouldn't blank tabs that have nothing to do with it.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Caught by ErrorBoundary:', error, info?.componentStack);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Ionicons name="alert-circle-outline" size={40} color="#B5690C" />
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {this.props.label ? `${this.props.label} hit an error and couldn't render.` : "This screen hit an error and couldn't render."}
          </Text>
          {__DEV__ && (
            <Text style={styles.debug} selectable>
              {String(error?.message || error)}
            </Text>
          )}
          <Pressable style={styles.button} onPress={this.handleRetry}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: { alignItems: 'center', maxWidth: 420 },
  title: { ...typography.h2, marginTop: spacing.sm, textAlign: 'center' },
  message: { ...typography.body, color: '#666', marginTop: spacing.xs, textAlign: 'center' },
  debug: {
    ...typography.caption,
    color: '#B5690C',
    marginTop: spacing.sm,
    textAlign: 'center',
    backgroundColor: '#FDF0E3',
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  button: {
    marginTop: spacing.lg,
    backgroundColor: '#2B6CB0',
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
  },
  buttonText: { color: '#fff', fontWeight: '700' },
});
