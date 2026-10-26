/**
 * OPEN DATA: the one rule for "may we show this name?".
 *
 * Every open-government licence we use (OGL-Canada, OGL-Toronto, OGL-Alberta,
 * OGL-BC, OGL-Vancouver, municipal OGLs) EXCLUDES personal information. A
 * permit's contractor or a contract's vendor can be a sole proprietor whose
 * business name is their own name, so we keep a name only when it looks like
 * a BUSINESS. Anything else is dropped (permits) or counted but never named
 * (award history: winner_is_individual = true).
 *
 * Plain ES module (not TypeScript) so the local scripts under scripts/ can
 * import it without a build step; the app imports it through
 * business-name.d.mts.
 *
 * THE RULE (conservative: when unsure, a name is NOT shown)
 *   1. Use the first line only (some feeds append the contractor's street
 *      address on later lines), drop "c/o ..." tails and trading-name
 *      prefixes ("John Smith dba Smith Roofing" keeps "Smith Roofing").
 *   2. Reject placeholders ("owner", "homeowner", "self", "n/a", "various"...)
 *      and anything holding an email address, a phone number or a street
 *      address.
 *   3. Accept when it carries a LEGAL SUFFIX (Inc, Ltd, Ltée, Corp, LLC, LLP,
 *      LP, ULC, Limited, Company, S.E.N.C., Enr...) or a numbered-company
 *      pattern ("1234567 Alberta Ltd"), or "&" / "and Sons".
 *   4. Otherwise accept only when it holds a STRONG BUSINESS WORD
 *      (construction, contracting, plumbing, roofing, electric, builders,
 *      homes, renovations, mechanical ...).
 *   5. Everything else is rejected: "John Smith", "Smith, John A.",
 *      "Marie-Eve Tremblay", single words ("Lund").
 *
 * KNOWN FALSE NEGATIVES (a real business we drop): a firm trading under a
 * plain name with no suffix and no business word ("Pomerleau", "Ellis Don",
 * "Bird"). Coverage loss is accepted.
 * KNOWN FALSE POSITIVES (a person we may show): a sole proprietor who
 * registered a trade name containing their own name plus a business word
 * ("John Smith Plumbing"): the trade name is a published business name, but
 * it identifies a person, so counsel should confirm we may show it. A
 * person's name that happens to contain a business word as a surname
 * ("Mike Builder", "Tom Power") would also pass.
 */

const LEGAL =
  /(?:^|[\s,])(?:inc|incorporated|ltd|ltée|ltee|limited|limitée|limitee|llc|l\.l\.c|llp|lp|l\.p|ulc|u\.l\.c|corp|corporation|co|company|cie|plc|gmbh|s\.e\.n\.c|senc|s\.e\.c|enr|gp|cooperative|co-op|holdings|enterprises|enterprise|ventures)\b\.?/i;

const STRONG_WORD = new RegExp(
  "\\b(?:" +
    [
      "construction", "constructors?", "contracting", "contractors?", "builders?", "building", "buildings", "homes?", "renovations?", "remodel\\w*",
      "roofing", "roofers?", "plumbing", "plumbers?", "heating", "cooling", "hvac", "mechanical", "electric", "electrical", "electricians?",
      "restoration", "concrete", "paving", "asphalt", "excavating", "excavation", "demolition", "framing", "drywall", "painting", "painters?",
      "flooring", "landscap\\w*", "paysag\\w*", "cleaning", "janitorial", "maintenance", "mechanics?",
      "developments?", "developers?", "properties", "property", "projects?", "group", "industries", "systems?", "solutions", "services?",
      "engineering", "engineers?", "architects?", "architecture", "management", "supply", "supplies", "installations?", "installers?",
      "insulation", "glazing", "windows?", "doors?", "fencing", "steelworks?", "masonry", "tiling", "carpentry", "millwork", "cabinets?",
      "pools?", "irrigation", "paysagement", "entrepreneur\\w*", "entreprises?", "b[âa]timents?", "construction[s]?", "toiture", "plomberie", "chauffage", "[ée]lectrique", "m[ée]canique",
      "pest", "protection", "sprinklers?", "elevators?", "controls", "automation", "technolog\\w*", "energy",
    ].join("|") +
    ")\\b",
  "i",
);

