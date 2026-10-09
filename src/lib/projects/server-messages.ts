/**
 * English answers from lib/projects and the /api/projects routes, keyed to
 * portfolioClient.serverMessages so the browser can show them translated
 * (pure, shared by client and tests). The test checks every template here
 * equals the English dictionary entry, so the two can't drift.
 *
 * {n} matches a number and {email} an address inside a message.
 */
export const SERVER_MESSAGE_TEMPLATES = {
  signIn: "Sign in to your company account first.",
  checkForm: "Please check the form.",
  invalidRequest: "Invalid request",
  tooMany: "Too many requests. Please slow down.",
  publishNotSetUp: "Publishing isn't set up here yet.",
  titleShort: "Give the project a clear title (10+ characters).",
  challengeShort: "Say a bit more about the challenge (a sentence or two).",
  approachShort: "Say a bit more about what you did (a sentence or two).",
  outcomeShort: "Say a bit more about the result (a sentence or two).",
  addPhoto: "Add at least one photo.",
  notThisProject: "One of those photos isn't from this project. Remove it and try again.",
  tickPhotos: "Tick \"I've checked the photos\" to publish.",
  freeProjectLimit: "The free plan includes one project. Upgrade to Trade Pro to add more.",
  projectsNotOn: "Projects aren't switched on yet. Try again soon.",
  publishFailed: "Couldn't save the project. Try again in a minute.",
  reviewsPro: "Review requests are part of Trade Pro.",
  reviewsNotSetUp: "Review requests aren't set up here yet.",
  reviewsBurst: "That's a lot of requests at once. Wait a minute and try again.",
  clientName: "Add your client's name.",
  validEmail: "Enter a valid email.",
  ownEmail: "Send this to your client, not to your own address.",
  reviewsAfterPublish: "You can ask for reviews once the project is published.",
  reviewsNotOn: "Review requests aren't switched on yet. Try again soon.",
  reviewCreateFailed: "Couldn't create the request. Try again in a minute.",
  fieldsSoon: "Case-study fields are switching on soon. Try again in a little while.",
  savingNotSetUp: "Saving isn't set up here yet.",
  notYours: "That project isn't on your account.",
  removed: "This project was removed. Add it again as a new project.",
  privatePro: "Private projects and private links are part of Trade Pro.",
  saveFailed: "Couldn't save. Try again in a minute.",
  photosPending: "Saved, but some photos are still moving. Try again in a minute to finish.",
  figureValue: "Each figure needs a value.",
  figureShort: "Keep each figure short (24 characters).",
  figureLabel: "Say what each figure measures.",
  labelShort: "Keep each label under 60 characters.",
  pickMonth: "Pick a month.",
  scopeLong: "Keep the scope under 1,500 characters.",
  finishBeforeStart: "The finish month is before the start month.",
  confirmAi: "Read the AI wording and tick the box to confirm it's accurate.",
  finishFuture: "The finish month can't be in the future.",
  startFuture: "The start month can't be in the future.",
  linksPro: "Private links are part of Trade Pro.",
  linksNotSetUp: "Private links aren't set up here yet.",
  linksBurst: "That's a lot of links at once. Wait a minute and try again.",
  shareAfterPublish: "You can share a project once it's published.",
  linksSoon: "Private links are switching on soon.",
  linkFailed: "Couldn't create the link.",
  linkFailedRetry: "Couldn't create the link. Try again in a minute.",
  linkOff: "That link is already off, or isn't yours.",
  uploadsNotSetUp: "Photo uploads aren't set up here yet.",
  uploadLost: "That upload didn't come through. Try again.",
  noPhoto: "No photo found in the upload.",
  photoTooBig: "That photo is over 15 MB. Try a smaller one.",
  photosOnly: "Only photos can be uploaded here.",
  unreadable: "We couldn't read that photo. Try a JPEG or PNG, or take it again with the camera.",
  photoSaveFailed: "Couldn't save that photo. Try again in a minute.",
  photoNotThisProject: "One of those photos isn't from this project.",
  draftEmpty: "Add a photo or a line about the job first.",
  draftFailed: "Couldn't write it right now. Write it yourself below.",
  photoLimitPaid: "Up to {n} photos per project. Remove a few and try again.",
  photoLimitFree: "The free plan allows {n} photos per project. Remove some, or upgrade to Trade Pro for more.",
  alreadyAsked: "You've already asked {email} about this project.",
  inviteLimit: "You've sent {n} requests for this project. That's the limit.",
  liveLinks: "This project has {n} live links. Turn one off first.",
  sent: "Sent to {email}. You'll see it here once they reply.",
} as const;

export type ServerMessageKey = keyof typeof SERVER_MESSAGE_TEMPLATES;

const EXACT = new Map<string, ServerMessageKey>();
const PATTERNS: { re: RegExp; key: ServerMessageKey; names: string[] }[] = [];

for (const [key, template] of Object.entries(SERVER_MESSAGE_TEMPLATES) as [ServerMessageKey, string][]) {
  if (!/\{(n|email)\}/.test(template)) {
    EXACT.set(template, key);
    continue;
  }
  const names: string[] = [];
  const source = template
    .split(/(\{n\}|\{email\})/)
    .map((part) => {
      if (part === "{n}") {
        names.push("n");
        return "(\\d+)";
      }
      if (part === "{email}") {
        names.push("email");
        return "(\\S+@\\S+?)";
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  PATTERNS.push({ re: new RegExp(`^${source}$`), key, names });
}

/** Which dictionary entry an English server answer is, with its {n}/{email}; null if unknown. */
export function translateServerMessage(message: string): { key: ServerMessageKey; values: Record<string, string> } | null {
  const exact = EXACT.get(message);
  if (exact) return { key: exact, values: {} };
  for (const p of PATTERNS) {
    const m = p.re.exec(message);
    if (m) return { key: p.key, values: Object.fromEntries(p.names.map((n, i) => [n, m[i + 1]])) };
  }
  return null;
}
