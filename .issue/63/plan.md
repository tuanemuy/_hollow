# 実装計画 — Issue #63: FilterBar に内部リンク参照フィルタの note picker UI を追加

**Issue:** #63
**作成日:** 2026-05-20
**複雑度:** 中〜大規模

---

## 目的

P10 ノート一覧の FilterBar 上で、ユーザーが P11 経由 / URL 直接編集 / SavedView を持たなくても、UI からターゲットノートを選んで `referencingNoteId` フィルタを起動できるようにする。Issue #32 で意図的にスコープアウトされた「FilterBar 単独からの新規入力 UI（note picker）」を本 Issue で実装する。

## スコープ

### 含まれるもの

- FilterBar の「内部リンク参照」セクションに、`referencingNoteId` 未指定状態のときだけ表示される picker トリガーボタン
- クリックで開くモーダル Dialog 内の note picker（タイトル前方一致検索 + autocomplete + キーボード操作）
- 選択時の `?referencingNoteId=<id>&page=1` への navigate
- 候補なし / loading / エラー / 空クエリの状態表示
- アクセシビリティ（combobox + listbox role、aria-activedescendant、IME-safe Enter）
- 軽量 happy-dom テスト
- `.issue/63/testing.md` の動作確認計画

### 含まれないもの

- 新規 port / usecase / server function（既存 `searchInternalLinkTargetsFn` を再利用）
- 全文検索（タイトル前方一致のみ）
- 件数ページング（picker は 20 件で打ち切り）
- 直近 N 件プレリスト（空クエリでは即空表示）
- `searchInternalLinkTargets` usecase 自体の変更（tag 混在のクライアントフィルタ吸収）
- chip 表示・解除挙動の変更（Issue #32 完成済み）
- listSelectors / loadReferencingNoteTitle の変更
- `HomePage` / `NoteList` / `FilterBar` の Props シグネチャ変更（`referencingNoteTitle` 中継経路は無改修。title 解決は ADR-006 の通り既存 SSR 経路に乗せる）

## 実装ステップ

### 1. `NotePickerDialog` を新設

- **対象ファイル:** `app/components/note/list/NotePickerDialog.tsx`（新規）
- **変更内容:**
  - `"use client"` 宣言。
  - Props: `{ open: boolean; onClose: () => void; onSelect: (noteId: string) => void }`。`onSelect` は FilterBar 側で `useTransition` + `router.navigate` を担当する形で受ける（dialog 自身は navigate せず、選択結果だけ親に渡す）。
  - 内部 state:
    - `query: string`
    - `items: readonly NoteSuggestion[]`
    - `selectedIndex: number`
    - `status: "idle" | "loading" | "ready" | "error"`
    - `error: SerializedError | null`
  - `useServerFn(searchInternalLinkTargetsFn)` を `useRef` で安定参照化（既存 `WysiwygEditor.tsx` パターン）。
  - `useEffect([query])`:
    - `query.trim().length === 0` → status を `idle` に、items を `[]` に即リセット（fetch しない）。
    - それ以外: `setTimeout(100ms)` で fetch をスケジュール、`AbortController` で前回 fetch を abort（single-flight）。レスポンスは `suggestion.kind === "note"` のみ抽出。空 array なら `status = "ready"`、エラーなら `status = "error"` + `extractSerializedError`。`items` 更新時に `selectedIndex = 0` リセット。
    - cleanup で `clearTimeout` + `abortController.abort()`。
  - Layout（Dialog 内）:
    - `<input role="combobox" type="search" inputMode="search" aria-expanded={hasListbox} aria-autocomplete="list" aria-busy={status === "loading"} {...(hasListbox ? { "aria-controls": listboxId } : {})} {...(selectedOptionId ? { "aria-activedescendant": selectedOptionId } : {})} />`
    - hint / 件数領域: `aria-live="polite"` で status に応じた文言。
    - listbox は **`status !== "idle"` のときだけ render**（`idle` では `aria-controls` 自体を渡さない、`aria-expanded={false}`）。`ready` で `items.length === 0` のときは `<ul role="listbox">` を出して中に「該当なし」の `<li role="option" aria-disabled="true">` ではなく、listbox の隣に専用の `<p aria-live="polite">該当するノートが見つかりません</p>` を出す（listbox 内に option 以外を入れない）。
    - `<ul role="listbox" id={listboxId}>` 内に `<li role="option" id aria-selected onClick onMouseDown={(e) => e.preventDefault()}>`（focus 維持）。
  - キー操作:
    - `ArrowDown` / `ArrowUp` → `nextSuggestionIndex`（`@/components/note/editor/internalLinkSuggest` から import）で wrap-around、`preventDefault`。
    - `Enter` → `event.isComposing === false` のときだけ `onSelect(items[selectedIndex].noteId)`（IME 確定 Enter で誤 commit させない）。空リストなら no-op。
    - `Escape` → Dialog が自動処理（独自で `preventDefault` しない）。
  - 文言:
    - `idle`: `タイトルの先頭一致でノートを検索できます`
    - `loading`: `検索中…`
    - `ready` & `items.length === 0`: `該当するノートが見つかりません。タイトルの先頭の文字を変えて検索してください` （tag が 20 件を占有して note が 0 件になる病的ケースも同文言で吸収可能 — ADR-003 参照）
    - `error`: `displayError(error)` で表示
    - 件数: `ready` かつ `items.length > 0` のとき `{n} 件` を控えめに表示
