// PROTOTYPE: throwaway previews of the Notification emails. Never merge.
// Question: "What do the Nudge and Reply emails say and look like?" (#15)
// Plan: three structurally different email designs, switchable via ?variant=A|B|C,
// each rendering all five scenarios with subject, preheader and headers.
// Plain React + Tailwind stands in for React Email / Knock templates; data is stubbed.
import { useSearchParams } from "react-router";
import { PrototypeSwitcher } from "~/components/prototype-switcher";

// ─── Stub data ───

type CourseNudge = {
  course: string;
  step: "7d" | "21d";
  lessonsDone: number;
  lessonsTotal: number;
  nextLesson: string;
  nextLessonMinutes: number;
  instructor: string;
};

type ReplyItem = {
  replier: string;
  isInstructor: boolean;
  course: string;
  lesson: string;
  yourComment: string;
  reply: string;
};

const TS: CourseNudge = {
  course: "Introduction to TypeScript",
  step: "7d",
  lessonsDone: 4,
  lessonsTotal: 12,
  nextLesson: "Arrays and Tuples",
  nextLessonMinutes: 8,
  instructor: "Sarah Chen",
};
const REACT: CourseNudge = {
  course: "React Patterns in Practice",
  step: "7d",
  lessonsDone: 0,
  lessonsTotal: 18,
  nextLesson: "Why patterns matter",
  nextLessonMinutes: 5,
  instructor: "Marcus Johnson",
};
const NODE: CourseNudge = {
  course: "Node.js from Scratch",
  step: "21d",
  lessonsDone: 9,
  lessonsTotal: 14,
  nextLesson: "Streams and Backpressure",
  nextLessonMinutes: 12,
  instructor: "Priya Nair",
};

const REPLY_PEER: ReplyItem = {
  replier: "James Park",
  isInstructor: false,
  course: "Introduction to TypeScript",
  lesson: "Union and Intersection Types",
  yourComment: "Is there ever a reason to prefer an intersection over extending an interface?",
  reply: "I reach for intersections when combining types I don't own — e.g. a library prop type plus my own.",
};
const REPLY_INSTRUCTOR: ReplyItem = {
  replier: "Sarah Chen",
  isInstructor: true,
  course: "Introduction to TypeScript",
  lesson: "Type Aliases and Interfaces",
  yourComment: "Why does my type alias not show up in the error message?",
  reply: "Good catch! TypeScript expands aliases in some errors. Hover the variable to see the alias name — I'll add a note to the lesson.",
};
const REPLY_PEER_2: ReplyItem = {
  replier: "Olivia Martinez",
  isInstructor: false,
  course: "Node.js from Scratch",
  lesson: "Event Loop Basics",
  yourComment: "Does setImmediate always run before setTimeout(0)?",
  reply: "Not always — outside an I/O callback the order isn't guaranteed.",
};

type Scenario =
  | { key: string; label: string; kind: "nudge"; nudges: CourseNudge[] }
  | { key: string; label: string; kind: "reply"; replies: ReplyItem[] };

const SCENARIOS: Scenario[] = [
  { key: "nudge-7", label: "Nudge, single course, 7 days", kind: "nudge", nudges: [TS] },
  { key: "nudge-21", label: "Nudge, single course, 21 days", kind: "nudge", nudges: [NODE] },
  { key: "nudge-combined", label: "Nudge, combined (3 courses, one sweep)", kind: "nudge", nudges: [TS, REACT, NODE] },
  { key: "reply-single", label: "Reply, single (Instructor answer)", kind: "reply", replies: [REPLY_INSTRUCTOR] },
  { key: "reply-batched", label: "Reply, batched (3 in 15 min)", kind: "reply", replies: [REPLY_PEER, REPLY_INSTRUCTOR, REPLY_PEER_2] },
];

// ─── Subjects, preheaders, headers (shared copy, aligned with in-app copy from #11) ───

function nudgeLine(n: CourseNudge) {
  return n.step === "7d"
    ? `Pick up where you left off in ${n.course}`
    : `${n.course} is waiting for you`;
}

function replyLine(r: ReplyItem) {
  return r.isInstructor
    ? "Your Instructor answered your question"
    : `${r.replier} replied to your comment`;
}

function subjectFor(s: Scenario) {
  if (s.kind === "nudge") {
    return s.nudges.length === 1
      ? nudgeLine(s.nudges[0])
      : `${s.nudges.length} of your courses are waiting for you`;
  }
  return s.replies.length === 1
    ? replyLine(s.replies[0])
    : `${s.replies.length} new replies to your comments`;
}

function preheaderFor(s: Scenario) {
  if (s.kind === "nudge") {
    return s.nudges.length === 1
      ? `Next up: ${s.nudges[0].nextLesson} (${s.nudges[0].nextLessonMinutes} min)`
      : s.nudges.map((n) => n.course).join(" · ");
  }
  return s.replies.length === 1
    ? `“${s.replies[0].reply.slice(0, 60)}…”`
    : s.replies.map((r) => r.replier).join(", ");
}

