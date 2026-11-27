# PMRFP Mobile

The Expo app uses the PMRFP website API. Set `EXPO_PUBLIC_SITE_URL` to the
configured PMRFP HTTPS origin. Production defaults to `https://pmrfp.com`.

## Develop and build

```bash
cd mobile
npm ci
npx expo start --dev-client
```

Use a native development or store build registered for the `pmrfp` scheme to
exercise sign-in. The browser starts the normal PMRFP login and opens the app
after approval. A one-time code and device verifier complete the exchange.
The app keeps its session credential in Expo SecureStore. Signing out on the
phone revokes that credential. Revoking the originating PMRFP browser session
also invalidates it.

The public board uses `/api/mobile/rfps` and the project form loads its choices
from `/api/mobile/taxonomy`. PMRFP performs access checks on the server for
full RFPs, projects, photos, and submissions. Photo files are processed by the
website and stored in private Cloudflare R2.

The mobile app opens `pmrfp.com` in the system browser for signup and billing.
For push registration, configure the Expo project ID for the native build.
The device token registers with PMRFP when push is enabled.

Export both JavaScript bundles for a release check with:

```bash
npx expo export --platform ios --platform android
```

An Expo export verifies the bundles. The native app still needs signed builds
and device checks before distribution.

## Store builds

Link this directory to PMRFP's Expo project before running a store build. Use
the Apple Developer team and Google Play publisher that own `com.pmrfp.app`.
If either store already has a release, use its existing signing setup and seed
EAS with the latest uploaded build number before enabling automatic increments.

```bash
npx eas-cli build --platform all --profile production
```

Validate sign-in, sign-out, and project photo uploads on physical devices using
TestFlight and Google Play internal testing. Existing Google Play listings need
their upload key. A new listing requires a manual first upload in Play Console.
