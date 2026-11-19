# Which email service should send Notification emails, and how do we preview them locally?

Research for [#7](https://github.com/grigaci/cohort-005-project/issues/7), part of map [#4](https://github.com/grigaci/cohort-005-project/issues/4). Checked against primary sources on 2026-11-19. Prices and limits change, so recheck before committing to one.

## Answer

- **Use Resend for production, behind a small `sendEmail()` seam of our own.** It has the most generous permanent free tier (3,000 emails/month, 100/day). Its Node SDK accepts a React Email component directly. Resend maintains React Email, and React Email is the natural way to write templates in a React Router app. Postmark is the strongest alternative if deliverability matters more than the free allowance. SES is the cheapest at volume, but its sandbox and AWS setup are the most work for anyone cloning the repo. SendGrid no longer has a free plan.
- **Unsubscribe handling is ours to build on all four providers.** Nudges are engagement email, not one-to-one transactional mail, so Gmail and Yahoo's bulk-sender rules apply: `List-Unsubscribe` plus one-click `List-Unsubscribe-Post` (RFC 8058). Postmark and SES manage unsubscribes automatically only on their broadcast and list-management features. Resend's managed unsubscribe flow is for Broadcasts. On a plain transactional send, we add the headers and host the POST endpoint ourselves. This fits well, because Student preferences in our own DB are the source of truth either way.
- **Local preview needs no account.** Two layers:
  1. `react-email`'s `email dev` server renders templates in the browser for design work.
  2. In development, `sendEmail()` uses a Nodemailer SMTP transport pointed at **Mailpit** (`docker run -p 8025:8025 -p 1025:1025 axllent/mailpit`, inbox at `http://localhost:8025`). When Docker isn't available, Nodemailer's `jsonTransport` logs the message to the console instead. Tests use the same JSON transport, or Mailpit's REST API.
- **Dependency on #9 (build vs buy):** every hosted notification provider checked (Novu, Courier, Knock) can send through Resend, Postmark, SES, SendGrid, or generic SMTP. Choosing Resend therefore doesn't constrain #9. If #9 picks a provider, that provider calls the ESP and our `sendEmail()` seam may shrink to a dev-only path. Local preview then depends on whether the provider can use custom SMTP pointed at Mailpit (Novu, Courier and Knock all list SMTP). If #9 builds in-house, the recommendation above stands as written.

## Comparison

| | Resend | Postmark | Amazon SES | SendGrid |
| --- | --- | --- | --- | --- |
| Free tier | 3,000/month, max 100/day, 3 domains, 30-day data retention; permanent [1] | 100/month; "never expires" [2] | No SES-specific allowance. New AWS accounts get up to $200 in Free Tier credits, usable within 12 months [3] | **None.** 60-day trial at 100/day, then sending stops until you pay [4] |
| Cheapest paid | Pro $20/month for 50k [1] | Basic $15/month for 10k, then $1.80 per 1k [2] | $0.10 per 1k à la carte [3] | Essentials $19.95/month for 50k–100k [4] |
| Account friction for a contributor | API key and a verified domain; test inboxes `delivered@resend.dev` etc. [5] | Server token and a sender signature | AWS account and IAM. The sandbox only sends to verified addresses, max 200 per 24 hours at 1/sec, and production access is reviewed within about 96 hours [6] | API key; the trial expires |
| Node SDK (npm, version on 2026-11-19) | `resend` 6.39.0 [7] | `postmark` 5.1.1 [8] | `@aws-sdk/client-sesv2` 3.1172.0 | `@sendgrid/mail` 8.1.6 (last published June 2026) |
| React Email | Native: `react: Template(props)` in `emails.send` (Node only) [7] | Through `render()` to an HTML string, plus `toPlainText()` [9] | Same as Postmark | Same as Postmark |
| List-Unsubscribe on transactional sends | Manual: you pass `List-Unsubscribe` / `List-Unsubscribe-Post` in `headers` and serve the POST endpoint; must honour within 48 hours [10] | Not added on Transactional streams, though your own headers are passed through. Auto one-click link and headers only on Broadcast streams [11] | Automatic only with `ListManagementOptions` (SES contact lists and topics), which overrides your headers. Otherwise pass your own [12] | Automatic `List-Unsubscribe` and one-click `List-Unsubscribe-Post` when subscription tracking is enabled [13] |
| Usable from Novu / Courier / Knock | Yes / Yes / Yes | Yes / Yes / Yes | Yes / Yes / Yes | Yes / Yes / Yes [14][15][16] |

Package versions come from `npm view <pkg> version` on 2026-11-19.

### Notes per provider

- **Resend.** Its free tier is the only one big enough to run real Nudges for a small cohort without paying. Its own Contacts and Topics would duplicate the Student preferences we keep in SQLite, and its managed unsubscribe flow is documented for Broadcasts [17]. So we'd send Nudges as single transactional sends with our own headers.
- **Postmark.** It requires transactional and marketing mail to go through separate streams [2]. If Nudges count as "broadcast", Postmark would want them on a Broadcast stream, which adds its own unsubscribe link and headers [11]. That would split preference state between Postmark and our DB. The 100/month free tier only covers development.
- **Amazon SES.** It is the cheapest at scale. The sandbox (verified recipients only) [6] and AWS IAM setup are the highest barrier for someone cloning the repo, which the map flags as a concern.
- **SendGrid.** Its free plan was retired in favour of a 60-day trial [4], so it's the worst fit for a repo that people clone and run.

## Local preview options

| Option | What it gives | Account needed | Setup |
| --- | --- | --- | --- |
| **React Email dev server** (`email dev`) | Live browser preview of templates in `emails/`, default port 3000, which the `--port` flag can change. Our Vite dev server uses its own default port. [18] | No | npm devDependency |
| **Mailpit** | A real SMTP sink with a web inbox (8025), SMTP on 1025, a REST API for integration tests, an HTML client-compatibility check, a link check, and chaos/SMTP-error injection [19][20] | No | Docker (`axllent/mailpit`) or a single static binary [19] |
| **Nodemailer `jsonTransport` / `streamTransport`** | No delivery: returns the message as JSON or raw RFC 822, so it can be logged to the console or asserted in Vitest [21] | No | npm dependency |
| Resend test addresses | `delivered@`, `bounced@`, `complained@`, `suppressed@resend.dev`, to simulate outcomes against the real API [5] | Yes | — |

Suggested dev story: `EMAIL_TRANSPORT=smtp|json|resend`. The default is `json`, so a fresh clone works with zero setup and the email shows up in the server log. `smtp` targets Mailpit for anyone who wants an inbox view. `resend` is for production. DevUI user-switching then just changes the recipient, and everything lands in the same Mailpit inbox.

## Open questions for downstream tickets

- Do Nudges count as "bulk" under our sending volume? If so, one-click unsubscribe is mandatory. The safe default is to always send it. (Email content and templates, preferences.)
- If #9 picks a hosted provider, does its own preference centre replace our Student preference table, or mirror it?

## Sources

1. Resend pricing: https://resend.com/pricing
2. Postmark pricing: https://postmarkapp.com/pricing
3. Amazon SES pricing: https://aws.amazon.com/ses/pricing/
4. Twilio SendGrid Email API pricing: https://www.twilio.com/en-us/products/email-api/pricing.md
5. Resend, send test emails: https://resend.com/docs/dashboard/emails/send-test-emails
6. SES, request production access (sandbox limits): https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html
7. Resend, send with Node.js: https://resend.com/docs/send-with-nodejs
8. Postmark official libraries: https://postmarkapp.com/developer/integration/official-libraries
9. React Email `render`: https://react.email/docs/utilities/render
10. Resend, unsubscribe in transactional emails: https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails
11. Postmark, List-Unsubscribe header: https://postmarkapp.com/support/article/1299-how-to-include-a-list-unsubscribe-header
12. SES subscription management: https://docs.aws.amazon.com/ses/latest/dg/sending-email-subscription-management.html
13. SendGrid List-Unsubscribe: https://www.twilio.com/docs/sendgrid/ui/sending-email/list-unsubscribe
14. Novu email integrations: https://docs.novu.co/platform/integrations/email
15. Courier email providers: https://www.courier.com/docs/external-integrations/email/intro
16. Knock email integrations: https://docs.knock.app/integrations/email/overview
17. Resend Topics: https://resend.com/docs/dashboard/topics/introduction
18. React Email CLI: https://react.email/docs/cli
19. Mailpit docs: https://mailpit.axllent.org/docs/
20. Mailpit Docker install: https://mailpit.axllent.org/docs/install/docker/
21. Nodemailer stream and JSON transports: https://nodemailer.com/transports/stream
