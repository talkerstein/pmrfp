# PMRFP lifecycle email sequence: full copy for review

*2026-10-16 · from "R. Talkar · PMRFP" <info@pmrfp.com> · code: src/lib/lifecycle/ · preview live: /admin/lifecycle*

> **Update 2026-10-22:** the badge now has its own email right after approval (plus a reminder, a thanks and a one-time go-live catch-up), and "Day 3 · Get found" below is now about adding a project only. See `2026-10-22-badge-lifecycle.md`. The Day 3 copy in this file is the old version.

## In plain English

New free trade companies get a short, helpful email every few days for about two weeks: welcome, what's in their market, how to get found, the free 14-day Trade Pro trial, what similar jobs sold for, the forum, and finally the Founding 500 offer. If they start a trial, that track replaces the rest: how to use it, a halfway check-in with their real numbers, 2 days left, trial ended, and one win-back a week later. Then nothing more.

Every email is plain text first, under 150 words, in the member's language (en / fr / es), with one currency (CAD in Canada, USD in the U.S.). Canada and U.S. content is never mixed. Only real numbers from their own data go in; the samples below use made-up numbers so you can read the copy.

**Stops for good** when they pay (Pro, Featured or lifetime), unsubscribe (link in every email, or email alerts off), bounce or complain. **At most one** of these emails a day, never on the day the weekly email went to them, and only 9:00 to 17:00 Monday to Friday in their own time zone (province/state, else Eastern). A step that can't go out inside its window is skipped, not sent late, so turning this on never blasts old members.

**Tailored by trade** (persona research): recurring-service trades (snow, janitorial, landscaping, pest, waste, security guards) hear about who holds the contracts and the rebid; specialty / mechanical trades (HVAC, electrical, roofing, fire, elevators) hear who won and at what price; small subtrades (painting, windows, masonry, flooring) get project leads and getting found first and a softer upsell. Trade Pro is sold as "who wins this work and what it paid", not bid alerts.

**Off by default.** Turn on with LIFECYCLE_EMAILS_ENABLED=1 in Vercel. While on, trade companies get this Day 0 welcome instead of the old onboarding welcome (no double welcome). U.S. members are never quoted the CAD yearly price (Trade Pro is billed in CAD); they see "Trade Pro by the year" and the USD Founding price.

## Timing and skip rules

| Step | When / rule |
|---|---|
| Day 0 · Welcome + finish profile | Day 0 (within 3 days of joining). Always sent: it is the entry to the sequence. One action: finish trades + areas (if missing), else see your leads. |
| Day 1 · Your market | Day 1. Real counts from the lead matcher for their trades + area, plus 3 real lead titles. Under 3 leads and no price bands: says so and suggests more areas/trades. Fewer than 3 open bids: awards, price bands, GC packages and projects lead. |
| Day 3 · Get found (add a project) | Day 3. Skipped if the company already has a project. (Was "project + badge"; the badge has its own email since 2026-10-22.) |
| Day 5 · Start the free trial | Day 5. Skipped if the matcher finds nothing at all and no price bands (no trial into an empty market). Counts are theirs: leads beyond the free 3, awards with a named winner, trades with a price range. |
| Day 8 · What similar jobs sold for | Day 8. Only when one of their trades has at least 5 priced public awards in their province/state (24 months). Else skipped. |
| Day 12 · Forum + reputation | Day 12. Only for approved company profiles (who can post) that haven't posted yet. |
| Day 16 · Founding 500 offer | Day 16. Only if not on a trial / Pro (a trial moves them to the trial track). Skipped if sold out. No remaining-spots count unless 50 or fewer are left. |
| Trial day 1 · How to use leads + alerts | A few hours after the trial starts. |
| Trial day 7 · What you've seen so far | Trial day 7. Real counts since the trial started: lead alerts emailed, bids saved, interests sent, leads in the feed. |
| Trial day 12 · 2 days left + offer | 2 days before the trial ends. |
| Trial ended · Back on free + offer | The day the trial ends. |
| Trial +7 days · Win-back (last one) | 7 days after the trial ended. One email, then the sequence is over. |

Windows (from joining): welcome day 0 to 3, market day 1 to 6, get_found day 3 to 8, trial_offer day 5 to 10, benchmark day 8 to 13, community day 12 to 17, founding day 16 to 21. Trial windows: trial_day1 start +3h to +72h, trial_day7 start +168h to +240h, trial_day12 end -48h to -4h, trial_expired end +0h to +72h, trial_winback end +168h to +264h.

## The copy (Canadian sample, specialty trade, all three languages)


### Day 0 · Welcome + finish profile

#### EN

**Subject:** Welcome to PMRFP, Sam  
*72 words before the footer*

