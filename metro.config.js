const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Expo's web server bundle resolves the Node export of Firestore, which depends
// on @grpc/grpc-js. Metro cannot bundle that package. Storage has the same
// Node entry. The browser and React Native builds talk to Firebase without
// those Node clients, so drop the Node condition for these packages only.
const firebaseClientEntrypoints = [
  'firebase/firestore',
  '@firebase/firestore',
  'firebase/storage',
  '@firebase/storage',
  'firebase/auth',
  '@firebase/auth',
];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform !== 'web' && (moduleName === 'firebase/auth' || moduleName === '@firebase/auth')) {
    const conditionNames = ['react-native', 'require', 'import', 'default'].filter((name) => name !== 'node');
    return context.resolveRequest(
      { ...context, unstable_conditionNames: conditionNames },
      '@firebase/auth',
      platform,
    );
  }

  const usesFirebaseClient = firebaseClientEntrypoints.some(
    (entry) => moduleName === entry || moduleName.startsWith(`${entry}/`),
  );

  if (!usesFirebaseClient) {
    return context.resolveRequest(context, moduleName, platform);
  }

  const conditionNames = (context.unstable_conditionNames ?? []).filter((name) => name !== 'node');
  return context.resolveRequest({ ...context, unstable_conditionNames: conditionNames }, moduleName, platform);
};

module.exports = config;
