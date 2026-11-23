import { db } from "~/db";
import {
  getBestAttempt,
  getQuizByLessonId,
  getQuizWithQuestions,
  submitQuizAttempt,
  type Db,
  type QuizSubmission,
} from "./lib/lesson-quiz";

export type { QuizSubmission } from "./lib/lesson-quiz";

/**
 * A Lesson's quiz bound to a database. The app uses `lessonQuiz`, which reads
 * the app database; tests build their own against a test database.
 */
export function createLessonQuiz(database: Db) {
  return {
    /** The quiz attached to the Lesson, if it has one. */
    forLesson(lessonId: number) {
      return getQuizByLessonId(database, lessonId);
    },
    /** The quiz with its questions in order, each with its options. */
    withQuestions(quizId: number) {
      return getQuizWithQuestions(database, quizId);
    },
    /** The Student's highest-scoring attempt at the quiz. */
    bestAttempt(userId: number, quizId: number) {
      return getBestAttempt(database, userId, quizId);
    },
    /**
     * Grades the answers and records the attempt. Returns null when the quiz
     * does not exist or the write fails.
     */
    submit(submission: QuizSubmission) {
      return submitQuizAttempt(database, submission);
    },
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const lessonQuiz = /* @__PURE__ */ createLessonQuiz(db);
