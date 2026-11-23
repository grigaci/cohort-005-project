import { db } from "~/db";
import {
  calculateWatchProgress,
  getLastWatchPosition,
  getLessonProgress,
  getLessonProgressForCourse,
  markLessonComplete,
  markLessonInProgress,
  type Db,
} from "./lib/lesson-progress";

/**
 * A Student's progress through a course's Lessons, bound to a database. The
 * app uses `lessonProgress`, which reads the app database; tests build their
 * own against a test database.
 */
export function createLessonProgress(database: Db) {
  return {
    /** The Student's progress row for the Lesson, if they have opened it. */
    get(userId: number, lessonId: number) {
      return getLessonProgress(database, userId, lessonId);
    },
    /** Every progress row the Student has in the course. */
    forCourse(userId: number, courseId: number) {
      return getLessonProgressForCourse(database, userId, courseId);
    },
    /** Opening a Lesson starts it; a completed Lesson stays completed. */
    markInProgress(userId: number, lessonId: number) {
      return markLessonInProgress(database, userId, lessonId);
    },
    markComplete(userId: number, lessonId: number, now: Date) {
      return markLessonComplete(database, { userId, lessonId, now });
    },
    /** Where the video was when the Student last watched it, in seconds. */
    lastWatchPosition(userId: number, lessonId: number) {
      return getLastWatchPosition(database, userId, lessonId);
    },
    /** How far into the video the Student has got, 0–100. */
    watchProgress(userId: number, lessonId: number, durationSeconds: number) {
      return calculateWatchProgress(database, {
        userId,
        lessonId,
        videoDurationSeconds: durationSeconds,
      });
    },
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const lessonProgress = /* @__PURE__ */ createLessonProgress(db);
