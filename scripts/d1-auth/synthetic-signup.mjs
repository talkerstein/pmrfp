export const syntheticSignupPath = "/api/auth/sign-up/email";
const fixtureEmail = "profile-signup-19@example.invalid";
const fixtureId = "00000000-0000-4000-8000-000000000019";
const maxBodyBytes = 1024;

export async function syntheticSignupRequest(request, origin) {
  if (request.method !== "POST" || new URL(request.url).search || request.headers.get("origin") !== origin
      || request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw Error("Invalid synthetic signup request");
  }
  const reader = request.body?.getReader();
  if (!reader) throw Error("Missing synthetic signup body");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBodyBytes) throw Error("Synthetic signup body exceeds limit");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel();
  }
  const input = JSON.parse(text);
  if (!input || typeof input !== "object" || Array.isArray(input)
      || Object.keys(input).some(key => !["name", "email", "password"].includes(key))
      || input.email !== fixtureEmail || typeof input.name !== "string" || !input.name.trim()
      || input.name.trim().length > 120 || typeof input.password !== "string" || input.password.length < 8
      || new TextEncoder().encode(input.password).byteLength > 72) {
    throw Error("Invalid synthetic signup fields");
  }
  return new Request(request.url, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ name: input.name.trim(), email: fixtureEmail, password: input.password, callbackURL: "/" }),
  });
}

export function syntheticSignupOptions(options) {
  if (typeof options.emailVerification?.sendVerificationEmail !== "function") {
    throw Error("Synthetic verification capture is required");
  }
  return {
    ...options,
    emailAndPassword: { ...options.emailAndPassword, disableSignUp: false, autoSignIn: false },
    emailVerification: { ...options.emailVerification, sendOnSignUp: true },
    advanced: {
      ...options.advanced,
      database: {
        ...options.advanced.database,
        generateId: input => input.model === "user" ? fixtureId : options.advanced.database.generateId(input),
      },
    },
  };
}
