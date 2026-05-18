"use client";

import Mention from "@tiptap/extension-mention";
import type { SuggestionOptions } from "@tiptap/suggestion";
import type { InternalLinkSuggestion } from "@/core/application/note/searchInternalLinkTargets";
import {
  formatInternalLinkInsertion,
  INTERNAL_LINK_TRIGGER,
} from "./internalLinkSuggest";

/**
 * Mention extension wired to the `[[` suggestion trigger.
 *
 * The extension is configured to insert plain text (`[[note-title]]`
 * or `#tagname`) via `command` rather than a Mention node, so
 * server-side `INTERNAL_LINK_PATTERN` / `HASHTAG_PATTERN` keep
 * working unchanged and `HtmlSanitizer` does not need a new allow-list
 * entry. The Mention node is never actually inserted in the doc —
 * the extension is used purely as a Suggestion-plugin host.
 *
 * See `.issue/36/adr.md` ADR-001 for the design rationale.
 */
export function buildInternalLinkMention(
  suggestionConfig: Pick<
    SuggestionOptions<InternalLinkSuggestion>,
    "items" | "render"
  >,
) {
  return Mention.configure({
    suggestion: {
      char: INTERNAL_LINK_TRIGGER,
      allowSpaces: true,
      startOfLine: false,
      command: ({ editor, range, props }) => {
        // The Mention extension's default `props` type is
        // `MentionNodeAttrs`, but the Suggestion plugin actually passes
        // through whatever the `items` callback returns. We override
        // the contract by emitting `InternalLinkSuggestion` shapes from
        // `items` (see WysiwygEditor.tsx), so the cast here narrows the
        // structurally-correct payload back into the union.
        const insertion = formatInternalLinkInsertion(
          props as unknown as InternalLinkSuggestion,
        );
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent(`${insertion} `)
          .run();
      },
      ...suggestionConfig,
    },
  });
}
