/**
 * Server-side message loader. Each namespace file under ./messages exports
 * { en, fr, es? }, with fr/es typed against en so a missing string is a type
 * error. A language without its own copy yet falls back to English.
 *
 * Client components never import this file (it holds every language); they
 * read CLIENT_NAMESPACES through I18nProvider with useT().
 */
import type { Locale } from "./config";
import common from "./messages/common";
import home from "./messages/home";
import homeV3 from "./messages/homeV3";
import v3Pages from "./messages/v3Pages";
import agencies from "./messages/agencies";
import shared from "./messages/shared";
import sharedClient from "./messages/sharedClient";
import board from "./messages/board";
import boardClient from "./messages/boardClient";
import directory from "./messages/directory";
import directoryClient from "./messages/directoryClient";
import sales from "./messages/sales";
import salesClient from "./messages/salesClient";
import writer from "./messages/writer";
import auth from "./messages/auth";
import dash from "./messages/dash";
import dashClient from "./messages/dashClient";
import pm from "./messages/pm";
import pmClient from "./messages/pmClient";
import jobs from "./messages/jobs";
import jobsClient from "./messages/jobsClient";
import seo from "./messages/seo";
import content from "./messages/content";
import misc from "./messages/misc";
import miscClient from "./messages/miscClient";
import partners from "./messages/partners";
import partnersClient from "./messages/partnersClient";
import forum from "./messages/forum";
import forumClient from "./messages/forumClient";
import marketplace from "./messages/marketplace";
import marketplaceClient from "./messages/marketplaceClient";
import founding from "./messages/founding";
import foundingClient from "./messages/foundingClient";
import reports from "./messages/reports";
import gcHub from "./messages/gcHub";
import karma from "./messages/karma";
import portfolio from "./messages/portfolio";
import portfolioClient from "./messages/portfolioClient";

const NAMESPACES = {
  common,
  home,
  homeV3,
  v3Pages,
  agencies,
  shared,
  sharedClient,
  board,
  boardClient,
  directory,
  directoryClient,
  sales,
  salesClient,
  writer,
  auth,
  dash,
  dashClient,
  pm,
  pmClient,
  jobs,
  jobsClient,
  seo,
  content,
  misc,
  miscClient,
  partners,
  partnersClient,
  forum,
  forumClient,
  marketplace,
  marketplaceClient,
  founding,
  foundingClient,
  reports,
  gcHub,
  karma,
  portfolio,
  portfolioClient,
};

type Namespaces = typeof NAMESPACES;
export type Messages = { [K in keyof Namespaces]: Namespaces[K]["en"] };

/** Namespaces shipped to the browser for client components. */
export const CLIENT_NAMESPACES = ["common", "sharedClient", "boardClient", "directoryClient", "salesClient", "writer", "auth", "dashClient", "pmClient", "jobsClient", "miscClient", "partnersClient", "marketplaceClient", "forumClient", "foundingClient", "portfolioClient"] as const satisfies readonly (keyof Messages)[];
export type ClientMessages = Pick<Messages, (typeof CLIENT_NAMESPACES)[number]>;

export function getDictionary(lang: Locale): Messages {
  const out = {} as Record<string, unknown>;
  for (const [ns, byLang] of Object.entries(NAMESPACES) as [string, Record<string, unknown>][]) {
    out[ns] = byLang[lang] ?? byLang.en;
  }
  return out as Messages;
}

export function clientMessages(lang: Locale): ClientMessages {
  const all = getDictionary(lang);
  return Object.fromEntries(CLIENT_NAMESPACES.map((ns) => [ns, all[ns]])) as ClientMessages;
}
