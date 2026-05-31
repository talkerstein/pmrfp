# PMRFP — Specialist Brief Archive

Briefs from the 8-agent PMRFP specialist cast land here. Each agent also writes its brief to a Notion page under Command Center and emails Rishon a copy.

## Weekly rhythm

| Day | Agent | Brief | File pattern |
|---|---|---|---|
| Mon 8am | `pmrfp-pm` | Project status — what shipped, what's stuck, what's next | `YYYY-MM-DD-pm.md` |
| Tue 8am | `pmrfp-sales` | Funnel + conversion + churn signals | `YYYY-MM-DD-sales.md` |
| Wed 8am | `pmrfp-bizdev` | 3 partnership opportunities for the week | `YYYY-MM-DD-bizdev.md` |
| Thu 8am | `pmrfp-construction` + `pmrfp-real-estate` + `pmrfp-property-mgr` (parallel) | Industry-expert review of the week's content/code | `YYYY-MM-DD-{construction\|real-estate\|property-mgr}.md` + index |
| Fri 8am | `pmrfp-mba` | Strategic check (weekly) + deeper review (first Friday of month) | `YYYY-MM-DD-mba.md` |
| 1st of month 8am | `pmrfp-cto` | Tech-debt + (quarterly) architecture audit | `YYYY-MM-DD-cto.md` |

## On-demand agents

Each agent also responds when called directly. From any Claude Code session:

```
ask my PMRFP construction expert about [thing]
ask my PMRFP MBA whether [decision]
PMRFP CTO check on [code/architecture]
PMRFP PM status
PMRFP sales — review the pricing page
PMRFP bizdev — who could we partner with for [vertical]
PMRFP real estate — would a REIT use [feature]
PMRFP property manager — is this onboarding too long
```

## Scheduled tasks

Managed in Claude Code at `~/.claude/scheduled-tasks/pmrfp-*`. Edit / pause / "Run now" from the Scheduled section in the sidebar.

## If briefs stop arriving

1. Open Claude Code → Scheduled tab → look for paused tasks
2. Check that the dev machine was running at the brief time (tasks fire on next app launch if missed)
3. The local file is the source of truth — if a Notion page or email is missing but the local file exists, the destination failed but the brief ran successfully
