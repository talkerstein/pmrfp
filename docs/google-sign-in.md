# Turning on "Continue with Google"

Once this code is deployed, the button stays hidden until Google is switched
on in Supabase, then shows up by itself on /sign-in and /sign-up within about
5 minutes. No redeploy needed. One-time setup, about 15 minutes:

## 1. Google Cloud Console (console.cloud.google.com)

Use a project owned by the PMRFP Google account (create one called "PMRFP" if needed).

1. **APIs & Services → OAuth consent screen**
   - User type: **External**
   - App name: **PMRFP**
   - User support email: your support address
   - App logo: optional (adding one can trigger Google's brand review)
   - Authorized domains: **pmrfp.com**
   - Developer contact email: your address
   - Scopes: **openid**, **email** and **profile** only. These don't need Google's app verification.
   - Publishing status: click **Publish app** so anyone can sign in, not just test users.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: `PMRFP Supabase`
   - Authorized JavaScript origins: `https://pmrfp.com`
   - Authorized redirect URIs: **`https://tumexryzbzmtijvbloch.supabase.co/auth/v1/callback`**
     (exactly this: Google sends people back to Supabase, not to pmrfp.com)
   - Create, then copy the **Client ID** and **Client secret**.

## 2. Supabase dashboard (project tumexryzbzmtijvbloch)

1. **Authentication → Sign In / Providers → Google**
   - Turn on **Enable Sign in with Google**
   - Paste the **Client ID** and **Client secret**
   - Save
2. **Authentication → URL Configuration**
   - Site URL: **`https://pmrfp.com`**
   - Redirect URLs: add **`https://pmrfp.com/**`**
   - Optional, to test on Vercel preview links: add `https://pmrfp-*.vercel.app/**`,
     and `http://localhost:3000/**` for local testing.
   - Keep the existing `…/onboarding` and `…/reset-password` entries.

## 3. Check it

Wait about 5 minutes, then open https://pmrfp.com/sign-in in a private window.
You should see "Continue with Google" above the email form. New people who use
it are asked one question ("How will you use PMRFP?") and then carry on to the
normal account setup. Existing members who sign in with the same Gmail address
land in their usual account.

## How it works (for developers)

- `src/lib/auth/google.ts`: `isGoogleAuthEnabled()` reads
  `/auth/v1/settings` (cached 5 minutes). No button unless `external.google` is true.
- `src/components/forms/google-button.tsx`: starts `signInWithOAuth` with
  `redirectTo = <origin>/auth/callback?next=…`.
- `src/app/auth/callback/route.ts`: swaps the code for a session cookie, then
  goes to onboarding (new people) or `next` / their dashboard (members). Any
  failure goes to `/sign-in?error=google`.
- Google sign-ups get the database default role (`trade`) and no role in
  their auth metadata. Onboarding asks them once. `chooseRoleAction`, guarded by
  `resolveRolePick()` in `src/lib/auth/oauth.ts`, can only switch them to
  trade, property manager (optionally as a general contractor) or supplier, and
  only before onboarding is finished. Email sign-ups never see this question.

To turn it off, disable the Google provider in Supabase. The button disappears
within 5 minutes.
