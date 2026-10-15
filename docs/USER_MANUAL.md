# The Movie Network — User Manual

The Movie Network is a mobile app for movie fans. You can browse trending
films, post reviews with a reaction GIF, find cinemas near you (with the local
weather), and buy movie merchandise.

## 1. Running the app

### What you need

- Node.js 22 or newer
- The **Expo Go** app (SDK 57) on an Android or iOS phone, **or** the Android emulator from Android Studio
- A `.env` file in the project folder, filled in using `.env.example` as a template

### Start the app

```powershell
npm install
npx expo start
```

Then do one of the following:

- **Phone:** scan the QR code with the camera (iPhone) or with Expo Go (Android). The phone and computer must be able to reach each other. On restricted networks, such as university Wi-Fi, connect the computer to the phone's hotspot or use `npx expo start --tunnel`.
- **Android emulator:** start the emulator, then press `a` in the Expo terminal.

### Optional services

| Feature | Setup guide |
|---|---|
| Emailed sign-in code | `MFA_SETUP.md` |
| Real Stripe test payments | `STRIPE_SETUP.md` (otherwise checkout runs as a simulation) |

## 2. Creating an account and signing in

1. Tap **Create account** under the sign-in form.
2. Enter your email and a password of at least 6 characters, then tap **Create account**.
3. To sign in later, enter your email and password and tap **Sign in**.
4. **Two-step verification:** after the password, the app emails you a 6-digit code.
   Enter it and tap **Verify and continue**. The code expires after 10 minutes.
   Tap **Resend code** if it has not arrived (available once a minute).
   After 5 wrong attempts, request a new code.
5. You stay signed in when you close the app. Tap **Log out** at the top right to sign out.

## 3. Browsing movies

- The **Movies** tab lists today's trending films from TMDb, with poster, summary and rating.
- Pull the list down to refresh it. If loading fails, tap **Retry**.
- Tap **Dark** / **Light** to switch the theme. Your choice is remembered.

## 4. Writing a review

1. Tap a movie to open it.
2. **Step 1:** type your review (up to 800 characters).
3. **Step 2:** choose a reaction GIF. The app suggests GIFs for the movie's title; tap a
   suggestion chip (e.g. *mind blown*) or search for your own, then tap a GIF.
   Tap **Change** to pick another.
4. Tap **Verify and post review**, enter the demo code **123456**, and tap **Verify and post**.
5. Your review appears in the list below, marked **You**.

Use **< Back to movies** or your phone's Back button to return to the list.

## 5. Finding cinemas

1. Open the **Cinemas** tab and allow location access when asked.
2. The map shows cinemas within 15 km. Each one in the list shows its distance,
   rating and current weather at that cinema.
3. Tap a cinema to move the map to it; tap a map pin to see its name and weather.
4. Tap **Refresh** to search again.

## 6. Buying merchandise

1. Open the **Store** tab and tap **Add to cart** on any product (maximum 10 of each).
2. Tap **Cart** to review items. Use **−** and **+** to change quantities.
3. Tap **Proceed to checkout**:
   - With Stripe configured, tap **Pay with Stripe** and use test card
     `4242 4242 4242 4242`, any future date, any CVC.
   - Otherwise, tap **Simulate successful payment** or **Simulate failed payment**.
4. After a successful payment, the PDF receipt is created automatically:
   - **Save PDF to device:** on Android, choose a folder such as Downloads.
     On iPhone, choose **Save to Files** in the share sheet.
   - **Share PDF:** send the receipt by email, messaging and so on.
5. Tap **Continue shopping** to return to the store.

## 7. Admin dashboard

Accounts with the `admin` role (set in the Firebase console, in the user's
document in the `users` collection) see an **Admin** tab listing every
registered user with their role and last visit.

## 8. Troubleshooting

| Problem | Solution |
|---|---|
| "Request timed out" when opening on a phone | The phone cannot reach the computer. Use a hotspot, `--tunnel`, or the emulator. |
| "Your profile could not sync" | Check your connection and tap **Retry**. Firestore must be enabled for the project. |
| No weather shown for cinemas | Check `EXPO_PUBLIC_OPENWEATHER_API_KEY` in `.env`. |
| Checkout says "simulation" | Stripe is not configured; see `STRIPE_SETUP.md`. |
| Sign-in code never arrives | Check the spam folder, then tap **Resend code**. |