```text
Hi Sam,

PMRFP finds commercial work for Northline Roofing: open bids and public tenders, new projects and permits, and the contractors who just won jobs and will be hiring subs.

One thing first: pick your trades and the areas you serve. Every lead we show or email you is matched on those two, so until they're set we can't match anything.

Finish your profile (2 minutes): https://pmrfp.com/dashboard/company

Questions? Just reply to this email.

R. Talkar
PMRFP

--
You're getting this because you have a PMRFP account.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### FR

**Subject:** Bienvenue sur PMRFP, Sam  
*81 words before the footer*

```text
Bonjour Sam,

PMRFP trouve du travail commercial pour Northline Roofing : appels d'offres et marchés publics ouverts, nouveaux projets et permis, et les entrepreneurs qui viennent de remporter des contrats et vont embaucher des sous-traitants.

Une chose d'abord : choisissez vos corps de métier et les régions que vous desservez. Chaque occasion qu'on vous montre ou vous envoie est jumelée sur ces deux critères; sans eux, on ne peut rien jumeler.

Compléter votre profil (2 minutes) : https://pmrfp.com/fr/dashboard/company

Des questions? Répondez simplement à ce courriel.

R. Talkar
PMRFP

--
Vous recevez ce courriel parce que vous avez un compte PMRFP.
Se désabonner de ces courriels : https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### ES

**Subject:** Bienvenido a PMRFP, Sam  
*69 words before the footer*

```text
Hola, Sam:

PMRFP encuentra trabajo comercial para Northline Roofing: licitaciones abiertas, proyectos y permisos nuevos, y los contratistas que acaban de ganar obras y van a contratar subcontratistas.

Primero, una cosa: elija sus oficios y las zonas donde trabaja. Cada oportunidad que le mostramos o enviamos se busca con esos dos datos; sin ellos no podemos encontrar nada.

Complete su perfil (2 minutos): https://pmrfp.com/es/dashboard/company

¿Preguntas? Solo responda a este correo.

R. Talkar
PMRFP

--
Recibe este correo porque tiene una cuenta en PMRFP.
Cancelar la suscripción a estos correos: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```


### Day 1 · Your market

#### EN

**Subject:** Roofing work in Toronto right now  
*101 words before the footer*

```text
Hi Sam,

Here's what PMRFP has matched for Roofing and HVAC in Toronto:

- 4 contractors who won public work this month (they hire subs)
- 6 open bids and tenders
- Price ranges for 2 of your trades, from real public awards
- 2 GC sub-trade packages
- 9 new projects and permits this month

Each award shows who won and when. The contractor who won is often the one hiring subs next.

A few of them:

- Roof replacement, 4 low-rise residential blocks (Toronto Community Housing)
- New 18-storey rental tower, Mississauga: building permit issued
- HVAC upgrades, Peel District School Board (awarded)

See all your leads: https://pmrfp.com/dashboard

R. Talkar
PMRFP

--
You're getting this because you have a PMRFP account.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### FR

**Subject:** Toiture, Toronto : vos occasions en ce moment  
*108 words before the footer*

```text
Bonjour Sam,

Voici ce que PMRFP a jumelé pour Toiture et CVC (Toronto) :

- 4 entrepreneurs qui ont remporté des contrats publics ce mois-ci (ils embauchent des sous-traitants)
- 6 appels d'offres ouverts
- Des fourchettes de prix pour 2 de vos métiers, tirées de vrais contrats publics
- 2 lots de sous-traitance d'entrepreneurs généraux
- 9 nouveaux projets et permis ce mois-ci

Chaque contrat attribué montre qui a gagné et quand. L'entrepreneur qui gagne est souvent celui qui embauche des sous-traitants ensuite.

Quelques exemples :

- Roof replacement, 4 low-rise residential blocks (Toronto Community Housing)
- New 18-storey rental tower, Mississauga: building permit issued
- HVAC upgrades, Peel District School Board (awarded)

Voir toutes vos occasions : https://pmrfp.com/fr/dashboard

R. Talkar
PMRFP

--
Vous recevez ce courriel parce que vous avez un compte PMRFP.
Se désabonner de ces courriels : https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### ES

**Subject:** Techos en Toronto: lo que hay ahora  
*100 words before the footer*

```text
Hola, Sam:

Esto es lo que PMRFP encontró para Techos y HVAC en Toronto:

- 4 contratistas que ganaron obra pública este mes (contratan subcontratistas)
- 6 licitaciones abiertas
- Rangos de precios para 2 de sus oficios, de adjudicaciones públicas reales
- 2 paquetes de subcontrato de contratistas generales
- 9 proyectos y permisos nuevos este mes

Cada adjudicación muestra quién ganó y cuándo. El contratista que gana suele ser quien contrata subcontratistas después.

Algunos ejemplos:

- Roof replacement, 4 low-rise residential blocks (Toronto Community Housing)
- New 18-storey rental tower, Mississauga: building permit issued
- HVAC upgrades, Peel District School Board (awarded)

Ver todas sus oportunidades: https://pmrfp.com/es/dashboard

R. Talkar
PMRFP

--
Recibe este correo porque tiene una cuenta en PMRFP.
Cancelar la suscripción a estos correos: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```


