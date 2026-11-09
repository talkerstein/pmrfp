# Two-message Auth delivery rehearsal — applied and closed

The single earlier SMTP test was received. This separate rehearsal would send exactly one generated verification message and one generated password-reset message from `info@pmrfp.com` to `dev@talkerstein.ca` through Cloudflare Auth → protected Vercel relay → Hostinger SMTP.

Only synthetic fixture `00000000-0000-4000-8000-000000000012` is eligible. The relay never accepts a caller-selected real recipient, subject or body. The account remains `@example.invalid`; its messages are redirected to the fixed approved test inbox. Subjects:

- `PMRFP preview: verify your email`
- `PMRFP preview: reset your password`

The fixed body identifies an isolated migration test, includes the generated test link and states its 15-minute expiry. Links point to the private gateway-protected synthetic Auth Worker; they grant no customer account or application access. The test driver follows them through the existing private gateway, so the recipient need not click or provide a password.

## Bounds and approval

No additional email is authorized by preparing this change. Delivery stays disabled unless branch-only Preview variables explicitly select `approved-dev-test` and a hard deadline no more than 15 minutes away. Production is always denied. The Cloudflare callback mode must separately select `synthetic-delivery-test`, using temporary relay gateway and same-project OIDC credentials. Ordinary outbox/dry-run modes do not send email.

The local private driver records each of the two attempts before its corresponding callback request and refuses any automatic rerun or retry, including an uncertain response. SMTP has a single `sendMail` call per callback. The fixture has `sendOnSignIn: false`, preventing incidental verification messages during login. No newsletter/customer/billing delivery is enabled.

After approval: enable the bounded test window, deploy the tested relay/callback code, run the two-attempt driver once, verify confirmation/reset/session revocation/replay denial, then remove the temporary Worker relay secrets and branch delivery variables. Restore the fixture's original credential/verification state and remove its test sessions/tokens/outbox entries. A final default deployment keeps future delivery disabled. Retained test deployment code also denies delivery after its hard deadline.

## Validation

Local contract tests cover the fixed sender/recipient/fixture, wrong recipient/identity, production/mode/expiry denials, verified Hostinger TLS and safe provider errors. Existing native dry-run proof covers generated messages, verification, reset expiry, replay and session revocation. Actual two-message delivery is pending explicit authorization; no customer account or production login switch is involved.


## Applied result

The user explicitly authorized both messages. The actual Cloudflare Auth → protected Vercel → Hostinger flow accepted exactly one verification email and one password-reset email to the fixed test inbox. The generated verification and reset links completed successfully through the private test gateway; reset revoked the existing session and replay was denied. The user confirmed receipt of both messages. An email link opened without the private gateway returns `unauthorized`; these are isolated fixture links, not public customer callbacks.

The original fake account credential/verification state was restored and its sessions/tokens/outbox records removed. Temporary Worker relay mode/gateway/OIDC secrets and branch-only Vercel delivery/deadline variables were removed. The next default deployment leaves delivery disabled; the retained test deployment also rejects delivery after its hard deadline. Proof: `.d1-private/auth-mail-delivery-native-report-20261106.json`; the one-shot attempt ledger is `.d1-private/auth-mail-delivery-attempts-20261106.json`. No customer account or Source row changed.