function headersFor(s: Scenario) {
  const base = [
    ["From", "Cadence <hello@cadence.dev>"],
    ["To", "emma.wilson@example.com"],
  ];
  if (s.kind === "nudge") {
    base.push(
      ["List-Unsubscribe", "<https://api.knock.app/…/unsubscribe?category=commercial>"],
      ["List-Unsubscribe-Post", "List-Unsubscribe=One-Click"]
    );
  }
  return base;
}

// ─── Email chrome (not part of the design being evaluated) ───

function EmailFrame({ scenario, children }: { scenario: Scenario; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="mb-2 font-mono text-xs uppercase tracking-wider text-fuchsia-600">
        {scenario.label}
      </h2>
      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <div className="border-b bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
          <div className="text-base font-semibold text-neutral-900">{subjectFor(scenario)}</div>
          <div className="mb-2 italic text-neutral-500">{preheaderFor(scenario)}</div>
          {headersFor(scenario).map(([k, v]) => (
            <div key={k} className="font-mono">
              <span className="text-neutral-400">{k}:</span> {v}
            </div>
          ))}
        </div>
        <div className="bg-neutral-100 px-4 py-6 text-neutral-900">
          <div className="mx-auto max-w-[600px]">{children}</div>
        </div>
      </div>
    </section>
  );
}

function Footer({ kind, tone }: { kind: Scenario["kind"]; tone: "plain" | "boxed" }) {
  return (
    <div
      className={
        tone === "plain"
          ? "mt-8 border-t pt-4 text-xs text-neutral-500"
          : "mt-6 text-center text-xs text-neutral-500"
      }
    >
      <p>
        {kind === "nudge"
          ? "You're getting this because you're enrolled on a course you haven't finished."
          : "You're getting this because someone replied to your comment."}{" "}
        <a className="underline" href="#">Manage email preferences</a>
        {kind === "nudge" && (
          <>
            {" · "}
            <a className="underline" href="#">Unsubscribe from course reminders</a>
          </>
        )}
      </p>
      <p className="mt-1">Cadence · 123 Example St · Somewhere</p>
    </div>
  );
}

// ─── Variant A: plain personal note (text-first, no images, inline links) ───

function VariantA({ scenario }: { scenario: Scenario }) {
  return (
    <div className="bg-white p-6 font-serif text-[15px] leading-relaxed">
      <p>Hi Emma,</p>
      {scenario.kind === "nudge" ? (
        scenario.nudges.length === 1 ? (
          <>
            <p className="mt-3">
              {scenario.nudges[0].step === "7d"
                ? `It's been a week since you last worked on ${scenario.nudges[0].course}. You're ${scenario.nudges[0].lessonsDone} lessons in — the next one, "${scenario.nudges[0].nextLesson}", takes about ${scenario.nudges[0].nextLessonMinutes} minutes.`
                : `${scenario.nudges[0].course} is still here when you're ready. You've done ${scenario.nudges[0].lessonsDone} of ${scenario.nudges[0].lessonsTotal} lessons — that's most of the way.`}
            </p>
            <p className="mt-3">
              <a className="text-blue-700 underline" href="#">
                Continue with “{scenario.nudges[0].nextLesson}” →
              </a>
            </p>
          </>
        ) : (
          <>
            <p className="mt-3">A few of your courses haven't seen you in a while:</p>
            <ul className="mt-3 list-disc pl-5">
              {scenario.nudges.map((n) => (
                <li key={n.course} className="mt-1">
                  <a className="text-blue-700 underline" href="#">{n.course}</a> — next up:{" "}
                  {n.nextLesson}
                </li>
              ))}
            </ul>
          </>
        )
      ) : (
        scenario.replies.map((r) => (
          <div key={r.reply} className="mt-4">
            <p>
              {r.isInstructor ? (
                <strong>Your Instructor {r.replier} answered your question</strong>
              ) : (
                <strong>{r.replier} replied to your comment</strong>
              )}{" "}
              on “{r.lesson}”:
            </p>
            <p className="mt-1 border-l-2 border-neutral-300 pl-3 text-neutral-700">{r.reply}</p>
            <p className="mt-1">
              <a className="text-blue-700 underline" href="#">Read the thread →</a>
            </p>
          </div>
        ))
      )}
      <p className="mt-6">— The Cadence team</p>
      <Footer kind={scenario.kind} tone="plain" />
    </div>
  );
}

// ─── Variant B: branded cards (logo header, course card with progress, big button) ───

function ProgressBar({ done, total }: { done: number; total: number }) {
  return (
    <div className="mt-2 h-2 w-full rounded-full bg-neutral-200">
      <div
        className="h-2 rounded-full bg-indigo-600"
        style={{ width: `${Math.max(4, (done / total) * 100)}%` }}
      />
    </div>
  );
}

