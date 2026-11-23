import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, desc, eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { QuestionType } from "~/db/schema";
import {
  quizAnswers,
  quizAttempts,
  quizOptions,
  quizQuestions,
  quizzes,
} from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

export function getQuizByLessonId(db: Db, lessonId: number) {
  return db.select().from(quizzes).where(eq(quizzes.lessonId, lessonId)).get();
}

export function getQuizWithQuestions(db: Db, quizId: number) {
  const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
  if (!quiz) return null;

  const questions = db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.position)
    .all();

  const questionsWithOptions = questions.map((question) => {
    const options = db
      .select()
      .from(quizOptions)
      .where(eq(quizOptions.questionId, question.id))
      .all();
    return { ...question, options };
  });

  return { ...quiz, questions: questionsWithOptions };
}

export function getBestAttempt(db: Db, userId: number, quizId: number) {
  return db
    .select()
    .from(quizAttempts)
    .where(
      and(eq(quizAttempts.userId, userId), eq(quizAttempts.quizId, quizId))
    )
    .orderBy(desc(quizAttempts.score))
    .limit(1)
    .get();
}

export function calculateGrade(score: number): string {
  if (score >= 0.9) return "A";
  if (score >= 0.8) return "B";
  if (score >= 0.7) return "C";
  if (score >= 0.6) return "D";
  return "F";
}

type QuestionResult = {
  questionId: number;
  correct: boolean;
  selectedOptionId: number | null;
  correctOptionId: number | null;
};

export type QuizSubmission = {
  userId: number;
  quizId: number;
  /** Question id → the option id the Student picked. */
  selectedAnswers: Record<number, number>;
};

type Question = typeof quizQuestions.$inferSelect;

function correctOptionIdFor(db: Db, question: Question) {
  if (
    question.questionType !== QuestionType.MultipleChoice &&
    question.questionType !== QuestionType.TrueFalse
  ) {
    return null;
  }
  const correctOption = db
    .select()
    .from(quizOptions)
    .where(
      and(
        eq(quizOptions.questionId, question.id),
        eq(quizOptions.isCorrect, true)
      )
    )
    .get();
  return correctOption ? correctOption.id : null;
}

function gradeQuestion(
  db: Db,
  question: Question,
  selected: number | undefined
): QuestionResult {
  if (!selected) {
    return {
      questionId: question.id,
      correct: false,
      selectedOptionId: null,
      correctOptionId: null,
    };
  }
  const correctOptionId = correctOptionIdFor(db, question);
  return {
    questionId: question.id,
    correct: selected === correctOptionId,
    selectedOptionId: selected,
    correctOptionId,
  };
}

function recordAttempt(
  db: Db,
  { userId, quizId }: QuizSubmission,
  {
    score,
    passed,
    questionResults,
  }: { score: number; passed: boolean; questionResults: QuestionResult[] }
) {
  return db.transaction((tx) => {
    const attempt = tx
      .insert(quizAttempts)
      .values({ userId, quizId, score, passed })
      .returning()
      .get();

    for (const result of questionResults) {
      if (result.selectedOptionId !== null) {
        tx.insert(quizAnswers)
          .values({
            attemptId: attempt.id,
            questionId: result.questionId,
            selectedOptionId: result.selectedOptionId,
          })
          .run();
      }
    }
    return attempt;
  });
}

export function submitQuizAttempt(db: Db, submission: QuizSubmission) {
  const { quizId, selectedAnswers } = submission;
  try {
    const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
    if (!quiz) {
      console.error("quiz not found");
      return null;
    }

    const questions = db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(quizQuestions.position)
      .all();

    const questionResults = questions.map((question) =>
      gradeQuestion(db, question, selectedAnswers[question.id])
    );
    const correct = questionResults.filter((result) => result.correct).length;
    const total = questions.length;
    const score = total > 0 ? correct / total : 0;
    const passed = score > 0.7;

    const attempt = recordAttempt(db, submission, {
      score,
      passed,
      questionResults,
    });

    return {
      attemptId: attempt.id,
      score,
      passed,
      grade: calculateGrade(score),
      totalCorrect: correct,
      totalQuestions: total,
      questionResults,
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}