### Day 3 · Get found (project + badge)

#### EN

**Subject:** Free ways to get found by property managers  
*55 words before the footer*

```text
Hi Sam,

Property managers hire trades they can check. Two free things help most:

Add a project: before-and-after photos and one sentence. PMRFP writes it up for your profile.

Add a project: https://pmrfp.com/dashboard/projects/new

Put the PMRFP badge on your website. It shows visitors you're listed and links to your profile, projects and reviews.

Get your badge: https://pmrfp.com/badge

R. Talkar
PMRFP

--
You're getting this because you have a PMRFP account.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### FR

**Subject:** Des façons gratuites de vous faire trouver  
*65 words before the footer*

```text
Bonjour Sam,

Les gestionnaires immobiliers embauchent des entrepreneurs qu'ils peuvent vérifier. Deux choses gratuites aident le plus :

Ajoutez un projet : des photos avant-après et une phrase. PMRFP rédige le reste pour votre profil.

Ajouter un projet : https://pmrfp.com/fr/dashboard/projects/new

Mettez le badge PMRFP sur votre site Web. Il montre aux visiteurs que vous êtes inscrit et mène à votre profil, vos projets et vos avis.

Obtenir votre badge : https://pmrfp.com/fr/badge

R. Talkar
PMRFP

--
Vous recevez ce courriel parce que vous avez un compte PMRFP.
Se désabonner de ces courriels : https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### ES

**Subject:** Formas gratuitas de que lo encuentren  
*66 words before the footer*

```text
Hola, Sam:

Los administradores de propiedades contratan a quienes pueden verificar. Dos cosas gratuitas ayudan más:

Agregue un proyecto: fotos de antes y después y una frase. PMRFP redacta el resto para su perfil.

Agregar un proyecto: https://pmrfp.com/es/dashboard/projects/new

Ponga la insignia de PMRFP en su sitio web. Muestra a los visitantes que está registrado y lleva a su perfil, sus proyectos y sus reseñas.

Obtener su insignia: https://pmrfp.com/es/badge

R. Talkar
PMRFP

--
Recibe este correo porque tiene una cuenta en PMRFP.
Cancelar la suscripción a estos correos: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```


### Day 5 · Start the free trial

#### EN

**Subject:** Try Trade Pro free for 14 days  
*82 words before the footer*

```text
Hi Sam,

Your free account shows 3 of your 21 matched leads.

Trade Pro shows who won Roofing work near you, and at what price:

- Who won: the contractors on 4 recent awards in your trades
- What similar contracts paid: price ranges for 2 of your trades
- All 21 leads, not just the first 3
- New matches emailed to you each morning

14 days free. No card. One click to start, and it just ends: nothing to cancel.

Start the free trial: https://pmrfp.com/dashboard/trial

R. Talkar
PMRFP

--
You're getting this because you have a PMRFP account.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### FR

**Subject:** Essayez Trade Pro gratuitement pendant 14 jours  
*93 words before the footer*

```text
Bonjour Sam,

Votre compte gratuit montre 3 de vos 21 occasions jumelées.

Trade Pro montre qui a remporté le travail en Toiture près de chez vous, et à quel prix :

- Qui a gagné : les entrepreneurs de 4 contrats récents dans vos métiers
- Ce que des contrats semblables ont payé : fourchettes de prix pour 2 de vos métiers
- Les 21 occasions, pas seulement les 3 premières
- Les nouvelles occasions par courriel chaque matin

14 jours gratuits. Sans carte. Un clic pour commencer, et l'essai se termine tout seul : rien à annuler.

Commencer l'essai gratuit : https://pmrfp.com/fr/dashboard/trial

R. Talkar
PMRFP

--
Vous recevez ce courriel parce que vous avez un compte PMRFP.
Se désabonner de ces courriels : https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### ES

**Subject:** Pruebe Trade Pro gratis durante 14 días  
*84 words before the footer*