const JUNK =
  /^(?:n\/?a|none|nil|unknown|tbd|tba|various|multiple|same|self|owner|owners|home ?owner|homeowners?|owner[ /-]?builder|owner contractor|applicant|the owner|to be determined|not (?:applicable|available|provided|required|listed)|no contractor|-+|\.+|\*+|\d+)$/i;

const ADDRESS = /\b\d{1,6}\s+[A-Za-z0-9'.-]+\s+(?:st|street|ave|avenue|rd|road|dr|drive|blvd|boulevard|way|ct|court|cres|crescent|ln|lane|pl|place|hwy|highway|terrace|trail)\b/i;
const CONTACT = /@|\b\d{3}[-.\s)]\s?\d{3}[-.\s]\d{4}\b|\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/;
const DBA = /\s+(?:d\/?b\/?a|o\/a|a\/s|doing business as|operating as|faisant affaires sous(?: le nom de)?|trading as|t\/a)\s+/i;

const tidy = (s) => s.replace(/\s+/g, " ").replace(/^[\s,;:.\-*]+|[\s,;:\-*]+$/g, "").trim();

/** "SMITH PLUMBING LTD" -> "Smith Plumbing Ltd". Mixed case is left alone. */
export function tidyCase(s) {
  if (!s || s !== s.toUpperCase() || !/[A-Z]/.test(s)) return s;
  const SMALL = new Set(["and", "of", "the", "de", "du", "des", "la", "le", "et"]);
  const SUFFIX = new Set(["ltd", "inc", "enr", "cie", "co", "corp"]);
  const ACRONYM = new Set(["hvac", "llp", "llc", "ulc", "lp", "pvc", "jv"]);
  return s.toLowerCase().replace(/(^|[\s\-/(#&])([a-zà-öø-ÿ]+)/g, (_m, pre, w) => {
    if (ACRONYM.has(w) || (w.length <= 2 && !SMALL.has(w) && !SUFFIX.has(w))) return pre + w.toUpperCase();
    if (SMALL.has(w) && pre !== "") return pre + w;
    return pre + w[0].toUpperCase() + w.slice(1);
  });
}

/**
 * The business name to show, or null when it may be a person, a placeholder
 * or holds contact details. Never throws.
 */
export function businessOnly(raw) {
  if (raw == null) return null;
  let name = tidy(String(raw).split(/[\r\n]+/)[0] ?? "");
  if (!name || name.length < 3) return null;
  name = tidy(name.replace(/\s+c\/o\b.*$/i, ""));
  const dba = name.split(DBA);
  if (dba.length > 1) name = tidy(dba[dba.length - 1]);
  if (!name || name.length < 3 || name.length > 160) return null;
  if (JUNK.test(name) || CONTACT.test(name) || ADDRESS.test(name)) return null;
  const numbered = /^\d{5,}\s+[A-Za-z]/.test(name);
  if (LEGAL.test(name) || numbered || /\s&\s|\band sons?\b|\bet fils\b/i.test(name)) return tidyCase(name);
  if (STRONG_WORD.test(name)) {
    // "Smith, John" with a comma-separated personal order is still a person.
    if (/^[A-Za-zÀ-ÿ'’-]+,\s+[A-Za-zÀ-ÿ'’. -]+$/.test(name) && !LEGAL.test(name) && name.split(/\s+/).length <= 3) return null;
    return tidyCase(name);
  }
  return null;
}

/** Stable grouping key: "GUILD ELECTRIC LTD." and "Guild Electric Limited" match. */
export function businessKey(name) {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\band\b/g, "&")
    .replace(/\b(?:incorporated|inc|limited|ltd|ltee|corporation|corp|company|co|llc|ulc)\b\.?/g, "")
    .replace(/[^a-z0-9&]+/g, " ")
    .replace(/^the\s+/, "")
    .trim();
}
