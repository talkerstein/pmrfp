import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import type { D1Binding, D1Statement } from "@/lib/d1/contracts";
import { acceptVpsForumAnswer, moderateVpsForumTarget, rateVpsForumThread, reportVpsForumTarget, storeVpsForumReply,
  storeVpsForumThread, voteVpsForumPoll, voteVpsForumPost, type ForumActor } from "@/lib/forum/vps";

it("keeps forum writes, counts, moderation, and photo ownership in the native database", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    for (const path of ["d1/production-staging-copy-2026-11-05.sql", "deploy/vps/customer-app-authority.sql", "deploy/vps/forum-media.sql"]) {
      sqlite.exec(readFileSync(path, "utf8"));
    }
    sqlite.exec(`
      INSERT INTO _customer_app_authority VALUES(1,'native-v1');
      INSERT INTO forum_categories(id,slug,name) VALUES('room','general','General'),('private-room','hidden','Hidden');
      UPDATE forum_categories SET is_public=0 WHERE id='private-room';
    `);
    const users = ["author", "reply", "admin", "guest", "member"];
    for (const id of users) {
      sqlite.prepare("INSERT INTO _auth_users(id) VALUES(?)").run(id);
      sqlite.prepare("INSERT INTO users_profile(id,email,primary_role) VALUES(?,?,?)")
        .run(id, id + "@example.test", id === "admin" ? "admin" : "property_manager");
      sqlite.prepare("INSERT INTO forum_profiles(user_id,handle,display_name) VALUES(?,?,?)").run(id,id,id);
    }
    const prepare = (sql: string, params: (string | number | null)[] = []): D1Statement => {
      const execute = <T>() => {
        const statement = sqlite.prepare(sql);
        const before = Number(sqlite.prepare("SELECT total_changes() AS n").get()?.n);
        const results = statement.all(...params) as T[];
        const changes = Number(sqlite.prepare("SELECT total_changes() AS n").get()?.n) - before;
        return { success: true, results, meta: { changes } };
      };
      return {
        bind: (...values) => prepare(sql, values),
        first: async <T>() => execute<T>().results[0] ?? null,
        all: async <T>() => execute<T>(),
        run: async () => execute(),
      };
    };
    const db: D1Binding = {
      prepare,
      async batch<T>(statements: D1Statement[]) {
        sqlite.exec("BEGIN");
        try {
          const results = [];
          for (const statement of statements) results.push(await statement.all<T>());
          sqlite.exec("COMMIT");
          return results;
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      },
    };
    const actor = (userId: string): ForumActor => ({ userId, handle: userId, post_count: 0,
      banned: 0, is_staff: 0, created_at: new Date().toISOString() });
    const form = { categoryId: "room", type: "question", title: "How should we maintain this roof?", slug: "roof",
      body: "We would like guidance on maintaining a commercial roof.", hold: false, staff: false,
      trusted: false, region: null, country: "CA", images: [], poll: { question: "Which option?", options: ["One", "Two"] } };
    await expect(storeVpsForumThread(actor("author"), { ...form, images: [{ path: "reply/stranger.jpg", w: 100, h: 100 }] }, db))
      .resolves.toBeNull();
    await expect(storeVpsForumThread(actor("author"), { ...form, categoryId: "private-room" }, db)).resolves.toBeNull();
    const stored = await storeVpsForumThread(actor("author"), form, db);
    expect(stored).not.toBeNull();
    const threadId = stored!.id;
    await expect(storeVpsForumThread(actor("author"), form, db)).resolves.toBeNull();
    const reply = { threadId, body: "Check all seals.", hold: false, trusted: false, staff: false, images: [] };
    await expect(storeVpsForumReply(actor("reply"), reply, db)).resolves.toBe(true);
    expect(sqlite.prepare("SELECT thread_count,post_count FROM forum_categories WHERE id='room'").get())
      .toMatchObject({thread_count: 1, post_count: 2});
    const postId = String(sqlite.prepare("SELECT id FROM forum_posts").get()?.id);
    await expect(rateVpsForumThread(actor("author"), threadId, 5, db)).resolves.toBe(false);
    await expect(rateVpsForumThread(actor("reply"), threadId, 4, db)).resolves.toBe(true);
    await expect(voteVpsForumPost(actor("author"), postId, db)).resolves.toBe(true);
    expect(sqlite.prepare("SELECT upvote_count FROM forum_posts").get()?.upvote_count).toBe(1);
    await expect(voteVpsForumPost(actor("author"), postId, db)).resolves.toBe(true);
    expect(sqlite.prepare("SELECT upvote_count FROM forum_posts").get()?.upvote_count).toBe(0);
    await expect(acceptVpsForumAnswer(actor("guest"), postId, threadId, db)).resolves.toBeNull();
    await expect(acceptVpsForumAnswer(actor("author"), postId, threadId, db)).resolves.not.toBeNull();
    expect(sqlite.prepare("SELECT is_accepted FROM forum_posts").get()?.is_accepted).toBe(1);
    const vote = sqlite.prepare("SELECT id,poll_id FROM forum_poll_options ORDER BY position LIMIT 1").get()!;
    await expect(voteVpsForumPoll(actor("reply"), String(vote.poll_id), String(vote.id), db)).resolves.toBe(true);
    await expect(voteVpsForumPoll(actor("reply"), String(vote.poll_id), String(vote.id), db)).resolves.toBe(false);
    await expect(moderateVpsForumTarget(actor("reply"), "thread", threadId, "hide", undefined, db))
      .resolves.toMatchObject({ error: "forbidden" });
    for (const id of ["author", "guest", "member"]) await reportVpsForumTarget(actor(id), "post", postId, "Problem", db);
    expect(sqlite.prepare("SELECT status FROM forum_posts").get()?.status).toBe("hidden");
    expect(sqlite.prepare("SELECT reply_count FROM forum_threads").get()?.reply_count).toBe(0);
    await expect(moderateVpsForumTarget(actor("admin"), "post", postId, "unhide", undefined, db))
      .resolves.toMatchObject({ target: { id: postId } });
    expect(sqlite.prepare("SELECT reply_count FROM forum_threads").get()?.reply_count).toBe(1);
  } finally {
    sqlite.close();
  }
});