- **理由:** Issue 要件を 1 コンポーネントに閉じ込めることで FilterBar の責務膨張を避ける。`Dialog` プリミティブ（focus trap / Esc / body scroll lock / portal / a11y）に任せ、内部は薄い combobox とする。状態を判別 union に正規化することで JSX 分岐を単純化し、テスト網羅性を高める。

### 2. FilterBar に picker トリガーを追加

- **対象ファイル:** `app/components/note/list/FilterBar.tsx`
- **変更内容:**
  - Props シグネチャは変更しない（`referencingNoteTitle` 中継経路は無改修、`HomePage` / `NoteList` 側も変更不要）。
  - `useState<boolean>(false)` で `pickerOpen` を保持。
  - 既存の `referencingNoteId !== undefined ? <chip /> : null` 分岐の `null` 枝を `<button>` トリガーに差し替え。
    - `<button type="button" className={pillBtn} aria-haspopup="dialog" aria-expanded={pickerOpen} onClick={() => setPickerOpen(true)} disabled={isPending}>ノートを選ぶ…</button>`
  - セクションラベル `内部リンク参照` は chip 経路と同じく常時表示（picker トリガーと chip でレイアウトが揺れない）。
  - 末尾に `<NotePickerDialog open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handlePick} />` を mount。
  - `handlePick(noteId: string)`: **modal close と navigate を同じ tick で同期実行する。**
    ```tsx
    const handlePick = (noteId: string) => {
      setPickerOpen(false);
      startTransition(() => {
        router.navigate({ to: "/", search: (prev) => ({ ...withDefaults(prev), referencingNoteId: noteId, page: 1 }) });
      });
    };
    ```
    `withDefaults` は **FilterBar 関数内部のローカルヘルパ**（既存）で、`handlePick` も FilterBar 内に置くので問題なく参照可能。`page: 1` リセットは他フィルタ操作と一貫。
  - `hasAnyFilter` の判定（`referencingNoteId !== undefined` を含む）は変更しない。picker トリガー単独表示状態では「全フィルタなし → クリアボタン非表示」が維持される（picker open は URL state でないため）。
- **理由:** chip と picker を同じ位置で排他表示することで「未指定 → 指定」の UI 上の連続性を保つ。SavedView の対象は URL に確定したフィルタだけなので、未確定 state（pickerOpen）が FilterBar に閉じているのは意味的にも整合。`setPickerOpen(false)` を `startTransition` の外で同期実行することで chip 化前にモーダルがカチカチ点滅するのを防ぐ。

### 3. 軽量テスト追加

