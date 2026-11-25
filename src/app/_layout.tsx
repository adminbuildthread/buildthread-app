import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, useColorScheme, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { VerifyEmail } from '@/components/verify-email';

SplashScreen.preventAutoHideAsync();

type SignedInUser = { uid: string; email: string; emailVerified: boolean } | null;

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SignedInUser>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [reminderProjectId, setReminderProjectId] = useState<string | null>(null);
  const onLogin = pathname === '/login' || pathname.endsWith('/login');

  useEffect(() => {
    let unsubscribe = () => {};
    let active = true;

    import('@/lib/firebase-auth')
      .then(({ getProjectAuth, onAuthStateChanged }) => {
        if (!active) {
          return;
        }
        unsubscribe = onAuthStateChanged(getProjectAuth(), (nextUser) => {
          setUser(
            nextUser
              ? { uid: nextUser.uid, email: nextUser.email ?? '', emailVerified: nextUser.emailVerified }
              : null,
          );
          setAuthLoading(false);
        });
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setUser(null);
        setAuthLoading(false);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};
    let active = true;
    void import('@/utils/reminders').then(({ subscribeReminderOpens }) => {
      if (!active) {
        return;
      }
      unsubscribe = subscribeReminderOpens(setReminderProjectId);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }
    const sync = () => {
      void import('@/utils/offlineQueue').then(({ syncOfflineQueue }) => syncOfflineQueue());
    };
    sync();
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        sync();
      }
    });
    const appState = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        sync();
      }
    });
    return () => {
      unsubscribeNet();
      appState.remove();
    };
  }, [authLoading, user]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!user && !onLogin) {
      router.replace('/login');
      return;
    }
    if (user && reminderProjectId) {
      const projectId = reminderProjectId;
      setReminderProjectId(null);
      router.push({ pathname: '/project/[id]', params: { id: projectId } });
      return;
    }
    if (user?.emailVerified && onLogin) {
      router.replace('/' as '/(tabs)/index');
    }
  }, [authLoading, onLogin, reminderProjectId, router, user]);

  const refreshUser = () => {
    void import('@/lib/firebase-auth').then(({ getProjectAuth }) => {
      const current = getProjectAuth().currentUser;
      setUser(
        current
          ? { uid: current.uid, email: current.email ?? '', emailVerified: current.emailVerified }
          : null,
      );
    });
  };

  const waitingForRoute = authLoading || (!user && !onLogin) || (!!user?.emailVerified && onLogin);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="new-project"
          options={{ presentation: 'modal', headerShown: true, title: 'Start New Project' }}
        />
        <Stack.Screen
          name="edit-project/[id]"
          options={{ presentation: 'modal', headerShown: true, title: 'Edit Project' }}
        />
        <Stack.Screen name="company-profile" options={{ headerShown: true, title: 'Company Profile' }} />
        <Stack.Screen name="project/[id]" options={{ headerShown: true }} />
      </Stack>
      {waitingForRoute ? (
        <View style={[styles.loading, colorScheme === 'dark' && styles.loadingDark]}>
          <ActivityIndicator size="large" color={colorScheme === 'dark' ? '#FFFFFF' : '#208AEF'} />
        </View>
      ) : null}
      {user && !user.emailVerified ? <VerifyEmail email={user.email} onRefresh={refreshUser} /> : null}
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingDark: {
    backgroundColor: '#000000',
  },
});