```text
Hola, Sam:

Su cuenta gratuita muestra 3 de sus 21 oportunidades.

Trade Pro muestra quién ganó obras de Techos cerca de usted, y a qué precio:

- Quién ganó: los contratistas de 4 adjudicaciones recientes en sus oficios
- Lo que pagaron contratos similares: rangos de precios para 2 de sus oficios
- Las 21 oportunidades, no solo las primeras 3
- Las nuevas oportunidades por correo cada mañana

14 días gratis. Sin tarjeta. Un clic para empezar, y termina sola: nada que cancelar.

Empezar la prueba gratis: https://pmrfp.com/es/dashboard/trial

R. Talkar
PMRFP

--
Recibe este correo porque tiene una cuenta en PMRFP.
Cancelar la suscripción a estos correos: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```


### Day 8 · What similar jobs sold for

#### EN

**Subject:** What Roofing jobs sold for in Ontario  
*74 words before the footer*

```text
Hi Sam,

PMRFP tracks public contract awards. In the last 24 months, 37 Roofing contracts in Ontario were awarded with a published price.

Two recent ones:

- Roof replacement, Brampton fire hall: $412,000 CAD (Sep 12, 2026)
- Flat roof repairs, Peel housing: $96,500 CAD (Aug 28, 2026)

Trade Pro shows the full range (low, typical, high), who won, and every award behind it. Worth a look before you price your next bid.

See the benchmark: https://pmrfp.com/benchmarks/roofing/ontario

R. Talkar
PMRFP

--
You're getting this because you have a PMRFP account.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### FR

**Subject:** Toiture, Ontario : à quel prix les contrats se sont conclus  
*81 words before the footer*

```text
Bonjour Sam,

PMRFP suit les contrats publics attribués. Au cours des 24 derniers mois, 37 contrats publics (Toiture, Ontario) ont été attribués avec un prix publié.

Deux exemples récents :

- Roof replacement, Brampton fire hall: 412 000 $ CAD (12 sept. 2026)
- Flat roof repairs, Peel housing: 96 500 $ CAD (28 août 2026)

Trade Pro montre la fourchette complète (bas, typique, haut), qui a gagné et chaque contrat derrière les chiffres. Utile avant de chiffrer votre prochaine soumission.

Voir la référence de prix : https://pmrfp.com/fr/benchmarks/roofing/ontario

R. Talkar
PMRFP

--
Vous recevez ce courriel parce que vous avez un compte PMRFP.
Se désabonner de ces courriels : https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### ES

**Subject:** Techos en Ontario: a qué precio se adjudicaron los contratos  
*77 words before the footer*

```text
Hola, Sam:

PMRFP sigue las adjudicaciones de contratos públicos. En los últimos 24 meses se adjudicaron 37 contratos de Techos en Ontario con precio publicado.

Dos recientes:

- Roof replacement, Brampton fire hall: $412,000 CAD (12 sept 2026)
- Flat roof repairs, Peel housing: $96,500 CAD (28 ago 2026)

Trade Pro muestra el rango completo (bajo, típico, alto), quién ganó y cada adjudicación detrás de las cifras. Útil antes de cotizar su próxima oferta.

Ver la referencia de precios: https://pmrfp.com/es/benchmarks/roofing/ontario

R. Talkar
PMRFP

--
Recibe este correo porque tiene una cuenta en PMRFP.
Cancelar la suscripción a estos correos: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```


### Day 12 · Forum + reputation

#### EN

**Subject:** Ask other trades, and get credit for good answers  
*46 words before the footer*

```text
Hi Sam,

The PMRFP forum is where trades compare notes: pricing, prequalification, slow-paying clients, which tenders are worth the effort.

Visit the forum: https://pmrfp.com/forum

Helpful answers earn reputation points that show on your company profile, so property managers can see you know the work.

How reputation works: https://pmrfp.com/reputation

R. Talkar
PMRFP

--
You're getting this because you have a PMRFP account.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### FR

**Subject:** Posez vos questions aux autres entrepreneurs (et obtenez du crédit)  
*57 words before the footer*

```text
Bonjour Sam,

Le forum PMRFP, c'est là où les entrepreneurs comparent leurs notes : prix, préqualification, clients qui paient en retard, appels d'offres qui en valent la peine.

Visiter le forum : https://pmrfp.com/fr/forum

Les réponses utiles rapportent des points de réputation visibles sur votre profil d'entreprise, pour que les gestionnaires voient que vous connaissez votre métier.

Comment fonctionne la réputation : https://pmrfp.com/fr/reputation

R. Talkar
PMRFP

--
Vous recevez ce courriel parce que vous avez un compte PMRFP.
Se désabonner de ces courriels : https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### ES

**Subject:** Pregunte a otros contratistas y gane crédito por buenas respuestas  
*55 words before the footer*

```text
Hola, Sam:

El foro de PMRFP es donde los contratistas comparan notas: precios, precalificación, clientes que pagan tarde, qué licitaciones valen la pena.

Visitar el foro: https://pmrfp.com/es/forum

Las respuestas útiles suman puntos de reputación que se ven en el perfil de su empresa, para que los administradores vean que conoce el oficio.

Cómo funciona la reputación: https://pmrfp.com/es/reputation

R. Talkar
PMRFP

--
Recibe este correo porque tiene una cuenta en PMRFP.
Cancelar la suscripción a estos correos: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```


