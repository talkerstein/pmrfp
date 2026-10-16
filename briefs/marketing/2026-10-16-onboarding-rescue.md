# PMRFP onboarding rescue: copy and rules

*2026-10-16 · from "R. Talkar · PMRFP" <info@pmrfp.com>, reply-to info@pmrfp.com · code: src/lib/lifecycle/rescue.ts (+ copy.ts, server.ts) · preview: /admin/lifecycle*

## In plain English

Some people create a PMRFP account and stop before setting up their company. The lifecycle emails start with the company's Day 0 welcome, so these people never got anything. They now get up to three short emails, then nothing:

1. **2 hours after sign-up: "Finish your PMRFP profile in 2 minutes."** What's left (only what they didn't already pick at sign-up), why it matters (leads match on trades and service area), a link straight back to onboarding, and "reply and I'll help".
2. **1 day after: real leads.** Up to 3 real leads for the trade they picked at sign-up, with the real count. No trade picked: open bids in their province, or their country if the province has none. Nothing to show: it says so.
3. **3 days after: "Want us to set it up for you?"** Reply with company name, trades and area. Says it's the last reminder.

The moment they finish onboarding, the rescue stops and the normal Day 0 welcome starts. There's never a second welcome. If a rescue email already went out that day, the welcome goes the next day (one email a day, as always).

**Pending review is handled separately.** A new company whose profile is waiting in pending_review gets one short note: "We're reviewing your profile, usually within 1 business day," plus what they'll get once approved. If trades or areas are missing it tells them to add those (that's what's checked). It goes once, only in the first 3 days after they joined. No email like this existed before. The welcome follows on a later day.

