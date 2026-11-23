import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { markdown } from "~/lib/text";
import { createLessonDiscussion } from "../index.server";

let db: TestDb;
let studentId: number;
let instructorId: number;
let lessonId: number;
let discussion: ReturnType<typeof createLessonDiscussion>;

beforeEach(() => {
  db = createTestDb();
  const base = seedBaseData(db);
  studentId = base.user.id;
  instructorId = base.instructor.id;
  const mod = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Module", position: 1 })
    .returning()
    .get();
  lessonId = db
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: "Lesson", position: 1 })
    .returning()
    .get().id;
  discussion = createLessonDiscussion(db);
});

// ─── Fixtures ───
// Comments are written by ~/lib/comments.server, which also notifies people,
// so rows go in directly. Kept here so a schema change touches only this block.

let minute = 0;

function addComment(
  body: string,
  {
    userId = studentId,
    parentId = null,
    deleted = false,
  }: { userId?: number; parentId?: number | null; deleted?: boolean } = {}
) {
  minute += 1;
  const at = `2026-11-23T10:${String(minute).padStart(2, "0")}:00.000Z`;
  return db
    .insert(schema.comments)
    .values({
      lessonId,
      userId,
      parentId,
      body: markdown(body),
      createdAt: at,
      deletedAt: deleted ? at : null,
    })
    .returning()
    .get().id;
}

function addAdmin() {
  return db
    .insert(schema.users)
    .values({
      name: "Ada Admin",
      email: "ada@example.com",
      role: UserRole.Admin,
    })
    .returning()
    .get().id;
}

// ─── Thread ───

describe("thread", () => {
  it("is empty for a Lesson nobody has commented on", async () => {
    expect(await discussion.thread(lessonId)).toEqual([]);
  });

  it("is empty for a Lesson that does not exist", async () => {
    expect(await discussion.thread(9999)).toEqual([]);
  });

  it("nests replies under their question, oldest first", async () => {
    const first = addComment("First question");
    const second = addComment("Second question");
    const reply = addComment("An answer", { parentId: first });

    const thread = await discussion.thread(lessonId);

    expect(thread.map((c) => c.id)).toEqual([first, second]);
    expect(thread[0].replies.map((c) => c.id)).toEqual([reply]);
  });

  it("renders bodies to HTML and keeps the Markdown for editing", async () => {
    addComment("**bold**");

    const [comment] = await discussion.thread(lessonId);

    expect(comment.body).toBe("**bold**");
    expect(comment.bodyHtml).toContain("<strong>bold</strong>");
  });

  it("does not render raw HTML from a comment", async () => {
    addComment("<script>alert(1)</script>");

    const [comment] = await discussion.thread(lessonId);

    expect(comment.bodyHtml).not.toContain("<script>");
  });

  it("marks the course's Instructor and Platform Admins", async () => {
    addComment("From the instructor", { userId: instructorId });
    addComment("From an admin", { userId: addAdmin() });
    addComment("From a student");

    const authors = (await discussion.thread(lessonId)).map((c) => c.author);

    expect(authors.map((a) => [a.isInstructor, a.isPlatformAdmin])).toEqual([
      [true, false],
      [false, true],
      [false, false],
    ]);
  });

  it("drops a deleted question with no replies", async () => {
    addComment("Gone", { deleted: true });
    expect(await discussion.thread(lessonId)).toEqual([]);
  });

  it("keeps a deleted question with replies, blanked", async () => {
    const question = addComment("Gone", { deleted: true });
    addComment("Still here", { parentId: question });

    const [comment] = await discussion.thread(lessonId);

    expect(comment).toMatchObject({
      id: question,
      deleted: true,
      body: "",
      bodyHtml: "",
      editedAt: null,
    });
    expect(comment.replies).toHaveLength(1);
  });

  it("leaves out deleted replies", async () => {
    const question = addComment("Question");
    addComment("Gone", { parentId: question, deleted: true });

    const [comment] = await discussion.thread(lessonId);

    expect(comment.replies).toEqual([]);
  });
});

// ─── Has comment ───

describe("hasComment", () => {
  it("is true for a comment on the Lesson", () => {
    const comment = addComment("Question");
    expect(discussion.hasComment(lessonId, comment)).toBe(true);
  });

  it("is false for a comment on another Lesson", () => {
    const comment = addComment("Question");
    expect(discussion.hasComment(lessonId + 1, comment)).toBe(false);
  });

  it("is false for a comment that does not exist", () => {
    expect(discussion.hasComment(lessonId, 999)).toBe(false);
  });
});
