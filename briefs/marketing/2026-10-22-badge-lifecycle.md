# The badge emails, the install check and the go-live safety switch

*2026-10-22 · from "R. Talkar · PMRFP" <info@pmrfp.com>, sent through Resend · code: src/lib/lifecycle/, src/lib/badge/ · preview live: /admin/lifecycle · status per company: /admin/badge-installs*

## In plain English

Every free company now gets a short "put the PMRFP badge on your website" email right after its profile is approved. A week later, if we still can't see the badge on its own website, it gets one reminder, and then nothing more. The moment we see the badge loading from the company's own site, on two different days, we send a short "thanks, we can see it on yourdomain.com" email and stop asking. The company's dashboard shows the same thing: "Not detected yet" or "Detected on yourdomain.com", with the code to copy.

Nothing promises rankings. The email says what is true: visitors can check you're listed and click through to your projects and reviews; the badge links your site to your PMRFP profile; and links from relevant directories can help search engines understand your business, but we can't promise rankings.

**An optional reward, off by default.** With BADGE_REWARD_ENABLED=1, the first time a free company's badge is detected on its own site it gets +14 days of Trade Pro, once, ever (a new 14-day trial if it never had one, or its running trial pushed out by 14 days). The badge emails mention the reward only while the switch is on.

**A safe way to switch the sequence on.** The lifecycle emails are still off. With LIFECYCLE_START_AT set, every company that existed before that moment gets no old welcome / market / get-found catch-up, only ONE short "welcome back + badge" email (once its profile is approved). Companies that join after it get the normal sequence. Leave it unset and nothing about the old sequence changes.

## When each email goes

| Email | When | Stops when |
|---|---|---|
| Welcome (existing) | Day 0 | as before |
| **Badge** | Right after the profile is approved (half an hour later, open 5 days), after the welcome and before "market" | upgrade, unsubscribe, bounce; skipped if the badge is already installed |
| **Badge reminder** | 7 days after the badge email went out, only if no install was detected and the profile has a website. Then nothing more | install detected, upgrade, unsubscribe, bounce |
| **Badge thanks** | Once, when the badge is first detected on the company's own site (open 14 days from detection) | upgrade, unsubscribe, bounce |
| **Welcome back** | Once, for a company that existed before LIFECYCLE_START_AT, when its profile is approved (open 21 days from go-live) | upgrade, unsubscribe, bounce; skipped if already installed |
| "Get found" (Day 3, existing) | now only about adding a project (it stopped repeating the badge) | has a project |

Same gates as every lifecycle email: one a day, never on a weekly-email day, 9:00 to 17:00 Monday to Friday in the company's own time zone, never late (a window that closes is skipped).

## How "installed" is decided

The badge image is loaded by the visitor's browser from the company's website, and the request says which site it came from (the Referer, already cut down to a bare domain in badge_hits). A company counts as **installed on its site** when its badge was requested from a page on **its own website's domain** (the domain on its profile) on **at least 2 different days**.

- No referrer, or a request from any other site, proves nothing and is ignored (the admin screen still lists where else it shows).
- www., subdomains and either way of typing the website all match (acme.ca = www.acme.ca = shop.acme.ca). Free site-builder addresses (acme.wixsite.com, name.wordpress.com) count as their own site, so one customer can't match another.
- PMRFP's own pages, localhost and \*.vercel.app never reach the counters.
- A company with no website on its profile can't be detected. Its badge email asks it to add one, and it gets no reminder.
- Limits: a site that sends no Referer at all (some privacy settings, a "no-referrer" policy) can't be detected, and a badge whose image is cached or hot-linked by someone else's page looks like that other site.

## The reward, and how it lands

Reuses the existing trial table (trade_trials), so Trade Pro access works everywhere the trial already does (the SQL access function and the app read the same ends_at). Nothing new decides who is Pro.

| The company has | What happens |
|---|---|
| no trial yet | a new trial row, 14 days from now (source "badge") |
| a trial running | its ends_at moves 14 days later (start unchanged) |
| a trial that already ended | the same row runs again for 14 days from now. One row per company stays true. The old dates are kept in badge_rewards |

