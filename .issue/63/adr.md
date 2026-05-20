# ADR — Issue #63: FilterBar に内部リンク参照フィルタの note picker UI を追加

## ADR-001: candidate fetch 戦略はインクリメンタル autocomplete を採用

### Status
Proposed

### Context

候補ノートの fetch 戦略として 3 案あった:

1. **page-by-page 検索**: ノート一覧と同じページング検索を modal 内に埋め込む。
2. **インクリメンタル autocomplete**: 入力中に debounce + abort で逐次検索。
3. **直近 N 件プレリスト**: modal を開いた瞬間に直近ノートを N 件先読み。

(1) は SSR ラウンドトリップが画面遷移を伴うため modal UX に重い。(3) は既存 `searchInternalLinkTargets` usecase が空クエリで `[]` を即返す仕様と非互換で、application 層に新 port / usecase を増やす必要があり YAGNI 違反。

### Decision

**(2) インクリメンタル autocomplete を採用。** debounce は 100ms（既存 WYSIWYG `[[` 補完と同値）、`AbortController` で single-flight。既存 `searchInternalLinkTargetsFn` をそのまま再利用。

### Consequences
- 良い点: 既存サーバー関数 / usecase / port を一切いじらず追加コスト 0。`[[` 補完と挙動が一貫し学習コストゼロ。
- トレードオフ: 直近ノートをデフォルト表示できない（空クエリは hint 文言のみ）。ユーザーが何も入力していない時に「最近使ったノート」が出ないが、Issue のスコープ案にも明示されておらず受容。

---

## ADR-002: 検索クエリはタイトル前方一致のみ

### Status
Proposed

### Context

検索クエリ仕様の選択肢:

1. **タイトル前方一致**: 既存 `searchByTitlePrefix`（`lower(title) LIKE 'q%'`、index 利用）。
2. **全文検索**: 既存 `searchOwnNotes` などの検索インデックス経由。

(2) は新規 server-fn / usecase が必要、レイテンシ・コスト共に高い、ページング前提で picker UX に不適。

### Decision

**(1) タイトル前方一致のみを採用。** WYSIWYG `[[` 補完と同じ挙動で学習コストゼロ、D1 LIKE prefix は indexed-friendly。

### Consequences
- 良い点: 追加 DB 負荷 0、UX 一貫、実装ゼロコスト。
- トレードオフ: タイトルの先頭ではなく中間や本文に当該語があるノートは picker から探せない。代替経路（P11 / URL 直叩き / SavedView）が残るため受容。

---

## ADR-003: tag 種別の混入はクライアント側でフィルタ

### Status
Proposed

### Context

`searchInternalLinkTargetsFn` は `{ suggestions: (NoteSuggestion | TagSuggestion)[] }` を返す（WYSIWYG `[[` 補完が note + tag を同じ popup で扱うため）。picker では tag を選ばせたくない。

選択肢:

1. **クライアント側 filter**: 結果から `kind === "note"` のみ抽出。
2. **専用 server-fn を新設**: `searchOwnNotesByTitlePrefixFn` のような note 限定 API を別ファイルに切る。

### Decision

**(1) クライアント側 filter を採用。** `searchInternalLinkTargetsFn` の結果を `suggestions.filter(s => s.kind === "note")` で抽出。

### Consequences
- 良い点: 新規 server-fn / usecase / schema / テストを増やさず本 Issue のスコープに収まる。
- トレードオフ: server 側の `limit=20` に tag が混ざるため、tag が候補を占有すると note 表示数が <20 になるケースあり。
- **量的な希少性根拠:** `searchInternalLinkTargets` は note + tag を別クエリで実行し、両方からマージして上位 20 件を返す（usecase 実装参照）。tag が note を完全に圧倒するには「同じ前方一致で **タグ名 ≥ 20 件かつ note タイトル 0 件**」という条件が必要。実利用上は稀（タグはノート本数より圧倒的に少なく、命名が短い）。MVP 規模では UX 上問題なし。
- **緩和策:** picker の 0 件文言を「該当するノートが見つかりません。タイトルの先頭の文字を変えて検索してください」に揃え、tag 占有による誤検知も「先頭文字を変える」案内で吸収する。専用 server-fn 化は picker 利用が増えて顕在化した場合に別 Issue で対応する。

---

## ADR-004: 候補件数は最大 20、ページングは不採用

### Status
Proposed

### Context

候補件数の方針:

- 既存 `searchInternalLinkTargetsSchema` は `limit.max(20)`、application 層は `MAX_LIMIT=20`。
- picker でページング表示するかどうか。

### Decision

**limit=20 で打ち切り、ページングは実装しない。** 表示は「{n} 件」（件数のみ）の控えめなテキスト。空クエリ時は hint 文言、0 件時は専用文言。

### Consequences
- 良い点: 実装シンプル、`[[` 補完と同じ運用想定（候補が多ければ絞り込みクエリを足す UX）。
- トレードオフ: 21 件目以降は picker から拾えない。前方一致を絞ればよいだけなので受容。

