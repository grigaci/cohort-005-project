import { describe, it, expect } from "vitest";
import {
  findRefundIneligibility,
  lastDayOfRefundWindow,
  REFUND_WATCH_LIMIT_SECONDS,
  type RefundFacts,
} from "./refund-eligibility";

const purchasedAt = new Date(2026, 0, 1, 23, 0).toISOString();

function facts(overrides: Partial<RefundFacts> = {}): RefundFacts {
  return {
    purchasedAt,
    hasOpenRefundRequest: false,
    hasClaimedTeamSeat: false,
    lessonCount: 10,
    completedLessonCount: 0,
    secondsWatched: 0,
    today: new Date(2026, 0, 2, 12, 0),
    ...overrides,
  };
}

describe("findRefundIneligibility", () => {
  it("allows a fresh purchase", () => {
    expect(findRefundIneligibility(facts())).toBeNull();
  });

  it("rejects a second open refund request with 409", () => {
    expect(
      findRefundIneligibility(facts({ hasOpenRefundRequest: true }))?.status
    ).toBe(409);
  });

  it("rejects a claimed team seat", () => {
    expect(
      findRefundIneligibility(facts({ hasClaimedTeamSeat: true }))?.status
    ).toBe(403);
  });

  describe("Refund Window", () => {
    it("allows the whole of the fourteenth day", () => {
      expect(
        findRefundIneligibility(facts({ today: new Date(2026, 0, 15, 23, 59) }))
      ).toBeNull();
    });

    it("closes on the fifteenth day", () => {
      expect(
        findRefundIneligibility(facts({ today: new Date(2026, 0, 16, 0, 1) }))
          ?.message
      ).toMatch(/window has closed/);
    });

    it("ends fourteen calendar days after purchase", () => {
      expect(lastDayOfRefundWindow(purchasedAt)).toBe("2026-01-15");
    });
  });

  it("rejects once half the lessons are completed", () => {
    expect(
      findRefundIneligibility(facts({ completedLessonCount: 5 }))?.message
    ).toMatch(/completed too much/);
  });

  it("allows just under half the lessons completed", () => {
    expect(
      findRefundIneligibility(facts({ completedLessonCount: 4 }))
    ).toBeNull();
  });

  it("ignores the completion limit for a course with no lessons", () => {
    expect(findRefundIneligibility(facts({ lessonCount: 0 }))).toBeNull();
  });

  it("rejects once the watch limit is reached", () => {
    expect(
      findRefundIneligibility(
        facts({ secondsWatched: REFUND_WATCH_LIMIT_SECONDS })
      )?.message
    ).toMatch(/watched too much/);
  });
});
