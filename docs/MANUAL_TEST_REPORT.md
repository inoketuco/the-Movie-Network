# The Movie Network — Test Report

> **Draft.** Results below are from test runs on 28 September 2026. Rows marked
> **Pending** have not been run yet and must be completed (with screenshots)
> before submission.

## 1. Scope and environment

| Item | Details |
|---|---|
| App | The Movie Network (Expo SDK 57, React Native 0.86, Firebase 12) |
| Device | Android emulator, Pixel 9a (x86_64), Expo Go 57.0.9 |
| Other platforms | iOS bundle compiles; not run on an iOS device |
| Backend | Firebase Auth and Firestore (project in `.env`), Cloud Functions (`functions/`) |
| External APIs | TMDb, GIPHY, Google Places / Maps, OpenWeatherMap, Stripe (test mode) |
| Test data | Test account `tmn.qa.20260928@example.com` (deleted after testing); no real users or payments |

Three levels of testing were used:

- **Unit tests** check single functions in isolation (automated).
- **Integration tests** check that screens work with their services, and that each external API responds with the configured keys (automated and manual).
- **System tests** walk through complete user journeys in the running app on the emulator (manual).

## 2. Unit testing (automated)

Run with `npm test` (Jest) in the project root and `npm run check` in `functions/` (Node test runner).
The full output is saved in `docs/test-results/`.

| Test file | What it checks | Result |
|---|---|---|
| `functions/catalog.test.js` | Server-side prices, 5% tax, and rejection of unknown products and invalid quantities | 2/2 pass |
| `functions/loginCode.test.js` | Sign-in codes: random 6 digits, stored hashed, 10-minute expiry, lock after 5 wrong attempts, resend cooldown, tied to one sign-in session | 5/5 pass |
| `__tests__/utils.test.js` | Timeout helper, readable auth error messages, "Not yet rated" rating label, guard against the removed `absoluteFillObject` API | 5/5 pass |
| `__tests__/loginVerification.test.js` | Session counts as verified only when the claim matches this sign-in; token refreshed after a correct code; server errors passed to the screen | 3/3 pass |

## 3. Integration testing

### 3.1 Screens with their services (automated, Jest + React Native Testing Library)

External services are replaced with mocks, so the screen logic is tested on its own.

| Test file | Scenarios | Result |
|---|---|---|
| `AuthScreen.test.js` | Sign in (email trimmed and lower-cased), empty fields, wrong password message, sign-up with 6-character minimum | 4/4 pass |
| `LoginVerificationScreen.test.js` | Code emailed on open, correct code continues, wrong code shows attempts left, non-digits ignored, send failure, switch account | 5/5 pass |
| `Dashboard.test.js` | TMDb list with posters and ratings, missing poster, "Not yet rated", open a movie, API error with Retry, network failure | 4/4 pass |
| `ReviewScreen.test.js` | Existing reviews load, GIFs suggested from the movie title, wrong then correct code, review saved with GIF, button disabled until complete | 4/4 pass |
| `StoreScreen.test.js` | 10-per-item cap, totals with tax, declined payment, order saved and PDF generated automatically, share PDF, order-save warning, PDF retry | 7/7 pass |
| `TheaterMapScreen.test.js` | Places search around the user's location, distance and rating, weather per cinema, weather failure, permission denied, no cinemas found | 4/4 pass |

Coverage (from `npm run test:coverage`): 66.5% of lines overall. The six screens above cover 81–100% of their lines and the GIF search component 74%; `App.js` (navigation) and the admin screen have no automated tests yet.

### 3.2 Live API checks (manual, 28 Sep 2026)

Each API was called directly with the keys from `.env`.

| ID | API | Expected | Actual | Status |
|---|---|---|---|---|
| I-01 | TMDb trending movies | 200 with a list of movies | 200, 20 movies, all with posters | Pass |
| I-02 | GIPHY search | 200 with GIFs | 200 | Pass |
| I-03 | Google Places nearby search | 200 with cinemas | 200 (cinemas returned) | Pass |
| I-04 | OpenWeatherMap current weather | 200 with weather | **401 Invalid API key** | **Fail**: key must be replaced |
| I-05 | Firebase Auth, wrong password | Rejected | `INVALID_LOGIN_CREDENTIALS` | Pass |
| I-06 | Firestore read with a signed-in user | Allowed by rules | **403 Firestore API disabled** in the `.env` project | **Fail**: Firestore must be enabled |
| I-07 | Stripe PaymentIntent function | Client secret returned | Not deployed (`EXPO_PUBLIC_STRIPE_PAYMENT_ENDPOINT` empty) | Pending |
| I-08 | `sendLoginCode` / `verifyLoginCode` functions | Code emailed and accepted | Not deployed yet (see `MFA_SETUP.md`) | Pending |

## 4. System testing (manual, on the emulator)

