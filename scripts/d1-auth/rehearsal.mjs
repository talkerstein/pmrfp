import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { getMigrations } from 'better-auth/db/migration';
import { compare, hash } from 'bcryptjs';

/** Isolated rehearsal only: no production URL, source connection or mail sender. */
export function rehearsalOptions(database, secret) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('A private rehearsal secret is required');
  return {
    database, secret, baseURL: 'http://localhost:8788',
    trustedOrigins: ['http://localhost:8788'],
    logger: { disabled: true },
    emailAndPassword: {
      enabled: true, disableSignUp: true, requireEmailVerification: true,
      password: {
        hash: async password => {
          if (Buffer.byteLength(password, 'utf8') > 72) throw new Error('Password exceeds bcrypt byte bound');
          return hash(password, 12);
        },
        verify: async ({ hash: stored, password }) => compare(password, stored),
      },
    },
    session: { cookieCache: { enabled: false } },
    advanced: { database: { generateId: () => randomUUID() } },
    plugins: [admin()],
  };
}

/** Synthetic fixtures exercise the migration fields without exporting real hashes. */
export function mapSyntheticSource(row, now = Date.now()) {
  if (!row || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(row.id)
    || typeof row.email !== 'string' || !row.email.endsWith('@example.invalid')
    || !/^\$2[aby]\$(0[4-9]|1[0-6])\$[./A-Za-z0-9]{53}$/.test(row.encrypted_password)
    || row.deleted_at || row.is_anonymous || row.is_sso_user) {
    throw new Error('Only supported synthetic migration fixtures are accepted');
  }
  const timestamp = value => {
    const n = Date.parse(value);
    if (!Number.isFinite(n)) throw new Error('Invalid source timestamp');
    return n;
  };
  const bannedUntil = row.banned_until ? timestamp(row.banned_until) : null;
  return {
    id: row.id, email: row.email, name: 'Migration test',
    emailVerified: row.email_confirmed_at ? (timestamp(row.email_confirmed_at), 1) : 0,
    createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at),
    // Application roles are not inferred from user-editable metadata.
    role: 'user', banned: bannedUntil !== null && bannedUntil > now ? 1 : 0,
    banExpires: bannedUntil,
    account: { id: `credential:${row.id}`, accountId: row.id, providerId: 'credential', password: row.encrypted_password },
  };
}

export async function createRehearsal(database, secret) {
  const options = rehearsalOptions(database, secret);
  const migration = await getMigrations(options);
  await migration.runMigrations();
  return betterAuth(options);
}

export function importSyntheticFixtures(database, rows) {
  const fixtures = rows.map(row => mapSyntheticSource(row));
  database.exec('BEGIN IMMEDIATE');
  try {
    const insertUser = database.prepare('INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt,role,banned,banExpires) VALUES(?,?,?,?,?,?,?,?,?)');
    const insertAccount = database.prepare('INSERT INTO account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)');
    for (const row of fixtures) {
      insertUser.run(row.id,row.name,row.email,row.emailVerified,row.createdAt,row.updatedAt,row.role,row.banned,row.banExpires);
      insertAccount.run(row.account.id,row.account.accountId,row.account.providerId,row.id,row.account.password,row.createdAt,row.updatedAt);
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  return { syntheticOnly: true, users: fixtures.length, sourceWrites: 0 };
}
