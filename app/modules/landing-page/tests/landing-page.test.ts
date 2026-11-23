import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus, UserRole } from "~/db/schema";
import { markdown } from "~/lib/text";
import { createLandingPage } from "../index.server";

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let landing: ReturnType<typeof createLandingPage>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  landing = createLandingPage(db);
});

// ─── Fixtures ───
// Courses, Lessons, Categories and Users are written outside this module, so
// rows go in directly. Kept here so a schema change touches only this block.

function addCourse(
  slug: string,
  options: {
    status?: CourseStatus;
    createdAt?: string;
    instructorId?: number;
  } = {}
) {
  return db
    .insert(schema.courses)
    .values({
      title: slug,
      slug,
      description: slug,
      salesCopy: markdown(slug),
      status: options.status ?? CourseStatus.Published,
      instructorId: options.instructorId ?? base.instructor.id,
      categoryId: base.category.id,
      createdAt: options.createdAt,
    })
    .returning()
    .get().id;
}

function addLessons(courseId: number, count: number) {
  const mod = db
    .insert(schema.modules)
    .values({ courseId, title: "Module", position: 1 })
    .returning()
    .get();
  for (let position = 1; position <= count; position++) {
    db.insert(schema.lessons)
      .values({ moduleId: mod.id, title: "Lesson", position })
      .run();
  }
}

function addInstructor(email: string) {
  return db
    .insert(schema.users)
    .values({ name: email, email, role: UserRole.Instructor })
    .returning()
    .get().id;
}

describe("catalogStats", () => {
  it("counts Published courses, their lessons, instructors and categories", () => {
    addLessons(base.course.id, 2);
    const other = addCourse("other", { instructorId: addInstructor("b@x.io") });
    addLessons(other, 3);
    db.insert(schema.categories)
      .values({ name: "Design", slug: "design" })
      .run();

    expect(landing.catalogStats()).toEqual({
      courses: 2,
      lessons: 5,
      instructors: 2,
      categories: 2,
    });
  });

  it("leaves out Draft and Archived courses and their lessons", () => {
    addLessons(base.course.id, 1);
    const draft = addCourse("draft", {
      status: CourseStatus.Draft,
      instructorId: addInstructor("d@x.io"),
    });
    addLessons(draft, 4);
    addLessons(addCourse("archived", { status: CourseStatus.Archived }), 2);

    expect(landing.catalogStats()).toMatchObject({
      courses: 1,
      lessons: 1,
      instructors: 1,
    });
  });

  it("counts an instructor with two courses once", () => {
    addCourse("second");

    expect(landing.catalogStats().instructors).toBe(1);
  });

  it("is all zeros for an empty catalogue", () => {
    const empty = createLandingPage(createTestDb());

    expect(empty.catalogStats()).toEqual({
      courses: 0,
      lessons: 0,
      instructors: 0,
      categories: 0,
    });
  });
});

describe("featuredCourses", () => {
  it("returns the newest Published courses first, up to the limit", () => {
    db.update(schema.courses)
      .set({ createdAt: "2026-01-01T00:00:00.000Z" })
      .run();
    addCourse("middle", { createdAt: "2026-02-01T00:00:00.000Z" });
    addCourse("newest", { createdAt: "2026-03-01T00:00:00.000Z" });
    addCourse("draft", {
      status: CourseStatus.Draft,
      createdAt: "2026-04-01T00:00:00.000Z",
    });

    expect(landing.featuredCourses(2).map((c) => c.slug)).toEqual([
      "newest",
      "middle",
    ]);
  });

  it("gives each course its own lesson count and instructor name", () => {
    addLessons(base.course.id, 3);
    const other = addCourse("other", { createdAt: "2020-01-01T00:00:00.000Z" });
    addLessons(other, 1);
    addCourse("empty", { createdAt: "2019-01-01T00:00:00.000Z" });

    const featured = landing.featuredCourses(3);

    expect(
      featured.map((c) => [c.slug, c.lessonCount, c.instructorName])
    ).toEqual([
      ["test-course", 3, "Test Instructor"],
      ["other", 1, "Test Instructor"],
      ["empty", 0, "Test Instructor"],
    ]);
  });

  it("is empty when nothing is Published", () => {
    db.update(schema.courses).set({ status: CourseStatus.Draft }).run();

    expect(landing.featuredCourses(3)).toEqual([]);
  });
});
