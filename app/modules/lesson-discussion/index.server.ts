import { db } from "~/db";
import {
  getLessonThread,
  isCommentOnLesson,
  renderThread,
  type Db,
} from "./lib/lesson-discussion";

/**
 * A Lesson's Questions & Discussion, bound to a database. The app uses
 * `lessonDiscussion`, which reads the app database; tests build their own
 * against a test database.
 */
export function createLessonDiscussion(database: Db) {
  return {
    /**
     * The Lesson's comments, oldest first, with replies nested under their
     * question and every body rendered to sanitised HTML. A deleted question
     * keeps its place only while it still has replies.
     */
    thread(lessonId: number) {
      return renderThread(getLessonThread(database, lessonId));
    },
    /**
     * Whether the comment belongs to the Lesson, so an id posted to one
     * Lesson's route can't reach a comment on another.
     */
    hasComment(lessonId: number, commentId: number) {
      return isCommentOnLesson(database, commentId, lessonId);
    },
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const lessonDiscussion = /* @__PURE__ */ createLessonDiscussion(db);
