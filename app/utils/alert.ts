import { Alert, Platform } from 'react-native';

/**
 * Show an alert that works on web (window.confirm/alert) and native (Alert.alert).
 * React Native's Alert.alert does nothing on web.
 */
export function showAlert(
  title: string,
  message?: string,
  options?: { text?: string; style?: string; onPress?: () => void }[]
): void {
  if (Platform.OS === 'web') {
    const fullMessage = message ? `${title}\n\n${message}` : title;
    const hasDestructive = options?.some((o) => o.style === 'destructive');
    const hasCancel = options?.some((o) => o.style === 'cancel');

    if (hasDestructive && hasCancel) {
      const confirmed = window.confirm(fullMessage);
      if (confirmed) {
        const action = options?.find((o) => o.style === 'destructive');
        action?.onPress?.();
      } else {
        const cancel = options?.find((o) => o.style === 'cancel');
        cancel?.onPress?.();
      }
    } else if (options && options.length > 1) {
      const confirmed = window.confirm(fullMessage);
      if (confirmed) {
        const action = options.find((o) => o.style !== 'cancel' && o.onPress);
        action?.onPress?.();
      }
    } else {
      window.alert(fullMessage);
      options?.find((o) => o.onPress)?.onPress?.();
    }
  } else {
    Alert.alert(title, message, options as Parameters<typeof Alert.alert>[2]);
  }
}
