import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DeleteAccountButton } from '@/components/delete-account';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { privacyPolicyUrl } from '@/constants/legal';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { openExternalUrl } from '@/lib/open-url';
import { decodeBase64, uploadJpeg } from '@/lib/upload-jpeg';

function logoPath(userId: string): string {
  return `users/${userId}/company-logo-${Date.now()}.jpg`;
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function profileErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : '';
  if (
    code.includes('permission-denied') ||
    code.includes('unauthorized') ||
    /permission denied/i.test(message) ||
    message.includes('403')
  ) {
    return 'Firebase blocked this. Allow this signed-in user to read and write settings/{uid} and Storage files under users/{uid}.';
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Could not save the company profile.';
}

export default function CompanyProfileScreen() {
  const theme = useTheme();
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [operativeName, setOperativeName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoRevision, setLogoRevision] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      try {
        const [{ doc, getDoc }, { getDb }, { requireUserId }] = await Promise.all([
          import('@/lib/firestore'),
          import('@/lib/firebase'),
          import('@/lib/firebase-auth'),
        ]);
        const snapshot = await getDoc(doc(getDb(), 'settings', requireUserId()));
        if (!active || !snapshot.exists()) {
          return;
        }
        const data = snapshot.data();
        setCompanyName(readText(data.companyName));
        setPhone(readText(data.phone));
        setEmail(readText(data.email));
        setAddress(readText(data.address));
        setWebsite(readText(data.website));
        setRegistrationNumber(readText(data.registrationNumber));
        setOperativeName(readText(data.operativeName));
        setLogoUrl(readText(data.logoUrl));
      } catch (error) {
        if (active) {
          setLoadError(profileErrorMessage(error));
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadProfile();
    return () => {
      active = false;
    };
  }, []);

  const pickLogo = async () => {
    if (isUploadingLogo) {
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Allow photo library access to upload your company logo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      base64: true,
    });
    const imageBase64 = result.canceled ? null : result.assets[0]?.base64;
    if (!imageBase64) {
      return;
    }

    setIsUploadingLogo(true);
    try {
      const bytes = decodeBase64(imageBase64);
      if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
        throw new Error('The selected photo could not be read as an image.');
      }
      const [{ ref, getDownloadURL, getProjectStorage }, { requireIdToken, requireUserId }] = await Promise.all([
        import('@/lib/firebase-storage'),
        import('@/lib/firebase-auth'),
      ]);
      const objectPath = logoPath(requireUserId());
      const storageRef = ref(getProjectStorage(), objectPath);
      await uploadJpeg(storageRef.bucket, objectPath, bytes, await requireIdToken());
      const downloadUrl = await getDownloadURL(storageRef);
      setLogoUrl(downloadUrl);
      setLogoRevision((current) => current + 1);
    } catch (error) {
      Alert.alert('Could not upload logo', profileErrorMessage(error));
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const saveProfile = async () => {
    const name = companyName.trim();
    if (!name || isSaving || isUploadingLogo) {
      if (!name) {
        Alert.alert('Company name needed', 'Enter your company or trading name before saving.');
      }
      return;
    }

    setIsSaving(true);
    try {
      const [{ doc, serverTimestamp, setDoc }, { getDb }, { requireUserId }] = await Promise.all([
        import('@/lib/firestore'),
        import('@/lib/firebase'),
        import('@/lib/firebase-auth'),
      ]);
      await setDoc(
        doc(getDb(), 'settings', requireUserId()),
        {
          companyName: name,
          phone: phone.trim(),
          email: email.trim(),
          address: address.trim(),
          website: website.trim(),
          registrationNumber: registrationNumber.trim(),
          operativeName: operativeName.trim(),
          logoUrl,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setCompanyName(name);
      Alert.alert('Profile saved', 'Your company details are ready for printable reports.');
    } catch (error) {
      Alert.alert('Could not save profile', profileErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const signOutAccount = async () => {
    if (isSigningOut) {
      return;
    }
    setIsSigningOut(true);
    try {
      const { getProjectAuth, signOut } = await import('@/lib/firebase-auth');
      await signOut(getProjectAuth());
    } catch (error) {
      Alert.alert('Could not sign out', profileErrorMessage(error));
      setIsSigningOut(false);
    }
  };

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <KeyboardAvoidingView
          style={styles.safeArea}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={theme.text} />
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
              {loadError ? <Text style={styles.error}>{loadError}</Text> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={logoUrl ? 'Replace company logo' : 'Tap to upload company logo'}
                disabled={isUploadingLogo}
                onPress={() => void pickLogo()}
                style={[styles.logoBox, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
                {logoUrl ? (
                  <Image
                    key={`${logoUrl}-${logoRevision}`}
                    source={{ uri: logoUrl }}
                    style={styles.logoImage}
                    contentFit="contain"
                    accessibilityLabel="Company logo"
                  />
                ) : (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.logoPlaceholder}>
                    Tap to upload company logo
                  </ThemedText>
                )}
                {isUploadingLogo ? (
                  <View style={styles.logoSpinner}>
                    <ActivityIndicator color="#FFFFFF" />
                  </View>
                ) : null}
              </Pressable>
              {logoUrl ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={isUploadingLogo}
                  onPress={() => setLogoUrl('')}
                  style={styles.removeLogo}>
                  <Text style={styles.removeLogoLabel}>Remove Logo</Text>
                </Pressable>
              ) : null}

              <Field
                label="Your name on evidence"
                value={operativeName}
                onChangeText={setOperativeName}
                placeholder="Name burned onto photos"
              />
              <Field label="Company / Trading Name" value={companyName} onChangeText={setCompanyName} placeholder="Required" />
              <Field
                label="Phone Number"
                value={phone}
                onChangeText={setPhone}
                placeholder="Optional"
                keyboardType="phone-pad"
              />
              <Field
                label="Email Address"
                value={email}
                onChangeText={setEmail}
                placeholder="Optional"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Field
                label="Business Address / Postcode"
                value={address}
                onChangeText={setAddress}
                placeholder="Optional"
                multiline
              />
              <Field
                label="Website (optional)"
                value={website}
                onChangeText={setWebsite}
                placeholder="https://"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <Field
                label="Registration / Accreditation No. (optional)"
                value={registrationNumber}
                onChangeText={setRegistrationNumber}
                placeholder="VAT / Gas Safe / NICEIC"
                autoCapitalize="characters"
                autoCorrect={false}
              />

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isSaving || isUploadingLogo }}
                disabled={isSaving || isUploadingLogo}
                onPress={() => void saveProfile()}
                style={[styles.submit, (isSaving || isUploadingLogo) && styles.submitDisabled]}>
                {isSaving ? <ActivityIndicator color="#FFFFFF" /> : null}
                <Text style={styles.submitLabel}>{isSaving ? 'Saving' : 'Save Profile'}</Text>
              </Pressable>
              <Pressable accessibilityRole="link" onPress={() => void openExternalUrl(privacyPolicyUrl())} style={styles.signOut}>
                <Text style={styles.privacy}>Privacy policy</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isSigningOut }}
                disabled={isSigningOut}
                onPress={() => void signOutAccount()}
                style={styles.signOut}>
                {isSigningOut ? <ActivityIndicator color="#B42318" /> : null}
                <Text style={styles.signOutLabel}>{isSigningOut ? 'Signing out' : 'Sign Out'}</Text>
              </Pressable>
              <DeleteAccountButton />
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Field({
  label,
  multiline = false,
  ...inputProps
}: {
  label: string;
  multiline?: boolean;
} & ComponentProps<typeof TextInput>) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[
          styles.input,
          multiline && styles.address,
          {
            color: theme.text,
            backgroundColor: theme.backgroundElement,
            borderColor: theme.backgroundSelected,
          },
        ]}
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  error: {
    color: '#B42318',
    fontSize: 14,
    lineHeight: 20,
  },
  logoBox: {
    height: 180,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoPlaceholder: {
    textAlign: 'center',
    paddingHorizontal: Spacing.four,
  },
  logoSpinner: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  removeLogo: {
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
  },
  removeLogoLabel: {
    color: '#B42318',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  field: {
    gap: Spacing.one,
  },
  input: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  address: {
    minHeight: 96,
    paddingTop: Spacing.three,
  },
  submit: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#208AEF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  submitDisabled: {
    opacity: 0.55,
  },
  submitLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  signOut: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  signOutLabel: {
    color: '#B42318',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  privacy: {
    color: '#208AEF',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
});
