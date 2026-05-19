# 実装計画 — Issue #36: P12 内部リンク補完 UI（タグ・ノート横断 suggest）

**Issue:** #36
**作成日:** 2026-05-19
**複雑度:** 中〜大規模

---

## 目的

Issue #9 (P12 WYSIWYG エディタ導入) の follow-up。WYSIWYG モードで `[[` をトリガにタグ・ノートを横断 suggest する補完ポップアップを実装し、選択結果を `[[note-title]]` / `#tagname` のテキストとして挿入する。挿入結果はサーバー側 `INTERNAL_LINK_PATTERN` (note) / `HASHTAG_PATTERN` (tag) がそのまま抽出してバックリンク・タグとして登録できる形に整合させる。

## スコープ

### 含まれるもの

- `@tiptap/extension-mention@^3.23.4` + `@tiptap/suggestion@^3.23.4` を新規導入（既存 `@tiptap/react` v3.23.x と peer 整合）
- TipTap Mention 拡張を **Mention ノード化せずプレーンテキスト挿入する** 用途で利用（`command` で `[[title]]` または `#name` をテキスト挿入）— Mention ノード ↔ `[[...]]` 双方向変換は実装しない（設計判断 ADR-001）
- `char: "[["` トリガで Suggestion プラグインを起動
- 候補取得用 server fn `searchInternalLinkTargetsFn`（POST、`requireCurrentUser` で owner スコープ）
- usecase `searchInternalLinkTargets`（`actorUserId` をオーナーとして、note と tag を `Promise.all` で並列検索しマージ）
- Domain port 新メソッド: `NoteRepository.searchByTitlePrefix(ownerId, prefix, limit)` / `TagRepository.searchByNamePrefix(ownerId, prefix, limit)`
- D1 adapter 実装: 既存 `escapeLikePattern` を流用、case-insensitive prefix LIKE。トラッシュ除外。
- pure helpers（`internalLinkSuggest.ts`）— `formatInternalLinkInsertion` / `nextSuggestionIndex` / `suggestionKey` をテスト可能に分離
- React ポップアップコンポーネント `InternalLinkSuggestPopup`（stateless、`role="listbox"` / aria 属性付き）
- TipTap Suggestion グルー（`onStart` / `onUpdate` / `onKeyDown` / `onExit`）を `ReactRenderer` で実装（tippy.js 不採用）
- ↑↓ / Enter / Esc / マウスクリックのキーボード・マウス操作
- 自オーナー限定（visibility 制約は `ownerId === actorUserId` で達成）
- `NoteEditor.tsx` の "follow-up Issue" コメント除去

### 含まれないもの

- **Mention ノード化と parseHTML / renderHTML 双方向変換** — 受入条件は「`[[note-title]]` 相当のテキストが入力され、サーバー側 `INTERNAL_LINK_PATTERN` でバックリンクとして抽出される」のみ。Mention ノードはサニタイザの allow-list 拡張・round-trip 不整合リスクを生むため不採用（ADR-001）
- D1 の新 index 追加（`(owner_id, title)` 等）— LIKE 検索は owner + status の既存 filter で十分絞られる。実測でレイテンシ問題が出たら別 Issue
- `tippy.js` 等の追加 npm 依存
- WYSIWYG タブ + suggestion プラグインの happy-dom 統合テスト — TipTap Suggestion を headless 環境で動かすコストが見合わないためマニュアルテストで代替
- 既存 `[[...]]` 文字列の Input Rule による自動 Mention 化（テキストとして保存・抽出されるので不要）
- `searchOwnNotes` (FTS index 経由) との統合 — 本 Issue は別経路（prefix LIKE）で独立

---

## 実装ステップ

### 1. 依存追加

- **対象ファイル:** `package.json`, `pnpm-lock.yaml`
- **変更内容:** `pnpm add @tiptap/extension-mention@^3.23.4 @tiptap/suggestion@^3.23.4`
- **理由:** TipTap v3.23.x の peer 整合（既存 `@tiptap/react@^3.23.4` と一致、ADR-004 と整合）。Mention 拡張は `command` フックを利用するために必要、Suggestion は実プラグイン本体。
- **検証:** `pnpm install` 後 `pnpm typecheck` がパス、peer 警告ゼロ。`pnpm build` 後 `dist/worker/server.cjs` を `grep -E "tiptap|prosemirror"` し 0 件（サーバー漏洩なし）。

### 2. Domain port 拡張（noteRepository）

- **対象ファイル:** `app/core/domain/note/ports/noteRepository.ts`
- **変更内容:** `NoteRepository` interface に以下を追加。

  ```ts
  /**
   * Owner-scoped active notes whose `title` matches `prefix` as a
   * case-insensitive prefix. Used by the WYSIWYG internal-link
   * suggest popup. The caller is responsible for trimming `prefix`
   * and clamping `limit` to a small constant; the adapter LIKE-escapes
   * wildcards in the user input. Ordered by title asc, id asc for
   * stable ranking across identical titles. Trashed notes are excluded.
   */
  searchByTitlePrefix(
    ownerId: UserId,
    prefix: string,
    limit: number,
  ): Promise<readonly Note[]>;
  ```

