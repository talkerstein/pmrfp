"""PMRFP account emails for Supabase Auth: responsive, email-client-safe HTML.

Table layout with inline styles (Gmail, Outlook, Apple Mail), a <style> block
only for the phone breakpoint, a hidden inbox preview line, and a
"bulletproof" button that goes full width on phones. Supabase fills the
{{ .ConfirmationURL }} / {{ .Email }} / {{ .NewEmail }} / {{ .Token }} merge
fields. `python build.py` writes one .html per template plus preview.html
(desktop and phone side by side, sample data filled in).
"""
import base64
import html
import pathlib

HERE = pathlib.Path(__file__).parent
LOGO_URL = "https://pmrfp.com/brand/email-logo.png"
NAVY = "#282B59"
INK = "#1B1E45"
TEXT = "#475569"
MUTED = "#94A3B8"
FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif"

PAGE = """<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>{subject}</title>
<style>
  body {{ margin:0; padding:0; }}
  a {{ color:{navy}; }}
  @media only screen and (max-width:620px) {{
    .card {{ width:100% !important; border-radius:0 !important; border-left:0 !important; border-right:0 !important; }}
    .pad {{ padding-left:24px !important; padding-right:24px !important; }}
    .h1 {{ font-size:22px !important; line-height:30px !important; }}
    .btn-table {{ width:100% !important; }}
    .btn-a {{ display:block !important; text-align:center !important; }}
    .outer {{ padding:0 !important; }}
  }}
</style>
</head>
<body style="margin:0;padding:0;background:#F4F5F9;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#F4F5F9;">{preheader}&#8203;&#8199;&#65279;&#847;&#8203;&#8199;&#65279;&#847;&#8203;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F4F5F9;">
  <tr><td class="outer" align="center" style="padding:32px 12px;">
    <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#FFFFFF;border:1px solid #E6E8F0;border-radius:16px;">
      <tr><td class="pad" style="padding:32px 40px 0 40px;">
        <a href="https://pmrfp.com" style="text-decoration:none;"><img src="{logo}" width="146" height="28" alt="PMRFP" style="display:block;border:0;outline:none;height:28px;width:146px;"></a>
      </td></tr>
      <tr><td class="pad" style="padding:28px 40px 0 40px;font-family:{font};">
        <h1 class="h1" style="margin:0 0 12px 0;font-size:24px;line-height:32px;font-weight:700;color:{ink};">{title}</h1>
        {body}
      </td></tr>
      <tr><td class="pad" style="padding:24px 40px 36px 40px;font-family:{font};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F6F7FB;border-radius:10px;">
          <tr><td style="padding:14px 16px;font-size:13px;line-height:20px;color:{text};">{note}</td></tr>
        </table>
      </td></tr>
    </table>
    <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
      <tr><td class="pad" align="center" style="padding:20px 40px 8px 40px;font-family:{font};font-size:12px;line-height:18px;color:{muted};">
        PMRFP · Commercial property RFPs and public tenders in Canada and the U.S.<br>
        <a href="https://pmrfp.com" style="color:{muted};text-decoration:underline;">pmrfp.com</a> · <a href="mailto:info@pmrfp.com" style="color:{muted};text-decoration:underline;">info@pmrfp.com</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
"""


def para(text: str) -> str:
    return f'<p style="margin:0 0 16px 0;font-size:16px;line-height:26px;color:{TEXT};">{text}</p>'


def button(label: str, href: str = "{{ .ConfirmationURL }}") -> str:
    return f"""<table role="presentation" class="btn-table" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px 0;">
          <tr><td align="center" bgcolor="{NAVY}" style="border-radius:10px;background:{NAVY};">
            <a class="btn-a" href="{href}" style="display:inline-block;padding:15px 30px;font-family:{FONT};font-size:16px;line-height:20px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;">{label}</a>
          </td></tr>
        </table>"""


FALLBACK = (
    f'<p style="margin:0;font-size:13px;line-height:20px;color:{MUTED};">Button not working? Copy this link into your browser:<br>'
    f'<a href="{{{{ .ConfirmationURL }}}}" style="color:{NAVY};word-break:break-all;">{{{{ .ConfirmationURL }}}}</a></p>'
)

