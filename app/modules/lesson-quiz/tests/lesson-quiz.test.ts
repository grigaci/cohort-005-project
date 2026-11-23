import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { QuestionType } from "~/db/schema";
import { createLessonQuiz } from "../index.server";

let db: TestDb;
let studentId: number;
let lessonId: number;
let quiz: ReturnType<typeof createLessonQuiz>;

beforeEach(() => {
  db = createTestDb();
  const base = seedBaseData(db);
  studentId = base.user.id;
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
  quiz = createLessonQuiz(db);
});

// ─── Fixtures ───
// Quizzes are written by the instructor's quiz editor, which is not part of
// this module, so rows go in directly. Kept here so a schema change touches
// only this block.

function addQuiz() {
  return db
    .insert(schema.quizzes)
    .values({ lessonId, title: "Check yourself", passingScore: 0.7 })
    .returning()
    .get();
}

function addQuestion(
  quizId: number,
  position: number,
  questionType = QuestionType.MultipleChoice
) {
  const question = db
    .insert(schema.quizQuestions)
    .values({ quizId, questionText: `Q${position}`, questionType, position })
    .returning()
    .get();
  const [right, wrong] = [true, false].map((isCorrect) =>
    db
      .insert(schema.quizOptions)
      .values({
        questionId: question.id,
        optionText: isCorrect ? "right" : "wrong",
        isCorrect,
      })
      .returning()
      .get()
  );
  return { question, right, wrong };
}

function attempts() {
  return db.select().from(schema.quizAttempts).all();
}

function answers() {
  return db.select().from(schema.quizAnswers).all();
}

// ─── Reading ───

describe("forLesson", () => {
  it("returns undefined when the lesson has no quiz", () => {
    expect(quiz.forLesson(lessonId)).toBeUndefined();
  });

  it("returns the lesson's quiz", () => {
    const created = addQuiz();
    expect(quiz.forLesson(lessonId)?.id).toBe(created.id);
  });
});

describe("withQuestions", () => {
  it("returns null for an unknown quiz", () => {
    expect(quiz.withQuestions(999)).toBeNull();
  });

  it("orders questions by position and attaches each one's options", () => {
    const created = addQuiz();
    const second = addQuestion(created.id, 2);
    const first = addQuestion(created.id, 1);

    const result = quiz.withQuestions(created.id);

    expect(result?.questions.map((q) => q.id)).toEqual([
      first.question.id,
      second.question.id,
    ]);
    expect(result?.questions[0].options.map((o) => o.id).sort()).toEqual(
      [first.right.id, first.wrong.id].sort()
    );
  });
});

// ─── Submitting ───

