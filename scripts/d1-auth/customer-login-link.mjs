import { magicLink } from "better-auth/plugins";
import { customerPasswordAuth } from "./customer-auth.mjs";

const magicLifetime = 300;

export function customerLoginLinkAuth(database, secret, origin, { capture, expectedUser }) {
  return customerPasswordAuth(database, secret, origin, {
    extraPlugins: [magicLink({
      expiresIn: magicLifetime,
      disableSignUp: true,
      storeToken: "hashed",
      generateToken: () => Array.from(crypto.getRandomValues(new Uint8Array(32)),
        byte => byte.toString(16).padStart(2, "0")).join(""),
      sendMagicLink: async ({ email, token }) => {
        if (!capture) throw new Error("Email sign-in unavailable");
        await capture(email, token);
      },
    })],
    databaseHooks: expectedUser ? {
      user: { update: { before: async () => false } },
      session: { create: { before: async (session) => {
        if (session.userId !== expectedUser.id) return false;
        const current = await database.prepare(`SELECT id FROM user
          WHERE id=? AND email=? AND emailVerified=1 AND
          (banned=0 OR (banned=1 AND julianday(banExpires)<=julianday('now')))`)
          .bind(expectedUser.id, expectedUser.email).first();
        return current ? { data: session } : false;
      } } },
    } : undefined,
  });
}