- **理由:** owner スコープ + prefix 検索という単一責務のメソッドを追加することで、既存 `findByOwner` の `NoteOwnerListOpts` を膨らませない。JSDoc で「trimmed/clamped は caller 責任」「trashed 除外」「並び順」を明文化。

### 3. Domain port 拡張（tagRepository）

- **対象ファイル:** `app/core/domain/tag/ports/tagRepository.ts`
- **変更内容:** `TagRepository` interface に以下を追加。

  ```ts
  /**
   * Owner-scoped tags whose `name` matches `prefix` as a case-insensitive
   * prefix (compared against `nameNormalized`). Ordered by name asc, id
   * asc. Same caller contract as `NoteRepository.searchByTitlePrefix`.
   */
  searchByNamePrefix(
    ownerId: UserId,
    prefix: string,
    limit: number,
  ): Promise<readonly Tag[]>;
  ```

- **理由:** 上記と同じく単一責務メソッド。`nameNormalized` がすでに lower 化されているので prefix 側も lower 化して合わせる。

### 4. D1 adapter 共通 helper の集約（前段リファクタ）

- **対象ファイル:** `app/core/adapters/d1/repositories/helpers.ts`（既存）, `app/core/adapters/d1/repositories/tagRepository.ts`（既存）
- **変更内容:**
  - `escapeLikePattern` を `tagRepository.ts` から `helpers.ts` に移動して `export` する
  - `tagRepository.ts` の既存使用箇所を `helpers.ts` からの import に置き換える
  - 既存 `tagRepository.findByOwner` の LIKE 表現を `like(col, pat)` から raw `sql\`${col} LIKE ${pat} ESCAPE '\\'\`` に修正（ADR-006 に基づく既存実装の小修正。ESCAPE 句が無いと `escapeLikePattern` の出力が SQLite で機能しないため）
- **理由:** ADR-007。`escapeLikePattern` を Single Source of Truth にすることで、note/tag 両方で同じ規則を共有する。既存 `tagRepository.findByOwner` の ESCAPE 句欠落は本 Issue で同じ規則を使う以上、潜在 bug を残したままにできない。
- **影響範囲:** `tagRepository.findByOwner` の SQL が変わるので既存 integration test を再走させ、緑のまま通過することを確認する。

### 5. D1 adapter 実装（noteRepository）

- **対象ファイル:** `app/core/adapters/d1/repositories/noteRepository.ts`
- **変更内容:**
  - imports に `sql` を追加（`drizzle-orm` から、`like` ヘルパは使わない）
  - `escapeLikePattern` を `helpers.ts` から import
  - 既存 `findByOwnerAndSlug` の直下に `searchByTitlePrefix` を追加:

    ```ts
    searchByTitlePrefix(
      ownerId: UserId,
      prefix: string,
      limit: number,
    ): Promise<readonly Note[]> {
      return mapDbError("Failed to search notes by title prefix", async () => {
        if (limit <= 0) return [];
        const trimmed = prefix.trim();
        if (trimmed.length === 0) return [];
        const pattern = `${escapeLikePattern(trimmed.toLowerCase())}%`;
        const rows = await this.db
          .select()
          .from(notes)
          .where(
            and(
              eq(notes.ownerId, ownerId),
              eq(notes.status, "active"),
              sql`lower(${notes.title}) LIKE ${pattern} ESCAPE '\\'`,
            ),
          )
          .orderBy(asc(notes.title), asc(notes.id))
          .limit(limit);
        return this.hydrateMany(rows);
      });
    }
    ```