### Day 16 · Founding 500 offer

#### EN

**Subject:** Founding 500: Trade Pro for life, one payment  
*48 words before the footer*

```text
Hi Sam,

A plain offer while PMRFP is early: Founding 500 members pay once, $250 CAD, and keep Trade Pro for life. No renewals. Trade Pro is otherwise $249 CAD a year.

Not for you? Email us within 30 days for a full refund.

See the offer: https://pmrfp.com/founding-500

Terms: https://pmrfp.com/terms#founding-500

R. Talkar
PMRFP

--
You're getting this because you have a PMRFP account.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### FR

**Subject:** Fondateurs 500 : Trade Pro à vie, un seul paiement  
*52 words before the footer*

```text
Bonjour Sam,

Une offre simple pendant que PMRFP est jeune : les membres Fondateurs 500 paient une fois, 250 $ CAD, et gardent Trade Pro à vie. Aucun renouvellement. Sinon, Trade Pro coûte 249 $ CAD par année.

Ce n'est pas pour vous? Écrivez-nous dans les 30 jours pour un remboursement complet.

Voir l'offre : https://pmrfp.com/fr/founding-500

Conditions : https://pmrfp.com/fr/terms#founding-500

R. Talkar
PMRFP

--
Vous recevez ce courriel parce que vous avez un compte PMRFP.
Se désabonner de ces courriels : https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### ES

**Subject:** Fundadores 500: Trade Pro de por vida con un solo pago  
*54 words before the footer*

```text
Hola, Sam:

Una oferta sencilla mientras PMRFP es nuevo: los miembros Fundadores 500 pagan una vez, $250 CAD, y conservan Trade Pro de por vida. Sin renovaciones. De lo contrario, Trade Pro cuesta $249 CAD al año.

¿No es para usted? Escríbanos dentro de 30 días y le devolvemos todo.

Ver la oferta: https://pmrfp.com/es/founding-500

Condiciones: https://pmrfp.com/es/terms#founding-500

R. Talkar
PMRFP

--
Recibe este correo porque tiene una cuenta en PMRFP.
Cancelar la suscripción a estos correos: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```


### Trial day 1 · How to use leads + alerts

#### EN

**Subject:** Your Trade Pro trial is on  
*59 words before the footer*

```text
Hi Sam,

Your 14-day trial is running. Three things to do first:

- Open your lead feed: all 21 matched leads, with contractor names and bid-list links where we have them.
- Check your alert settings, so new matches reach your inbox each morning.
- Save the bids you want and send interest straight from the listing.

Open your leads: https://pmrfp.com/dashboard

Alert settings: https://pmrfp.com/dashboard/settings

R. Talkar
PMRFP

--
You're getting this because your company started a Trade Pro trial on PMRFP.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### FR

**Subject:** Votre essai Trade Pro est commencé  
*69 words before the footer*

```text
Bonjour Sam,

Votre essai de 14 jours est en cours. Trois choses à faire d'abord :

- Ouvrez votre fil : vos 21 occasions jumelées, avec le nom des entrepreneurs et les liens vers les listes de soumissionnaires quand on les a.
- Vérifiez vos réglages d'alertes, pour recevoir les nouvelles occasions chaque matin.
- Sauvegardez les appels d'offres qui vous intéressent et manifestez votre intérêt directement depuis l'annonce.

Ouvrir vos occasions : https://pmrfp.com/fr/dashboard

Réglages d'alertes : https://pmrfp.com/fr/dashboard/settings

R. Talkar
PMRFP

--
Vous recevez ce courriel parce que votre entreprise a commencé un essai Trade Pro sur PMRFP.
Se désabonner de ces courriels : https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### ES

**Subject:** Su prueba de Trade Pro ya empezó  
*59 words before the footer*

```text
Hola, Sam:

Su prueba de 14 días está activa. Tres cosas para empezar:

- Abra sus oportunidades: las 21, con nombres de contratistas y enlaces a listas de oferentes cuando los tenemos.
- Revise sus alertas, para recibir las nuevas oportunidades cada mañana.
- Guarde las licitaciones que le interesan y envíe su interés desde el anuncio.

Abrir sus oportunidades: https://pmrfp.com/es/dashboard

Configurar alertas: https://pmrfp.com/es/dashboard/settings

R. Talkar
PMRFP

--
Recibe este correo porque su empresa comenzó una prueba de Trade Pro en PMRFP.
Cancelar la suscripción a estos correos: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```


