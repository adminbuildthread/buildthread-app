# BuildThread

BuildThread is an Expo app for UK tradespeople. It records before, during, and after photos for a job, with time, GPS, and an audit trail, starting with passive fire protection and other regulated work.

The icon and splash in `assets/images/` are placeholders (a “BT” mark on blue). Replace them before store submission.

## Firebase config

The app reads Firebase from `EXPO_PUBLIC_FIREBASE_*` variables. Real values stay out of git.

1. Copy `.env.example` to `.env.local`.
2. Paste the web app config from Firebase console → Project settings → Your apps.
3. Start the app with `npx expo start`.

### EAS environment variables

Store builds do not see `.env.local`. Set the same variables on the EAS project for the `development`, `preview`, and `production` environments. Create them as plain text variables, not secrets, because Expo inlines `EXPO_PUBLIC_*` into the client bundle.

```bash
npx eas-cli env:create --name EXPO_PUBLIC_FIREBASE_API_KEY --value "<from Firebase console>" --environment production --visibility plaintext
npx eas-cli env:create --name EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN --value "<project>.firebaseapp.com" --environment production --visibility plaintext
npx eas-cli env:create --name EXPO_PUBLIC_FIREBASE_PROJECT_ID --value "<project id>" --environment production --visibility plaintext
npx eas-cli env:create --name EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET --value "<project>.appspot.com" --environment production --visibility plaintext
npx eas-cli env:create --name EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID --value "<sender id>" --environment production --visibility plaintext
npx eas-cli env:create --name EXPO_PUBLIC_FIREBASE_APP_ID --value "<app id>" --environment production --visibility plaintext
```

Repeat for `preview` and `development`. Leave `EXPO_PUBLIC_FIREBASE_DATABASE_ID` unset when the database is `(default)`.

Optional:

```bash
npx eas-cli env:create --name EXPO_PUBLIC_PRIVACY_POLICY_URL --value "https://example.com/privacy" --environment production --visibility plaintext
```

If that variable is unset, the app uses `expo.extra.privacyPolicyUrl` in `app.json` (`https://buildthread.app/privacy`). Host the real policy and point the URL at it before submission. `PRIVACY.md` is the draft.

## Builds

`eas.json` has three profiles:

- `development` — dev client, Android APK, internal distribution.
- `preview` — store distribution, Android App Bundle, for Google Play closed testing. `eas submit --profile preview` uses the Play closed-testing track (`alpha`).
- `production` — store distribution, Android App Bundle, production track.

```bash
npx eas-cli build --profile preview --platform android
npx eas-cli submit --profile preview --platform android
npx eas-cli build --profile production --platform all
```

The iOS bundle id and Android package are `com.buildthread.app`. Version `1.0.0`, iOS build number `1`, Android version code `1`.

## Security rules

`firestore.rules`, `storage.rules`, and `firebase.json` are in the repo. They are not live until they are deployed:

```bash
npx firebase-tools deploy --only firestore:rules,storage
```

Use a Firebase project in the UK or the EU. The rules assume the `(default)` database. Evidence documents cannot be edited. Storage objects cannot be overwritten. Deletes run only while the account-deletion flag is set.

## Scripts

```bash
npx expo start
npx expo lint
npx tsc --noEmit
```
