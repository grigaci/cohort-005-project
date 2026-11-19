import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  coupons,
  lessonProgress,
  lessons,
  modules,
  purchases,
  refundRequests,
  videoWatchEvents,
  LessonProgressStatus,
  RefundRequestStatus,
} from "~/db/schema";
import {
  findRefundIneligibility,
  lastDayOfRefundWindow,
  type RefundIneligibility,
} from "~/lib/refund-eligibility";

type Purchase = typeof purchases.$inferSelect;

export type RefundEligibility =
  | {
      eligible: true;
      purchase: Purchase;
      amount: number;
      lastDayInWindow: string;
    }
  | ({ eligible: false } & RefundIneligibility);

function getLatestPurchase(userId: number, courseId: number) {
  return db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
    .orderBy(sql`${purchases.createdAt} desc`)
    .get();
}

function getOpenRefundRequest(purchaseId: number) {
  return db
    .select({ id: refundRequests.id })
    .from(refundRequests)
    .where(
      and(
        eq(refundRequests.purchaseId, purchaseId),
        eq(refundRequests.status, RefundRequestStatus.Open)
      )
    )
    .get();
}

function hasClaimedTeamSeat(purchaseId: number) {
  const claimedSeat = db
    .select({ id: coupons.id })
    .from(coupons)
    .where(
      and(eq(coupons.purchaseId, purchaseId), isNotNull(coupons.redeemedAt))
    )
    .get();

  return claimedSeat !== undefined;
}

function getLessonIdsForCourse(courseId: number): number[] {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

function getCompletedLessonCount(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();

  return result?.count ?? 0;
}

function getSecondsWatched(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  const furthestPerLesson = db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all();

  return furthestPerLesson.reduce((total, row) => total + row.furthest, 0);
}

/**
 * Whether the learner may open a Refund Request on their latest purchase of
 * this course, and for how much. The course page and the refund action both
 * ask this, so the two can never disagree.
 */
export function checkRefundEligibility(
  userId: number,
  courseId: number,
  today: Date = new Date()
): RefundEligibility {
  const purchase = getLatestPurchase(userId, courseId);

  if (!purchase) {
    return {
      eligible: false,
      status: 403,
      message: "You have not bought this course.",
    };
  }

  const lessonIds = getLessonIdsForCourse(courseId);

  const ineligibility = findRefundIneligibility({
    purchasedAt: purchase.createdAt,
    hasOpenRefundRequest: getOpenRefundRequest(purchase.id) !== undefined,
    hasClaimedTeamSeat: hasClaimedTeamSeat(purchase.id),
    lessonCount: lessonIds.length,
    completedLessonCount: getCompletedLessonCount(userId, lessonIds),
    secondsWatched: getSecondsWatched(userId, lessonIds),
    today,
  });

  if (ineligibility) {
    return { eligible: false, ...ineligibility };
  }

  // A Refund gives back what the learner actually paid — after any
  // purchasing-power discount or coupon — never the list price.
  return {
    eligible: true,
    purchase,
    amount: purchase.amountPaid,
    lastDayInWindow: lastDayOfRefundWindow(purchase.createdAt),
  };
}