### Trial day 7 · What you've seen so far

#### EN

**Subject:** A week into your trial: what you've seen  
*34 words before the footer*

```text
Hi Sam,

A week in. Your trial so far:

- 12 new leads emailed to you
- 3 bids saved
- 1 interest sent
- 21 leads in your feed right now

7 days left.

Open your leads: https://pmrfp.com/dashboard

R. Talkar
PMRFP

--
You're getting this because your company started a Trade Pro trial on PMRFP.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### FR

**Subject:** Une semaine d'essai : ce que vous avez vu  
*38 words before the footer*

```text
Bonjour Sam,

Une semaine de faite. Votre essai jusqu'ici :

- 12 nouvelles occasions envoyées par courriel
- 3 appels d'offres sauvegardés
- 1 manifestation d'intérêt envoyée
- 21 occasions dans votre fil en ce moment

Il reste 7 jours.

Ouvrir vos occasions : https://pmrfp.com/fr/dashboard

R. Talkar
PMRFP

--
Vous recevez ce courriel parce que votre entreprise a commencé un essai Trade Pro sur PMRFP.
Se désabonner de ces courriels : https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### ES

**Subject:** Una semana de prueba: lo que ha visto  
*32 words before the footer*

```text
Hola, Sam:

Una semana. Su prueba hasta ahora:

- 12 oportunidades nuevas enviadas por correo
- 3 licitaciones guardadas
- 1 interés enviado
- 21 oportunidades en su lista ahora

Quedan 7 días.

Abrir sus oportunidades: https://pmrfp.com/es/dashboard

R. Talkar
PMRFP

--
Recibe este correo porque su empresa comenzó una prueba de Trade Pro en PMRFP.
Cancelar la suscripción a estos correos: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```


### Trial day 12 · 2 days left + offer

#### EN

**Subject:** 2 days left on your Trade Pro trial  
*54 words before the footer*

```text
Hi Sam,

Your trial ends October 18. After that you're back on the free account: the first 3 leads, no contractor names, no price ranges.

To keep Trade Pro:

- Founding 500: $250 CAD once, Trade Pro for life (30-day refund)
- Or Trade Pro at $249 CAD a year

See Founding 500: https://pmrfp.com/founding-500

Trade Pro yearly: https://pmrfp.com/dashboard/billing?plan=pro&interval=annual

R. Talkar
PMRFP

--
You're getting this because your company started a Trade Pro trial on PMRFP.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### FR

**Subject:** Plus que 2 jours à votre essai Trade Pro  
*59 words before the footer*

```text
Bonjour Sam,

Votre essai se termine le 18 octobre. Ensuite, vous revenez au compte gratuit : les 3 premières occasions, sans nom d'entrepreneur ni fourchette de prix.

Pour garder Trade Pro :

- Fondateurs 500 : 250 $ CAD une fois, Trade Pro à vie (remboursement sous 30 jours)
- Ou Trade Pro à 249 $ CAD par année

Voir Fondateurs 500 : https://pmrfp.com/fr/founding-500

Trade Pro à l'année : https://pmrfp.com/fr/dashboard/billing?plan=pro&interval=annual

R. Talkar
PMRFP

--
Vous recevez ce courriel parce que votre entreprise a commencé un essai Trade Pro sur PMRFP.
Se désabonner de ces courriels : https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### ES

**Subject:** Quedan 2 días de su prueba de Trade Pro  
*60 words before the footer*

```text
Hola, Sam:

Su prueba termina el 18 de octubre. Después vuelve a la cuenta gratuita: las primeras 3 oportunidades, sin nombres de contratistas ni rangos de precios.

Para conservar Trade Pro:

- Fundadores 500: $250 CAD una vez, Trade Pro de por vida (reembolso en 30 días)
- O Trade Pro a $249 CAD al año

Ver Fundadores 500: https://pmrfp.com/es/founding-500

Trade Pro anual: https://pmrfp.com/es/dashboard/billing?plan=pro&interval=annual

R. Talkar
PMRFP

--
Recibe este correo porque su empresa comenzó una prueba de Trade Pro en PMRFP.
Cancelar la suscripción a estos correos: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```


### Trial ended · Back on free + offer

#### EN

**Subject:** Your trial ended. Your free account stays.  
*50 words before the footer*

```text
Hi Sam,

Your Trade Pro trial ended today. No charge and nothing to cancel: your free account and profile stay as they are.

If the leads were useful, Founding 500 is still open: $250 CAD once, Trade Pro for life, with a 30-day refund.

See Founding 500: https://pmrfp.com/founding-500

Trade Pro yearly: https://pmrfp.com/dashboard/billing?plan=pro&interval=annual

R. Talkar
PMRFP

--
You're getting this because your company started a Trade Pro trial on PMRFP.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### FR

**Subject:** Votre essai est terminé. Votre compte gratuit reste.  
*54 words before the footer*

```text
Bonjour Sam,