---

## ADR-005: アクセシビリティは WAI-ARIA 1.2 combobox + listbox パターンで実装

### Status
Proposed

### Context

picker のキーボード操作 / SR 読み上げを破綻させないため、明確なパターンに従う必要がある。

### Decision

以下の組み合わせで実装する:

- 外枠は既存 `Dialog`（`role="dialog"` / `aria-modal="true"` / focus trap / Esc / body scroll lock を保証）。
- 入力は `<input role="combobox" aria-controls={listboxId} aria-expanded aria-autocomplete="list" aria-activedescendant={selectedOptionId} aria-busy={loading}>`。
- リストは `<ul role="listbox" id={listboxId}>` + `<li role="option" id aria-selected>`。
- キー操作: ↑↓ で `nextSuggestionIndex`（**`@/components/note/editor/internalLinkSuggest` から横断 import して再利用** — `list/` から `editor/` への越境 import は既存前例こそ薄いが、純関数 1 つの再利用なので import の方が hoist より変更面が小さい）、Enter で commit、Esc は Dialog が消費。
- **listbox の出し分け**: `status === "idle"` のときは listbox を render しない（`aria-controls` と `aria-activedescendant` も渡さない）。0 件のときは listbox を render せず、専用の `<p aria-live="polite">` で空状態文言を出す（listbox 内に option 以外を入れない WAI-ARIA 仕様準拠）。
- **listbox / option の DOM 要素**: `<ul>` / `<li>` ではなく **`<div role="listbox">` / `<button role="option">`** を採用する。Biome の `lint/a11y/noNoninteractiveElementToInteractiveRole` ルールが `<ul>` / `<li>` への interactive role を拒否するため。既存 `InternalLinkSuggestPopup` も同じ理由で div + button パターンを採用しており、それに揃える（SR 上は role が SSOT なので意味的に等価）。
- **`event.isComposing` の取得経路**: React 19 の `SyntheticKeyboardEvent` には `isComposing` プロパティが直接生えていないため、`event.nativeEvent.isComposing` 経由で取得する。
- **option の commit ハンドラ**: `onMouseDown` で `preventDefault` + commit を一気に行う形を採用（`onClick` だと input が blur されてフォーカス遷移が走る前に Dialog が close する順序問題があるため）。
- **IME-safe Enter**: `event.isComposing === false` のときだけ commit（IME 確定 Enter で誤選択しない）。
- `aria-live="polite"` で件数 / loading / 結果状態を SR にアナウンス。
- option 行の click ハンドラは `onMouseDown={(e) => e.preventDefault()}` + `onClick` の組み合わせで focus 取り合いを防ぐ。

### Consequences
- 良い点: WYSIWYG `[[` 補完で既に確立済みのパターンを picker 用に転写するだけ。focus trap / Esc / IME 対策は既存 `Dialog` と editor の実装に倣えるため再発明不要。
- トレードオフ: option 行のクリックハンドラの blur 順序対策など細部は明示的に書く必要があり、コメント or テストで意図を保つ必要がある。

---

## ADR-007: テストでは `@tanstack/react-start` 全体をモックする

### Status
Accepted

### Context

`NotePickerDialog.test.tsx` は `useServerFn(searchInternalLinkTargetsFn)` の挙動を差し替える必要があるが、`searchInternalLinkTargetsFn` を読み込むと transitive に `createServerFn(...).middleware([errorResponseMiddleware])` の chain が top-level で走り、テスト環境では `createServerFn` / `createMiddleware` の実装が無いとモジュール load 段階でクラッシュする。

### Decision

`vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mockedFn, createServerFn: () => proxyChain, createMiddleware: () => proxyChain }))` で **`@tanstack/react-start` 全体を proxy-chain で stub する。** `useServerFn` 以外は「何を呼んでも自身を返す」no-op として扱う。

### Consequences
- 良い点: 1 ファイルで完結、test 用に server-fn を refactor する必要なし。
- トレードオフ: 前例が薄く、`@tanstack/react-start` の signature が将来変わると test がモジュール load 段階で落ちる。変更時は他 server-fn の test より先に typecheck で気付けるため、許容範囲と判断。

---

## ADR-006: chip タイトル解決は既存 SSR 経路に乗せる

### Status
Proposed

### Context

picker で選択した直後の chip 表示で、ノートタイトルをどう解決するか:

1. picker が選択時に title を伝搬して chip に直接渡す。
2. navigate 後の SSR で既存 `loadReferencingNoteTitle`（Issue #32 で実装済み）が title を resolve し、chip に流れる。

### Decision

**(2) を採用。** picker は noteId のみを navigate に渡す。chip は既存の resolver 経路で title を取得する。

### Consequences
- 良い点: title 伝搬経路を増やさない。Issue #32 で完成済みの動線を破壊しない。
- トレードオフ: navigate 後の最初のレンダリングで chip タイトルが「読み込み中」表示を経由する可能性。既存 P11 リンク経路も同じ挙動なので受容。
