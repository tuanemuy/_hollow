/**
 * Compatibility re-export. The full editor moved to `./editor/NoteEditor`
 * during Phase D of Issue #1 — see `.issue/1/plan.md` and ADR-002
 * (WYSIWYG代替) / ADR-005 (pure / side-effect 分離) / ADR-008
 * (frontMatterJson) / ADR-009 (`/media/<id>` URL) for the rationale.
 */

export type { NoteEditorProps } from "./editor/NoteEditor";
export { NoteEditor } from "./editor/NoteEditor";