Votre essai Trade Pro s'est terminé aujourd'hui. Aucuns frais, rien à annuler : votre compte gratuit et votre profil restent tels quels.

Si les occasions vous ont été utiles, Fondateurs 500 est encore ouvert : 250 $ CAD une fois, Trade Pro à vie, remboursement sous 30 jours.

Voir Fondateurs 500 : https://pmrfp.com/fr/founding-500

Trade Pro à l'année : https://pmrfp.com/fr/dashboard/billing?plan=pro&interval=annual

R. Talkar
PMRFP

--
Vous recevez ce courriel parce que votre entreprise a commencé un essai Trade Pro sur PMRFP.
Se désabonner de ces courriels : https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### ES

**Subject:** Su prueba terminó. Su cuenta gratuita sigue.  
*52 words before the footer*

```text
Hola, Sam:

Su prueba de Trade Pro terminó hoy. Sin cargos y nada que cancelar: su cuenta gratuita y su perfil siguen igual.

Si las oportunidades le sirvieron, Fundadores 500 sigue abierto: $250 CAD una vez, Trade Pro de por vida, con reembolso en 30 días.

Ver Fundadores 500: https://pmrfp.com/es/founding-500

Trade Pro anual: https://pmrfp.com/es/dashboard/billing?plan=pro&interval=annual

R. Talkar
PMRFP

--
Recibe este correo porque su empresa comenzó una prueba de Trade Pro en PMRFP.
Cancelar la suscripción a estos correos: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```


### Trial +7 days · Win-back (last one)

#### EN

**Subject:** Still looking for Roofing work in Toronto?  
*58 words before the footer*

```text
Hi Sam,

PMRFP has 21 leads matched for Roofing and HVAC in Toronto right now. Your free account shows the first 3.

To see them all again: Founding 500 ($250 CAD once, for life) or Trade Pro at $249 CAD a year.

See Founding 500: https://pmrfp.com/founding-500

This is the last email about it. Your free account stays either way.

R. Talkar
PMRFP

--
You're getting this because your company started a Trade Pro trial on PMRFP.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### FR

**Subject:** Toujours à la recherche de travail en Toiture (Toronto)?  
*58 words before the footer*

```text
Bonjour Sam,

PMRFP a 21 occasions jumelées pour Toiture et CVC (Toronto) en ce moment. Votre compte gratuit montre les 3 premières.

Pour toutes les revoir : Fondateurs 500 (250 $ CAD une fois, à vie) ou Trade Pro à 249 $ CAD par année.

Voir Fondateurs 500 : https://pmrfp.com/fr/founding-500

C'est le dernier courriel à ce sujet. Votre compte gratuit reste, peu importe.

R. Talkar
PMRFP

--
Vous recevez ce courriel parce que votre entreprise a commencé un essai Trade Pro sur PMRFP.
Se désabonner de ces courriels : https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```

#### ES

**Subject:** ¿Sigue buscando trabajo de Techos en Toronto?  
*59 words before the footer*

```text
Hola, Sam:

PMRFP tiene 21 oportunidades para Techos y HVAC en Toronto ahora mismo. Su cuenta gratuita muestra las primeras 3.

Para verlas todas otra vez: Fundadores 500 ($250 CAD una vez, de por vida) o Trade Pro a $249 CAD al año.

Ver Fundadores 500: https://pmrfp.com/es/founding-500

Es el último correo sobre esto. Su cuenta gratuita sigue de todos modos.

R. Talkar
PMRFP

--
Recibe este correo porque su empresa comenzó una prueba de Trade Pro en PMRFP.
Cancelar la suscripción a estos correos: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```


## Persona variants (English)


### Day 1 · Your market · recurring

**Subject:** Roofing work in Toronto right now  
*107 words before the footer*

```text
Hi Sam,

Here's what PMRFP has matched for Roofing and HVAC in Toronto:

- 4 contractors who won public work this month (they hire subs)
- 6 open bids and tenders
- Price ranges for 2 of your trades, from real public awards
- 2 GC sub-trade packages
- 9 new projects and permits this month

Service contracts come back up for tender. Knowing who holds yours now, and what it paid, is how you get ready for the rebid.

A few of them:

- Roof replacement, 4 low-rise residential blocks (Toronto Community Housing)
- New 18-storey rental tower, Mississauga: building permit issued
- HVAC upgrades, Peel District School Board (awarded)

See all your leads: https://pmrfp.com/dashboard

R. Talkar
PMRFP

--
You're getting this because you have a PMRFP account.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```


### Day 1 · Your market · subtrade