TEMPLATES = {
    "confirm-signup": dict(
        subject="Confirm your PMRFP account",
        preheader="One tap to confirm your email and finish setting up your account.",
        title="Confirm your email",
        body=para("Thanks for joining PMRFP. Tap the button to confirm this is your email, and you'll go straight to setting up your company.")
        + button("Confirm my email") + FALLBACK,
        note="Didn&#39;t sign up for PMRFP? You can ignore this email.",
    ),
    "magic-link": dict(
        subject="Your PMRFP sign-in link",
        preheader="Tap to sign in. The link works once.",
        title="Sign in to PMRFP",
        body=para("Tap the button to sign in. No password needed.") + button("Sign in to PMRFP") + FALLBACK,
        note="The link works once and expires soon. Didn&#39;t ask to sign in? You can ignore this email; your account is safe.",
    ),
    "reset-password": dict(
        subject="Reset your PMRFP password",
        preheader="Choose a new password for your PMRFP account.",
        title="Reset your password",
        body=para("We got a request to reset the password for <strong style=\"color:#1B1E45;\">{{ .Email }}</strong>. Tap the button to choose a new one.")
        + button("Choose a new password") + FALLBACK,
        note="Didn&#39;t ask for this? Ignore this email and your password stays the same. The link expires soon.",
    ),
    "change-email": dict(
        subject="Confirm your new email for PMRFP",
        preheader="Confirm the new email address for your PMRFP account.",
        title="Confirm your new email",
        body=para("Please confirm you want to change your PMRFP sign-in email from <strong style=\"color:#1B1E45;\">{{ .Email }}</strong> to <strong style=\"color:#1B1E45;\">{{ .NewEmail }}</strong>.")
        + button("Confirm new email") + FALLBACK,
        note="Didn&#39;t ask for this? Ignore this email and nothing changes. If you think someone else has access to your account, reset your password.",
    ),
    "invite": dict(
        subject="You're invited to PMRFP",
        preheader="Accept your invite and set up your PMRFP account.",
        title="You&#39;re invited to PMRFP",
        body=para("You&#39;ve been invited to join PMRFP, where property managers post RFPs and trades find the work. Tap the button to accept and set up your account.")
        + button("Accept invite") + FALLBACK,
        note="Not expecting this? You can ignore this email.",
    ),
    "reauthentication": dict(
        subject="Your PMRFP verification code",
        preheader="Your PMRFP verification code is inside.",
        title="Your verification code",
        body=para("Enter this code in PMRFP to confirm it&#39;s you:")
        + f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px 0;"><tr><td style="background:#F6F7FB;border:1px solid #E6E8F0;border-radius:10px;padding:14px 22px;font-family:{FONT};font-size:30px;line-height:36px;font-weight:700;letter-spacing:6px;color:{INK};">{{{{ .Token }}}}</td></tr></table>',
        note="The code expires soon. Didn&#39;t ask for a code? You can ignore this email.",
    ),
    # Security notifications (Supabase Auth → Emails → Notifications).
    "password-changed": dict(
        subject="Your PMRFP password was changed",
        preheader="A security notice about your PMRFP account.",
        title="Your password was changed",
        body=para("The password for your PMRFP account <strong style=\"color:#1B1E45;\">{{ .Email }}</strong> was just changed. If that was you, you&#39;re all set.")
        + para("Wasn&#39;t you? Reset your password now, then email us at <a href=\"mailto:info@pmrfp.com\" style=\"color:#282B59;\">info@pmrfp.com</a> so we can help secure your account.")
        + button("Reset my password", "https://pmrfp.com/forgot-password"),
        note="We send this notice every time your password changes, to keep your account safe.",
    ),
    "email-changed": dict(
        subject="Your PMRFP sign-in email was changed",
        preheader="A security notice about your PMRFP account.",
        title="Your sign-in email was changed",
        body=para("The sign-in email for your PMRFP account was changed from <strong style=\"color:#1B1E45;\">{{ .OldEmail }}</strong> to <strong style=\"color:#1B1E45;\">{{ .Email }}</strong>.")
        + para("Wasn&#39;t you? Email us right away at <a href=\"mailto:info@pmrfp.com\" style=\"color:#282B59;\">info@pmrfp.com</a> and we&#39;ll lock the account down."),
        note="We send this notice every time your sign-in email changes, to keep your account safe.",
    ),
}

SAMPLE = {
    "{{ .ConfirmationURL }}": "https://pmrfp.com/auth/confirm?token=5f2c8a",
    "{{ .Email }}": "you@yourcompany.com",
    "{{ .OldEmail }}": "old@yourcompany.com",
    "{{ .NewEmail }}": "new@yourcompany.com",
    "{{ .Token }}": "482913",
}


def render(t: dict, logo: str) -> str:
    return PAGE.format(
        subject=html.escape(t["subject"]), preheader=t["preheader"], title=t["title"], body=t["body"],
        note=t["note"], logo=logo, navy=NAVY, ink=INK, text=TEXT, muted=MUTED, font=FONT,
    )


if __name__ == "__main__":
    for old in HERE.glob("*.html"):
        old.unlink()
    lines = []
    for key, t in TEMPLATES.items():
        (HERE / f"{key}.html").write_text(render(t, LOGO_URL), encoding="utf-8")
        lines.append(f"{key}: {t['subject']}")
    (HERE / "SUBJECTS.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Preview page: each email at desktop (600px) and phone (375px) width.
    logo_file = HERE.parents[1] / "public" / "brand" / "email-logo.png"
    logo_data = "data:image/png;base64," + base64.b64encode(logo_file.read_bytes()).decode()
    cards = []
    for key, t in TEMPLATES.items():
        doc = render(t, logo_data)
        for a, b in SAMPLE.items():
            doc = doc.replace(a, b)
        src = html.escape(doc, quote=True)
        cards.append(f"""<section><h2>{html.escape(t['subject'])} <span>{key}</span></h2>
<div class="row"><figure><figcaption>Desktop</figcaption><iframe srcdoc="{src}" style="width:680px;height:640px"></iframe></figure>
<figure><figcaption>Phone</figcaption><iframe srcdoc="{src}" style="width:375px;height:640px"></iframe></figure></div></section>""")
    (HERE / "preview.html").write_text(f"""<!doctype html><html><head><meta charset="utf-8"><title>PMRFP account emails</title>
<style>body{{margin:0;padding:24px;background:#E9EBF2;font-family:system-ui,sans-serif;color:#1B1E45}}
h1{{margin:0 0 4px}} p.lead{{margin:0 0 24px;color:#475569}}
section{{margin:0 0 36px}} h2{{font-size:17px;margin:0 0 10px}} h2 span{{font-weight:400;color:#94A3B8;font-size:13px;margin-left:8px}}
.row{{display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start}} figure{{margin:0}} figcaption{{font-size:12px;color:#64748B;margin:0 0 6px}}
iframe{{border:1px solid #CBD2E1;border-radius:12px;background:#fff}}</style></head><body>
<h1>PMRFP account emails</h1><p class="lead">Sample data filled in. Sender: PMRFP &lt;info@pmrfp.com&gt;.</p>
{''.join(cards)}</body></html>""", encoding="utf-8")
    print("\n".join(lines))
