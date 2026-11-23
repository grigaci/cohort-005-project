import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { countDistinct, desc, eq, inArray, sql } from "drizzle-orm";
import * as schema from "~/db/schema";
import { courses, CourseStatus, lessons, modules, users } from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

const published = eq(courses.status, CourseStatus.Published);

export function getCatalogStats(db: Db) {
  const catalog = db
    .select({
      courses: countDistinct(courses.id),
      instructors: countDistinct(courses.instructorId),
      categories: countDistinct(courses.categoryId),
    })
    .from(courses)
    .where(published)
    .get();

  const lessonCount = db
    .select({ count: sql<number>`count(*)` })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(published)
    .get();

  return {
    courses: catalog?.courses ?? 0,
    lessons: lessonCount?.count ?? 0,
    instructors: catalog?.instructors ?? 0,
    categories: catalog?.categories ?? 0,
  };
}

export function getFeaturedCourses(db: Db, limit: number) {
  const newest = db
    .select({
      id: courses.id,
      title: courses.title,
      slug: courses.slug,
      description: courses.description,
      coverImageUrl: courses.coverImageUrl,
      instructorName: users.name,
    })
    .from(courses)
    .innerJoin(users, eq(courses.instructorId, users.id))
    .where(published)
    .orderBy(desc(courses.createdAt), desc(courses.id))
    .limit(limit)
    .all();

  const counts = db
    .select({
      courseId: modules.courseId,
      count: sql<number>`count(*)`,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(
      inArray(
        modules.courseId,
        newest.map((course) => course.id)
      )
    )
    .groupBy(modules.courseId)
    .all();
  const lessonCountByCourse = new Map(
    counts.map((row) => [row.courseId, row.count])
  );

  return newest.map((course) => ({
    ...course,
    lessonCount: lessonCountByCourse.get(course.id) ?? 0,
  }));
}