**Subject:** Roofing work in Toronto right now  
*98 words before the footer*

```text
Hi Sam,

Here's what PMRFP has matched for Roofing and HVAC in Toronto:

- 9 new projects and permits this month
- 2 GC sub-trade packages
- 6 open bids and tenders
- 4 contractors who won public work this month (they hire subs)
- Price ranges for 2 of your trades, from real public awards

New projects and permits are where subtrades get in early, before the work is tendered.

A few of them:

- Roof replacement, 4 low-rise residential blocks (Toronto Community Housing)
- New 18-storey rental tower, Mississauga: building permit issued
- HVAC upgrades, Peel District School Board (awarded)

See all your leads: https://pmrfp.com/dashboard

R. Talkar
PMRFP

--
You're getting this because you have a PMRFP account.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```


### Day 5 · Start the free trial · recurring

**Subject:** Try Trade Pro free for 14 days  
*94 words before the footer*

```text
Hi Sam,

Your free account shows 3 of your 21 matched leads.

Trade Pro shows who holds the Roofing contracts near you, what they paid and when they were awarded, so you can plan for the rebid:

- Who won: the contractors on 4 recent awards in your trades
- What similar contracts paid: price ranges for 2 of your trades
- All 21 leads, not just the first 3
- New matches emailed to you each morning

14 days free. No card. One click to start, and it just ends: nothing to cancel.

Start the free trial: https://pmrfp.com/dashboard/trial

R. Talkar
PMRFP

--
You're getting this because you have a PMRFP account.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```


### Day 5 · Start the free trial · subtrade

**Subject:** Try Trade Pro free for 14 days  
*78 words before the footer*

```text
Hi Sam,

Your free account shows 3 of your 21 matched leads.

If you want the full picture, Trade Pro unlocks:

- All 21 leads, not just the first 3
- Who won: the contractors on 4 recent awards in your trades
- What similar contracts paid: price ranges for 2 of your trades
- New matches emailed to you each morning

14 days free. No card. One click to start, and it just ends: nothing to cancel.

Start the free trial: https://pmrfp.com/dashboard/trial

R. Talkar
PMRFP

--
You're getting this because you have a PMRFP account.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```


## U.S. differences (English)

Same copy; U.S. members see USD and their own state, and no CAD yearly price.


### Day 16 · Founding 500 offer · U.S.

**Subject:** Founding 500: Trade Pro for life, one payment  
*40 words before the footer*

```text
Hi Sam,

A plain offer while PMRFP is early: Founding 500 members pay once, $200 USD, and keep Trade Pro for life. No renewals.

Not for you? Email us within 30 days for a full refund.

See the offer: https://pmrfp.com/founding-500

Terms: https://pmrfp.com/terms#founding-500

R. Talkar
PMRFP

--
You're getting this because you have a PMRFP account.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```


### Trial day 12 · 2 days left + offer · U.S.

**Subject:** 2 days left on your Trade Pro trial  
*52 words before the footer*

```text
Hi Sam,

Your trial ends October 18. After that you're back on the free account: the first 3 leads, no contractor names, no price ranges.

To keep Trade Pro:

- Founding 500: $200 USD once, Trade Pro for life (30-day refund)
- Or Trade Pro by the year

See Founding 500: https://pmrfp.com/founding-500

Trade Pro yearly: https://pmrfp.com/dashboard/billing?plan=pro&interval=annual

R. Talkar
PMRFP

--
You're getting this because your company started a Trade Pro trial on PMRFP.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```


### Day 8 · What similar jobs sold for · U.S.

**Subject:** What Roofing jobs sold for in Texas  
*75 words before the footer*

```text
Hi Sam,

PMRFP tracks public contract awards. In the last 24 months, 37 Roofing contracts in Texas were awarded with a published price.

Two recent ones:

- Roof replacement, Round Rock fire station: $386,000 USD (Sep 12, 2026)
- Flat roof repairs, Austin ISD: $88,200 USD (Aug 28, 2026)

Trade Pro shows the full range (low, typical, high), who won, and every award behind it. Worth a look before you price your next bid.

See the benchmark: https://pmrfp.com/benchmarks/roofing/texas

R. Talkar
PMRFP

--
You're getting this because you have a PMRFP account.
Unsubscribe from these emails: https://pmrfp.com/api/email/lifecycle-unsubscribe?u=…&t=…
Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5 · info@pmrfp.com
```


## Open questions for Rishon

1. Sender name "R. Talkar · PMRFP" from info@pmrfp.com, replies to info@. OK, or a different mailbox?
2. Weekdays only (no Saturday / Sunday sends). Keep?
3. Turn on Resend open / click tracking? The admin funnel shows opens and clicks only if it's on (no pixels of our own).