describe("submit", () => {
  it("returns null for an unknown quiz and records nothing", () => {
    const result = quiz.submit({
      userId: studentId,
      quizId: 999,
      selectedAnswers: {},
    });
    expect(result).toBeNull();
    expect(attempts()).toHaveLength(0);
  });

  it("grades every answer right as a pass with an A", () => {
    const created = addQuiz();
    const q1 = addQuestion(created.id, 1);
    const q2 = addQuestion(created.id, 2, QuestionType.TrueFalse);

    const result = quiz.submit({
      userId: studentId,
      quizId: created.id,
      selectedAnswers: {
        [q1.question.id]: q1.right.id,
        [q2.question.id]: q2.right.id,
      },
    });

    expect(result).toMatchObject({
      score: 1,
      passed: true,
      grade: "A",
      totalCorrect: 2,
      totalQuestions: 2,
    });
    expect(result?.questionResults).toEqual([
      {
        questionId: q1.question.id,
        correct: true,
        selectedOptionId: q1.right.id,
        correctOptionId: q1.right.id,
      },
      {
        questionId: q2.question.id,
        correct: true,
        selectedOptionId: q2.right.id,
        correctOptionId: q2.right.id,
      },
    ]);
  });

  it("marks a wrong answer and an unanswered question as incorrect", () => {
    const created = addQuiz();
    const q1 = addQuestion(created.id, 1);
    const q2 = addQuestion(created.id, 2);

    const result = quiz.submit({
      userId: studentId,
      quizId: created.id,
      selectedAnswers: { [q1.question.id]: q1.wrong.id },
    });

    expect(result).toMatchObject({
      score: 0,
      passed: false,
      grade: "F",
      totalCorrect: 0,
    });
    expect(result?.questionResults[1]).toEqual({
      questionId: q2.question.id,
      correct: false,
      selectedOptionId: null,
      correctOptionId: null,
    });
  });

  it("records the attempt and only the answered questions", () => {
    const created = addQuiz();
    const q1 = addQuestion(created.id, 1);
    addQuestion(created.id, 2);

    const result = quiz.submit({
      userId: studentId,
      quizId: created.id,
      selectedAnswers: { [q1.question.id]: q1.right.id },
    });

    expect(attempts()).toEqual([
      expect.objectContaining({
        id: result?.attemptId,
        userId: studentId,
        quizId: created.id,
        score: 0.5,
        passed: false,
      }),
    ]);
    expect(answers()).toEqual([
      expect.objectContaining({
        attemptId: result?.attemptId,
        questionId: q1.question.id,
        selectedOptionId: q1.right.id,
      }),
    ]);
  });

  it("scores a quiz with no questions as 0, not NaN", () => {
    const created = addQuiz();

    const result = quiz.submit({
      userId: studentId,
      quizId: created.id,
      selectedAnswers: {},
    });

    expect(result).toMatchObject({ score: 0, passed: false, grade: "F" });
  });

  it("needs more than 70% to pass", () => {
    const created = addQuiz();
    const questions = Array.from({ length: 10 }, (_, i) =>
      addQuestion(created.id, i + 1)
    );
    const answerFirst = (count: number) =>
      Object.fromEntries(
        questions
          .slice(0, count)
          .map((q) => [q.question.id, q.right.id] as const)
      );

    const atSeventy = quiz.submit({
      userId: studentId,
      quizId: created.id,
      selectedAnswers: answerFirst(7),
    });
    const atEighty = quiz.submit({
      userId: studentId,
      quizId: created.id,
      selectedAnswers: answerFirst(8),
    });

    expect(atSeventy).toMatchObject({ passed: false, grade: "C" });
    expect(atEighty).toMatchObject({ passed: true, grade: "B" });
  });
});

describe("bestAttempt", () => {
  it("returns the Student's highest-scoring attempt", () => {
    const created = addQuiz();
    const q1 = addQuestion(created.id, 1);
    addQuestion(created.id, 2);
    const submit = (selectedAnswers: Record<number, number>) =>
      quiz.submit({ userId: studentId, quizId: created.id, selectedAnswers });

    submit({});
    const best = submit({ [q1.question.id]: q1.right.id });
    submit({ [q1.question.id]: q1.wrong.id });

    expect(quiz.bestAttempt(studentId, created.id)?.id).toBe(best?.attemptId);
  });

  it("returns undefined before the Student has tried", () => {
    const created = addQuiz();
    expect(quiz.bestAttempt(studentId, created.id)).toBeUndefined();
  });
});

describe("grades", () => {
  it.each([
    [0.9, "A"],
    [0.8, "B"],
    [0.7, "C"],
    [0.6, "D"],
    [0.59, "F"],
  ])("a score of %s is %s", (score, grade) => {
    const created = addQuiz();
    const questions = Array.from({ length: 100 }, (_, i) =>
      addQuestion(created.id, i + 1)
    );
    const correct = Math.round(score * 100);
    const selectedAnswers = Object.fromEntries(
      questions
        .slice(0, correct)
        .map((q) => [q.question.id, q.right.id] as const)
    );

    const result = quiz.submit({
      userId: studentId,
      quizId: created.id,
      selectedAnswers,
    });

    expect(result?.grade).toBe(grade);
  });
});
