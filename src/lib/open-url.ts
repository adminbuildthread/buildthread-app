import { Linking } from 'react-native';

export async function openExternalUrl(url: string): Promise<void> {
  const supported = await Linking.canOpenURL(url);
  if (!supported) {
    throw new Error('Could not open that link on this device.');
  }
  await Linking.openURL(url);
}