- **対象ファイル:** `app/components/note/list/__tests__/NotePickerDialog.test.tsx`（新規、`@vitest-environment happy-dom`）
- **変更内容:** `vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mockedFn }))` で server-fn 経路を差し替え、`createRoot` + `act` パターン（既存 `internalLinkSuggestPopup.test.tsx` 踏襲）で:
  - 空クエリで server fn が呼ばれない
  - 入力 → 100ms debounce 後に 1 回だけ呼ばれる（fake timers）
  - 連打しても 1 回しか呼ばれない（single-flight 確認）
  - ↓↑ で `aria-selected` が遷移する
  - Enter で `onSelect(noteId)` が呼ばれる（テスト内で `onSelect` を `vi.fn()` として渡し、dialog 内で `router.navigate` が呼ばれないこと = ADR-006 の責務分離を pin）
  - IME 中（`isComposing: true`）の Enter では `onSelect` が呼ばれない
  - server fn reject で error 文言が表示される
  - tag 種別のサジェストが結果から除外される
- **理由:** debounce + AbortController + キー操作 + IME 制御は壊れやすい挙動が多い。実機テストで毎回確認するより、happy-dom で薄く pin する方が回帰検知が速い。`useServerFn` モックは既存テストに前例がないが、`@tanstack/react-start` 全体を vi.mock する方法は標準的で hoisting も問題ない（factory が `mockedFn` を closure 経由で参照する形）。

### 4. 動作確認計画

- **対象ファイル:** `.issue/63/testing.md`（新規）
- **変更内容:** ブラウザでの確認手順を記載。詳細は Phase 1 Step 7 で書く。

### 5. ADR

- **対象ファイル:** `.issue/63/adr.md`（新規）
- **変更内容:** 下記「設計判断」で挙げた判断を ADR 形式で記録。

## 設計判断

詳細は `.issue/63/adr.md` を参照。

- **ADR-001**: candidate fetch 戦略 = **インクリメンタル autocomplete**（debounce 100ms + AbortController）。既存 `searchInternalLinkTargetsFn` を再利用、新規 server-fn / usecase / port を一切作らない。
- **ADR-002**: 検索クエリ = **タイトル前方一致のみ**（既存 `searchByTitlePrefix`）。本文全文検索は採用しない（コスト・UX 一貫性の観点）。
- **ADR-003**: **tag 種別の混入はクライアント側で `kind === "note"` フィルタ**で除外。専用 server-fn を切る判断は将来の picker 利用頻度を見てから（YAGNI）。
- **ADR-004**: **件数上限 = 20**（既存 schema 上限）。ページングは picker に組み込まない。表示上は「{n} 件」のみ。
- **ADR-005**: アクセシビリティ実装方針 = `Dialog`（focus trap / Esc / scroll lock）+ `role="combobox"` + `aria-activedescendant` + `role="listbox"/"option"` + `aria-live="polite"` + IME-safe Enter。
- **ADR-006**: navigate 後の SSR で `loadReferencingNoteTitle`（Issue #32）が chip タイトル解決を担当。picker 側で title を渡し回さない。

## リスクと注意点

- **tag 混入による note 件数減**: `searchInternalLinkTargetsFn` は note + tag 統合 limit。tag が候補を占有すると note 表示が減るケースあり。MVP 規模では受容、将来 picker 利用が増えたら専用 fn 化を検討（ADR-003）。
- **INTERNAL_LINK 禁則文字**: `searchInternalLinkTargets` は `[ ] |` を含むタイトルを除外する。理論上 picker から選べないノートが存在する。URL 直叩き / P11 経由 / SavedView の代替経路があるため受容（ADR-002 に明記）。
- **`exactOptionalPropertyTypes: true`**: navigate の `search` callback で `referencingNoteId` を含めるとき、既存 `withDefaults` ヘルパを使えば回避可能。
- **debounce のメモリリーク**: `useEffect` cleanup で `clearTimeout` + `abortController.abort()` を必ず呼ぶ。StrictMode 二重マウントに耐えるよう ref で保持。
- **IME 確定 Enter**: input の `onKeyDown` で `event.isComposing === false` を必ず check（誤 commit 事故防止）。
- **Dialog の HMR**: `Dialog.tsx` の既存 caveat 通り、開いたまま HMR が走ると scroll lock が残る場合がある。テストでは `act` で確実に unmount。
- **router invalidate 不要**: search 変更による navigate は loader が自動再評価する。`router.invalidate()` の追加呼び出しは行わない（重複 fetch になる）。
- **page リセット**: navigate 時に `page: 1` を明示しないと旧ページで 0 件表示になる。`withDefaults` 経由でリセット。

