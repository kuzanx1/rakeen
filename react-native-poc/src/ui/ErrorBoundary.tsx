import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './Text';

/**
 * The safety net this app has never had.
 *
 * A JS exception thrown during render, in a release build with no
 * boundary, does not show an error -- it terminates the process. Every
 * crash reported from a till so far has looked the same from the outside:
 * the app simply closes, with nothing to go on. That includes the
 * hooks-order crash after login and the Intl crash on the stale-shift
 * screen, both of which took a full debugging round to find precisely
 * because the app said nothing.
 *
 * This does not make bugs go away. It makes them REPORTABLE: the till
 * stays up, the cashier can retry, and the actual message is on screen to
 * be read out or photographed instead of lost.
 *
 * Deliberately dependency-free -- no theme hook, no shared styles, no
 * navigation. Whatever broke may be the very thing this would otherwise
 * reach for, and a fallback that can itself throw is not a fallback.
 * Being a class is not a style choice either: getDerivedStateFromError has
 * no hook equivalent.
 */
interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Kept on the console for a dev build / attached device log. Not sent
    // anywhere: this app has no crash reporter, and inventing one here
    // would be a bigger decision than a fallback screen.
    console.error('[Rakeen] render error', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>صار خطأ غير متوقع</Text>
          <Text style={styles.sub}>
            التطبيق وقف عند هذي الشاشة. اضغط «إعادة المحاولة» — وإذا تكرر، صوّر هذي الرسالة وأرسلها.
          </Text>
          <View style={styles.box}>
            <Text style={styles.detail} selectable>
              {String(error?.message || error)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.button}
            activeOpacity={0.85}
            onPress={() => this.setState({ error: null })}>
            <Text style={styles.buttonText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }
}

// Literal values, not tokens: see the class comment.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EEF1E6' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: '800', color: '#12261A', textAlign: 'center', marginBottom: 8 },
  sub: { fontSize: 13, lineHeight: 21, color: 'rgba(18,38,26,0.6)', textAlign: 'center', marginBottom: 18 },
  box: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(18,38,26,0.09)',
    padding: 14,
    marginBottom: 18,
  },
  detail: { fontSize: 12, lineHeight: 18, color: '#C0523A', writingDirection: 'ltr', textAlign: 'left' },
  button: {
    backgroundColor: '#C7FF4D',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonText: { fontSize: 14, fontWeight: '800', color: '#053E22' },
});