- **理由:** `notes.title` には normalize カラムが無いため `lower(title)` の関数式 LIKE で case-insensitive 化（ADR-004）。`ESCAPE '\\'` 句で `%`/`_`/`\` のリテラル一致を担保（ADR-006）。`status = 'active'` で trashed 除外。`hydrateMany` は子テーブル ×3 を `IN` で引くが limit ≤ 20 なので問題なし。

### 6. D1 adapter 実装（tagRepository）

- **対象ファイル:** `app/core/adapters/d1/repositories/tagRepository.ts`
- **変更内容:** 既存 `findByOwner` の直下に `searchByNamePrefix` を追加。

  ```ts
  searchByNamePrefix(
    ownerId: UserId,
    prefix: string,
    limit: number,
  ): Promise<readonly Tag[]> {
    return mapDbError("Failed to search tags by name prefix", async () => {
      if (limit <= 0) return [];
      const trimmed = prefix.trim();
      if (trimmed.length === 0) return [];
      const pattern = `${escapeLikePattern(trimmed.toLowerCase())}%`;
      const rows = await this.db
        .select()
        .from(tags)
        .where(
          and(
            eq(tags.ownerId, ownerId),
            sql`${tags.nameNormalized} LIKE ${pattern} ESCAPE '\\'`,
          ),
        )
        .orderBy(asc(tags.nameNormalized), asc(tags.id))
        .limit(limit);
      return rows.map((row) => this.toTag(row));
    });
  }
  ```

- **理由:** 既存 `uniq_tags_owner_name_normalized` index が prefix LIKE の B-tree range scan として効く。新規 index 不要。raw `sql` + `ESCAPE '\\'` 句で `escapeLikePattern` の出力を正しく機能させる（ADR-006）。

### 7. Application 層 usecase 新設

- **対象ファイル（新規）:** `app/core/application/note/searchInternalLinkTargets.ts`
- **変更内容:**

  ```ts
  import type { UserId } from "@/core/domain/identity/valueObject";
  import type { ServiceArgs } from "../types";

  /**
   * Discriminated-union read model for the WYSIWYG internal-link suggest
   * popup. Notes and tags are unioned and capped server-side so the UI
   * can render the list without further filtering.
   */
  export type InternalLinkSuggestion =
    | Readonly<{
        kind: "note";
        noteId: string;
        title: string;
        slug: string;
      }>
    | Readonly<{
        kind: "tag";
        tagId: string;
        name: string;
      }>;

  export type SearchInternalLinkTargetsInput = Readonly<{
    actorUserId: UserId;
    query: string;
    limit?: number;
  }>;

  export type SearchInternalLinkTargetsOutput = Readonly<{
    suggestions: readonly InternalLinkSuggestion[];
  }>;

  const DEFAULT_LIMIT = 8;
  const MAX_LIMIT = 20;

  function clampLimit(value: number | undefined): number {
    if (value === undefined || !Number.isInteger(value) || value <= 0) {
      return DEFAULT_LIMIT;
    }
    return Math.min(value, MAX_LIMIT);
  }

  export async function searchInternalLinkTargets({
    container,
    input,
  }: ServiceArgs<SearchInternalLinkTargetsInput>): Promise<SearchInternalLinkTargetsOutput> {
    const limit = clampLimit(input.limit);
    const trimmed = input.query.trim();
    if (trimmed.length === 0) return { suggestions: [] };

    const { notes, tags } = await container.unitOfWorkProvider.run(
      async (ctx) => {
        const [notesResult, tagsResult] = await Promise.all([
          ctx.noteRepository.searchByTitlePrefix(input.actorUserId, trimmed, limit),
          ctx.tagRepository.searchByNamePrefix(input.actorUserId, trimmed, limit),
        ]);
        return { notes: notesResult, tags: tagsResult };
      },
    );

    const suggestions: InternalLinkSuggestion[] = [];
    for (const note of notes) {
      if (suggestions.length >= limit) break;
      // NoteTitle が `[` / `]` / `|` を許容している一方、
      // INTERNAL_LINK_PATTERN はこれらを境界文字として使うため、
      // 含まれる title は候補から除外する（破綻リンク防止、ADR-008）
      if (/[\[\]|]/.test(note.title)) continue;
      // Branded string types (e.g. NoteId extends string) — direct
      // string assignment is sufficient, no `as unknown as` needed.
      suggestions.push({
        kind: "note",
        noteId: note.id,
        title: note.title,
        slug: note.slug,
      });
    }
    for (const tag of tags) {
      if (suggestions.length >= limit) break;
      suggestions.push({
        kind: "tag",
        tagId: tag.id,
        name: tag.name,
      });
    }
    return { suggestions };
  }
  ```

  ※ `TagName` VO は whitespace を禁止しているため、`#${tag.name}` 形式で挿入後の `HASHTAG_PATTERN` 終端マッチは `name` + 後置スペースで必ず成立する。

- **理由:** `ownerId = actorUserId` で visibility 制約を port シグネチャレベルで強制。ノート優先・タグ後置の **deterministic** な順序で integration test を固める（ADR-002）。

### 8. Server fn 公開

- **対象ファイル:** `app/components/note/schema.ts`（追記）, `app/components/note/actions.ts`（追記）
- **変更内容（schema.ts）:**

  ```ts
  // NOTE_TITLE_MAX_LENGTH (200) と揃え、ノートタイトルそのものを
  // 入力しても shape バリデーションで弾かれないようにする。
  export const searchInternalLinkTargetsSchema = z.object({
    query: z.string().trim().min(1).max(200),
    limit: z.coerce.number().int().min(1).max(20).optional(),
  });
  ```

- **変更内容（actions.ts）:**

  ```ts
  export const searchInternalLinkTargetsFn = createServerFn({ method: "POST" })
    .middleware([errorResponseMiddleware])
    .inputValidator(validateInput(searchInternalLinkTargetsSchema))
    .handler(async ({ data }) => {
      const user = await requireCurrentUser();
      const { container, module } = await loadServerDeps(
        () => import("@/core/application/note/searchInternalLinkTargets"),
      );
      const result = await module.searchInternalLinkTargets({
        container,
        input: {
          actorUserId: user.id,
          query: data.query,
          ...(data.limit === undefined ? {} : { limit: data.limit }),
        },
      });
      return { suggestions: result.suggestions };
    });
  ```

