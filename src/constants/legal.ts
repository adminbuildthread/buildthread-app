import Constants from 'expo-constants';

const PLACEHOLDER_PRIVACY_URL = 'https://buildthread.app/privacy';

export function privacyPolicyUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const extra = Constants.expoConfig?.extra as { privacyPolicyUrl?: unknown } | undefined;
  if (typeof extra?.privacyPolicyUrl === 'string' && extra.privacyPolicyUrl.trim()) {
    return extra.privacyPolicyUrl.trim();
  }
  return PLACEHOLDER_PRIVACY_URL;
}
