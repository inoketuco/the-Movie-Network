# The Movie Network

A React Native (Expo) mobile app for movie fans. Browse trending films, watch trailers, post reviews with a reaction GIF, find cinemas near you with the local weather, and buy movie-themed merchandise. Firebase handles accounts and data, and Cloud Functions handle payments and the emailed sign-in code.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Running the app](#running-the-app)
- [Testing](#testing)
- [Firebase backend](#firebase-backend)
- [Payments](#payments)
- [Security model](#security-model)
- [User roles](#user-roles)
- [Troubleshooting](#troubleshooting)
- [Further documentation](#further-documentation)

---

## Features

| Area | What it does |
|---|---|
| **Movies** | Trending and genre lists from TMDb, pull-to-refresh, movie details with runtime, plot ("Read more" for long plots) and an embedded YouTube trailer |
| **Reviews** | Read reviews as a guest; signed-in users post reviews with an optional reaction GIF from Giphy |
| **Cinemas** | Map of nearby cinemas (Google Places) based on your location, with current weather (OpenWeather). Choose the map style (standard, satellite, hybrid, terrain/muted) and layers (traffic, 3D buildings, indoor maps), make the map bigger, and get driving, walking, cycling or transit routes drawn on the map (Google Routes API) or opened in Google Maps |
| **Store** | Merch (tees, posters, pins, mugs) printed with movie and cast art from TMDb, cart, checkout, and PDF receipts you can save or share |
| **Accounts** | Email/password sign-up via Firebase Auth, optional nickname, and an emailed 6-digit code as a second sign-in step |
| **Admin** | Admin users get an extra tab listing registered users |
| **Theme** | Dark (default) and light "glass" themes, with a blurred backdrop from today's top trending movie. The choice is saved on the device |
| **Guest mode** | Browse everything without an account; the sign-in screen only opens when an action needs it, and a guest's cart survives sign-in |

---

## Tech stack

**App**
- Expo SDK 57, React Native 0.86, React 19
- Firebase JS SDK 12 (Auth + Firestore)
- `react-native-maps`, `expo-location`
- `react-native-youtube-iframe`, `expo-web-browser`
- `expo-print`, `expo-sharing`, `expo-file-system` (receipts)
- `@stripe/stripe-react-native` (optional Stripe checkout)
- `@react-native-async-storage/async-storage`

**Backend (`functions/`)**
- Firebase Cloud Functions v2 on Node 22
- `firebase-admin`, `stripe`, `nodemailer`
- Whop hosted checkout and webhook

**External APIs**
- [TMDb](https://www.themoviedb.org/) for movies, images and trailers
- [Giphy](https://developers.giphy.com/) for review GIFs
- [Google Maps / Places](https://developers.google.com/maps) for cinemas
- [OpenWeather](https://openweathermap.org/api) for weather

**Testing**
- Jest 29 with `jest-expo` and React Native Testing Library
- Node's built-in test runner for the Cloud Functions

---

## Project structure

```
The Movie Network/
├── App.js                     # Root: auth state, tabs, theme, routing between screens
├── index.js                   # Expo entry point
├── app.config.js              # Expo config (name, bundle IDs, plugins, Maps key)
├── firebaseConfig.js          # Firebase init from EXPO_PUBLIC_FIREBASE_* vars
│
├── AuthScreen.js              # Sign in / register
├── LoginVerificationScreen.js # Enter the emailed 6-digit code
├── loginVerification.js       # Calls sendLoginCode / verifyLoginCode
├── NicknameScreen.js          # Choose or edit a display name
├── nickname.js                # Nickname validation and helpers
├── authErrors.js              # Friendly Firebase Auth error messages
│
├── Dashboard.js               # Movies tab: trending and genre lists
├── MovieDetails.js            # Details and trailer for one movie
├── ReviewScreen.js            # Reviews for a movie, posting a review
├── GifSearch.js               # Giphy picker used in reviews
├── TheaterMapScreen.js        # Cinemas tab: map, nearby cinemas, weather
│
├── StoreScreen.js             # Store tab: products, cart, receipts
├── MerchArt.js                # Renders movie/cast art on products
├── CheckoutPanel.js           # Picks Whop, Stripe, or the demo card form
├── WhopCheckout.js            # Whop hosted checkout
├── StripeCheckout.js          # Stripe PaymentSheet checkout
├── MockCardCheckout.js        # Demo card form (no real charge)
├── receiptService.js          # Builds, saves and shares PDF receipts
│
├── AdminDashboard.js          # Admin tab: user list
├── theme.js                   # Colours, spacing, typography, glass background
├── ui.js                      # Shared UI components (Button, Banner, Sheet, ...)
├── withTimeout.js             # Promise timeout helper
│
├── functions/                 # Firebase Cloud Functions
│   ├── index.js               # createPaymentIntent, createWhopCheckout, whopWebhook,
│   │                          # sendLoginCode, verifyLoginCode
│   ├── catalog.js             # Server-side product prices and order totals
│   ├── loginCode.js           # Code generation and hashing
│   ├── whop.js                # Whop API and webhook helpers
│   └── *.test.js              # Function tests
│
├── __tests__/                 # Jest tests for the app
├── jest.setup.js              # Test mocks and fake env vars
├── firestore.rules            # Firestore security rules
├── firebase.json / .firebaserc
├── docs/                      # User manual, manual test report, test results
├── MFA_SETUP.md               # Emailed sign-in code setup
├── STRIPE_SETUP.md            # Stripe test checkout setup
└── WHOP_SETUP.md              # Whop checkout setup
```

---

## Getting started

### Prerequisites

- **Node.js 22** or newer
- **Expo Go** (SDK 57) on an Android or iOS phone, **or** an Android emulator from Android Studio
- API keys for the services you want to use (see below). The app runs with missing keys; the affected features show a message instead.
- For the backend: the Firebase CLI (`npx firebase-tools`) and a Firebase project on the **Blaze** plan

### Install

```powershell
npm install
cd functions
npm install
cd ..
```

### Configure

Copy `.env.example` to `.env` and fill in the values:

```powershell
copy .env.example .env
```

---

## Environment variables

All app variables start with `EXPO_PUBLIC_`, which means they are **bundled into the app and visible to anyone who has it**. Only put public keys here. Secret keys (Stripe secret, Whop API key, SMTP password) go in Firebase secrets, never in `.env`.

The Stripe and Whop entries can hold mock placeholders (`pk_test_mock_…`, `mock://…`, listed in `mockPayments.js`). The app treats those as not configured and keeps the demo card checkout; swap in real values to switch on Stripe or Whop.

| Variable | Required for | Notes |
|---|---|---|
| `EXPO_PUBLIC_TMDB_API_KEY` | Movies, details, trailers, store art, backdrop | Core feature |
| `EXPO_PUBLIC_GIPHY_API_KEY` | GIFs in reviews | |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Cinemas map, search and directions | Also used by `app.config.js` for native maps. Enable the **Places API (New)** and **Routes API** for this key |
| `EXPO_PUBLIC_OPENWEATHER_API_KEY` | Weather on the Cinemas tab | |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Accounts, reviews, orders | |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | | |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | | |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | | |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | | |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | | |
| `EXPO_PUBLIC_FUNCTIONS_BASE_URL` | Emailed sign-in code | If empty, the code step is skipped. See [MFA_SETUP.md](MFA_SETUP.md) |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe checkout | `pk_test_...`. See [STRIPE_SETUP.md](STRIPE_SETUP.md) |
| `EXPO_PUBLIC_STRIPE_PAYMENT_ENDPOINT` | Stripe checkout | URL of `createPaymentIntent` |
| `EXPO_PUBLIC_WHOP_CHECKOUT_ENDPOINT` | Whop checkout | URL of `createWhopCheckout`. See [WHOP_SETUP.md](WHOP_SETUP.md) |
| `EXPO_PUBLIC_WHOP_TEST_MODE` | Whop checkout | Defaults to test mode; set to `false` only when going live |

The Cloud Functions have their own `functions/.env` (copy `functions/.env.example`) for `WHOP_COMPANY_ID`, `WHOP_PRODUCT_ID` and `WHOP_API_BASE`.

After changing `.env`, restart Expo with `--clear` so the new values are bundled.

---

## Running the app

```powershell
npm start            # expo start
npm run android      # open on an Android device/emulator
npm run ios          # open on an iOS device/simulator
```

- **Phone:** scan the QR code with the camera (iPhone) or Expo Go (Android). The phone and computer must be on a network where they can reach each other.
- **Restricted networks** (university Wi-Fi, phone hotspot, firewalls): use a tunnel:

  ```powershell
  npx expo start --tunnel --clear
  ```

- **Android emulator:** start the emulator, then press `a` in the Expo terminal.

---

## Testing

### App tests (Jest)

```powershell
npm test                 # run all tests in __tests__/
npm run test:coverage    # with a coverage report
```

`jest.setup.js` sets fake API keys and mocks native modules, so tests do not call real services. The `functions/` folder and `dist/` are excluded from Jest.

### Cloud Function tests

```powershell
cd functions
npm run check            # syntax check + node --test on catalog, loginCode and whop
```

Saved results from previous runs are in [docs/test-results/](docs/test-results/), and the manual test pass is in [docs/MANUAL_TEST_REPORT.md](docs/MANUAL_TEST_REPORT.md).

---

## Firebase backend

Firebase project: `the-movie-network-c2507` (see `.firebaserc`).

### Firestore collections

| Collection | Contents | Who can access |
|---|---|---|
| `users/{uid}` | `role`, `nickname`, `lastVisited` | The user (read, limited update) and admins (read) |
| `reviews/{id}` | Review text, GIF, movie id and title, `userId`, author name, timestamp | Anyone can read; verified users create and edit their own |
| `orders/{id}` | Items, totals, status (`pending` / `paid` / `needs_review`) | Verified owner and admins can read |
| `loginCodes/{uid}` | Salted hash of the sign-in code | Cloud Functions only |

### Cloud Functions

| Function | Purpose |
|---|---|
| `sendLoginCode` | Creates a 6-digit code, stores a salted hash, emails it (expires in 10 min, resend once per minute) |
| `verifyLoginCode` | Checks the code (5 attempts) and sets the `mfaAuthTime` custom claim |
| `createPaymentIntent` | Prices the cart server-side and creates a Stripe PaymentIntent |
| `createWhopCheckout` | Prices the cart, saves a `pending` order, creates a Whop checkout |
| `whopWebhook` | Verifies Whop's signature and amount, marks the order `paid` |

### Deploy

```powershell
npx.cmd firebase-tools deploy --only functions,firestore:rules
```

Set secrets first (you'll be prompted for each value):

```powershell
npx.cmd firebase-tools functions:secrets:set SMTP_USER
npx.cmd firebase-tools functions:secrets:set SMTP_PASSWORD
npx.cmd firebase-tools functions:secrets:set STRIPE_SECRET_KEY
npx.cmd firebase-tools functions:secrets:set WHOP_API_KEY
npx.cmd firebase-tools functions:secrets:set WHOP_WEBHOOK_SECRET
```

You only need the secrets for the functions you deploy. For example, the Whop guide deploys only the two Whop functions.

---

## Payments

`CheckoutPanel.js` picks the checkout automatically:

1. **Whop** if `EXPO_PUBLIC_WHOP_CHECKOUT_ENDPOINT` is set
2. **Stripe** if both Stripe variables are set
3. Otherwise a **demo card form** that charges nothing

Prices always come from `functions/catalog.js` on the server, never from the app, so the cart total can't be tampered with. Tax is 5%.

| Product | Price |
|---|---|
| Character T-Shirt | $24.99 |
| Movie Poster Tee | $29.99 |
| Movie Poster | $14.99 |
| Premiere Scene Print | $18.99 |
| Character Enamel Pin | $8.99 |
| Movie Scene Mug | $12.99 |

Test card for Stripe and Whop sandbox: `4242 4242 4242 4242`, any future expiry, any 3-digit CVC.

After payment the app shows a receipt that can be saved as a PDF or shared.

---

## Security model

- **Two-step sign-in:** after the password, the user enters an emailed code. `verifyLoginCode` sets a custom claim `mfaAuthTime` equal to the session's `auth_time`. `firestore.rules` require `mfaAuthTime == auth_time` for posting reviews, reading orders and admin access, so **every new sign-in must be verified again**.
- **Roles can't be self-assigned:** new user documents must be created with `role == 'user'`, and users can only update `nickname` and `lastVisited`. Admins are promoted manually in the Firebase console.
- **Orders** can't be updated or deleted from the app; payment status is set only by the server.
- **Secrets** live in Firebase Secret Manager. `.env` is git-ignored and only contains public keys.

---

## User roles

| Role | Can do |
|---|---|
| **Guest** | Browse movies, trailers, reviews, cinemas and the store; fill a cart |
| **User** | Everything a guest can, plus post reviews, check out, and set a nickname |
| **Admin** | Everything a user can, plus the Admin tab with the user list |

To make someone an admin, open their `users/{uid}` document in the Firebase console and set `role` to `admin`.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Phone can't connect to Expo | Use `npx expo start --tunnel --clear` |
| `adb` won't connect to the emulator | Another program (e.g. NTKDaemon) may be using adb's port 5037; close it and restart adb |
| "TMDb is not configured" / "Giphy is not configured" | Add the key to `.env` and restart with `--clear` |
| Cinemas tab says keys are missing | Set `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` and `EXPO_PUBLIC_OPENWEATHER_API_KEY` |
| `.env` changes don't show up | Restart Expo with `--clear` |
| Permission denied writing a review or reading orders | The session hasn't passed the emailed code step, or the rules/functions aren't deployed |
| Whop order stays `pending` | Check the webhook delivery log in Whop and `npx.cmd firebase-tools functions:log --only whopWebhook` |

More troubleshooting is in [WHOP_SETUP.md](WHOP_SETUP.md).

---

## Further documentation

- [docs/USER_MANUAL.md](docs/USER_MANUAL.md): how to use the app
- [docs/MANUAL_TEST_REPORT.md](docs/MANUAL_TEST_REPORT.md): manual test results
- [MFA_SETUP.md](MFA_SETUP.md): emailed sign-in code
- [STRIPE_SETUP.md](STRIPE_SETUP.md): Stripe test checkout
- [WHOP_SETUP.md](WHOP_SETUP.md): Whop checkout, sandbox and going live
