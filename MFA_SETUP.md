# Two-step sign-in (emailed code) setup

After the password step, the app emails a 6-digit code and asks for it before
showing any data. Until `EXPO_PUBLIC_FUNCTIONS_BASE_URL` is set, the app skips
this step so development keeps working.

## How it works

1. `sendLoginCode` (Cloud Function) creates a random code, stores only a salted
   hash in `loginCodes/{uid}` (unreadable by the app), and emails the code.
   Codes expire after 10 minutes and can be resent once per minute.
2. `verifyLoginCode` checks the code (5 attempts per code). On success it sets a
   custom claim `mfaAuthTime` equal to the session's `auth_time`.
3. `firestore.rules` only allow reviews, orders and the admin user list when
   `mfaAuthTime == auth_time`, so each new sign-in must be verified again.

## Prerequisites

- The Firebase project on the Blaze plan (also needed for Stripe)
- Firestore enabled in the same project as the app's `.env` values
- A Gmail account with 2-Step Verification and an
  [app password](https://myaccount.google.com/apppasswords) for sending email

## Configure and deploy

1. Store the email credentials as secrets. Enter the values only when prompted:

   ```powershell
   npx.cmd firebase-tools functions:secrets:set SMTP_USER
   npx.cmd firebase-tools functions:secrets:set SMTP_PASSWORD
   ```

2. Deploy the functions and the rules together (the rules depend on the claim):

   ```powershell
   npx.cmd firebase-tools deploy --only functions,firestore:rules
   ```

3. Add the functions base URL to the root `.env` file:

   ```env
   EXPO_PUBLIC_FUNCTIONS_BASE_URL=https://us-central1-<project-id>.cloudfunctions.net
   ```

4. Restart Expo so the value is included in the app bundle:

   ```powershell
   npm.cmd start -- --clear
   ```

Never add the email password to the mobile `.env` file or source code.
