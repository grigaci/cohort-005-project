# Notification providers vs. building in-house

Research for [#5](https://github.com/grigaci/cohort-005-project/issues/5) (map [#4](https://github.com/grigaci/cohort-005-project/issues/4)). Sources checked on 2026-11-19 against vendor pricing pages, vendor docs and the npm registry. This is input to the build-vs-buy decision ([#9](https://github.com/grigaci/cohort-005-project/issues/9)), not the decision itself.

Cadence context: React Router 8, Node, one SQLite file via Drizzle (`better-sqlite3`), no email sending, no job runner. Users switch identity via DevUI. Anyone cloning the repo today runs it with no API keys.

## Summary

| | Knock | Novu Cloud | Novu self-hosted | MagicBell | Courier | SuprSend | In-house |
|---|---|---|---|---|---|---|---|
| Free tier | 10k messages/mo [1] | 10k workflow runs/mo, 5 workflows [5] | Free MIT core; you run the infra [8] | 1k deliveries/mo [11] | 10k sends/mo [14] | 10k notifications/mo [18] | $0 + ESP costs |
| First paid step | $250/mo, 50k msgs [1] | Pro from $30/mo, 30k runs [5] | Enterprise on-prem: contact sales [5] | $249/mo, 50k [11] | $0.005/send pay-as-you-go, from send #1 [14] | $100/mo, 50k [18] | — |
| React bell/inbox | Yes, `@knocklabs/react` [2] | Yes, `@novu/react` `<Inbox />` [6] | Same as cloud (some Inbox features cloud-only) [8] | Yes, `@magicbell/react` [12] | Yes, `@trycourier/courier-react` [15] | Yes, `@suprsend/react` [19] | Build it (shadcn popover + loader) |
| Prebuilt preferences UI | Hosted page; no React component found [4] | Yes, inside `<Inbox />` [6] | Yes | `UserPreferences` component [12] | `CourierPreferences` + hosted page [15][16] | Yes, but **not on Free** [18] | Build it |
| Email | Bring your own ESP; "Knock (testing only)" provider [3] | BYO ESP; demo provider for tests [7] | BYO ESP | Via SES/Mailgun/SendGrid/SMTP/Ping Email [13] | BYO ESP [17] | BYO ESP [20] | BYO ESP / SMTP |
| Per-type / per-channel prefs | Workflows, categories, channel types [4] | Per workflow + channel [6] | Same | Per category x channel [12] | Topics + per-channel routing [16] | Category + channel; **channel/category prefs not on Free** [18][21] | Build it |
| Unsubscribe | 1-click commercial unsubscribe, hosted page [4] | DIY link + preference API [7] | DIY | Not documented | Unsubscribe links in templates, hosted page [16] | `$hosted_preference_url`, auto 1-click header for commercial [20] | Build it |
| Delays / cancel (for Nudges) | Delay (fixed, dynamic, time window), cancel by `cancellation_key`, max 365 days [9][10] | Delay **capped at 1 day on Free**, 7 on Pro, 30 on Team; cancel by `transactionId` [22][23] | Same engine | `wait` (seconds), `pause`, `abort` [24] | Journeys delay up to 93 days, cancel by run id or token [25] | Delay + Wait Until; no cancel in Node docs [19][26] | Needs a scheduler (none exists today) |
| Node server SDK | `@knocklabs/node` 1.41.1 (Apache-2.0) | `@novu/api` 3.20.0 [23] | same | `magicbell-js` 1.8.0 | `@trycourier/courier` 10.0.1 (Apache-2.0) [25] | `@suprsend/node-sdk` 1.15.1 (MIT) [26] | n/a |
| Real-time | Yes, socket-based real-time feed [2] | Yes, real-time unread count [6] | Yes, WS service [8] | Not documented on component page [12] | Yes, `listenForUpdates()` [15] | Yes, `feed.new_notification` event [19] | Loader revalidation or polling; SSE if wanted |
| Clone-without-keys story | None: needs Knock account + keys | `npx novu dev` still tunnels to Novu Cloud [27] | Docker: API, Worker, WS, Dashboard, 2x Redis, MongoDB, object storage [8] | Needs account | Needs account | Needs account | Works out of the box |

npm versions/licences: `npm view` against registry.npmjs.org on 2026-11-19.

## Per-provider notes

### Knock
- Free: 10,000 messages/mo, no hard cap ("will contact you about billing"); in-app feeds, pre-built components, preferences and batching all included on Free; Knock branding stays; 30-day logs [1].
- Feed: `KnockProvider`, `KnockFeedProvider`, `NotificationIconButton` (bell with badge), `NotificationFeedPopover`, `NotificationFeed` [2]. Real-time over sockets [2].
- Email is not sent by Knock; connect Resend, Postmark, SES, SendGrid, SMTP, etc. A "Knock (testing only)" provider and sandbox mode exist [3].
- Preferences: `workflows`, `categories`, `channel_types`, `channels` keys; environment and tenant defaults; hosted preference center at a signed URL; 1-click unsubscribe sets `commercial_subscribed=false` [4]. No React preference-centre component documented; build it on the preferences API [4].
- Nudge fit: delay step supports fixed, dynamic (from data, e.g. "3 days after last lesson") and recipient-timezone windows; cancel the run when the Student comes back via `POST /v1/workflows/{key}/cancel` with a `cancellation_key` [9][10]. Cancellation is enqueued, not immediate; do not cancel within 5 s of trigger [10].
- Jump to paid is steep: $250/mo [1].

### Novu (cloud)
- Free: 10,000 workflow runs/mo, **5 workflows**, 24 h activity-feed retention, 3 team members [5]. Pro from $30/mo (30k runs, 20 workflows, $1.20/1k overage) [5].
- `<Inbox />` from `@novu/react` ships bell, list and preferences modal; real-time unread count [6].
- **Delay limit: 1 day on Free, 7 days on Pro, 30 on Team** [22]. A "no activity for 3–7 days" Nudge cannot be a single delay step on Free; Cadence would have to schedule the trigger itself (which needs our own scheduler anyway).
- Email: BYO ESP (19 providers incl. Resend, Postmark, SES, SMTP); demo provider for testing [7]. No unsubscribe link by default; you build the link and call the preference API [7].
- Cancel by `transactionId` (`DELETE /v1/events/trigger/{transactionId}`) [23].

### Novu (self-hosted)
- Core MIT, `enterprise/` folder under a commercial licence [8].
- Requires API, Worker, WS and Dashboard services, two Redis clusters (one with AOF), MongoDB, and S3-compatible storage; single-VM minimum 4 vCPU / 8 GB [8]. Some cloud features unavailable; no social login [8].
- This is far heavier than Cadence's one SQLite file and is not a reasonable "clone and run" dependency.

### MagicBell
- Free "Builder": 1,000 deliveries/mo; next tier $249/mo for 50k [11].
- `@magicbell/react`: `Inbox`, `FloatingInbox`, `UserPreferences` (channels per category) [12]. Real-time transport not documented on that page [12].
- Email via SMTP, SES, Mailgun, SendGrid, or "Ping Email" (not explained) [13].
- Workflows: `broadcast`, `wait` (seconds), `pause`, `abort`, with `if` conditions [24]. Max durations not stated.
- Smallest free tier, and least complete docs of the five for the features we need.

### Courier
- Free "Developer": 10,000 sends/mo; above that, Business charges $0.005 for **every** send including the first 10k (50k = $250) [14]. A send = one template to one recipient, across all channels [17b].
- React: `CourierInbox`, `CourierInboxPopupMenu`, `CourierToast`, `CourierPreferences`; real-time after `listenForUpdates()` [15].
- Preferences: subscription topics (opted in / opted out / required), per-channel custom routing, hosted preference page, unsubscribe links in templates [16].
- Journeys: delay by duration or until a timestamp, max 93 days per node, cancel by run id or cancelation token; `client.journeys.invoke` / `client.journeys.cancel` in the Node SDK [25]. Digest & batching listed as Enterprise on the pricing page [14].
- Email: connect your own ESP; Courier adds routing and failover [17].

### SuprSend
- Free: 10,000 notifications/mo, but Free **excludes channel preferences, category preferences, the preference-centre UI and hosted preference page**, and excludes batching/digest/throttling [18]. Essentials $100/mo for 50k [18].
- `@suprsend/react` inbox (bell + popover); JWT user tokens issued by our backend; toasts via `feed.new_notification` [19].
- Email via your vendor (Resend, Mailgun, SendGrid…) configured in dashboard; auto 1-click unsubscribe header on commercial categories; `$hosted_preference_url` template variable [20].
- Delay node and Wait Until node exist [26]; Node trigger supports `idempotency_key`, no cancel documented [26].
- Preferences are a hard requirement for #4, so SuprSend Free is not enough on its own.

## What every third party adds to Cadence regardless

- An account, a secret key, and a public key/user-token flow in `.env`. A fresh clone without keys needs a fallback (no-op adapter, or the bell hidden).
- Identity sync: each Student must exist as a user/subscriber/recipient in the vendor. DevUI user-switching means tokens must be minted per switched user.
- Still an ESP for email (none of the five sends email on its own in production).
- Student data (names, emails, course progress) leaves the SQLite file.
- Nudges triggered from "Student has *not* done something" need either a vendor delay-plus-cancel (Knock, Courier; Novu only up to its plan cap) or our own scheduler that queries SQLite.

## In-house estimate (React Router 8 + SQLite/Drizzle)

Rough, for one developer familiar with the codebase (21 tables in `app/db/schema.ts`, shadcn UI, `sonner` already present):

| Piece | Work | Estimate |
|---|---|---|
| Schema | `notifications` (studentId, type, payload JSON, createdAt, readAt, emailedAt), `notification_preferences` (studentId, type, channel, enabled); migration + seed | 0.5 day |
| Emit helper | `notify(studentId, type, payload)` that checks preferences, inserts a row, optionally queues email; hook into existing actions (lesson create, comment reply, quiz, progress) | 1 day |
| Bell + inbox | Popover in `layout.app.tsx`, unread count from the root/layout loader, mark-read / mark-all-read actions; freshness via loader revalidation on navigation (optionally `useRevalidator` on an interval) | 1–1.5 days |
| Preferences UI | Section in `settings.tsx`: type x channel toggles | 0.5–1 day |
| Email | ESP SDK or SMTP (e.g. nodemailer); dev mode logs to console or writes to an outbox table/page so a clone needs no keys; templates (React Email or plain) | 1–2 days |
| Unsubscribe | Signed-token link, one-click page, `List-Unsubscribe` + `List-Unsubscribe-Post` headers | 0.5 day |
| Nudge scheduler | Job that finds stalled Enrollments (no progress in N days, not already nudged) and emits Nudges. Simplest: an in-process `setInterval`/cron in the Node server or a `npm run nudges` script run by system cron; idempotency via `emailedAt`/a nudge log table | 1–2 days |
| Tests | Vitest for preference rules, nudge selection, unsubscribe token | 1 day |
| **Total** | | **~6–9 developer-days** for parity with the features listed in #5 (excluding real-time push, digests and analytics) |

Things in-house does not get for free: delivery logs/observability, retries, real-time push (SSE could be added later, ~1 day), digesting/throttling, and multi-channel failover. Things it keeps: zero-key local dev, all data in the one SQLite file, DevUI switching just works, no per-message costs.

## Candidates for #9 (not a decision)

1. **In-house** — best fit for clone-without-keys and the single-SQLite architecture; cost is roughly 1.5–2 weeks of work plus owning a scheduler and email deliverability.
2. **Knock** — most complete fit for Nudges on the free tier (long dynamic delays, cancellation keys, preferences, unsubscribe, real-time feed); downsides are mandatory keys, $250/mo cliff, and building our own preference UI.
3. **Courier** — comparable feature fit (93-day delays, cancel tokens, prefs UI component); pay-as-you-go pricing is gentler than Knock but charges from the first send once off Free.
4. **Novu Cloud** — cheapest paid tier and best prebuilt Inbox+preferences, but the 1-day Free delay cap pushes Nudge scheduling back onto us; self-hosting is too heavy for this repo.
5. MagicBell (1k free, thin docs) and SuprSend (no preferences on Free) fit worst.

A hybrid is also possible: in-house table + bell + scheduler, with only email going through an ESP.

## Sources

1. Knock pricing — https://knock.app/pricing
2. Knock React feed — https://docs.knock.app/in-app-ui/react/feed
3. Knock email overview — https://docs.knock.app/integrations/email/overview
4. Knock preferences — https://docs.knock.app/preferences/overview and https://docs.knock.app/concepts/preferences
5. Novu pricing — https://novu.co/pricing
6. Novu Inbox — https://docs.novu.co/platform/inbox/overview
7. Novu email integrations — https://docs.novu.co/platform/integrations/email
8. Novu self-hosting — https://docs.novu.co/community/self-hosting-novu/overview ; licence — https://github.com/novuhq/novu
9. Knock delay function — https://docs.knock.app/designing-workflows/delay-function
10. Knock canceling workflows — https://docs.knock.app/send-notifications/canceling-workflows
11. MagicBell pricing — https://www.magicbell.com/pricing
12. MagicBell React — https://www.magicbell.com/docs/libraries/magicbell-react
13. MagicBell email channel — https://www.magicbell.com/docs/channels/email
14. Courier pricing — https://www.courier.com/pricing
15. Courier React SDK — https://www.courier.com/docs/platform/inbox/web/react-sdk
16. Courier preferences — https://www.courier.com/docs/platform/preferences/preferences-overview
17. Courier email providers — https://www.courier.com/docs/integrations/email/overview ; 17b. billing — https://www.courier.com/docs/workspaces/billing
18. SuprSend pricing — https://www.suprsend.com/pricing
19. SuprSend React inbox — https://docs.suprsend.com/docs/inbox-react , https://docs.suprsend.com/docs/react-toast-notifications
20. SuprSend email vendors / unsubscribe — https://docs.suprsend.com/docs/resend , https://docs.suprsend.com/docs/user-preferences
21. SuprSend preference evaluation — https://docs.suprsend.com/docs/preference-evaluation
22. Novu delay step — https://docs.novu.co/platform/workflow/add-and-configure-steps/configure-action-steps/delay
23. Novu trigger / cancel — https://docs.novu.co/platform/workflow/trigger-workflow , https://docs.novu.co/api-reference/events/cancel-triggered-event
24. MagicBell workflows — https://www.magicbell.com/workflows
25. Courier journeys / Node SDK — https://www.courier.com/docs/journeys/overview , https://www.courier.com/docs/sdk-libraries/node
26. SuprSend workflow design / Node trigger — https://docs.suprsend.com/docs/design-workflow , https://docs.suprsend.com/docs/node-trigger-workflow-from-api
27. Novu local dev — https://docs.novu.co/framework/studio

Gaps: MagicBell real-time transport and workflow limits, Knock's free-tier overage price, and Courier's Developer-plan feature limits beyond those on the pricing page are not stated in the sources checked.
