import { betterAuth } from 'better-auth';
import { rehearsalOptions } from './rehearsal.mjs';

export function customerPasswordAuth(database, secret, origin, { extraPlugins = [], databaseHooks = undefined } = {}) {
  const options = rehearsalOptions(database, secret);
  return betterAuth({
    ...options, baseURL: origin, trustedOrigins: [origin],
    plugins: [...options.plugins, ...extraPlugins], databaseHooks,
    session: { ...options.session, expiresIn: 3600, disableSessionRefresh: true },
  });
}
