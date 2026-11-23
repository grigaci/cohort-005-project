import { useState } from "react";
import { useFetcher } from "react-router";
import { Lock, NotebookPen } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { MAX_NOTE_LENGTH } from "~/lib/notes";
import { cn, formatRelativeTime } from "~/lib/utils";

type SavedNote = { body: string; updatedAt: string };

// Laid out like the Questions & Discussion card further down the page, so the
// two places a Student writes on a Lesson read as one design.
export function LessonNote({ note }: { note: SavedNote | null }) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [body, setBody] = useState(note?.body ?? "");
  const isSaving = fetcher.state !== "idle";
  const tooLong = body.length > MAX_NOTE_LENGTH;
  const empty = body.trim().length === 0;

  return (
    <Card className="mb-8 py-0">
      <CardContent className="p-6">
        <LessonNoteHeader />
        <fetcher.Form method="post" className="space-y-2">
          <input type="hidden" name="intent" value="save-note" />
          <Textarea
            name="body"
            rows={4}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Jot down what you want to remember from this lesson..."
            aria-label="Your notes"
          />
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              size="sm"
              disabled={isSaving || empty || tooLong}
            >
              {isSaving ? "Saving..." : "Save note"}
            </Button>
            <LessonNoteStatus note={note} error={fetcher.data?.error} />
            <span
              className={cn(
                "ml-auto text-xs",
                tooLong ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {body.length} / {MAX_NOTE_LENGTH}
            </span>
          </div>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function LessonNoteHeader() {
  return (
    <div className="mb-4 flex items-center gap-2">
      <NotebookPen className="size-5 text-primary" />
      <h2 className="text-xl font-semibold">Your notes</h2>
      <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
        <Lock className="size-3.5" />
        Only you can see these
      </span>
    </div>
  );
}

function LessonNoteStatus({
  note,
  error,
}: {
  note: SavedNote | null;
  error: string | undefined;
}) {
  if (error) return <span className="text-sm text-destructive">{error}</span>;
  if (!note) return null;
  return (
    <span suppressHydrationWarning className="text-xs text-muted-foreground">
      Last edited {formatRelativeTime(note.updatedAt)}
    </span>
  );
}
