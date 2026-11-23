import { db } from "~/db";
import {
  getCatalogStats,
  getFeaturedCourses,
  type Db,
} from "./lib/landing-page";

/**
 * What the landing page shows about the catalogue, bound to a database. The
 * app uses `landingPage`, which reads the app database; tests build their own
 * against a test database. Only Published courses count.
 */
export function createLandingPage(database: Db) {
  return {
    /** Totals for the hero: courses, lessons, instructors, categories. */
    catalogStats() {
      return getCatalogStats(database);
    },
    /** The newest Published courses, each with its lesson count. */
    featuredCourses(limit: number) {
      return getFeaturedCourses(database, limit);
    },
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const landingPage = /* @__PURE__ */ createLandingPage(db);
