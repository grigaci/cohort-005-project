// PROTOTYPE, throwaway. Answers: "What should the in-app Notification bell and
// inbox look and behave like?" Three variants mounted in the app layout,
// switchable via `?variant=A|B|C`. Knock isn't installed: the feed is stubbed
// in memory so each variant can stand in for a styled `@knocklabs/react` feed
// with a custom item renderer. Nothing here talks to Knock or the database.
import { createContext, useContext, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Popover, Dialog } from "radix-ui";
import { toast } from "sonner";
import {
  Bell,
  BellOff,
  CheckCheck,
  Clock,
  MessageSquare,
  PlayCircle,
  X,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { PrototypeSwitcher } from "~/components/prototype-switcher";

// ─── Stub feed ────────────────────────────────────────────────────────────

type Course = { title: string; slug: string };

type FeedItem = {
  id: number;
  type: "nudge" | "reply";
  course: Course;
  // Nudge
  stalledDays?: 7 | 21;
  lessonTitle: string;
  // Reply
  replierName?: string;
  replierIsInstructor?: boolean;
  snippet?: string;
  insertedAt: number; // minutes ago
  readAt: number | null;
};

const FALLBACK_COURSES: Course[] = [
  { title: "Intro to TypeScript", slug: "intro-to-typescript" },
  { title: "React Patterns", slug: "react-patterns" },
];

function seedItems(courses: Course[]): FeedItem[] {
  const [c1, c2] = [courses[0], courses[1] ?? courses[0]];
  return [
    {
      id: 1,
      type: "reply",
      course: c1,
      lessonTitle: "Generics in practice",
      replierName: "Sarah Chen",
      replierIsInstructor: true,
      snippet: "Good question! The constraint is there because…",
      insertedAt: 12,
      readAt: null,
    },
    {
      id: 2,
      type: "nudge",
      course: c2,
      stalledDays: 7,
      lessonTitle: "Compound components",
      insertedAt: 60 * 5,
      readAt: null,
    },
    {
      id: 3,
      type: "reply",
      course: c1,
      lessonTitle: "Narrowing",
      replierName: "Alex Kim",
      snippet: "I had the same issue, try `in` instead of…",
      insertedAt: 60 * 26,
      readAt: Date.now(),
    },
    {
      id: 4,
      type: "nudge",
      course: c1,
      stalledDays: 21,
      lessonTitle: "Mapped types",
      insertedAt: 60 * 24 * 9,
      readAt: Date.now(),
    },
  ];
}

type Feed = {
  items: FeedItem[];
  unread: number;
  markRead: (id: number) => void;
  markAllRead: (filter?: (i: FeedItem) => boolean) => void;
};

const FeedContext = createContext<Feed | null>(null);
const useFeed = () => useContext(FeedContext)!;

function title(item: FeedItem) {
  if (item.type === "nudge") {
    return item.stalledDays === 7
      ? `Pick up where you left off in ${item.course.title}`
      : `${item.course.title} is waiting for you`;
  }
  return item.replierIsInstructor
    ? `Your Instructor answered your question`
    : `${item.replierName} replied to your comment`;
}

function href(item: FeedItem) {
  // Nudge: where the Student left off. Reply: the live thread on the lesson.
  return item.type === "nudge"
    ? `/courses/${item.course.slug}#resume`
    : `/courses/${item.course.slug}#comments`;
}

function ago(min: number) {
  if (min < 60) return `${min}m`;
  if (min < 60 * 24) return `${Math.round(min / 60)}h`;
  return `${Math.round(min / 60 / 24)}d`;
}

function TypeIcon({ item, className }: { item: FeedItem; className?: string }) {
  return item.type === "nudge" ? (
    <Clock className={cn("size-4 text-amber-500", className)} />
  ) : (
    <MessageSquare className={cn("size-4 text-sky-500", className)} />
  );
}

function Badge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}

function EmptyState({ compact }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 text-center text-sm text-muted-foreground",
        compact ? "p-6" : "p-12"
      )}
    >
      <BellOff className="size-6" />
      <div className="font-medium text-foreground">You're all caught up</div>
      <div>Replies to your comments and course reminders show up here.</div>
    </div>
  );
}

// ─── Variant A: sidebar-header bell + popover (closest to Knock default) ──