Never for a company that already pays (active or comped Pro / Featured, or lifetime). Once per company, enforced by the database (badge_rewards.organization_id is the primary key, so a second run or a race can't grant twice). Only a live, approved trade company, not a demo, not run by staff or a test address, whose website isn't one of ours (pmrfp.com, talkerstein.com and test hosts don't count). No admin screen grants it: only the cron does, from the hit counters. The table's own cap (a trial can't run past 31 days from its start) is never exceeded; a hand-made trial with no room left simply gets nothing and nothing is used up.

The simplest alternative (a separate "bonus days" column on subscriptions, or a second way to be Pro) would have meant changing the SQL access function that RLS depends on, so it was not used.

## What happens on the first run if the sequence were switched on today

Run on 2026-10-22 against production, read-only (the same planner the cron uses, with every write blocked), simulating the first send window, Friday 2026-10-23 10:30 Eastern. Production has 41 trade companies; 31 have a login (the other 10 are listings with no account, who are never emailed). Nothing has ever been sent (lifecycle_sends is empty).

| | Emails on the first run |
|---|---|
| Before this PR, flag on | 6: welcome x5 (the 5 accounts from Oct 21 and 22), rescue +2h x1 (an unfinished sign-up). The other 9 accounts in the 21-day window are "too old for the free steps": the old windows never send late, so there was no burst of old steps on today's data |
| This PR, flag on, LIFECYCLE_START_AT unset | 7: welcome x5, badge x1 (Centrale De Nettoyage, joined 5 days ago), rescue +2h x1. Everything else as before |
| This PR, flag on, LIFECYCLE_START_AT set to the go-live moment | 24: welcome-back x23 (five more follow later the same day: their time zone is still before 9:00), rescue +2h x1. Nothing for Talkerstein (internal) and the smoke-test company (it has an active Pro plan). Fence Builder Boston (profile still pending) gets its welcome-back when approved. After that, nothing at all for any of them until they install the badge (the thanks) |

The 23 are sent about 1.7 a second (Resend's per-second limit), so the run takes about 15 seconds. LIFECYCLE_MAX_PER_DAY=15 spreads the 28 over two days instead.

| Company | Country / language | Before this PR, flag on | This PR, no cutoff | This PR with LIFECYCLE_START_AT |
|---|---|---|---|---|
| Americas Chimney Sweep | US/en | nothing | nothing (too old for the free steps) | welcome_back (after quiet hours, same day) |
| Centrale De Nettoyage | CA/en | nothing | badge | welcome_back |
| Damaco-Pro inc | CA/fr | welcome | welcome | welcome_back |
| Entretien et Services Claritas | CA/en | nothing | nothing (too old for the free steps) | welcome_back |
| Fence Builder Boston | US/en | nothing | nothing (too old for the free steps) | nothing yet (profile still pending; welcome-back once approved) |
| Integrity Masonry Inc | CA/en | nothing | nothing (too old for the free steps) | welcome_back |
| Kalpin Painting Inc. | CA/en | nothing | nothing (too old for the free steps) | welcome_back |
| Louisville House Cleaning Pros | US/en | welcome | welcome | welcome_back |
| Mallet Tile Installation | CA/en | nothing | nothing (too old for the free steps) | welcome_back |
| Marlin Leads | US/en | welcome | welcome | welcome_back |
| Pesticon Pest Control | CA/en | welcome | welcome | welcome_back |
| Pureté ZE inc | CA/en | nothing | nothing (too old for the free steps) | welcome_back |
| Riaboy Mechanical Inc. | CA/en | nothing | nothing (too old for the free steps) | welcome_back |
| SOLARTODO LIMITED – Sentinel Solar Security Pol... | CA/en | welcome | welcome | welcome_back |
| Angelstone Construction Inc. | CA/en | not looked at (older than 21 days) | not looked at (older than 21 days) | welcome_back |
| Aydin Cleaning | CA/en | not looked at (older than 21 days) | not looked at (older than 21 days) | welcome_back |
| City Limits Landscaping & Snow Removal | CA/en | not looked at (older than 21 days) | not looked at (older than 21 days) | welcome_back (after quiet hours, same day) |
| Cole's Contracting Services | CA/en | not looked at (older than 21 days) | not looked at (older than 21 days) | welcome_back |
| Crystal Care Residential and Commercial Professio... | CA/en | not looked at (older than 21 days) | not looked at (older than 21 days) | welcome_back (after quiet hours, same day) |
| DGP Painting Inc. | CA/en | not looked at (older than 21 days) | not looked at (older than 21 days) | welcome_back |
| FARAD ELECTRIC INC. | CA/en | not looked at (older than 21 days) | not looked at (older than 21 days) | welcome_back |
| Gomezcore llc | CA/en | not looked at (older than 21 days) | not looked at (older than 21 days) | welcome_back |
| NESHMAR INC. | CA/en | not looked at (older than 21 days) | not looked at (older than 21 days) | welcome_back |
| Northline Electrical (Smoketest) | CA/en | not looked at (older than 21 days) | not looked at (older than 21 days) | nothing (active Pro plan) |
| Rainshine Junk - Removal Services | CA/en | not looked at (older than 21 days) | not looked at (older than 21 days) | welcome_back |
| Sea of Blue | CA/en | not looked at (older than 21 days) | not looked at (older than 21 days) | welcome_back |
| Talkerstein | CA/en | not looked at (older than 21 days) | not looked at (older than 21 days) | nothing (our own address) |
| Topography Landscape Construction & Property Mana... | CA/en | not looked at (older than 21 days) | not looked at (older than 21 days) | welcome_back |
| Valet Prestige | CA/en | not looked at (older than 21 days) | not looked at (older than 21 days) | welcome_back |
| Wepower Electric Inc. | CA/en | not looked at (older than 21 days) | not looked at (older than 21 days) | welcome_back (after quiet hours, same day) |
| Zpro Building Solution | CA/en | not looked at (older than 21 days) | not looked at (older than 21 days) | welcome_back (after quiet hours, same day) |

Notes on the data: Louisville House Cleaning Pros and Fence Builder Boston signed up with bearseoservice.com addresses (an SEO service, by the look of it). Put "@bearseoservice.com" in LIFECYCLE_INTERNAL_EMAILS if you don't want them in the catch-up or the reward. City Limits Landscaping & Snow Removal has a Pro plan that is past_due: that is not "paying" under the existing rule, so it would get the welcome-back.

## Sending: Resend, and its limits

- The whole sequence sends through the Resend API (sendLifecycleEmail in src/lib/email/send.ts), never the Hostinger mailbox. The lifecycle code has no SMTP / IMAP path (a test checks it). info@pmrfp.com is only the From name and the Reply-To address.
- Every send carries: the footer (why they got it, a signed one-click unsubscribe link, "Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5", info@pmrfp.com), the headers List-Unsubscribe (https link and mailto) and List-Unsubscribe-Post: List-Unsubscribe=One-Click, and Resend tags (category=lifecycle, step). A test sends every step through a fake Resend and checks all of that.
- Fixed in this PR: a run now refuses to send if the unsubscribe signing secret is missing (before, it would have sent with only a "reply unsubscribe" line and no one-click header). In practice the secret falls back to the service-role key, so it is always there in production.
- Limits that can be read from the code and env: lifecycle sends at most 150 per hourly run, one per company per day, weekdays 9 to 17 local. The weekly email is 400 per run. Resend's default API limit is 2 requests a second and the lifecycle loop used to send as fast as Resend answered; a 429 would have been recorded as a permanently failed step. It now spaces sends 600 ms apart and stops starting new ones after 50 seconds (the route's limit is 60), so whoever is left goes out the next hour. The Resend plan itself is not visible from the code (the older Resend setup note assumed the free tier, 100 emails a day and 3,000 a month; the weekly email alone would not fit that, so it is presumably paid). LIFECYCLE_MAX_PER_DAY is a ceiling you can set to whatever the plan allows.

## Turn-on order

1. Merge, and apply migration 20261022000200_badge_lifecycle.sql (the migrations workflow). It adds the four new step names to lifecycle_sends and creates badge_rewards. Until it is applied the new steps can't be recorded, so they simply don't send.
2. Confirm RESEND_API_KEY, RESEND_WEBHOOK_SECRET (bounces and complaints) and UNSUBSCRIBE_SECRET (or the service-role key) are set in Vercel.
3. Set LIFECYCLE_START_AT to the moment you switch on (for example 2026-10-23T09:00:00-04:00).
4. Set LIFECYCLE_MAX_PER_DAY=15 (optional, spreads the catch-up).
5. Open /admin/lifecycle and press "As of the next send window": the "Who gets what" list is the planner's answer for every company.
6. Set LIFECYCLE_EMAILS_ENABLED=1 and redeploy. The hourly cron (/api/cron/lifecycle) starts.
7. Later, when you want the reward: BADGE_REWARD_ENABLED=1. It is independent of step 6.

## The copy (Canadian and U.S. samples, English, French and Spanish)

All sample numbers and the company ("Northline Roofing", "Lone Star Roofing") are made up; real emails use the company's own name, real slug and website. The badge in the HTML version is a picture (public/images/badge-listed-preview.png, a PNG because Gmail and Outlook don't draw SVG, and a static file so opening an email never counts as a badge load); the plain-text version has none.

### The badge email (right after the profile is approved)

#### EN (Canada)

**Subject:** Put your PMRFP badge on your website (2 minutes)  
*116 words before the footer*

```text
Hi Sam,

Northline Roofing is listed on PMRFP. Here's a small PMRFP badge for your website footer or contact page.

Why add it: visitors can check that you're listed and click through to your projects and reviews. It also gives your site a link to your PMRFP profile. Links from relevant directories can help search engines understand your business, but we can't promise rankings.

It takes about two minutes. Paste this code where you want the badge to show:

  <a href="https://pmrfp.com/directory/northline-roofing?utm_source=badge&amp;utm_medium=referral&amp;utm_campaign=northline-roofing" target="_blank" rel="noopener">
    <img src="https://pmrfp.com/api/badge/northline-roofing" alt="Northline Roofing" width="214" height="54" />
  </a>

- WordPress: Appearance, Widgets, Custom HTML
- Wix: Add, Embed Code, Embed HTML
- Squarespace: edit footer, add a Code block
- Shopify: Themes, Edit code, footer

Send this to whoever manages your website: mailto:?subject=…&body=… (prefilled, shown below)

Your badge page, with a dark version: https://pmrfp.com/badge?company=northline-roofing&utm_source=lifecycle&utm_medium=email&utm_campaign=badge

R. Talkar
PMRFP

--
You're getting this because you have a PMRFP account.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### EN (U.S.)

**Subject:** Put your PMRFP badge on your website (2 minutes)  
*117 words before the footer*

```text
Hi Sam,

Lone Star Roofing is listed on PMRFP. Here's a small PMRFP badge for your website footer or contact page.

Why add it: visitors can check that you're listed and click through to your projects and reviews. It also gives your site a link to your PMRFP profile. Links from relevant directories can help search engines understand your business, but we can't promise rankings.

It takes about two minutes. Paste this code where you want the badge to show:

  <a href="https://pmrfp.com/directory/lone-star-roofing?utm_source=badge&amp;utm_medium=referral&amp;utm_campaign=lone-star-roofing" target="_blank" rel="noopener">
    <img src="https://pmrfp.com/api/badge/lone-star-roofing" alt="Lone Star Roofing" width="214" height="54" />
  </a>

- WordPress: Appearance, Widgets, Custom HTML
- Wix: Add, Embed Code, Embed HTML
- Squarespace: edit footer, add a Code block
- Shopify: Themes, Edit code, footer

Send this to whoever manages your website: mailto:?subject=…&body=… (prefilled, shown below)

Your badge page, with a dark version: https://pmrfp.com/badge?company=lone-star-roofing&utm_source=lifecycle&utm_medium=email&utm_campaign=badge

R. Talkar
PMRFP

--
You're getting this because you have a PMRFP account.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### FR

**Subject:** Mettez votre badge PMRFP sur votre site Web (2 minutes)  
*128 words before the footer*

```text
Bonjour Sam,

Northline Roofing figure au répertoire PMRFP. Voici un petit badge PMRFP pour le pied de page ou la page de contact de votre site Web.

Pourquoi l'ajouter : les visiteurs voient que vous êtes inscrit et accèdent à vos projets et à vos avis. Votre site obtient aussi un lien vers votre profil PMRFP. Les liens de répertoires pertinents peuvent aider les moteurs de recherche à comprendre votre entreprise, sans garantie de classement.

Ça prend environ deux minutes. Collez ce code là où le badge doit s'afficher :

  <a href="https://pmrfp.com/fr/directory/northline-roofing?utm_source=badge&amp;utm_medium=referral&amp;utm_campaign=northline-roofing" target="_blank" rel="noopener">
    <img src="https://pmrfp.com/api/badge/northline-roofing" alt="Northline Roofing" width="214" height="54" />
  </a>

- WordPress : Apparence, Widgets, HTML personnalisé
- Wix : Ajouter, Code d'intégration, HTML
- Squarespace : pied de page, bloc Code
- Shopify : Thèmes, Modifier le code, pied de page

Envoyer ceci à la personne qui gère votre site : mailto:?subject=…&body=… (prefilled, shown below)

Votre page de badge, avec version sombre : https://pmrfp.com/fr/badge?company=northline-roofing&utm_source=lifecycle&utm_medium=email&utm_campaign=badge

R. Talkar
PMRFP

--
Vous recevez ce courriel parce que vous avez un compte PMRFP.
Se désabonner de ces courriels : https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### ES

**Subject:** Ponga la insignia de PMRFP en su sitio web (2 minutos)  
*129 words before the footer*

```text
Hola, Sam:

Lone Star Roofing está en el directorio de PMRFP. Aquí tiene una pequeña insignia de PMRFP para el pie de página o la página de contacto de su sitio web.

Por qué agregarla: los visitantes comprueban que usted está registrado y entran a sus proyectos y reseñas. Su sitio también enlaza a su perfil de PMRFP. Los enlaces de directorios relevantes pueden ayudar a los buscadores a entender su negocio, pero no prometemos posiciones.

Toma unos dos minutos. Pegue este código donde quiera que aparezca la insignia:

  <a href="https://pmrfp.com/es/directory/lone-star-roofing?utm_source=badge&amp;utm_medium=referral&amp;utm_campaign=lone-star-roofing" target="_blank" rel="noopener">
    <img src="https://pmrfp.com/api/badge/lone-star-roofing" alt="Lone Star Roofing" width="214" height="54" />
  </a>

- WordPress: Apariencia, Widgets, HTML personalizado
- Wix: Agregar, Código para insertar, HTML
- Squarespace: pie de página, bloque de Código
- Shopify: Temas, Editar código, pie de página

Enviar esto a quien administra su sitio: mailto:?subject=…&body=… (prefilled, shown below)

Su página de la insignia, con versión oscura: https://pmrfp.com/es/badge?company=lone-star-roofing&utm_source=lifecycle&utm_medium=email&utm_campaign=badge

R. Talkar
PMRFP

--
Recibe este correo porque tiene una cuenta en PMRFP.
Cancelar la suscripción a estos correos: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

With BADGE_REWARD_ENABLED on, EN adds: "Once we see it on your own site, we'll add 14 days of Trade Pro, free."

### The reminder (7 days later, only if no install was detected)

#### EN (Canada)

**Subject:** Your PMRFP badge is still waiting  
*74 words before the footer*

```text
Hi Sam,

A week ago we sent you a PMRFP badge for your website. We can't see it on your site yet.

It takes two minutes. Paste this code in your website footer or contact page:

  <a href="https://pmrfp.com/directory/northline-roofing?utm_source=badge&amp;utm_medium=referral&amp;utm_campaign=northline-roofing" target="_blank" rel="noopener">
    <img src="https://pmrfp.com/api/badge/northline-roofing" alt="Northline Roofing" width="214" height="54" />
  </a>

Send this to whoever manages your website: mailto:?subject=…&body=… (prefilled, shown below)

Visitors can then check you're listed and see your projects and reviews.

This is the last reminder. Your listing stays the same either way.

Your badge page, with a dark version: https://pmrfp.com/badge?company=northline-roofing&utm_source=lifecycle&utm_medium=email&utm_campaign=badge_reminder

R. Talkar
PMRFP

--
You're getting this because you have a PMRFP account.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### EN (U.S.)

**Subject:** Your PMRFP badge is still waiting  
*74 words before the footer*

```text
Hi Sam,

A week ago we sent you a PMRFP badge for your website. We can't see it on your site yet.

It takes two minutes. Paste this code in your website footer or contact page:

  <a href="https://pmrfp.com/directory/lone-star-roofing?utm_source=badge&amp;utm_medium=referral&amp;utm_campaign=lone-star-roofing" target="_blank" rel="noopener">
    <img src="https://pmrfp.com/api/badge/lone-star-roofing" alt="Lone Star Roofing" width="214" height="54" />
  </a>

Send this to whoever manages your website: mailto:?subject=…&body=… (prefilled, shown below)

Visitors can then check you're listed and see your projects and reviews.

This is the last reminder. Your listing stays the same either way.

Your badge page, with a dark version: https://pmrfp.com/badge?company=lone-star-roofing&utm_source=lifecycle&utm_medium=email&utm_campaign=badge_reminder

R. Talkar
PMRFP

--
You're getting this because you have a PMRFP account.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### FR

**Subject:** Votre badge PMRFP vous attend toujours  
*90 words before the footer*

```text
Bonjour Sam,

Il y a une semaine, nous vous avons envoyé un badge PMRFP pour votre site Web. Nous ne le voyons pas encore sur votre site.

Ça prend deux minutes. Collez ce code dans le pied de page ou la page de contact de votre site :

  <a href="https://pmrfp.com/fr/directory/northline-roofing?utm_source=badge&amp;utm_medium=referral&amp;utm_campaign=northline-roofing" target="_blank" rel="noopener">
    <img src="https://pmrfp.com/api/badge/northline-roofing" alt="Northline Roofing" width="214" height="54" />
  </a>

Envoyer ceci à la personne qui gère votre site : mailto:?subject=…&body=… (prefilled, shown below)

Les visiteurs pourront alors vérifier que vous êtes inscrit et voir vos projets et vos avis.

C'est le dernier rappel. Votre inscription reste telle quelle, peu importe.

Votre page de badge, avec version sombre : https://pmrfp.com/fr/badge?company=northline-roofing&utm_source=lifecycle&utm_medium=email&utm_campaign=badge_reminder

R. Talkar
PMRFP

--
Vous recevez ce courriel parce que vous avez un compte PMRFP.
Se désabonner de ces courriels : https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### ES

**Subject:** Su insignia de PMRFP sigue esperando  
*82 words before the footer*

```text
Hola, Sam:

Hace una semana le enviamos una insignia de PMRFP para su sitio web. Todavía no la vemos en su sitio.

Toma dos minutos. Pegue este código en el pie de página o la página de contacto de su sitio:

  <a href="https://pmrfp.com/es/directory/lone-star-roofing?utm_source=badge&amp;utm_medium=referral&amp;utm_campaign=lone-star-roofing" target="_blank" rel="noopener">
    <img src="https://pmrfp.com/api/badge/lone-star-roofing" alt="Lone Star Roofing" width="214" height="54" />
  </a>

Enviar esto a quien administra su sitio: mailto:?subject=…&body=… (prefilled, shown below)

Así los visitantes pueden comprobar que usted está registrado y ver sus proyectos y reseñas.

Es el último recordatorio. Su registro sigue igual de todos modos.

Su página de la insignia, con versión oscura: https://pmrfp.com/es/badge?company=lone-star-roofing&utm_source=lifecycle&utm_medium=email&utm_campaign=badge_reminder

R. Talkar
PMRFP

--
Recibe este correo porque tiene una cuenta en PMRFP.
Cancelar la suscripción a estos correos: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

With BADGE_REWARD_ENABLED on, EN adds: "Once we see it on your own site, we'll add 14 days of Trade Pro, free."

### The thanks (once, when the install is first detected)

#### EN (Canada)

**Subject:** Thanks: we can see your PMRFP badge on northlineroofing.ca  
*37 words before the footer*

```text
Hi Sam,

Thanks, the PMRFP badge is showing on northlineroofing.ca. Visitors can now check you're listed and click through to your profile.

Nothing else to do. Your listing stays the same either way.

See your PMRFP profile: https://pmrfp.com/directory/northline-roofing?utm_source=lifecycle&utm_medium=email&utm_campaign=badge_thanks

R. Talkar
PMRFP

--
You're getting this because you have a PMRFP account.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### EN (U.S.)

**Subject:** Thanks: we can see your PMRFP badge on lonestarroofing.com  
*37 words before the footer*

```text
Hi Sam,

Thanks, the PMRFP badge is showing on lonestarroofing.com. Visitors can now check you're listed and click through to your profile.

Nothing else to do. Your listing stays the same either way.

See your PMRFP profile: https://pmrfp.com/directory/lone-star-roofing?utm_source=lifecycle&utm_medium=email&utm_campaign=badge_thanks

R. Talkar
PMRFP

--
You're getting this because you have a PMRFP account.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### FR

**Subject:** Merci : nous voyons votre badge PMRFP sur northlineroofing.ca  
*38 words before the footer*

```text
Bonjour Sam,

Merci, le badge PMRFP s'affiche sur northlineroofing.ca. Les visiteurs peuvent maintenant vérifier que vous êtes inscrit et accéder à votre profil.

Rien d'autre à faire. Votre inscription reste telle quelle, peu importe.

Voir votre profil PMRFP : https://pmrfp.com/fr/directory/northline-roofing?utm_source=lifecycle&utm_medium=email&utm_campaign=badge_thanks

R. Talkar
PMRFP

--
Vous recevez ce courriel parce que vous avez un compte PMRFP.
Se désabonner de ces courriels : https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### ES

**Subject:** Gracias: vemos su insignia de PMRFP en lonestarroofing.com  
*44 words before the footer*

```text
Hola, Sam:

Gracias, la insignia de PMRFP ya se ve en lonestarroofing.com. Los visitantes ahora pueden comprobar que usted está registrado y entrar a su perfil.

No hay nada más que hacer. Su registro sigue igual de todos modos.

Ver su perfil de PMRFP: https://pmrfp.com/es/directory/lone-star-roofing?utm_source=lifecycle&utm_medium=email&utm_campaign=badge_thanks

R. Talkar
PMRFP

--
Recibe este correo porque tiene una cuenta en PMRFP.
Cancelar la suscripción a estos correos: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

When the reward was granted, EN adds: "As a thank-you, Trade Pro is on for you through November 5."

### The go-live catch-up (the one welcome-back email for accounts that existed before LIFECYCLE_START_AT)

#### EN (Canada)

**Subject:** Welcome back to PMRFP, Sam: a badge for your website  
*116 words before the footer*

```text
Hi Sam,

Welcome back to PMRFP. We've added a small PMRFP badge for Northline Roofing's website footer or contact page.

Why add it: visitors can check that you're listed and click through to your projects and reviews. It also gives your site a link to your PMRFP profile. Links from relevant directories can help search engines understand your business, but we can't promise rankings.

It takes about two minutes. Paste this code where you want the badge to show:

  <a href="https://pmrfp.com/directory/northline-roofing?utm_source=badge&amp;utm_medium=referral&amp;utm_campaign=northline-roofing" target="_blank" rel="noopener">
    <img src="https://pmrfp.com/api/badge/northline-roofing" alt="Northline Roofing" width="214" height="54" />
  </a>

- WordPress: Appearance, Widgets, Custom HTML
- Wix: Add, Embed Code, Embed HTML
- Squarespace: edit footer, add a Code block
- Shopify: Themes, Edit code, footer

Send this to whoever manages your website: mailto:?subject=…&body=… (prefilled, shown below)

Your badge page, with a dark version: https://pmrfp.com/badge?company=northline-roofing&utm_source=lifecycle&utm_medium=email&utm_campaign=welcome_back

R. Talkar
PMRFP

--
You're getting this because you have a PMRFP account.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### EN (U.S.)

**Subject:** Welcome back to PMRFP, Sam: a badge for your website  
*117 words before the footer*

```text
Hi Sam,

Welcome back to PMRFP. We've added a small PMRFP badge for Lone Star Roofing's website footer or contact page.

Why add it: visitors can check that you're listed and click through to your projects and reviews. It also gives your site a link to your PMRFP profile. Links from relevant directories can help search engines understand your business, but we can't promise rankings.

It takes about two minutes. Paste this code where you want the badge to show:

  <a href="https://pmrfp.com/directory/lone-star-roofing?utm_source=badge&amp;utm_medium=referral&amp;utm_campaign=lone-star-roofing" target="_blank" rel="noopener">
    <img src="https://pmrfp.com/api/badge/lone-star-roofing" alt="Lone Star Roofing" width="214" height="54" />
  </a>

- WordPress: Appearance, Widgets, Custom HTML
- Wix: Add, Embed Code, Embed HTML
- Squarespace: edit footer, add a Code block
- Shopify: Themes, Edit code, footer

Send this to whoever manages your website: mailto:?subject=…&body=… (prefilled, shown below)

Your badge page, with a dark version: https://pmrfp.com/badge?company=lone-star-roofing&utm_source=lifecycle&utm_medium=email&utm_campaign=welcome_back

R. Talkar
PMRFP

--
You're getting this because you have a PMRFP account.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### FR

**Subject:** Content de vous revoir sur PMRFP, Sam : un badge pour votre site  
*131 words before the footer*

```text
Bonjour Sam,

Content de vous revoir sur PMRFP. Nous avons ajouté un petit badge PMRFP pour le pied de page ou la page de contact du site de Northline Roofing.

Pourquoi l'ajouter : les visiteurs voient que vous êtes inscrit et accèdent à vos projets et à vos avis. Votre site obtient aussi un lien vers votre profil PMRFP. Les liens de répertoires pertinents peuvent aider les moteurs de recherche à comprendre votre entreprise, sans garantie de classement.

Ça prend environ deux minutes. Collez ce code là où le badge doit s'afficher :

  <a href="https://pmrfp.com/fr/directory/northline-roofing?utm_source=badge&amp;utm_medium=referral&amp;utm_campaign=northline-roofing" target="_blank" rel="noopener">
    <img src="https://pmrfp.com/api/badge/northline-roofing" alt="Northline Roofing" width="214" height="54" />
  </a>

- WordPress : Apparence, Widgets, HTML personnalisé
- Wix : Ajouter, Code d'intégration, HTML
- Squarespace : pied de page, bloc Code
- Shopify : Thèmes, Modifier le code, pied de page

Envoyer ceci à la personne qui gère votre site : mailto:?subject=…&body=… (prefilled, shown below)

Votre page de badge, avec version sombre : https://pmrfp.com/fr/badge?company=northline-roofing&utm_source=lifecycle&utm_medium=email&utm_campaign=welcome_back

R. Talkar
PMRFP

--
Vous recevez ce courriel parce que vous avez un compte PMRFP.
Se désabonner de ces courriels : https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### ES

**Subject:** Bienvenido de nuevo a PMRFP, Sam: una insignia para su sitio  
*127 words before the footer*

```text
Hola, Sam:

Bienvenido de nuevo a PMRFP. Agregamos una pequeña insignia de PMRFP para el pie de página o la página de contacto del sitio web de Lone Star Roofing.

Por qué agregarla: los visitantes comprueban que usted está registrado y entran a sus proyectos y reseñas. Su sitio también enlaza a su perfil de PMRFP. Los enlaces de directorios relevantes pueden ayudar a los buscadores a entender su negocio, pero no prometemos posiciones.

Toma unos dos minutos. Pegue este código donde quiera que aparezca la insignia:

  <a href="https://pmrfp.com/es/directory/lone-star-roofing?utm_source=badge&amp;utm_medium=referral&amp;utm_campaign=lone-star-roofing" target="_blank" rel="noopener">
    <img src="https://pmrfp.com/api/badge/lone-star-roofing" alt="Lone Star Roofing" width="214" height="54" />
  </a>

- WordPress: Apariencia, Widgets, HTML personalizado
- Wix: Agregar, Código para insertar, HTML
- Squarespace: pie de página, bloque de Código
- Shopify: Temas, Editar código, pie de página

Enviar esto a quien administra su sitio: mailto:?subject=…&body=… (prefilled, shown below)

Su página de la insignia, con versión oscura: https://pmrfp.com/es/badge?company=lone-star-roofing&utm_source=lifecycle&utm_medium=email&utm_campaign=welcome_back

R. Talkar
PMRFP

--
Recibe este correo porque tiene una cuenta en PMRFP.
Cancelar la suscripción a estos correos: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

With BADGE_REWARD_ENABLED on, EN adds: "Once we see it on your own site, we'll add 14 days of Trade Pro, free."

### The prefilled "send this to whoever manages your website" email (EN)

```text
Subject: Please add our PMRFP badge to the website

Hi,

Could you add the PMRFP badge to our website, in the footer or on the contact page? It takes about two minutes.

Paste this HTML where it should show:

<a href="https://pmrfp.com/directory/northline-roofing?utm_source=badge&amp;utm_medium=referral&amp;utm_campaign=northline-roofing" target="_blank" rel="noopener">
  <img src="https://pmrfp.com/api/badge/northline-roofing" alt="Northline Roofing" width="214" height="54" />
</a>

It shows we're listed on PMRFP and links to our profile: https://pmrfp.com/directory/northline-roofing

Thanks!
```

Longest badge-lane email in any language, with the reward line on: 148 words (house limit 150).
