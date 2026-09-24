/**
 * PMRFP brand tokens, mirrored from the web app's globals.css so the app and
 * pmrfp.com read as one product. Indigo primary, mint teal accent.
 *
 * teal (#91F2CF) is a light mint — it is a background/accent colour, never a
 * text colour on white. Use tealInk for readable teal text.
 */
export const colors = {
  indigo: "#282B59",
  indigo700: "#1E2147",
  indigo500: "#383C72",
  periwinkle: "#5D60A6",
  periwinkleSoft: "#ECEDF6",

  teal: "#91F2CF",
  teal300: "#B6F7DF",
  teal100: "#E4FBF2",
  tealInk: "#0C7A5A",

  ink: "#0D0D0D",
  ink2: "#3A3D4D",
  ink3: "#6A6E80",

  paper: "#FFFFFF",
  bg: "#F5F7FB",
  bg2: "#EEF1F7",
  border: "#E2E6F0",
  borderStrong: "#CDD3E2",

  onIndigo: "#EDEEF6",
  onIndigo2: "#A9ADCE",

  success: "#15803D",
  warn: "#D97706",
  error: "#B91C1C",
  /** Amber callouts (privacy check), as the web's amber-50 / amber-900. */
  warnBg: "#FFFBEB",
  warnBorder: "#FCD34D",
  warnInk: "#78350F",
  errorBg: "#FEF2F2",
} as const;

/** 20px on cards, pill on buttons — matches the web geometry. */
export const radius = { sm: 12, md: 16, lg: 20, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const type = {
  display: { fontSize: 26, fontWeight: "700", letterSpacing: -0.5, color: colors.indigo },
  h1: { fontSize: 22, fontWeight: "700", letterSpacing: -0.4, color: colors.indigo },
  h2: { fontSize: 17, fontWeight: "600", color: colors.indigo },
  body: { fontSize: 15, lineHeight: 22, color: colors.ink2 },
  small: { fontSize: 13, lineHeight: 18, color: colors.ink3 },
  /** Uppercase mono-ish label — the web uses IBM Plex Mono eyebrows. */
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.tealInk,
  },
} as const;
