import type { RequestContainer } from "@/core/application/di/types";
import { isNotFoundError } from "@/core/application/errors";
import type { GetPublicNoteInput } from "@/core/application/publication/getPublicNote";
import type { ContentHtml } from "@/core/domain/note/valueObject";

/** Plain meta projection consumed by a public-note route's `head`. */
export type PublicNoteMeta = Readonly<{
  title: string;
  description: string;
  publishedTime?: string;
  modifiedTime: string;
  authorName: string;
  authorUsername: string;
  tags: readonly string[];
}>;

// SNS / search descriptions truncate well before this; keep the excerpt
// compact so the meta tag stays within typical render budgets.
const DESCRIPTION_MAX = 160;

/**
 * Loads the metadata a public-note `head` needs, reusing the
 * `getPublicNote` usecase. The body excerpt is produced through the
 * domain `htmlSanitizer.toPlainText` port (no raw-HTML parsing in the
 * presentation layer). Returns `null` when the note is not public /
 * missing so `head` can fall back to defaults without throwing.
 */
export async function loadPublicNoteMeta(
  container: RequestContainer,
  input: GetPublicNoteInput,
): Promise<PublicNoteMeta | null> {
  const { getPublicNote } = await import(
    "@/core/application/publication/getPublicNote"
  );
  try {
    const { note, owner, tagNames, publishedAt } = await getPublicNote({
      container,
      input,
    });
    const plain = container.htmlSanitizer.toPlainText(
      note.contentHtml as ContentHtml,
    );
    const description =
      plain.length > DESCRIPTION_MAX
        ? `${plain.slice(0, DESCRIPTION_MAX)}…`
        : plain;
    return {
      title: note.title,
      description,
      ...(publishedAt !== null
        ? { publishedTime: publishedAt.toISOString() }
        : {}),
      modifiedTime: new Date(note.updatedAt).toISOString(),
      authorName: owner.displayName,
      authorUsername: owner.username,
      tags: tagNames,
    };
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}