## テスト方針

- **unit (vitest, happy-dom)**: 実装ステップ 3 の通り `NotePickerDialog.test.tsx` 8 ケース。
- **integration**: 不要（usecase / adapter 無変更、既存 `searchInternalLinkTargets.integration.test.ts` で server 側カバー済み）。
- **手動 / E2E**: `.issue/63/testing.md` 参照（picker open / 入力 → debounce / 候補表示 / キー操作 / IME / 選択 → navigate → chip / 空状態 / エラー状態 / モバイル幅 / SR）。
- **静的検証**: `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test`。

## レビュー反映

### 修正した点
- **P-001（要件カバ）への対応:** スコープ「含まれないもの」に `HomePage` / `NoteList` / `FilterBar` の Props シグネチャ変更を明記。実装ステップ 2 にも「Props は変更しない」を追記。
- **P-002（要件カバ）への対応:** tag が候補上位 20 を占有した時の 0 件文言を「該当するノートが見つかりません。タイトルの先頭の文字を変えて検索してください」に変更し、緩和策として吸収可能にした。ADR-003 にも量的な希少性根拠を加筆。
- **P-001（実現性）への対応:** `vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mockedFn }))` の具体形を実装ステップ 3 に記載。前例がない件は注意点として明記。
- **P-002（実現性）への対応:** `withDefaults` は FilterBar 関数内部のローカルヘルパであることを実装ステップ 2 に明記。
- **S-001（実現性）への対応:** `aria-controls` / `aria-activedescendant` を `idle` 時に渡さない（listbox を render しない）方針を実装ステップ 1 のレイアウト節に明記。0 件文言は listbox 外の `<p aria-live="polite">` に出す。
- **S-003（実現性）への対応:** `handlePick` の実装順序（`setPickerOpen(false)` → `startTransition(() => router.navigate(...))`）を実装ステップ 2 のコードブロックで明示。
- **S-004（実現性）への対応:** `nextSuggestionIndex` を `@/components/note/editor/internalLinkSuggest` から横断 import することは ADR-005 に明記済み（依存方向の妥当性は ADR で pin）。

### 取り込んだ改善提案
- **S-001（要件カバ）:** モバイル幅 / 仮想キーボード / Enter 確定の手動確認手順を `.issue/63/testing.md` に必ず含めることを実装ステップ 4 に追記（後段の testing.md で具体化）。
- **S-002（要件カバ） / hasAnyFilter:** picker 単独表示状態でクリアボタンが出ない不変条件を実装ステップ 2 に明記。
- **S-003（要件カバ） / navigate 副作用テスト:** unit テストで `onSelect` 経由のみが発火することを確認するケースを実装ステップ 3 に追記（ADR-006 の責務分離を回帰テストで pin）。

### 見送った提案とその理由
- **S-002（実現性） / 専用 server-fn 化:** tag 占有による note 0 件は文言緩和で吸収可能（ADR-003）。専用 fn 化は port / usecase / schema / test の追加が必要で、本 Issue のスコープを超える。将来 picker 利用が増えて顕在化したら別 Issue で対応。

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| ベース採用 | × | × | ○ |
| 取り込んだ点 | a11y 詳細（aria-activedescendant、IME-safe Enter）、`nextSuggestionIndex` 再利用、ADR 構造化 | 状態を判別 union に正規化、軽量テストの追加判断 | 新規ファイル最小（picker dialog 1 つ）、既存 server-fn 流用、tag 混入の受容、debounce 100ms |