**Who never gets the rescue emails:** anyone who finished onboarding; property managers, GCs and suppliers (they show on the admin list for a personal note instead); our own, test, demo and throwaway addresses (pmrfp.com, talkerstein.com/.ca, example.com, mailinator and similar, test@ / demo@ / +test; add more with LIFECYCLE_INTERNAL_EMAILS); bounced or complained addresses; anyone who unsubscribed; accounts that never confirmed their email (the link would only send them to sign-in, and the address isn't verified).

**When it sends.** Same rules as the rest of the lifecycle emails: one a day, never on the day the weekly email went out, local time from the province or state they picked at sign-up (else Eastern). The 2-hour email and the pending-review note are replies to something the person just did, so they may also go **8:00 to 20:00 Monday to Thursday**: someone who signs up at 4pm hears back that evening, not the next morning. **Friday stays 9:00 to 17:00 and weekends are off**, so nothing goes out Friday evening. The other two rescue emails keep 9:00 to 17:00 weekdays. The 2-hour email can still go up to 3 days after sign-up, so a Friday-night sign-up gets it Monday morning. A window that passes is skipped, never sent late. The track only starts with the 2-hour email, so turning it on never emails old sign-ups.

**CASL.** Every recipient created a PMRFP account days or hours earlier. That's an inquiry/application from them, which gives implied consent (an existing business relationship) to email them about the service they signed up for. Every email still has the sender's identity, Talkerstein Consulting Group's mailing address and a working one-click unsubscribe.

**Off by default.** Nothing sends unless LIFECYCLE_EMAILS_ENABLED=1 (the same switch as the rest of the sequence). Run migration 20261017000060_onboarding_rescue.sql first.

## Admin: Stalled sign-ups

/admin/lifecycle now opens with **Stalled sign-ups (last 30 days)**: every unfinished account (trades, suppliers, property managers) with email, name / company, role (Google or email sign-up), account age, the last onboarding step reached, rescue emails sent, and what the rescue track will do next. **Copy email** copies a short personal note (To, Subject, body, signed R. Talkar) to send yourself from info@. Internal and test addresses are hidden.

**Where people stall** now gets recorded: when they see the Google "what describes you" question, pick a role, open the company form, submit it and get an error (which field), or hit a save failure on our side. The page shows the count per step. Older accounts only show "never confirmed the email" or "confirmed, never opened onboarding (or before tracking)".

## Timing

| Step | Due | Window (missed = skipped) | Hours |
|---|---|---|---|
| rescue_2h | 2 hours after the email was confirmed (Google: sign-up) | to 3 days | 8:00–20:00 Mon–Thu, 9:00–17:00 Fri |
| rescue_1d | 1 day after | to 5 days | 9:00–17:00 Mon–Fri |
| rescue_3d | 3 days after | to 8 days | 9:00–17:00 Mon–Fri |
| review_pending | when the company joins in pending_review | to 3 days after joining | 8:00–20:00 Mon–Thu, 9:00–17:00 Fri |

## The copy (sample: Sam, picked Roofing + HVAC at sign-up, no company name or areas yet)

Every email ends with:

> R. Talkar
> PMRFP
>
> --
> You're getting this because you created a PMRFP account. *(review_pending: "...because you have a PMRFP account.")*
> Unsubscribe from these emails: [one-click link]
> Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com

All links carry utm_source=lifecycle&utm_medium=email&utm_campaign=<step>.

### +2 hours · Finish your profile (55 words)

**Subject:** Finish your PMRFP profile in 2 minutes

Hi Sam,

You started a PMRFP account but didn't finish setting it up.
*(with a company name from sign-up: "You started setting up Northline Roofing on PMRFP but didn't finish.")*

What's left:
- Your company name
- The areas you serve

*(The list only has what's missing: "Tell us what describes you: trade, property manager or contractor" for a Google sign-up that didn't answer, then company name, trades, areas. If everything was picked at sign-up: "What you picked at sign-up is saved. Check it and press Finish.")*

Why it matters: leads match on your trades and service area. Until those are set, we can't show or send you anything.

Finish your profile: https://pmrfp.com/onboarding

Stuck? Reply to this email and I'll help.

### +1 day · Real leads (59 words)

**Subject:** Roofing work in Toronto on PMRFP

Hi Sam,

PMRFP has 14 leads for Roofing and HVAC in Toronto right now. A few:
- Roof replacement, 4 low-rise residential blocks (Toronto Community Housing)
- New 18-storey rental tower, Mississauga: building permit issued
- HVAC upgrades, Peel District School Board (awarded)

Your profile isn't finished, so none of this can reach you yet.

Finish your profile to see your leads: https://pmrfp.com/onboarding

*Variants:*
- *No trade picked:* subject "Open bids in Ontario on PMRFP", "PMRFP has 6 open bids in Ontario right now. A few:" … "Your profile isn't finished, so none of this can reach you yet. Pick your trades and we'll show you the ones that fit."
- *Nothing real to show:* "Honest answer: there are no open Roofing leads in Toronto today. New tenders, permits and awards come in every day." (or "it's quiet in Ontario today")
- *No area picked:* the area is the country ("Canada", "the U.S."), matched across the whole country.

### +3 days · Want us to set it up? (54 words)

**Subject:** Want us to set up your PMRFP profile?

Hi Sam,

Setting up a profile is nobody's favourite job. We can do it for you.

Reply with your company name, the trades you do and the area you cover. We'll set it up and email you when it's ready.

Or finish it yourself in 2 minutes: https://pmrfp.com/onboarding

This is the last reminder about it.

### Pending review (once, 75 words)

**Subject:** We're reviewing your PMRFP profile

Hi Sam,

Thanks for setting up Northline Roofing. We review new company profiles before they show in the directory, usually within 1 business day.

Once it's approved:
- Property managers can find you in the PMRFP directory
- Your leads match on your trades and areas
- You can post in the trades forum

One thing that helps: add your trades and service areas. It's what we check, and what your leads match on.
Add trades and areas: https://pmrfp.com/dashboard/company

*(Trades and areas already set: "Nothing to do in the meantime. Questions? Just reply to this email.")*

### The personal note (admin "Copy email")

To: jo@example.ca
Subject: Your PMRFP account

Hi Jo,

I saw you started a PMRFP account for Roof Co but didn't get to finish the profile. Anything I can help with?

If it's easier, reply with your company name, the trades you do and the area you cover, and I'll set it up for you.

R. Talkar
PMRFP · info@pmrfp.com

## French

**+2h · Complétez votre profil PMRFP en 2 minutes**
Bonjour Sam, / Vous avez créé un compte PMRFP sans terminer l'inscription. / Il reste : le nom de votre entreprise; les régions que vous desservez. / Pourquoi : les occasions sont jumelées sur vos corps de métier et votre région. Sans eux, on ne peut rien vous montrer ni vous envoyer. / Compléter votre profil / Un problème? Répondez à ce courriel et je vous aide.

**+1 jour · Toiture, Toronto : le travail sur PMRFP**
PMRFP a 14 occasions pour Toiture et CVC (Toronto) en ce moment. Quelques exemples : … / Votre profil n'est pas terminé, alors rien de tout ça ne peut encore vous parvenir. / Compléter votre profil pour voir vos occasions

**+3 jours · Voulez-vous qu'on crée votre profil PMRFP?**
Remplir un profil, personne n'aime ça. On peut le faire pour vous. / Répondez avec le nom de votre entreprise, vos corps de métier et votre région. On crée le profil et on vous écrit quand il est prêt. / Ou terminez-le vous-même en 2 minutes / C'est le dernier rappel à ce sujet.

**En attente · Nous examinons votre profil PMRFP**
Merci d'avoir inscrit Northline Roofing. Nous examinons les nouveaux profils d'entreprise avant qu'ils paraissent dans le répertoire, en général en 1 jour ouvrable. / Une fois approuvé : les gestionnaires immobiliers vous trouvent dans le répertoire PMRFP; vos occasions sont jumelées sur vos corps de métier et vos régions; vous pouvez publier dans le forum des métiers.

## Spanish

**+2h · Complete su perfil de PMRFP en 2 minutos**
Hola, Sam: / Creó una cuenta en PMRFP pero no terminó de configurarla. / Falta: el nombre de su empresa; las zonas donde trabaja. / Por qué importa: las oportunidades se buscan por sus oficios y su zona. Sin eso no podemos mostrarle ni enviarle nada. / Complete su perfil / ¿Algún problema? Responda a este correo y le ayudo.

**+1 día · Techos en Toronto: trabajo en PMRFP**
PMRFP tiene 14 oportunidades de Techos y HVAC en Toronto ahora mismo. Algunas: … / Su perfil no está terminado, así que nada de esto puede llegarle todavía.

**+3 días · ¿Quiere que le armemos su perfil de PMRFP?**
Llenar un perfil no le gusta a nadie. Podemos hacerlo por usted. / Responda con el nombre de su empresa, sus oficios y su zona. Armamos el perfil y le escribimos cuando esté listo. / Este es el último recordatorio.

**Pendiente · Estamos revisando su perfil de PMRFP**
Gracias por registrar Northline Roofing. Revisamos los perfiles nuevos antes de que aparezcan en el directorio, normalmente en 1 día hábil.

## Appendix: plumbing (skip unless you're changing it)

- Steps live in the existing lifecycle engine: `lifecycle_sends` rows (unique user + step, written before the send), `LIFECYCLE_EMAILS_ENABLED`, `/api/cron/lifecycle?dry=1`, the admin dry run and preview, signed one-click unsubscribe, Resend tags.
- Eligibility: users_profile.primary_role = trade, status active, and onboarding_completed = false OR no organization_members row; email confirmed (auth.users.email_confirmed_at); not internal; not suppressed / unsubscribed. Language and country from signup_attribution and the sign-up region picks; trades, areas and company name from the sign-up page picks (auth metadata).
- Instrumentation: `onboarding_steps` (user, step, first_at, last_at, detail), written by the onboarding page (role_pick_viewed, form_viewed, after the response) and the server actions (role_picked, form_error, org_failed). Never blocks onboarding.
- Migration: supabase/migrations/20261017000060_onboarding_rescue.sql (adds the four steps to lifecycle_sends' check, creates onboarding_steps).
- Tests: test/unit/onboarding-rescue.test.ts.