function VariantB({ scenario }: { scenario: Scenario }) {
  return (
    <div className="font-sans">
      <div className="rounded-t-xl bg-indigo-600 px-6 py-4 text-lg font-bold text-white">Cadence</div>
      <div className="rounded-b-xl bg-white px-6 py-6">
        <h1 className="text-2xl font-bold">{subjectFor(scenario)}</h1>
        {scenario.kind === "nudge" ? (
          <div className="mt-4 space-y-4">
            {scenario.nudges.map((n) => (
              <div key={n.course} className="rounded-xl border p-4">
                <div className="text-xs uppercase tracking-wide text-neutral-500">
                  with {n.instructor}
                </div>
                <div className="text-lg font-semibold">{n.course}</div>
                <ProgressBar done={n.lessonsDone} total={n.lessonsTotal} />
                <div className="mt-1 text-sm text-neutral-600">
                  {n.lessonsDone} of {n.lessonsTotal} lessons complete
                </div>
                <a
                  href="#"
                  className="mt-4 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white"
                >
                  {n.lessonsDone === 0 ? "Start course" : "Continue course"}
                </a>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {scenario.replies.map((r) => (
              <div key={r.reply} className="rounded-xl border p-4">
                <div className="text-xs text-neutral-500">
                  {r.course} · {r.lesson}
                </div>
                <div className="mt-2 rounded-lg bg-neutral-100 p-3 text-sm text-neutral-600">
                  <span className="font-semibold">You:</span> {r.yourComment}
                </div>
                <div
                  className={`mt-2 ml-6 rounded-lg p-3 text-sm ${r.isInstructor ? "bg-amber-50 ring-1 ring-amber-300" : "bg-indigo-50"}`}
                >
                  <span className="font-semibold">{r.replier}</span>
                  {r.isInstructor && (
                    <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold uppercase">
                      Instructor
                    </span>
                  )}
                  <div className="mt-1">{r.reply}</div>
                </div>
                <a
                  href="#"
                  className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  View thread
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
      <Footer kind={scenario.kind} tone="boxed" />
    </div>
  );
}

// ─── Variant C: next-lesson focus (one hero action; compact rows when combined) ───

function VariantC({ scenario }: { scenario: Scenario }) {
  if (scenario.kind === "nudge" && scenario.nudges.length === 1) {
    const n = scenario.nudges[0];
    return (
      <div className="font-sans">
        <div className="bg-white px-6 py-8 text-center">
          <div className="text-sm text-neutral-500">{nudgeLine(n)}</div>
          <div className="mx-auto mt-6 max-w-sm rounded-2xl bg-neutral-900 p-6 text-left text-white">
            <div className="text-xs uppercase tracking-wider text-neutral-400">
              Next lesson · {n.nextLessonMinutes} min
            </div>
            <div className="mt-1 text-2xl font-bold">{n.nextLesson}</div>
            <div className="mt-1 text-sm text-neutral-400">{n.course}</div>
            <a href="#" className="mt-5 block rounded-lg bg-white py-3 text-center font-semibold text-neutral-900">
              ▶ Resume lesson
            </a>
          </div>
          <div className="mt-4 text-sm text-neutral-500">
            {n.lessonsTotal - n.lessonsDone} lessons to go
          </div>
        </div>
        <Footer kind="nudge" tone="boxed" />
      </div>
    );
  }
  return (
    <div className="font-sans">
      <div className="bg-white px-6 py-6">
        <div className="text-sm font-semibold text-neutral-500">Cadence</div>
        <table className="mt-4 w-full text-sm">
          <tbody>
            {scenario.kind === "nudge"
              ? scenario.nudges.map((n) => (
                  <tr key={n.course} className="border-t">
                    <td className="py-3 pr-2">
                      <div className="font-semibold">{n.nextLesson}</div>
                      <div className="text-xs text-neutral-500">
                        {n.course} · {n.nextLessonMinutes} min
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <a href="#" className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white">
                        Resume
                      </a>
                    </td>
                  </tr>
                ))
              : scenario.replies.map((r) => (
                  <tr key={r.reply} className="border-t align-top">
                    <td className="py-3 pr-2">
                      <div className="font-semibold">{replyLine(r)}</div>
                      <div className="mt-0.5 text-neutral-700">“{r.reply}”</div>
                      <div className="text-xs text-neutral-500">
                        {r.course} · {r.lesson}
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <a href="#" className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white">
                        Open
                      </a>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      <Footer kind={scenario.kind} tone="boxed" />
    </div>
  );
}

// ─── Route ───

const VARIANTS = [
  { key: "A", name: "Plain personal note", Component: VariantA },
  { key: "B", name: "Branded cards", Component: VariantB },
  { key: "C", name: "Next-lesson focus", Component: VariantC },
];

export default function NotificationEmailsPrototype() {
  const [searchParams] = useSearchParams();
  const variant = VARIANTS.find((v) => v.key === searchParams.get("variant")) ?? VARIANTS[0];
  const { Component } = variant;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
      <h1 className="mb-1 text-xl font-bold">PROTOTYPE · Notification emails</h1>
      <p className="mb-8 text-sm text-neutral-500">
        Variant {variant.key}: {variant.name}. Recipient: Emma Wilson. Use ← / → to switch.
      </p>
      {SCENARIOS.map((s) => (
        <EmailFrame key={s.key} scenario={s}>
          <Component scenario={s} />
        </EmailFrame>
      ))}
      <PrototypeSwitcher variants={VARIANTS.map(({ key, name }) => ({ key, name }))} />
    </main>
  );
}
