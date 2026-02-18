import { Alert, Platform } from 'react-native';

/**
 * Show an alert that works on web (window.alert) and native (Alert.alert).
 * React Native's Alert.alert does nothing on web.
 */
export function showAlert(
  title: string,
  message?: string,
  options?: { text?: string; onPress?: () => void }[]
): void {
  if (Platform.OS === 'web') {
    const fullMessage = message ? `${title}\n\n${message}` : title;
    window.alert(fullMessage);
    options?.find((o) => o.onPress)?.onPress?.();
  } else {
    Alert.alert(title, message, options as Parameters<typeof Alert.alert>[2]);
  }
}
