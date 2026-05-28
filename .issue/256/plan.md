# 実装計画 — Issue #256: アップロードモーダル系のアクセシビリティ強化（aria-labelledby / focus / SR announce）

**Issue:** #256
**作成日:** 2026-05-28
**複雑度:** 中〜大規模

---

## 目的

Issue #226 (PR #251) のデザインレビュー (audit) で検出された a11y 高優先度 3 項目を解消する:

- **A11y-H1**: `Dialog` プリミティブの `aria-labelledby` がモーダル UI で配線されていない → タイトルが SR で読み上げられない
- **A11y-H2**: `Dialog` の rAF 初期フォーカスと `IngestionPreviewForm` の独自 `useEffect(focus)` の二重契約 → form 構造変更で破綻するリスク
- **A11y-H3**: `UploadDialog` の `uploading → waiting → editing → failed → multiResult → timedOut` 遷移が SR に announce されない

## スコープ

### 含まれるもの

- `Dialog` プリミティブの API 拡張（`initialFocusRef` プロップ追加、`ariaLabelledBy` の JSDoc 強化）
- `UploadDialog` の `ariaLabelledBy` 配線 + 常設 `aria-live="polite"` status region 追加
- `IngestionPreviewForm` の独自 focus effect 撤去（view machine 側で focus 制御に集約）
- 他 6 つの `Dialog` 呼び出し元（`NotePickerDialog`, `MoveNoteDialog`, `SaveViewDialog`, `BulkVisibilityDialog`, `BulkExportDialog`, `MergeTagDialog`）の `ariaLabel` → `ariaLabelledBy` 移行
- ユニットテスト追加（`Dialog.test.tsx`, `UploadDialog.test.tsx`, `IngestionPreviewForm.test.tsx`）

### 含まれないもの

- Issue #226 audit の Medium/Low 級項目（`aria-busy`、`aria-describedby` でのエラー文関連付け、dropzone label 補強など）
- `Dialog` プリミティブの `ariaLabel | ariaLabelledBy` の型レベル排他制約（discriminated union 化）
- E2E / 実機 SR テストの自動化

## 調査結果

### Dialog 呼び出し元の全リスト（追従が必要）

1. `app/components/ingestion/UploadDialog.tsx` — 本 Issue の主対象（H1/H2/H3 すべて）
2. `app/components/note/list/NotePickerDialog.tsx`
3. `app/components/note/list/MoveNoteDialog.tsx`
4. `app/components/note/list/SaveViewDialog.tsx`
5. `app/components/note/list/BulkVisibilityDialog.tsx`
6. `app/components/note/list/BulkExportDialog.tsx`
7. `app/components/tag/MergeTagDialog.tsx`

`ConfirmDialog.tsx` は既に正しい配線済み（参考実装）。

### あるべきアーキテクチャ

- WAI-ARIA Authoring Practices Dialog パターン: `role="dialog" aria-modal="true" aria-labelledby="<title-id>"`
- `CLAUDE.md`: utility-first Tailwind、`useId()` で frame-stable な id を発行、illegal states は型で表現
- モーダル UI は state 遷移を SR にアナウンスし、フォーカス契約は 1 箇所に集約する

### 既存実装の乖離

- **本 Issue で扱う**: `ariaLabelledBy` プロップは存在するが、7 呼び出し元のうち 6 つは `ariaLabel`（文字列複製）のみ。`initialFocusRef` API がなく `IngestionPreviewForm` が独自 effect で focus を奪う。`UploadDialog` 内に view 横断の status region がない。
- **本 Issue で扱わない**: その他 Medium/Low 級は別 Issue 化 or スコープ外。

## 実装ステップ

### 1. `Dialog` プリミティブに `initialFocusRef` プロップを追加

