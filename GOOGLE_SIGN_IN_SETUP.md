# Sign in with Google setup

The sign-in screen shows **Continue with Google** once this platform's OAuth
client ID is set in `.env`. Until then the button is hidden, so email sign-in
works as before.

## How it works

1. `GoogleSignInButton.js` uses `expo-auth-session` to open Google's sign-in
   page and get back an ID token.
2. It signs in to Firebase with `GoogleAuthProvider.credential(idToken)`.
3. `App.js` then runs the usual steps: the emailed sign-in code (if
   configured), the `users/{uid}` profile, and the nickname prompt for new users.

## Expo Go does not support Google sign-in

Google rejects Expo Go's `exp://` redirect address, so the button only works on
the web (`npx expo start --web`) or in a development build
(`npx expo run:android` / `npx expo run:ios`, or an EAS build). If you open the
app in Expo Go, Google shows an error page.

## Configure

1. In the [Firebase console](https://console.firebase.google.com) open
   **Authentication → Sign-in method** and enable **Google**.
2. Open [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
   for the same project and create OAuth client IDs:
   - **Web application** (Firebase usually creates one called "Web client
     (auto created by Google Service)"). Add `http://localhost:8081` to
     *Authorized JavaScript origins* and *Authorized redirect URIs*.
   - **Android**: package `com.themovienetwork.app` and the SHA-1 of your
     signing key (`cd android && ./gradlew signingReport` for a debug build).
   - **iOS**: bundle ID `com.themovienetwork.app`.
3. Add the IDs to `.env` and restart Expo:

   ```
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxxx.apps.googleusercontent.com
   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=xxxx.apps.googleusercontent.com
   EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=xxxx.apps.googleusercontent.com
   ```

If someone already has an email/password account with the same address,
Firebase links Google to it the first time they use the button (Google is a
trusted provider for Gmail addresses).
