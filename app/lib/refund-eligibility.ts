export const REFUND_WINDOW_DAYS = 14;
export const REFUND_WATCH_LIMIT_SECONDS = 2 * 60 * 60;
export const REFUND_COMPLETION_LIMIT = 0.5;

export type RefundFacts = {
  purchasedAt: string;
  hasOpenRefundRequest: boolean;
  hasClaimedTeamSeat: boolean;
  lessonCount: number;
  completedLessonCount: number;
  secondsWatched: number;
  today: Date;
};

export type RefundIneligibility = {
  status: 403 | 409;
  message: string;
};

// Compare whole days, not hours — a purchase at 23:00 should still get its
// full fourteenth day.
export function calendarDay(when: Date): string {
  const year = when.getFullYear();
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function lastDayOfRefundWindow(purchasedAt: string): string {
  const deadline = new Date(purchasedAt);
  deadline.setDate(deadline.getDate() + REFUND_WINDOW_DAYS);
  return calendarDay(deadline);
}

/**
 * Why a learner may not open a Refund Request on this purchase, or null if
 * they may.
 */
export function findRefundIneligibility(
  facts: RefundFacts
): RefundIneligibility | null {
  if (facts.hasOpenRefundRequest) {
    return {
      status: 409,
      message: "You already have a refund request open on this purchase.",
    };
  }

  // A seat that came out of a team licence, and has been claimed, belongs to
  // the team — the learner cannot hand it back on their own.
  if (facts.hasClaimedTeamSeat) {
    return {
      status: 403,
      message: "A claimed team seat cannot be refunded.",
    };
  }

  const today = calendarDay(facts.today);
  const purchasedDay = calendarDay(new Date(facts.purchasedAt));
  if (
    today < purchasedDay ||
    today > lastDayOfRefundWindow(facts.purchasedAt)
  ) {
    return {
      status: 403,
      message: `The ${REFUND_WINDOW_DAYS}-day refund window has closed.`,
    };
  }

  if (
    facts.lessonCount > 0 &&
    facts.completedLessonCount / facts.lessonCount >= REFUND_COMPLETION_LIMIT
  ) {
    return {
      status: 403,
      message: "You have completed too much of this course to get a refund.",
    };
  }

  if (facts.secondsWatched >= REFUND_WATCH_LIMIT_SECONDS) {
    return {
      status: 403,
      message: "You have watched too much of this course to get a refund.",
    };
  }

  return null;
}
