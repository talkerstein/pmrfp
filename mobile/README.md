# PMRFP Mobile

Expo / React Native app for iOS + Android. Same Supabase backend as the web app —
same Auth, same Postgres, same RLS.

## Run it

```bash
cd mobile
cp .env.example .env      # fill in from the web app's .env.local
npm install
npx expo start            # then press i / a, or scan with Expo Go
```

`npx expo start --web` renders in a browser, which is the fastest way to check
screens without a device. Push notifications do not work there or in a simulator.

## What's built

| Screen | File | State |
|---|---|---|
| RFP board | `app/index.tsx` | Live. Reads `rfp_public`, hides closed posts, soonest deadline first. |
| RFP detail + paywall | `app/rfp/[id].tsx` | Live. Full row when entitled, teaser + unlock prompt otherwise. |
| Express interest | `app/rfp/[id].tsx` | Live. Writes to `rfp_interests` against the user's org. |
| Sign in | `app/sign-in.tsx` | Live. Same credentials as pmrfp.com. |
| Account + push toggle | `app/account.tsx` | Live, but push needs an EAS project — see below. |

## How the paywall works here

It isn't enforced in this app. `getRfp()` asks `rfp_posts` for the full row; if
the caller lacks access the database returns **no row**, and we fall back to the
`rfp_public` teaser. `has_active_trade_access()` — the same function the RLS
policies use — decides.

That means a bug in this code cannot leak a scope the user didn't pay for, and
the same protection applies to anything else that talks to the API. Keep it that
way: never gate content on a client-side boolean alone.

## Billing goes through the web on purpose

`account.tsx` and the unlock prompt open `pmrfp.com` in the system browser via
`expo-web-browser` rather than using in-app purchase.

Trade Pro is a B2B subscription for services consumed outside the app, so it sits
outside Apple/Google's IAP requirement. It also keeps the whole $249 instead of
losing roughly 30% of it. Do not add IAP without re-checking both store policies.

## Push notifications — not finished

`src/lib/push.ts` registers a device and stores the token in `device_push_tokens`
(migration `20260726000002_device_push_tokens.sql`).

**Still to do before push actually works:**

1. `eas init` — `getExpoPushTokenAsync()` requires a real `projectId`. Until then
   the account toggle reports "No EAS projectId configured."
2. Apply the `device_push_tokens` migration to Supabase.
3. Teach `src/app/api/cron/rfp-alerts/route.ts` to send Expo pushes alongside the
   emails it already sends. It runs with the service-role key, so it can read
   every token; batch to the Expo push API and drop tokens that come back
   `DeviceNotRegistered`.

Worth being honest about the sequencing: this alert fires when a *new matching
RFP* is posted. The board currently holds a handful of projects, so until supply
grows it will rarely fire.

## Not built yet

Directory/vendor browse, saved RFPs, notification preferences by trade and
region, onboarding and sign-up (sign-up deliberately stays on the web, where the
role picker and Stripe live).

## Repo notes

- The root `tsconfig.json` excludes `mobile`, so Next.js never typechecks React
  Native files. Don't remove that — the DOM and RN type libs conflict.
- `mobile/.env`, `mobile/.expo/`, `mobile/android/`, `mobile/ios/` are gitignored.
- Read the versioned docs at https://docs.expo.dev/versions/v57.0.0/ before
  changing SDK usage. SDK 57 renamed the notification handler fields
  (`shouldShowBanner` / `shouldShowList`, no more `shouldShowAlert`).