| ID | Scenario | Steps | Expected | Actual (28 Sep) | Status |
|---|---|---|---|---|---|
| S-01 | Sign-in validation | Tap Sign in with empty fields | "Missing Details" message | As expected | Pass |
| S-02 | Wrong password | Enter a valid email and a wrong password | Clear error message | Initially showed raw "Firebase: Error (auth/invalid-credential)"; after fix: "The email or password is incorrect." | Pass (after fix) |
| S-03 | Sign-up validation | Create account with a 3-character password, then an invalid email | Password and email errors | Both rejected with messages | Pass |
| S-04 | Duplicate account | Sign up with an existing email | Clear error | "An account with this email already exists. Sign in instead." | Pass |
| S-05 | Sign-up success | Create account with valid details | Account created, dashboard shown | As expected | Pass |
| S-06 | Session persistence | Force-stop the app and reopen | Still signed in | As expected (also theme remembered) | Pass |
| S-07 | Logout | Tap Log out, then restart app | Sign-in screen, stays signed out | As expected | Pass |
| S-08 | Dashboard | Open Movies tab | Trending movies with posters and ratings | As expected | Pass |
| S-09 | Dark theme | Tap Dark | Theme switches and is remembered | As expected | Pass |
| S-10 | Status bar | Look at the top of each screen | Toolbar below the status bar | **Bug**: toolbar overlapped the clock and battery; fixed | Pass (after fix) |
| S-11 | Movie details | Tap a movie | Title, year, rating over the backdrop; review form visible | **Bug**: backdrop filled 1.5 screens and hid the form (removed `absoluteFillObject` API); fixed | Pass (after fix) |
| S-12 | Back navigation | Press Android Back on a movie | Return to the movie list | **Bug**: app closed; fixed | Pass (after fix) |
| S-13 | GIF search | Search empty, then "mind blown", pick a GIF | Validation, results, "Reaction ready" | As expected | Pass |
| S-14 | Review code | Enter a wrong code, then 123456 | Wrong code rejected; correct code posts | Wrong code rejected; posting hung forever because Firestore is disabled. **Bug**: fixed with a 15-second timeout and an error | Partial (blocked by I-06) |
| S-15 | Cart limit | Add one item 12 times | Cart stops at 10 | As expected (after fix to match the server) | Pass (after fix) |
| S-16 | Cart totals | Add 10 × $24.99 and 1 × $29.99 | Subtotal $279.89, tax $13.99, total $293.88 | As expected | Pass |
| S-17 | Failed payment | Simulate failed payment | Error shown, cart kept | "The simulated payment was declined." | Pass |
| S-18 | Successful payment | Simulate successful payment | Receipt with transaction number and total | As expected; order-save warning shown because Firestore is disabled | Pass |
| S-19 | PDF receipt | Share the receipt, open with Print | Correct PDF | **Bug**: sharing failed in Expo Go; fixed. PDF showed correct items, tax and total | Pass (after fix) |
| S-20 | Cinemas, permission denied | Deny location | Explanation shown | As expected | Pass |
| S-21 | Cinemas, permission granted | Allow location | Nearby cinemas with distance, rating and weather | Cinemas listed; no weather (I-04); map tiles blank on the emulator | Partial |
| S-22 | Profile sync | Sign in | Profile saved | Warning banner; Retry works (blocked by I-06) | Blocked |
| S-23 | Admin dashboard | Sign in as an admin | List of all users | Not tested: needs Firestore and an admin account | Pending |

### Retests needed after the latest changes

| ID | Scenario | Status |
|---|---|---|
| R-01 | Sign in: code emailed, wrong code, expired code, resend, correct code | Pending (deploy functions first) |
| R-02 | PDF generated automatically after payment; Save PDF to device (Android folder picker); Share PDF | Pending |
| R-03 | Movie screen: GIF suggestions for the movie title and reaction chips | Pending |
| R-04 | Movies: pull to refresh, Retry after turning off Wi-Fi | Pending |
| R-05 | Dark theme on the Cinemas, Store and Admin screens | Pending |
| R-06 | Safe areas on a device with a notch (layout after the SafeAreaView change) | Pending |
| R-07 | Reviews, orders and admin list with Firestore enabled | Pending |
| R-08 | Stripe test payment with card 4242 4242 4242 4242 | Pending |

## 5. Bugs found and fixed

| # | Bug | Fix |
|---|---|---|
| 1 | Overlays and background images broken (React Native 0.86 removed `StyleSheet.absoluteFillObject`) | Use `StyleSheet.absoluteFill`; test guards against it |
| 2 | Toolbar drawn under the Android status bar | Safe-area insets from `react-native-safe-area-context` |
| 3 | Posting a review or saving an order could hang forever | 15-second timeout with an error message |
| 4 | Order-save warning closed itself on Android | Shown on the receipt card instead |
| 5 | Receipt sharing failed in Expo Go | PDF saved to the app's cache before sharing |
| 6 | Android Back closed the app from a movie | Back returns to the movie list |
| 7 | Cart allowed more than the server's limit of 10 | Cart capped at 10 |
| 8 | Raw Firebase error text shown | Readable messages |
| 9 | Missing poster showed a broken image | "No poster" placeholder |

## 6. Known issues

- OpenWeatherMap key is rejected (I-04).
- Firestore is disabled in the Firebase project used by the app (I-06). `.firebaserc` also points to a different project.
- Stripe and sign-in-code functions are not deployed yet (I-07, I-08).
- The review "secure post" step still uses the fixed demo code 123456.
