import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { LessonProgressStatus } from "~/db/schema";
import { markdown } from "~/lib/text";
import { createLessonProgress } from "../index.server";

const NOW = new Date("2026-11-23T12:00:00.000Z");

let db: TestDb;
let studentId: number;
let courseId: number;
let lessonId: number;
let progress: ReturnType<typeof createLessonProgress>;

beforeEach(() => {
  db = createTestDb();
  const base = seedBaseData(db);
  studentId = base.user.id;
  courseId = base.course.id;
  lessonId = addLesson(courseId);
  progress = createLessonProgress(db);
});

// ─── Fixtures ───
// Courses, Lessons and watch events are written outside this module, so rows
// go in directly. Kept here so a schema change touches only this block.

function addLesson(inCourseId: number) {
  const mod = db
    .insert(schema.modules)
    .values({ courseId: inCourseId, title: "Module", position: 1 })
    .returning()
    .get();
  return db
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: "Lesson", position: 1 })
    .returning()
    .get().id;
}

function addOtherCourse() {
  const base = db.select().from(schema.courses).get();
  return db
    .insert(schema.courses)
    .values({
      title: "Other",
      slug: "other",
      description: "Other",
      salesCopy: markdown("Other"),
      status: schema.CourseStatus.Published,
      instructorId: base?.instructorId ?? 0,
      categoryId: base?.categoryId ?? 0,
    })
    .returning()
    .get().id;
}

function watched(positionSeconds: number, createdAt: string) {
  db.insert(schema.videoWatchEvents)
    .values({
      userId: studentId,
      lessonId,
      eventType: "progress",
      positionSeconds,
      createdAt,
    })
    .run();
}

// ─── Status ───

describe("markInProgress", () => {
  it("starts a Lesson the Student has not opened", () => {
    progress.markInProgress(studentId, lessonId);
    expect(progress.get(studentId, lessonId)?.status).toBe(
      LessonProgressStatus.InProgress
    );
  });

  it("leaves a completed Lesson completed", () => {
    progress.markComplete(studentId, lessonId, NOW);
    progress.markInProgress(studentId, lessonId);
    expect(progress.get(studentId, lessonId)?.status).toBe(
      LessonProgressStatus.Completed
    );
  });

  it("keeps one row per Student and Lesson", () => {
    progress.markInProgress(studentId, lessonId);
    progress.markInProgress(studentId, lessonId);
    expect(progress.forCourse(studentId, courseId)).toHaveLength(1);
  });
});

describe("markComplete", () => {
  it("completes an unopened Lesson at the given time", () => {
    progress.markComplete(studentId, lessonId, NOW);
    expect(progress.get(studentId, lessonId)).toMatchObject({
      status: LessonProgressStatus.Completed,
      completedAt: NOW.toISOString(),
    });
  });

  it("completes a started Lesson in place", () => {
    progress.markInProgress(studentId, lessonId);
    progress.markComplete(studentId, lessonId, NOW);
    expect(progress.forCourse(studentId, courseId)).toEqual([
      expect.objectContaining({
        status: LessonProgressStatus.Completed,
        completedAt: NOW.toISOString(),
      }),
    ]);
  });
});

describe("forCourse", () => {
  it("returns only the course's Lessons", () => {
    const otherLesson = addLesson(addOtherCourse());
    progress.markInProgress(studentId, lessonId);
    progress.markInProgress(studentId, otherLesson);

    expect(
      progress.forCourse(studentId, courseId).map((row) => row.lessonId)
    ).toEqual([lessonId]);
  });

  it("returns nothing for a course with no modules", () => {
    expect(progress.forCourse(studentId, addOtherCourse())).toEqual([]);
  });
});

// ─── Video ───

describe("lastWatchPosition", () => {
  it("is 0 before the Student has watched", () => {
    expect(progress.lastWatchPosition(studentId, lessonId)).toBe(0);
  });

  it("is the position of the latest event, not the furthest", () => {
    watched(300, "2026-11-23T10:00:00.000Z");
    watched(120, "2026-11-23T11:00:00.000Z");
    expect(progress.lastWatchPosition(studentId, lessonId)).toBe(120);
  });
});

describe("watchProgress", () => {
  it("is the furthest position as a percentage of the video", () => {
    watched(300, "2026-11-23T10:00:00.000Z");
    watched(120, "2026-11-23T11:00:00.000Z");
    expect(progress.watchProgress(studentId, lessonId, 600)).toBe(50);
  });

  it("caps at 100", () => {
    watched(900, "2026-11-23T10:00:00.000Z");
    expect(progress.watchProgress(studentId, lessonId, 600)).toBe(100);
  });

  it("is 0 for a video with no duration", () => {
    watched(300, "2026-11-23T10:00:00.000Z");
    expect(progress.watchProgress(studentId, lessonId, 0)).toBe(0);
  });
});