- **対象ファイル:** `app/components/common/Dialog.tsx`
- **変更内容:**
  - `DialogProps` に `initialFocusRef?: React.RefObject<HTMLElement | null> | undefined` を追加（JSDoc で「指定時は rAF 内でこの ref に focus する。`null` / `current === null` / panel 外の要素は静かにフォールバック」と明示）
  - `DialogInner` の初期フォーカス effect を以下の優先順位に書き換え:
    1. `role === "alertdialog"` → panel に focus（現状維持）
    2. `initialFocusRef?.current` が `panel.contains` を満たす → `initialFocusRef.current.focus()`
    3. それ以外 → `INITIAL_FOCUS_SELECTOR` の最初の focusable（現状維持）
  - effect 依存は `[mounted, role]` のまま（ref オブジェクトは安定参照）
- **理由:** 子コンポーネントが「最初に focus すべき要素」を宣言的に渡せるようにし、独自 focus effect を不要にする（A11y-H2）

### 2. `Dialog` の JSDoc 強化（API契約の明示）

- **対象ファイル:** `app/components/common/Dialog.tsx`
- **変更内容:** `ariaLabel` / `ariaLabelledBy` の JSDoc に「いずれか一方を必ず指定すること。SR で名前付け可能なダイアログにするため、`ariaLabelledBy` + visible `<h2 id>` の組み合わせを推奨」を追記
- **理由:** API 契約をドキュメントで明示し、呼び出し元の正しい使用を促す（型レベルの強制は ADR で議論済みの理由で見送り）