- **理由:** 既存全 server fn と同じ pattern。`query.min(1)` で空クエリを transport 層で即弾く。`limit.max(20)` で DoS 抑止。`requireCurrentUser` で未認証は 401。

### 9. Pure helpers の切り出し

- **対象ファイル（新規）:** `app/components/note/editor/internalLinkSuggest.ts`
- **変更内容:**

  ```ts
  import type { InternalLinkSuggestion } from "@/core/application/note/searchInternalLinkTargets";

  /**
   * `[[` is the literal text that the user types to invoke the
   * internal-link suggest popup. Kept here as a single source of truth
   * shared between the TipTap Suggestion trigger config and any test
   * fixtures.
   */
  export const INTERNAL_LINK_TRIGGER = "[[";

  /**
   * Format a selected suggestion into the literal text that gets inserted
   * into the document. Server-side `INTERNAL_LINK_PATTERN` (note) and
   * `HASHTAG_PATTERN` (tag) re-parse this text on save, so this function
   * is the single source of truth for the wire shape produced by the popup.
   *
   * Pure — no editor / DOM dependency — so the format contract is
   * unit-testable without TipTap.
   */
  export function formatInternalLinkInsertion(
    suggestion: InternalLinkSuggestion,
  ): string {
    switch (suggestion.kind) {
      case "note":
        return `[[${suggestion.title}]]`;
      case "tag":
        return `#${suggestion.name}`;
    }
  }

  /** Wraps around at both ends so the popup never gets stuck. */
  export function nextSuggestionIndex(
    current: number,
    direction: "up" | "down",
    total: number,
  ): number {
    if (total <= 0) return 0;
    const delta = direction === "down" ? 1 : -1;
    return ((current + delta) % total + total) % total;
  }

  /** Stable React key — `kind` prefix prevents collisions when a note
   * title equals a tag name. */
  export function suggestionKey(suggestion: InternalLinkSuggestion): string {
    return suggestion.kind === "note"
      ? `note:${suggestion.noteId}`
      : `tag:${suggestion.tagId}`;
  }
  ```

- **理由:** TipTap / DOM 抜きで pure ロジックを vitest で固定 → 失敗時の原因切り分けが容易。

### 10. ポップアップコンポーネント（React、presentational）

- **対象ファイル（新規）:** `app/components/note/editor/InternalLinkSuggestPopup.tsx`
- **変更内容:** stateless な presentational コンポーネント。`items` / `selectedIndex` / `position` を全部 props で受け取り、Suggestion プラグイン側が状態所有。

  ```tsx
  "use client";
  import type { InternalLinkSuggestion } from "@/core/application/note/searchInternalLinkTargets";
  import { suggestionKey } from "./internalLinkSuggest";

  export type InternalLinkSuggestPopupProps = Readonly<{
    items: readonly InternalLinkSuggestion[];
    selectedIndex: number;
    onSelect: (item: InternalLinkSuggestion) => void;
    onHover: (index: number) => void;
    position: Readonly<{ left: number; top: number }>;
  }>;

  export function InternalLinkSuggestPopup({
    items,
    selectedIndex,
    onSelect,
    onHover,
    position,
  }: InternalLinkSuggestPopupProps) {
    return (
      <div
        className="internal-link-suggest-popup"
        role="listbox"
        aria-label="内部リンク候補"
        style={{ position: "absolute", left: position.left, top: position.top }}
      >
        {items.length === 0 ? (
          <div className="suggest-empty">候補なし</div>
        ) : (
          items.map((item, idx) => (
            <button
              key={suggestionKey(item)}
              type="button"
              role="option"
              aria-selected={idx === selectedIndex}
              className={`suggest-row${idx === selectedIndex ? " active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(item);
              }}
              onMouseEnter={() => onHover(idx)}
            >
              {item.kind === "note" ? (
                <>
                  <span className="suggest-icon">N</span>
                  <span className="suggest-title">{item.title}</span>
                </>
              ) : (
                <>
                  <span className="suggest-icon">#</span>
                  <span className="suggest-title">{item.name}</span>
                </>
              )}
            </button>
          ))
        )}
      </div>
    );
  }
  ```

- **理由:** `onMouseDown + preventDefault` で「クリック前にエディタが blur して候補が消える」既知の罠を回避（ADR-003）。aria 属性付きで a11y 担保。

### 11. TipTap 拡張ビルダー（Mention + Suggestion）

- **対象ファイル（新規）:** `app/components/note/editor/internalLinkExtension.ts`
- **変更内容:**

  ```ts
  import Mention from "@tiptap/extension-mention";
  import type { SuggestionOptions } from "@tiptap/suggestion";
  import type { InternalLinkSuggestion } from "@/core/application/note/searchInternalLinkTargets";
  import { formatInternalLinkInsertion } from "./internalLinkSuggest";

  /**
   * Mention extension wired to the `[[` suggestion trigger.
   *
   * The extension is configured to insert plain text (`[[note-title]]`
   * or `#tagname`) via `command` rather than a Mention node, so
   * server-side `INTERNAL_LINK_PATTERN` / `HASHTAG_PATTERN` keep
   * working unchanged and HtmlSanitizer doesn't need a new allow-list
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
          const insertion = formatInternalLinkInsertion(
            props as InternalLinkSuggestion,
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
  ```

  ※ `@tiptap/suggestion` v3.23.4 の `findSuggestionMatch` は `escapeForRegEx(char)` 経由で多文字 trigger に対応している（regex で `\[\[` がリテラル一致、`slice(2)` で query を抽出）。万一動作しない場合のフォールバックは `char: "["` + `allow` callback で「直前文字も `[`」判定（v3 の `SuggestionOptions.allow({ state, range }) => boolean`）。

- **理由:** Suggestion 側の `items` / `render` だけを外部注入できるよう関数化し、`WysiwygEditor.tsx` を単純な呼び出しで済むようにする。`command` で plain text 挿入することで Mention ノード化を回避。

### 12. WysiwygEditor への組み込み

- **対象ファイル:** `app/components/note/editor/WysiwygEditor.tsx`
- **変更内容:**
  - 追加 import: `useServerFn`, `ReactRenderer`, `useMemo`, `searchInternalLinkTargetsFn`, `InternalLinkSuggestion` 型, `buildInternalLinkMention`, `InternalLinkSuggestPopup`, `nextSuggestionIndex`
  - **重要(P-004対応):** `searchSuggestions` の参照同一性を `useRef` で安定化させ、`useMemo` 依存配列を **空配列** にして `extensions` 配列の参照を初回のみ生成する。これにより `useEditor` が extensions の同一性に依存しても editor 再生成が起きない。
  - `useEditor` の手前で suggestion glue を組み立てる:

    ```tsx
    const searchSuggestions = useServerFn(searchInternalLinkTargetsFn);
    const searchSuggestionsRef = useRef(searchSuggestions);
    useEffect(() => {
      searchSuggestionsRef.current = searchSuggestions;
    }, [searchSuggestions]);

    // 100ms debounce + AbortController で in-flight request をキャンセル
    // し、タイピング由来の高頻度呼び出しを抑制する。
    const suggestionGlue = useMemo(() => {
      let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
      let pendingAbort: AbortController | null = null;
      return {
        items: ({ query }: { query: string }) =>
          new Promise<InternalLinkSuggestion[]>((resolve) => {
            if (pendingTimeout !== null) clearTimeout(pendingTimeout);
            if (pendingAbort !== null) pendingAbort.abort();
            const trimmed = query.trim();
            if (trimmed.length === 0) {
              resolve([]);
              return;
            }
            const ctrl = new AbortController();
            pendingAbort = ctrl;
            pendingTimeout = setTimeout(async () => {
              try {
                const { suggestions } = await searchSuggestionsRef.current({
                  data: { query: trimmed, limit: 8 },
                  signal: ctrl.signal,
                });
                if (!ctrl.signal.aborted) {
                  resolve(suggestions as InternalLinkSuggestion[]);
                }
              } catch {
                if (!ctrl.signal.aborted) resolve([]);
              }
            }, 100);
          }),
      render: () => {
        let renderer: ReactRenderer | null = null;
        let selectedIndex = 0;
        let items: readonly InternalLinkSuggestion[] = [];
        let clientRect: (() => DOMRect | null) | null = null;
        let commandRef: ((item: InternalLinkSuggestion) => void) | null = null;
        const computePos = () => {
          const rect = clientRect?.() ?? null;
          if (rect === null) return { left: 0, top: 0 };
          return { left: rect.left, top: rect.bottom + 4 };
        };
        const buildProps = () => ({
          items,
          selectedIndex,
          onSelect: (item: InternalLinkSuggestion) => commandRef?.(item),
          onHover: (idx: number) => {
            selectedIndex = idx;
            renderer?.updateProps(buildProps());
          },
          position: computePos(),
        });
        return {
          onStart: (props) => {
            items = props.items;
            selectedIndex = 0;
            clientRect = props.clientRect;
            commandRef = props.command;
            renderer = new ReactRenderer(InternalLinkSuggestPopup, {
              props: buildProps(),
              editor: props.editor,
            });
            document.body.appendChild(renderer.element);
          },
          onUpdate: (props) => {
            items = props.items;
            clientRect = props.clientRect;
            commandRef = props.command;
            if (selectedIndex >= items.length) selectedIndex = 0;
            renderer?.updateProps(buildProps());
          },
          onKeyDown: ({ event }) => {
            if (event.key === "ArrowDown") {
              selectedIndex = nextSuggestionIndex(selectedIndex, "down", items.length);
              renderer?.updateProps(buildProps());
              return true;
            }
            if (event.key === "ArrowUp") {
              selectedIndex = nextSuggestionIndex(selectedIndex, "up", items.length);
              renderer?.updateProps(buildProps());
              return true;
            }
            if (event.key === "Enter") {
              const item = items[selectedIndex];
              if (item !== undefined) commandRef?.(item);
              return true;
            }
            if (event.key === "Escape") {
              renderer?.element.remove();
              renderer?.destroy();
              renderer = null;
              return true;
            }
            return false;
          },
          onExit: () => {
            renderer?.element.remove();
            renderer?.destroy();
            renderer = null;
          },
        };
      },
    };
    }, []); // 空配列で初回のみ生成。最新の searchSuggestions は ref 経由で読む。
    ```

  - `extensions` 配列の末尾に `buildInternalLinkMention(suggestionGlue)` を追加
  - **検証:** 実機（pnpm dev）で `[[` 補完使用時にエディタが unmount/remount されないこと、`lastEmittedHtmlRef` が保持されること（autosave に取りこぼし無し）をマニュアルテスト時に確認する。

- **理由:** Mention ノードは挿入されず、`command` で直接テキストが入る → 既存 autosave (`getHTML()`) 経路もそのまま動く（`lastEmittedHtmlRef` ガードはテキスト編集を自然に拾う）。`searchSuggestions` を ref に逃がすことで extensions 配列の参照が初回固定され、editor 再生成リスク（P-004）を回避。Suggestion 状態はクロージャに閉じ、props 経由で React 側にだけ流す。100ms debounce + AbortController で D1 LIKE クエリの高頻度発火を抑制。

### 13. NoteEditor のコメント更新

- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`
- **変更内容:** Issue #9 由来の "follow-up Issue" コメントを除去（該当行は調査で確認、`Cross-note / tag suggest for internal links (Issue #9 ADR-002 ...)` という文言の周辺）
- **理由:** 本 Issue 完了で「未実装」記述が嘘になる。

### 14. テスト

#### 14-a. Pure helpers ユニットテスト

- **対象ファイル（新規）:** `app/components/note/editor/__tests__/internalLinkSuggest.test.ts`
- **変更内容:**
  - `formatInternalLinkInsertion`: note → `[[title]]`, tag → `#name`, 空白を含むタイトル
  - `nextSuggestionIndex`: 末尾→先頭ラップ、先頭→末尾ラップ、空リストで 0
  - `suggestionKey`: 同じラベルの note と tag で異なる key
  - **regression(P-003対応):** `formatInternalLinkInsertion` の note 出力を `INTERNAL_LINK_PATTERN` で再抽出して target が title と一致すること、tag 出力を `HASHTAG_PATTERN` で再抽出して name と一致することを確認

#### 14-b. Usecase integration テスト

- **対象ファイル（新規）:** `app/core/application/note/__tests__/searchInternalLinkTargets.integration.test.ts`
- **シナリオ:**
  1. 自分の note title 前方一致でヒット
  2. 他オーナーの note は除外
  3. trashed note は除外
  4. 自分の tag name 前方一致でヒット
  5. 他オーナーの tag は除外
  6. 空 query で空配列
  7. limit を超えるとき note 優先で truncate
  8. **NoteTitle に `[` / `]` / `|` を含むノートは候補から除外される（ADR-008）**

#### 14-c. Adapter integration テスト

- **対象ファイル（既存に追記）:** `app/core/adapters/d1/__tests__/noteRepository.integration.test.ts`, `app/core/adapters/d1/__tests__/tagRepository.integration.test.ts`（無ければ新規）
- **シナリオ:** owner 隔離、case-insensitive prefix、`%` / `_` リテラル escape（`ESCAPE '\\'` 句が機能していること）、trashed 除外、`limit <= 0` で `[]`
- **既存テスト破壊チェック:** `tagRepository.findByOwner` の SQL 変更（ESCAPE 追加）後も既存 integration test が緑であることを確認

#### 14-d. ポップアップ DOM テスト

- **対象ファイル（新規）:** `app/components/note/editor/__tests__/internalLinkSuggestPopup.test.tsx`
- **vitest-environment:** `happy-dom`
- **シナリオ:** items 0 件で `候補なし`、`role="option"` 要素数、`aria-selected` の付与、`onMouseDown` で `onSelect` 発火

#### 14-e. マニュアルテスト

`.issue/36/testing.md` に詳細を記述（Step 7 参照）。WYSIWYG + Suggestion の happy-dom 統合テストはコスト過大のためマニュアルでカバー。

## 設計判断

詳細は `.issue/36/adr.md` を参照。要約:

- **ADR-001:** Mention ノードを保持せず、`command` で `[[title]]` / `#name` のプレーンテキストを挿入する。サニタイザ allow-list 拡張・round-trip 不整合・パイプライン二重化を回避。
- **ADR-002:** タグ候補は `#tagname` 形式で挿入する（`[[tagname]]` ではなく）— 既存 `TagService.extractFromHtml` の `HASHTAG_PATTERN` と整合させ、誤った internal link 抽出を避ける。
- **ADR-003:** ポップアップ実装は `ReactRenderer` + `document.body.appendChild` の最小構成。tippy.js は追加依存にしない。
- **ADR-004:** `notes.title` には normalize カラムが無いため `lower(title)` 関数式 LIKE で対処。新規 index は本 Issue では追加しない（YAGNI、実測でレイテンシ問題が出てから別 Issue）。
- **ADR-005:** Suggestion 結果順序は note 優先・tag 後置の deterministic order。integration test の安定性 + ユーザーメンタルモデル整合。
- **ADR-006:** D1 LIKE クエリは `sql\`... LIKE ${pat} ESCAPE '\\'\`` の raw SQL で書く（drizzle の `like()` ヘルパは ESCAPE 句を発行しないため、`escapeLikePattern` の出力が SQLite で機能しない既知のギャップを本 Issue では正しく対処する）。
- **ADR-007:** `escapeLikePattern` を `app/core/adapters/d1/repositories/helpers.ts` に集約する小コミットを本 Issue 内で実施（plan 元案の「別 Issue で対応」を取り下げ、コスト極小なので本 Issue 範囲に取り込む）。
- **ADR-008:** NoteTitle が `[`/`]`/`|` を許容するが、`INTERNAL_LINK_PATTERN` がこれらを境界文字として使うため、これらを含む title を持つノートは `searchInternalLinkTargets` の候補から除外する（破綻リンクを未然に防止）。

## リスクと注意点

- **`@tiptap/suggestion` の `char` 多文字対応**: v3.23.x のソースで多文字 `[[` サポートを実装着手時に確認する。万一 1 文字制約があれば `char: "["` + `allow` コールバックで「直前文字も `[`」判定にフォールバック（Suggestion plugin の公式 `allow` フックを利用）。
- **TipTap v3 拡張のサーバー漏洩**: `WysiwygEditor.tsx` / 新規 `internalLinkExtension.ts` / `InternalLinkSuggestPopup.tsx` は必ず `"use client"`。`pnpm build` 後 `grep -RE "tiptap|prosemirror" dist/worker/` が 0 件であることを確認。
- **`escapeLikePattern` の重複**: 当面は `noteRepository.ts` 内にローカルコピー（4 行）。`helpers.ts` への切り出しはスコープ拡大回避のため別 Issue。
- **autosave との競合**: ポップアップが開いた状態でも `[[hel` のテキストは `state.contentHtml` に反映され autosave が走る。これは仕様通り。Esc でキャンセルしたら `[[hel` だけが残るが、ユーザーが消すまで残るのは既存の手打ち入力と同じ挙動。
- **大文字小文字（日本語）**: SQLite の LIKE は ASCII のみ大小区別あり。`lower(title)` で ASCII を吸収するが、日本語タイトルは元から大小区別が無い。実用上問題なし。
- **TipTap Mention v3 の型シグネチャ**: `SuggestionOptions<T>` のジェネリクスや `command` の `props` 型が v2 と異なる可能性。実装時にコンパイルエラーが出たら都度 v3.23.4 系の型定義に合わせる。
- **D1 LIKE のフルスキャン懸念**: owner + status の既存 filter で大半のヒットを絞れる前提。所有ノート数が 10,000 を超えるユーザーで遅延が見えたら、別 Issue で `(owner_id, title)` index 追加 or `title_normalized` カラム追加を検討。
- **「3 文字以下 1 件もヒットしない」UX**: 候補がない時は「候補なし」と表示するので無音にならない。クライアントは `query.length === 0` で API call 自体をスキップ。

## テスト方針

`.issue/36/testing.md` に詳細を記述。主要観点:

- ユニット: pure helpers の境界値
- Integration: usecase の owner 隔離・trashed 除外・並び順、adapter の LIKE escape
- DOM: ポップアップの a11y 属性と `onMouseDown` 罠の回帰防止
- マニュアル: WYSIWYG モードでの `[[` トリガ起動、↑↓Enter/Esc 操作、保存後のバックリンク抽出整合、他ユーザーの候補非表示

## レビュー反映

### 修正した点

- **[P-001 / feasibility]** D1 LIKE クエリの ESCAPE 句欠落 → adapter 実装を raw `sql\`... LIKE ${pat} ESCAPE '\\'\`` に変更し、`escapeLikePattern` の出力が SQLite で正しく機能するようにした。ADR-006 を追加。既存 `tagRepository.findByOwner` の同じ穴も本 Issue で同時修正（Step 4 に前段リファクタとして追加）。
- **[P-002 / requirements]** NoteTitle が `[` / `]` / `|` を許容する点 → usecase 内で該当文字を含む title のノートを候補から除外（ADR-008）。Step 7 の usecase 実装に filter ロジック追加、テスト 14-b にシナリオ 8 追加。
- **[P-003 / feasibility]** `as unknown as string` 二重キャスト → branded string types は素のまま `string` 型変数に代入可能。プレーン assignment に修正、コメント追加。
- **[P-004 / feasibility]** `useMemo` 依存と editor 再生成リスク → `searchSuggestions` を `useRef` に逃がし、`suggestionGlue` の `useMemo` 依存を空配列に変更。実機検証ステップを Step 12 に明記。
- **[P-002 / feasibility]** trivial read を UoW でラップしている件 → 既存 `listNotesByOwner.ts` が UoW でラップしているのを実機確認、本プロジェクト慣習と判断。維持。

### 取り込んだ改善提案

- **[S-003 / feasibility]** クライアント側 100ms debounce + AbortController で in-flight cancel を追加（Step 12）。
- **[S-004 / feasibility]** `escapeLikePattern` を `helpers.ts` に集約する前段リファクタを本 Issue 内で実施（Step 4、ADR-007）。極小コストかつ「LIKE escape の単一の真実の源」を担保。
- **[S-005 / feasibility]** `searchInternalLinkTargetsSchema.query.max(200)` に変更し `NOTE_TITLE_MAX_LENGTH` と揃えた（Step 8）。
- **[S-006 / feasibility]** P-001 採用に伴いテスト 14-c で `%` / `_` リテラル escape を明示的に検証。
- **[S-007 / feasibility]** `INTERNAL_LINK_TRIGGER` 定数を `internalLinkSuggest.ts` に export し、`buildInternalLinkMention` から参照（Step 9, 11）。
- **[S-001 / requirements]** ADR-001 と Issue #9 ADR-002 の差異について、PR description で 1 行触れる方針を明示（PR テンプレ部分は実装フェーズで対応）。
- **[S-002 / requirements]** HTML モードでは Suggest が起動しないことを testing.md の確認項目に追加（次ステップで testing.md 作成時に反映）。
- **[S-001 / feasibility]** `char: "[["` 多文字 trigger 対応の根拠と fallback を Step 11 末尾に追記（ADR には格上げせず実装ノートとして残す）。

### 見送った提案とその理由

- **[P-001 / requirements]** タグ出力 `#tagname` が Issue 本文との解釈ギャップを生む件 → ADR-002 で既に十分に根拠を文書化しており、解釈ギャップは技術的に正しい判断のトレードオフ。PR description で再度触れる方針。Issue へのコメント事前確認は時間コストが見合わないため、PR レビューでフィードバックがあれば対応。
- **[P-003 / requirements]** TagName VO 制約と HASHTAG_PATTERN 整合性 → 調査の結果 `TagName.create` が whitespace を禁止しており、`HASHTAG_PATTERN` の終端マッチに必要な「whitespace で終端」の前提が VO レベルで成立。`<`/`>`/`"`/`'`/`` ` `` を許容する余地はあるが、これらは sanitizer 経路で実用上ノート本文に含まれない（TipTap の Link/Image 等を経由しない限り、user-typed text として hit する確率は極めて低い）。リスクとして「リスクと注意点」セクションに追加するに留める。
- **[S-002 / feasibility]** `aria-activedescendant` 等の完全 a11y → 本 Issue スコープ外。最低限の `role="listbox"` / `aria-selected` で割り切り、完全対応は別 Issue で評価。
- **[S-003 / requirements]** `query.min(2)` への引き上げ → `[[a` で候補が出ない UX 劣化を避け、`min(1)` のまま維持。debounce + AbortController（S-003/feasibility）でリクエスト頻度の問題は緩和される。

## 参考: エージェント比較

| 観点 | エージェント1 (アーキ) | エージェント2 (保守性) | エージェント3 (シンプル) |
|------|----------------------|----------------------|------------------------|
| ベース採用 | 部分 (port 名・adapter 構造) | **○ (主体)** | 部分 (タグ出力非統一の指摘) |
| 取り込んだ点 | port 命名 `searchByTitlePrefix` / `searchByNamePrefix`、`searchOwnNotes` との分離方針、サーバー漏洩検証手順 | **pure helpers 分離、`#tagname` 採用、Mention ノード化回避、ReactRenderer、stateless popup、deterministic 順序** | YAGNI 重視（D1 index 追加見送り、`@tiptap/suggestion` のみ案は不採用＝Mention 拡張 host のほうが API 安定） |
| 主な相違 | Mention ノード `renderHTML` 利用案 → 不採用 (D1 round-trip リスク) | tippy.js 不使用案 → 採用 | `@tiptap/suggestion` 単独案 → Mention 拡張 host のほうがコミュニティ API として安定なので Agent 2 寄りに |
