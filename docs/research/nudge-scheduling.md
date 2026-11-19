# How Cadence can run scheduled jobs for Nudges

Research for [#6](https://github.com/grigaci/cohort-005-project/issues/6), part of map [#4](https://github.com/grigaci/cohort-005-project/issues/4). Researched 2026-11-19. Feeds the build-vs-buy decision in [#9](https://github.com/grigaci/cohort-005-project/issues/9).

## Question

A Nudge fires when a Student has made no progress on a course for N days, so something has to run on a timer. Cadence is one React Router 8 Node process (`react-router-serve`) on one SQLite file through Drizzle (ADR 0006), with no job runner. What are the options, and how do they compare on correctness (no double sends across restarts) and on local dev?

## Short answer

- **The scheduler does not make sends correct. A ledger in the database does.** Every option below can fire twice or skip a tick, whether through a restart, an overlapping run, a dev reload or a retried webhook. Treat the timer as a trigger for an idempotent **sweep**: "find Enrollments stalled for at least N days that have not had a Nudge for this stall, claim them in a `UNIQUE`-keyed row, then send". After that, which trigger you pick barely matters for correctness.
- **Viable on the current stack, with no new service:**
  1. An **in-process timer** (`setInterval`, `croner` or `node-cron`) that runs the sweep. It costs nothing to set up, but it needs a guard against double starts in dev, and `react-router-serve` has no startup hook.
  2. A **CLI script** (`npm run nudges:run`, like `scripts/seed.ts`) run by OS cron or by hand. It is the simplest to reason about and test, and gives the clearest dev story.
- **Viable, but the setup tax lands on everyone who clones the repo:** an **external cron hitting an HTTP endpoint**, or **provider-side delayed workflows** (Inngest `step.sleep` + `cancelOn`, Resend `scheduledAt`). Whether either is worth it depends on #9.
- **Not worth it:** a **SQLite-backed job queue** library. It brings durable delayed jobs, but a Nudge fires on *absence* of activity, so you would have to enqueue and cancel a job on every progress event. The candidate libraries are small and their maintenance is unclear.

## Grounding: what the app has today

- `npm start` is `react-router-serve ./build/server/index.js`, and `npm run dev` is `react-router dev` (`package.json`). There is no custom server, no `app/entry.server.tsx`, and no job, cron or queue dependency.
- The DB connection opens lazily on first use, in WAL mode (`app/db/index.ts`). WAL lets a second process (such as a cron script) read while the server writes. There is still one writer at a time (ADR 0006).
- **There is no single "last progress at" column.** Activity signals in `app/db/schema.ts`:
  - `enrollments.enrolledAt` and `enrollments.completedAt`. A completed Enrollment never gets a Nudge.
  - `lesson_progress.completedAt`. `lesson_progress` has no `createdAt` or `updatedAt`, so an `in_progress` row carries no timestamp.
  - `video_watch_events.createdAt`, which is per user and lesson. You join it through `lessons → modules → courses` to get a course.

  A sweep would compute `max(enrolledAt, lesson completedAt, watch event createdAt)` for each Enrollment, or the PRD adds a denormalised `lastProgressAt` to `enrollments`. That is a data-model question for #4 ("Data model").

## The correctness core (applies to every option)

1. **Ledger with a natural key.** Add a table such as `nudge_sends(enrollment_id, stall_anchor, …)` with `UNIQUE(enrollment_id, stall_anchor)`. Here `stall_anchor` is the last-progress timestamp the Nudge responds to, so each stall gets at most one Nudge, and new progress opens a new anchor. Claim with `INSERT … ON CONFLICT DO NOTHING`. With better-sqlite3, `.run()` returns `info.changes`, "the total number of rows that were inserted, updated, or deleted" ([better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)). If `changes === 0`, someone else already claimed the row, so skip.
2. **Claim before send.** The claim is a synchronous better-sqlite3 transaction. Transaction functions "do not work with async functions", and `.immediate()` uses `BEGIN IMMEDIATE` (same source). So claim synchronously, then do the async email send outside the transaction and record the outcome.
3. **The crash window between "claimed" and "sent" cannot be fully closed with email.** Choose at-most-once (claimed rows are never retried) or at-least-once (retry `pending` rows older than X minutes). For at-least-once, a provider idempotency key narrows the window. Resend's key is kept "for 24 hours" and can be "up to 256 characters" ([Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)), so a key of `nudge-<enrollmentId>-<stallAnchor>` stops duplicate retries within a day.
4. **In-app Nudges are a single DB insert.** The same `UNIQUE` row makes them exactly-once for free.

With this in place, a missed tick only delays Nudges until the next sweep, and a double tick does nothing.

## Options

### 1. In-process scheduler (`setInterval` / croner / node-cron)

- **What the libraries guarantee:** neither persists anything. croner "Operates in-memory, with no need for a database or configuration files" and has "Zero dependencies"; its `protect` option will "block new triggers as long as an old trigger is in progress" ([croner](https://github.com/Hexagon/croner)). node-cron v4 "coordinates but does not persist state to a database" and recommends a queue or workflow engine for stronger guarantees. It offers `noOverlap`, which "skips the run instead of stacking executions", a `timezone` option, and a `distributed` mode backed by "env-var flags or a Redis coordinator" ([node-cron README](https://github.com/node-cron/node-cron), [nodecron.com](https://nodecron.com/)). node-cron's `execution:missed` event fires when a run was skipped because the event loop was blocked. The docs do not say missed runs are replayed ([event listening](https://nodecron.com/event-listening.html)). Neither library catches up on runs missed while the process was down. The sweep design does not need that.
- **Where to start it:** `react-router-serve` has no hook. "By design, we do not provide options to customize the React Router App Server". The docs point to migrating to `@react-router/express` instead ([serve docs](https://reactrouter.com/api/other-api/serve)). Two routes:
  - (a) **Keep `react-router-serve`.** Start the timer as a module side effect in a server-only module, guarded by a `globalThis` flag. This starts lazily, on first request. Note that `app/db/index.ts` deliberately avoids module side effects so Rollup can drop it from the client bundle, so the timer module must be `.server.ts`. In dev, Vite reloads modules, and the serve docs note that dev purges the require cache "on every request", so module-scope values reset while side effects persist. Without the `globalThis` guard you get stacked timers. The ledger makes those harmless, but they are noisy.
  - (b) **Migrate to `@react-router/express`.** The documented steps are: add `server/app.ts` with `createRequestHandler`, add a `server.js` that runs dev and prod, point `vite.config.ts` at the server entry, and set `dev` to `cross-env NODE_ENV=development node --conditions development server.js` ([adapter docs](https://reactrouter.com/api/other-api/adapter)). The timer then starts once, in `server.js`. This adds express, compression, morgan and cross-env, and changes `npm run dev`.
- **Correctness:** fine with the ledger. Single process (ADR 0006), so there is no multi-instance coordination to worry about.
- **Local dev:** works automatically while `npm run dev` runs. For testing, expose the sweep as a plain function and call it directly, or add a "Run Nudge sweep now" button to the DevUI panel. A clock override lets you simulate N days passing.
- **Setup burden for cloners:** none.

### 2. CLI script run by OS cron (or by hand)

- A `scripts/send-nudges.ts` run with `tsx`, mirroring `scripts/seed.ts`, plus `npm run nudges:run`. Production runs it from crontab or a systemd timer on the same machine, against the same `data.db`. WAL mode allows this. Set a busy timeout so the script waits out the server's writes.
- **Correctness:** same ledger. Each run is a fresh process, so no state lingers across restarts. Use a lockfile or the ledger to stop overlapping runs if one runs long.
- **Local dev:** the best of all the options. You run it when you want, it is deterministic, and it is easy to drive from tests.
- **Cost:** someone must install the crontab in production, and the email-sending code must import cleanly outside the React Router build (no `virtual:` modules).

### 3. External cron hitting an HTTP endpoint

- A resource route such as `POST /api/nudges/run`, protected by a shared secret, called by a host scheduler or GitHub Actions.
- If you use GitHub Actions `schedule`: "The shortest interval … is once every 5 minutes". Runs "can be delayed during periods of high loads", "some queued jobs may be dropped", and "In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days" ([GitHub docs](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)). Nudges are measured in days, so delays are fine. The 60-day auto-disable is a real trap for a quiet repo.
- **Correctness:** same ledger. The endpoint must be idempotent anyway, because callers retry.
- **Local dev:** `curl` the endpoint, or the DevUI button. The production server must be publicly reachable, and you have one more secret to manage.

### 4. SQLite-backed job queue library

- Candidates include liteque ("A simple typesafe sqlite-based job queue for Node.js", with retries and a polling `Runner`, `pollIntervalMs: 1000`; its README does not mention delayed or cron jobs) ([liteque](https://github.com/karakeep-app/liteque)) and plainjob, whose listing advertises cron and delayed jobs on better-sqlite3 (README claim, repo last pushed March 2025).
- **Fit:** poor. A Nudge fires when something does *not* happen, so with a queue you enqueue a delayed job on every progress event and cancel or reschedule it on the next one. A sweep query is simpler and makes the database the source of truth. You still need a worker loop in the process (see option 1). It adds a dependency of uncertain maintenance, and possibly a second migration system, since liteque ships its own Drizzle migrations.

### 5. Provider-side delayed workflows (buy)

- **Inngest:** a function on "progress recorded" calls `step.sleep("7d")` and sends the Nudge, with `cancelOn` on the next progress event. `cancelOn` can "Stop a scheduled or sleeping run". It takes up to five cancellation events, and "cannot interrupt a `step.run` that has already begun sending" ([cancelOn docs](https://www.inngest.com/docs/features/inngest-functions/cancellation/cancel-on-events)). The `step.sleep` reference does not state a maximum duration ([step.sleep](https://www.inngest.com/docs/reference/functions/step-sleep)). Locally, the Dev Server is "an open-source local version of the Inngest Platform", run with `inngest dev -u http://localhost:3000/api/inngest`. It accepts a dummy `INNGEST_EVENT_KEY`, and the docs mention no account ([dev server](https://www.inngest.com/docs/dev-server)). Production needs an Inngest account and keys, and a public endpoint Inngest can call. Cloners must run a second process.
- **Resend scheduled email:** "Emails can be scheduled up to 30 days in advance", and you can update `scheduledAt` or cancel, but "Once an email is canceled, it cannot be rescheduled" ([Resend scheduling](https://resend.com/docs/dashboard/emails/schedule-email)). This would mean an API call to cancel and recreate on every progress event, plus storing the email id. It covers email only, not the in-app Nudge, and it needs an API key even in dev.
- **Correctness:** the provider holds the timer state, which survives restarts. You still need a local record of what was sent to show in-app Nudges and enforce rate limits, so the ledger does not go away.
- Notification platforms (Knock, Novu and similar) offer delay steps too. Weigh them as part of #9 rather than as a scheduling mechanism.

## Comparison

| Option | New deps / services | Double-send safety | Survives restart | Local dev | Clone setup |
| --- | --- | --- | --- | --- | --- |
| 1a In-process timer, keep `react-router-serve` | none (or croner) | ledger | next tick resweeps | automatic, plus DevUI button | none |
| 1b In-process timer, Express adapter | express et al. | ledger | next tick resweeps | automatic | none, but dev script changes |
| 2 CLI script + OS cron | none | ledger, plus lock | each run is fresh | `npm run nudges:run` | none locally; crontab in prod |
| 3 External cron → endpoint | secret, public URL | ledger | caller retries | curl / DevUI | secret |
| 4 SQLite queue lib | liteque/plainjob | lib + ledger | yes | worker in process | none |
| 5 Inngest / Resend scheduling | account, keys, dev server | provider + ledger | yes (provider-side) | extra process / key | account + keys |

## Recommendation for the PRD

Specify the **sweep plus ledger** as the contract, whatever wins #9. For the trigger, the cheapest viable choices are **1a**, an in-process `setInterval` or croner with `protect`, guarded on `globalThis`, or **2**, a CLI script. Either way, expose the same `runNudgeSweep(now)` function to tests and to a DevUI button. Revisit option 5 only if #9 picks a provider for other reasons. Then its delayed workflows replace the timer, but not the local ledger.

## Open questions passed on

- Add `enrollments.lastProgressAt` (written by progress actions), or derive it in the sweep query? (#4 "Data model")
- At-most-once or at-least-once for the email leg?
- The time zone and hour for sends (node-cron and croner both take a `timezone`), and how this interacts with "Batching and rate limits".