### 3. `UploadDialog` を `ariaLabelledBy` + 常設 status region に書き換え

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`
- **変更内容:**
  - `titleId = useId()` / `statusId = useId()` を発行
  - `<Dialog ariaLabel="アップロード">` → `<Dialog ariaLabelledBy={titleId}>`
  - `<h2 className={dialogTitle}>` に `id={titleId}` を付与
  - `<h2>` の近傍に常設 status region を 1 つ配置:
    ```tsx
    <div id={statusId} role="status" aria-live="polite" className="sr-only">
      {viewStatusText(view)}
    </div>
    ```
  - module-scope に純関数 `viewStatusText(view: View): string` を追加。シグネチャは `(view: View) => string`、本体は `switch (view.kind)` の exhaustive 分岐で各 variant のフィールド（`uploading.total` / `multiResult.total, succeeded, failedNames`）にナローイングしてアクセスする:
    - `select` → `""`（初期状態は announce しない）
    - `uploading` (`total === 1`) → `"アップロード中"` / (`total > 1`) → `"${total} 件のファイルをアップロード中"`
    - `waiting` → `"LLM がタイトルとメタデータを提案中"`
    - `editing` → `"プレビュー編集に進みました"`
    - `failed` → `"取り込みに失敗しました"`
    - `multiResult` → `"${total} 件中 ${succeeded} 件をキューに追加しました"`、`failedNames.length > 0` なら ``（${failedNames.length} 件失敗）`` を末尾に追加
    - `timedOut` → `"推論の完了を待ちきれませんでした"`
    - default は `never` 受けで exhaustive を強制
  - `UploadingView` / `WaitingView` 内の局所 `aria-live="polite"` 属性を削除（重複 announce 防止）
  - **`select` 戻り時のエラー併存ルール:** ポーリング失敗等で `select` に戻る際は `error` が `role="alert"` (assertive) で別 region に表示される。`role="status"` (polite) 側は空文字に戻すことで「status region は何も読まない、エラーは alert で 1 回だけ読む」というルールを徹底し、重複 announce を防ぐ
- **理由:** A11y-H1（ラベル関連付け）と A11y-H3（view 遷移 announce）を一度に解消。`role="status"` は `aria-live="polite"` と等価で SR 互換性が広い

### 4. `IngestionPreviewForm` の二重 focus 契約を解消

- **対象ファイル:** `app/components/ingestion/IngestionPreviewForm.tsx`, `app/components/ingestion/UploadDialog.tsx`
- **変更内容:**
  - `IngestionPreviewForm` の Props に `titleInputRef?: React.RefObject<HTMLInputElement | null>` を optional で追加
  - `IngestionPreviewForm` 内の `useRef<HTMLInputElement>(null)` + `useEffect(() => titleInputRef.current?.focus(), [])` を削除し、`<input ref>` を props 経由に置き換え（props 未渡し時は内部 ref を作って fallback、副作用なし）
  - `UploadDialog` で `const titleInputRef = useRef<HTMLInputElement>(null);` を宣言し、`<IngestionPreviewForm titleInputRef={titleInputRef}>` を配線
  - `UploadDialog` 内に `useEffect(() => { if (view.kind === "editing") titleInputRef.current?.focus(); }, [view.kind]);` を置き、view machine の責務として `editing` 突入時に focus を寄せる
  - **`Dialog.initialFocusRef` プロップは `UploadDialog` 起点では使わない**。理由: `UploadDialog` は必ず `select` view から始まるため、`editing` 突入時に `Dialog` の rAF 初期フォーカス effect は既に発火済みで、`initialFocusRef` を渡しても無効。`select` 時はファイル input が `INITIAL_FOCUS_SELECTOR` のフォールバックで自然に focus される（現状維持）
- **理由:** A11y-H2 解消。focus 契約を `UploadDialog` 内の view machine effect の単一経路に集約。`Dialog.initialFocusRef` はプリミティブの API としては有用なので残すが、`UploadDialog` 起点では使わない（ADR-004 参照）

### 5. 他 6 つの Dialog 呼び出し元を `ariaLabelledBy` パターンへ移行

- **対象ファイル:** `NotePickerDialog.tsx`, `MoveNoteDialog.tsx`, `SaveViewDialog.tsx`, `BulkVisibilityDialog.tsx`, `BulkExportDialog.tsx`, `MergeTagDialog.tsx`
- **変更内容（各ファイル同パターン）:**
  - `const titleId = useId();` を追加
  - `<Dialog ariaLabel="...">` props のみを `<Dialog ariaLabelledBy={titleId}>` に置き換え（サブ要素の `aria-label="..."` — 例: `NotePickerDialog` の `<ul aria-label="ノート候補">` — は別物なので機械置換しない）
  - `<h2 className={dialogTitle}>...</h2>` に `id={titleId}` を付与
  - 実装着手時に各 Dialog が `<h2 className={dialogTitle}>` を持つことを実コードで確認する。万一 `<h2>` を持たない呼び出し元があれば、`sr-only` の `<h2 id={titleId}>` を `Dialog` 内に追加する代替パターンを取る
- **理由:** Issue 本文の「UploadDialog を含む既存 Dialog 呼び出しの追従」に該当。Dialog プリミティブの正しい使い方を全呼び出し元で統一する

### 6. テスト追加: `Dialog.test.tsx`

- **対象ファイル:** `app/components/common/__tests__/Dialog.test.tsx`
- **変更内容:** 新規 `describe("Dialog initialFocusRef", ...)`:
  - ケース 1: `initialFocusRef.current` が panel 内 → rAF 後に `document.activeElement === ref.current`
  - ケース 2: `initialFocusRef.current === null` → フォールバックして `INITIAL_FOCUS_SELECTOR` の最初に focus
  - ケース 3: `initialFocusRef.current` が panel 外 → フォールバック（防御的契約）
  - ケース 4: `role="alertdialog"` → `initialFocusRef` 指定でも panel が focus される（alertdialog の WAI-ARIA 契約優先）
- **理由:** 新規 API の振る舞いを契約として固定

### 7. テスト追加: `UploadDialog.test.tsx`

- **対象ファイル:** `app/components/ingestion/__tests__/UploadDialog.test.tsx`
- **変更内容:**
  - ケース A: 初期表示で `<h2 id="...">` と `dialog[aria-labelledby]` が同じ id を指していること
  - ケース B: 常設 status region が `role="status"` + `aria-live="polite"` で存在すること
  - ケース C: state 遷移時に status region の textContent が更新されること（`uploading → waiting → editing`、`failed`、`timedOut`、`multiResult` の各遷移を最低 1 ケースずつ。`multiResult` は `succeeded` / `failedNames.length` の文字列化も検証）
  - ケース C': 再オープン時に status region が空文字に戻ること（`select` の announce 抑制契約）
  - ケース D: `editing` view 突入時、`document.activeElement` がタイトル input であること（rAF 待ちは既存 `Dialog.test.tsx` の rAF パターン — `await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))` 等 — を再利用。`vi.useFakeTimers()` と real rAF が混在する場合は `vi.advanceTimersByTimeAsync` 系で polling を進めつつ rAF は real のまま、または `vi.useRealTimers()` に切り戻して focus 検証する方針）
  - ケース E: `editing` view 内で再 render が走っても focus が再強制されないこと（`view.kind` が変わらない限り focus effect が発火しない契約 — UX 退行防止）
- **理由:** A11y-H1 / H2 / H3 の振る舞いを契約としてピン留め

### 8. テスト追加: `IngestionPreviewForm.test.tsx`

- **対象ファイル:** `app/components/ingestion/__tests__/IngestionPreviewForm.test.tsx`
- **変更内容:**
  - 既存に `useEffect(focus)` 由来のテストがあれば削除/差し替え
  - mount 後 `IngestionPreviewForm` 自体は focus 副作用を持たないことを assert（`document.activeElement !== titleInput`）
- **理由:** 二重契約撤去の証跡

### 9. 既存テストの追従

- **対象:** 他 6 Dialog 呼び出し元の既存テスト
- **変更内容:** 実装着手時に `app/components/**/*.test.tsx` 内で `ariaLabel` props を assert している箇所を grep で確認する。事前調査では該当 0 件の見込みで、追従修正は不要の可能性が高い。0 件確認なら対応不要と記録、もしあれば `aria-labelledby` ベースに差し替える
- **理由:** ステップ 5 の API 移行に追従

### 10. 検証: `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test:unit`

- **対象:** 全変更ファイル
- **理由:** CLAUDE.md の「After changes」規約

## 設計判断

詳細は `.issue/256/adr.md` を参照。

- **ADR-001**: `initialFocusRef` の API 形 — `React.RefObject<HTMLElement | null> | undefined`（optional、防御的フォールバック）
- **ADR-002**: `ariaLabelledBy` の型レベル必須化 — 見送り（JSDoc 推奨に留める）
- **ADR-003**: status region の実装場所 — `UploadDialog` 内に集約（`Dialog` プリミティブには焼き込まない）
- **ADR-004**: focus 契約の責務分離 — `Dialog.initialFocusRef`（初回表示）+ `UploadDialog` の view machine effect（再表示）

## リスクと注意点

- **`UploadDialog` 起点での focus 制御**: `Dialog.initialFocusRef` は使わず、view machine の `useEffect(view.kind)` で `editing` 突入時に focus を寄せる単一経路に統一する（ADR-004 参照）。`select` 時はファイル input が `INITIAL_FOCUS_SELECTOR` のフォールバックで自然に focus される
- **Portal/SSR**: `mounted` ガード + `panel.contains(ref.current)` チェックで unmount race / 別 panel 誤 focus は防止済み
- **StrictMode**: 既存の `previousActiveRef` ガードと整合。rAF は cleanup で `cancelAnimationFrame` する
- **focus trap**: `initialFocusRef` で focus した要素は panel 内なので trap 境界判定に影響なし
- **`sr-only`**: Tailwind v4 標準 utility として既に他箇所（`FrontMatterEditor.tsx`, `IngestionPreviewForm.tsx`）で使用済み。新規定義不要
- **`role="status"` textContent 変化**: React の差分更新で textContent が書き換わる。SR 互換性は良好
- **`select` 戻り時のエラー併存**: `role="status"` (polite) と `role="alert"` (assertive) の重複 announce を避けるため、`viewStatusText(select) === ""` で status 側を沈黙させ、エラーは `role="alert"` の単一経路で announce する
- **`viewStatusText` の型安全性**: `(view: View) => string` を switch + exhaustive check（default 句で `never` 受け）で実装。`view.kind` ナローイング後に各 variant 固有フィールド（`uploading.total` / `multiResult.{total, succeeded, failedNames}`）にアクセスする
- **他 6 Dialog 既存テストへの影響**: 事前調査では `ariaLabel` を直接 assert している箇所は 0 件の見込み。実装着手時に grep で再確認
- **Follow-up Issue 起票候補**: 本対応で 7 呼び出し元すべてが `ariaLabelledBy` 統一されるタイミングは、`Dialog` 型レベル排他制約（`{ ariaLabel } | { ariaLabelledBy }` の discriminated union 化）を導入する好機。Phase 4 でスコープ外 Issue として起票を検討する

## テスト方針

- **ユニットテスト**: ステップ 6 / 7 / 8 / 9
- **a11y lint**: biome の `lint/a11y/*` ルール既存通り。H1/H2/H3 の挙動は既存 lint ルールでは静的検出できない領域（ランタイム挙動・state 遷移・SR 通知）のため、新規 lint ルール追加は行わずユニットテストで契約を固定する
- **手動確認**:
  - VoiceOver / NVDA で `UploadDialog` を開き、タイトル「アップロード」が announce されること
  - state 遷移で各 view のステータス文字列が SR から聞こえること
  - `editing` view 突入時、focus が title input に乗ること
  - 既存 ConfirmDialog ネスト（破棄確認）が引き続き機能すること
- **検証コマンド**: `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test:unit`

## レビュー履歴

### 1周目
**修正した点**:
- **[アーキ視点 P-001]**: `Dialog.initialFocusRef` を `UploadDialog` 起点では使わない方針に変更。ステップ 4 を「view machine effect の単一経路で focus 制御」に書き直し、`Dialog.initialFocusRef` の意義（プリミティブとしては有用、ただし `UploadDialog` には不要）を ADR-004 に明記
- **[アーキ視点 P-002]**: `select` 戻り時の `role="status"` と `role="alert"` の重複・取りこぼし問題に対し、`viewStatusText(select) === ""` で status 側を沈黙させエラーは alert 単一経路という整理ルールをステップ 3・リスクセクションに追記
- **[アーキ視点 P-003]**: `viewStatusText(view: View): string` の型契約（switch + exhaustive check、各 variant フィールドへのナローイング）と、`uploading.total === 1` / `> 1` の分岐、`multiResult.failedNames.length` の文字列化をステップ 3 に明記

**取り込んだ改善提案**:
- **[アーキ視点 S-002]**: テストケース C' を追加（再オープン時に status region が空文字に戻ること）
- **[アーキ視点 S-003]**: テストケース E を追加（`editing` view 内で再 render しても focus が再強制されない契約）
- **[アーキ視点 S-003 別]**: ステップ 5 で「サブ要素の `aria-label` は機械置換しない」（例: `NotePickerDialog` の `<ul aria-label="ノート候補">`）と明記
- **[アーキ視点 S-005]**: テストケース D の rAF と `vi.useFakeTimers()` 混在の取り扱い方針を追記
- **[要件視点 S-002 / アーキ視点 S-002 / 共通]**: ステップ 9 の既存テスト追従について「事前調査では該当 0 件の見込み」を明記
- **[アーキ視点 S-004 / 要件視点 別]**: 型レベル排他制約導入の follow-up Issue 起票候補をリスクセクションに追記

**見送った提案とその理由**:
- **[アーキ視点 S-001]**: `React.RefObject<HTMLElement | null>` の JSDoc 補強 — `Dialog.initialFocusRef` 自体は実装ステップ 1 で残すが、JSDoc 補足は ADR-001 の Decision で十分カバー済みのため見送り
- **[アーキ視点 S-004 別]**: `Dialog` プリミティブの slot 構造（title / body / actions）導入 — Issue 範囲を超えるため見送り

**要件カバレッジ視点**: 問題点ゼロ

### 2周目
両視点とも問題点ゼロで終了。軽微な改善提案 2 件（lint 追加方針の明文化、`<h2>` 存在前提の確認手順）を反映した上で完了。
