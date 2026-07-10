import { Suspense } from "react";
import { SectionErrorBoundary } from "@/components/common/SectionErrorBoundary";
import type { UserDTO } from "@/core/application/dto/identity";
import { NoteEditorLoader } from "./NoteEditorLoader";
import { NoteEditorSkeleton } from "./NoteEditorSkeleton";

/**
 * Server sync shell for the note editor (P12), mirroring `NoteDetail`.
 *
 * Streams `NoteEditorLoader` behind a `<Suspense>` so the loader can return
 * from the route immediately and the `NoteEditorSkeleton` paints while the
 * note / directory-tree / tag queries resolve. `SectionErrorBoundary` catches
 * any error surfaced through the flight stream (including a stray
 * `NotFoundError`) so it degrades to an in-section message rather than a
 * full-page crash.
 */
export type NoteEditorSectionProps = Readonly<{
  user: UserDTO;
  noteId: string;
}>;

export function NoteEditorSection(props: NoteEditorSectionProps) {
  return (
    <SectionErrorBoundary section="ノート" resetKey={props.noteId}>
      <Suspense fallback={<NoteEditorSkeleton />}>
        <NoteEditorLoader {...props} />
      </Suspense>
    </SectionErrorBoundary>
  );
}