function VariantABell() {
  const { items, unread, markRead, markAllRead } = useFeed();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const navigate = useNavigate();
  const shown = filter === "all" ? items : items.filter((i) => !i.readAt);

  return (
    <Popover.Root>
      <Popover.Trigger className="relative ml-auto rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent">
        <Bell className="size-4" />
        <Badge count={unread} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="start"
          sideOffset={12}
          className="z-50 w-80 rounded-lg border bg-popover text-popover-foreground shadow-lg"
        >
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="text-sm font-semibold">Notifications</div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as "all" | "unread")}
              className="rounded border bg-transparent px-1 text-xs"
            >
              <option value="all">All</option>
              <option value="unread">Unread</option>
            </select>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {shown.length === 0 ? (
              <EmptyState compact />
            ) : (
              shown.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    markRead(item.id);
                    navigate(href(item));
                  }}
                  className="flex w-full gap-3 border-b px-3 py-2.5 text-left last:border-0 hover:bg-accent"
                >
                  <TypeIcon item={item} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm leading-snug">{title(item)}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {item.course.title} · {item.lessonTitle}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground">
                      {ago(item.insertedAt)}
                    </span>
                    {!item.readAt && (
                      <span className="size-2 rounded-full bg-primary" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="border-t px-3 py-2 text-right">
            <button
              onClick={() => markAllRead()}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="size-3" /> Mark all as read
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ─── Variant B: sidebar nav item + full-height drawer, grouped by course ──

function VariantBNavItem() {
  const { items, unread, markRead, markAllRead } = useFeed();
  const navigate = useNavigate();
  const groups = new Map<string, FeedItem[]>();
  for (const item of items) {
    groups.set(item.course.slug, [...(groups.get(item.course.slug) ?? []), item]);
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
        <Bell className="size-4" />
        Notifications
        {unread > 0 && (
          <span className="ml-auto rounded-full bg-primary px-2 text-xs text-primary-foreground">
            {unread}
          </span>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[28rem] flex-col border-l bg-background shadow-xl">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <Dialog.Title className="text-lg font-semibold">
              Notifications
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 hover:bg-accent">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <div className="flex-1 space-y-6 overflow-y-auto p-5">
            {items.length === 0 && <EmptyState />}
            {[...groups.values()].map((group) => {
              const course = group[0].course;
              const groupUnread = group.filter((i) => !i.readAt).length;
              return (
                <section key={course.slug}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-semibold">{course.title}</h3>
                    {groupUnread > 0 && (
                      <button
                        onClick={() =>
                          markAllRead((i) => i.course.slug === course.slug)
                        }
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Mark {groupUnread} read
                      </button>
                    )}
                  </div>
                  <ul className="space-y-1">
                    {group.map((item) => (
                      <li key={item.id}>
                        <Dialog.Close asChild>
                          <button
                            onClick={() => {
                              markRead(item.id);
                              navigate(href(item));
                            }}
                            className={cn(
                              "flex w-full items-start gap-3 rounded-md p-2 text-left hover:bg-accent",
                              !item.readAt && "bg-primary/5"
                            )}
                          >
                            <TypeIcon item={item} className="mt-0.5" />
                            <div className="flex-1">
                              <div
                                className={cn(
                                  "text-sm",
                                  !item.readAt && "font-semibold"
                                )}
                              >
                                {title(item)}
                              </div>
                              {item.snippet && (
                                <div className="text-xs italic text-muted-foreground">
                                  “{item.snippet}”
                                </div>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {ago(item.insertedAt)}
                            </span>
                          </button>
                        </Dialog.Close>
                      </li>
                    ))}
                  </ul>
                  <Dialog.Close asChild>
                    <Link
                      to={`/courses/${course.slug}#resume`}
                      className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      <PlayCircle className="size-4" /> Continue course
                    </Link>
                  </Dialog.Close>
                </section>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Variant C: top bar bell, rich cards, opening marks seen, toasts ──────

function VariantCTopBar() {
  const { items, unread, markRead, markAllRead } = useFeed();
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const navigate = useNavigate();
  const shown = tab === "all" ? items : items.filter((i) => !i.readAt);

  return (
    <div className="sticky top-0 z-30 flex h-14 items-center justify-end border-b bg-background/80 px-6 backdrop-blur">
      <Popover.Root
        onOpenChange={(open) => {
          // Opening the panel counts as seeing everything in it.
          if (!open) markAllRead();
        }}
      >
        <Popover.Trigger className="relative rounded-full p-2 hover:bg-accent">
          <Bell className="size-5" />
          <Badge count={unread} />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={8}
            className="z-50 w-[26rem] rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl"
          >
            <div className="mb-3 flex gap-1 rounded-lg bg-muted p-1 text-sm">
              {(["unread", "all"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "flex-1 rounded-md py-1 capitalize",
                    tab === t && "bg-background shadow"
                  )}
                >
                  {t}
                  {t === "unread" && unread > 0 && ` (${unread})`}
                </button>
              ))}
            </div>
            <div className="max-h-[28rem] space-y-2 overflow-y-auto">
              {shown.length === 0 && <EmptyState compact />}
              {shown.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border p-3 shadow-sm"
                >
                  <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <TypeIcon item={item} className="size-3" />
                    {item.course.title}
                    {item.replierIsInstructor && (
                      <span className="rounded bg-sky-100 px-1.5 font-medium text-sky-700 dark:bg-sky-900 dark:text-sky-200">
                        Instructor
                      </span>
                    )}
                    <span className="ml-auto">{ago(item.insertedAt)} ago</span>
                  </div>
                  <div className="font-medium">{title(item)}</div>
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {item.snippet ? `“${item.snippet}”` : `Next up: ${item.lessonTitle}`}
                  </div>
                  <button
                    onClick={() => {
                      markRead(item.id);
                      navigate(href(item));
                    }}
                    className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90"
                  >
                    {item.type === "nudge" ? (
                      <>
                        <PlayCircle className="size-4" /> Resume lesson
                      </>
                    ) : (
                      <>
                        <MessageSquare className="size-4" /> View reply
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

// ─── Wiring ───────────────────────────────────────────────────────────────

export const VARIANTS = [
  { key: "A", name: "Sidebar bell + popover" },
  { key: "B", name: "Nav item + course drawer" },
  { key: "C", name: "Top bar + cards + toasts" },
];

export function useNotificationVariant() {
  const [searchParams] = useSearchParams();
  return searchParams.get("variant") ?? "A";
}

export function NotificationPrototype({
  courses,
  children,
}: {
  courses: Course[];
  children: React.ReactNode;
}) {
  const variant = useNotificationVariant();
  const [items, setItems] = useState(() =>
    seedItems(courses.length > 0 ? courses : FALLBACK_COURSES)
  );
  const [nextId, setNextId] = useState(100);
  const unread = items.filter((i) => !i.readAt).length;

  const feed: Feed = {
    items,
    unread,
    markRead: (id) =>
      setItems((all) =>
        all.map((i) => (i.id === id ? { ...i, readAt: i.readAt ?? Date.now() } : i))
      ),
    markAllRead: (filter = () => true) =>
      setItems((all) =>
        all.map((i) => (filter(i) && !i.readAt ? { ...i, readAt: Date.now() } : i))
      ),
  };

  function simulate(type: FeedItem["type"]) {
    const base = seedItems(courses.length > 0 ? courses : FALLBACK_COURSES);
    const item = { ...base[type === "reply" ? 0 : 1], id: nextId, insertedAt: 0, readAt: null };
    setNextId(nextId + 1);
    setItems((all) => [item, ...all]);
    // Only C pops a toast for a real-time arrival; A and B just bump the badge.
    if (variant === "C") toast(title(item), { description: item.course.title });
  }

  return (
    <FeedContext.Provider value={feed}>
      {children}
      <PrototypeSwitcher variants={VARIANTS}>
        <span className="mx-1 h-4 w-px bg-white/30" />
        <button onClick={() => simulate("reply")} className="rounded-full px-2 hover:bg-white/20">
          +Reply
        </button>
        <button onClick={() => simulate("nudge")} className="rounded-full px-2 hover:bg-white/20">
          +Nudge
        </button>
        <button
          onClick={() => setItems([])}
          className="rounded-full px-2 hover:bg-white/20"
        >
          Empty
        </button>
        <button
          onClick={() => setItems(seedItems(courses.length > 0 ? courses : FALLBACK_COURSES))}
          className="rounded-full px-2 hover:bg-white/20"
        >
          Reset
        </button>
        <span className="font-mono text-xs text-white/70">
          {unread} unread / {items.length}
        </span>
      </PrototypeSwitcher>
    </FeedContext.Provider>
  );
}

export function PrototypeSidebarHeaderSlot() {
  return useNotificationVariant() === "A" ? <VariantABell /> : null;
}

export function PrototypeSidebarNavSlot() {
  return useNotificationVariant() === "B" ? <VariantBNavItem /> : null;
}

export function PrototypeMainTopSlot() {
  return useNotificationVariant() === "C" ? <VariantCTopBar /> : null;
}
