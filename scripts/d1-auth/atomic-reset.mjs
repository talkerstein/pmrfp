import { hash } from 'bcryptjs';

/** Pinned synthetic-only D1 reset: token consumption, session revocation and
 * credential replacement commit together in one native D1 batch. No mail. */
export async function resetSyntheticPassword(db, token, password, now = Date.now()) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(token)
    || typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72
    || !Number.isSafeInteger(now) || now < 0) throw new Error('Invalid reset input');
  const identifier = `reset-password:${token}`;
  const timestamp = new Date(now).toISOString();
  const encoded = await hash(password, 12);
  // The pinned native D1 adapter stores dates as ISO text.
  // Fail inside the transaction using the sandbox marker's CHECK constraint.
  const eligible = `SELECT v.value FROM verification v JOIN user u ON u.id=v.value
    JOIN account a ON a.userId=u.id AND a.providerId='credential'
    WHERE v.identifier=? AND typeof(v.expiresAt)='text' AND julianday(v.expiresAt)>julianday(?)
      AND u.id LIKE '00000000-0000-4000-8000-0000000000%' AND u.email LIKE '%@example.invalid'`;
  const statement = (sql, ...params) => db.prepare(sql).bind(...params);
  return db.batch([
    statement("INSERT INTO _auth_preview_manifest(id,mode) SELECT 1,'invalid' WHERE NOT EXISTS (SELECT 1 FROM _auth_preview_manifest WHERE id=1 AND mode='synthetic-only-v1')"),
    statement(`UPDATE _auth_preview_manifest SET mode=CASE WHEN (SELECT count(*) FROM (${eligible}))=1 THEN mode ELSE 'invalid' END WHERE id=1`, identifier, timestamp),
    statement(`UPDATE account SET password=?,updatedAt=? WHERE providerId='credential' AND userId=(${eligible})`, encoded, timestamp, identifier, timestamp),
    statement("UPDATE _auth_preview_manifest SET mode=CASE WHEN changes()=1 THEN mode ELSE 'invalid' END WHERE id=1"),
    statement(`DELETE FROM session WHERE userId=(${eligible})`, identifier, timestamp),
    statement('DELETE FROM verification WHERE identifier=?', identifier),
    statement("UPDATE _auth_preview_manifest SET mode=CASE WHEN changes()=1 THEN mode ELSE 'invalid' END WHERE id=1"),
  ]);
}
