# 実装計画 — Issue #286: モード切替「破棄」時の in-flight autosave をキャンセル/ロールバックする

**Issue:** #286
**作成日:** 2026-05-28
**複雑度:** 中〜大規模

---

## 目的

Issue #233 ADR-004 で「`saving` 中に『破棄』を選んでも in-flight な保存リクエスト自体はキャンセルされない」とトレードオフ明記したのを解消する。`window.confirm` で「破棄」が選ばれたとき、`useAutosave` が抱える in-flight な `saveDraft` fetch を `AbortController` で中断し、reducer 上の autosave 状態も `idle` に戻すことで、ユーザーの「破棄」セマンティクスを UI / ネットワーク両面で整合させる。

**採用方針: A案（AbortController による in-flight キャンセル）のみで対応。** Issue 本文の選択肢2（サーバー側 revert API）は採用しない（理由は ADR-001）。「破棄」のセマンティクスは「**現在 in-flight な fetch をベストエフォートでキャンセルする**」と定義し、ユーザーが入力した編集内容そのもの（`dirtyKeys`）は保持して、モード切替後の通常 autosave 経路に乗せる。

## スコープ

### 含まれるもの

- `useAutosave` から外部 abort 経路（`abortInFlight: () => void`）を expose し、`saveDraft({ data, signal })` で fetch に `AbortSignal` を伝播
- `NoteEditor.onModeChange` で「破棄」確定時に `abortInFlight()` を呼ぶ（順序: blur → dirty 再評価 → confirm → **abortInFlight** → `setMode` dispatch）
- `editorState` に `autosaveDiscarded` action を追加し、`saving` / `error` / それ以外の autosave 状態から `idle` へ遷移させる（`dirtyKeys` は保持）
- `autosaveError` 状態で「破棄」を選んだケースの整理: 表示中のエラーバナーを `idle` に戻す（in-flight は無いが UI 整合のため）
- 既存テスト更新 + 新規テスト追加（`autosaveDiscarded` reducer 単体、`onModeChange` から abort 経路が発火されるかの統合）
- `.issue/286/adr.md` に設計判断を記録

### 含まれないもの

- サーバー側 `saveNoteDraft` ユースケース / ドメイン / アダプターの変更（B案不採用）
- 新規 "discard draft" ユースケースの導入（spec/usecases/note.md には存在せず、本Issueの意図は UX 整合に閉じる）
- `confirm` ダイアログの独自モーダル化（Issue #233 ADR-004 と同じ理由でスコープ外）
- abort 直前に fetch が完了済みケースの「サーバー巻き戻し保証」（ベストエフォートで in-flight をキャンセルする方針）
- AutosaveIndicator のラベル変更や追加 UI

## 実装ステップ

### 1. `editorState.ts` に `autosaveDiscarded` action を追加

- **対象ファイル:** `app/components/note/editor/editorState.ts`
- **変更内容:**
  - `EditorAction` ユニオンに `Readonly<{ type: "autosaveDiscarded" }>` を追加
  - reducer に case を追加: `state.autosave.kind === "idle"` のときは `state` をそのまま返す（identity 保持の最適化）。それ以外は `{ ...state, autosave: { kind: "idle" } }` を返す。`dirtyKeys` は常に保持
  - 受理範囲: `saving` / `error` / `dirty` / `saved` / `idle` すべて受理
  - JSDoc に以下を明記:
    - Issue #286 への参照
    - 「mode-switch『破棄』専用の外部 reset action」
    - 「`dirtyKeys` は保持する — ユーザーの編集内容自体を消す action ではなく、in-flight fetch のキャンセルに伴う UI 整合のための action である。モード切替後、保持された `dirtyKeys` は通常の autosave 経路で再送される」
    - 「`idle` 状態では state identity を保持する（reducer 短絡）」
- **理由:** abort 後 `autosave.kind === "saving"` が UI に残ると `AutosaveIndicator` が誤表示するため、reducer 経由で明示的に `idle` 化する経路が必要。新規 action として明示することで `autosaveSuccess` / `autosaveError` のセマンティクスと混ぜない。`idle` 短絡は ADR-004 で言及した最適化を実装に落とす。

### 2. `useAutosave` を `{ abortInFlight }` を返す形に拡張

- **対象ファイル:** `app/components/note/editor/useAutosave.ts`
- **変更内容:**
  - フック本体に `controllerRef = useRef<AbortController | null>(null)` を追加
  - 既存の `useEffect` 内で生成する `controller` を `controllerRef.current = controller` に書き戻し、teardown 時に `controllerRef.current === controller` のときだけ `null` クリア（古い teardown が新しい effect を上書きしないよう identity でガード — 既存 `inFlightRef` の guard と同じパターン）
  - `saveDraft({ data: {...} })` を `saveDraft({ data: {...}, signal })` に変更（TanStack Start の `FetcherBaseOptions.signal` 経由で fetch に伝播）
  - `abortInFlight` を `useCallback([dispatch])` で実装:
    1. `controllerRef.current` が非 null なら `controllerRef.current.abort()` を呼び、その後 `controllerRef.current = null` をセット
    2. `timerRef.current` が非 null なら `clearTimeout` してから `null` セット（debounce 中の予約を取り消す）
    3. `reRunRef.current = false` をセット（保留中の re-run flag を取り消す）
    4. `attemptRef.current = 0` にリセット（retry カウンタをクリア）
    5. `inFlightRef.current = null` は**書き換えない** — 既存の `.finally` 内 `if (inFlightRef.current === p) inFlightRef.current = null` の identity ガードに任せる（in-flight promise が `AbortError` で reject → finally が自然に null 化する）
    6. `dispatch({ type: "autosaveDiscarded" })` を発火
  - 戻り値 `{ abortInFlight }` を返す。型を `UseAutosaveReturn = Readonly<{ abortInFlight: () => void }>` として export
  - JSDoc に以下を明記:
    - 「`abortInFlight` はモード切替『破棄』時の外部 abort 経路」
    - 「`saving` 中なら fetch をキャンセル、`error` 中なら表示クリア、その他は reducer 短絡で no-op」
    - 「`useCallback([dispatch])` で安定化。`controllerRef` は `useRef` なので deps に含めない（ref.current 読み出しに stale closure リスクは無い）」
    - 「`attemptRef` リセットの安全性: `flush()` の catch ブロックでは `if (signal.aborted) return;` → `if (e instanceof DOMException && e.name === 'AbortError') return;` の順に early return するため、`abort()` 由来の reject は `attemptRef.current += 1` に到達しない。よって `abortInFlight` でリセットした値が catch ブロックの increment で巻き戻ることはない」
- **理由:**
  - TanStack Start の `OptionalFetcherDataOptions` / `RequiredFetcherDataOptions` は `signal?: AbortSignal` を受け付けるため (`createServerFn.d.ts:50`)、`saveDraft({ data, signal })` で fetch がキャンセルされる
  - `AbortError` の catch は既存 (`if (e instanceof DOMException && e.name === "AbortError") return;`) で吸収されるため、新たな error 表示は出ない
  - `dispatch({ type: "autosaveDiscarded" })` を `abortInFlight` 側で呼ぶことで、呼び出し側 (`NoteEditor`) は 1 行の呼び出しで完結する
  - debounce / retry 残骸まで一括クリアすることで「破棄直後にユーザーが何もしていないのに autosave が再走する」競合を防ぐ

### 3. `NoteEditor.tsx` の `onModeChange` で `abortInFlight` を呼ぶ

- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`
- **変更内容:**
  - `useAutosave({...})` の呼び出しを `const { abortInFlight } = useAutosave({...});` に変更
  - `onModeChange` の `confirm` が `true` を返したパスで、`dispatch({ type: "setMode", mode: nextMode })` を呼ぶ**前**に `abortInFlight()` を呼ぶ
  - `onModeChange` の `useCallback` 依存配列を `[]` から `[abortInFlight]` に変更（`abortInFlight` は `useAutosave` 側で `useCallback([dispatch])` 安定化、`dispatch` 自体は `useReducer` が安定 identity を保証）
  - 既存の JSDoc コメント（ADR-004 / ADR-008 への参照箇所）に以下を追記:
    - 「Issue #286: 破棄時は `abortInFlight()` で in-flight な fetch をキャンセル」
    - 「順序: blur → stateRef dirty 再評価 → confirm → **abortInFlight** → setMode dispatch」
    - 「`setMode` より前に abort することで、(a) confirm false 時はネットワーク・reducer 共に未変更 (b) confirm true 時は fetch を確実に止めてから mode 切替の effect 再評価に進む」
- **理由:** 順序を「blur → stateRef で dirty 再評価 → `window.confirm` → abortInFlight → `setMode` dispatch」にすることで、(a) confirm が false ならネットワークも reducer も触らない (b) confirm が true なら fetch をキャンセルしてから mode を切り替えることで、mode 変更による effect 再評価（autosave gate の値変動）に巻き込まれない。React 18+ の自動バッチにより `autosaveDiscarded` と `setMode` の 2 つの dispatch は同 render サイクルで適用される。

### 4. テストを追加

- **対象ファイル:**
  - `app/components/note/editor/__tests__/editorState.test.ts`
  - `app/components/note/editor/__tests__/noteEditorModeChange.test.tsx`
- **変更内容:**
  - reducer 単体 (`editorState.test.ts`):
    - `autosave: { kind: "saving" }` → `autosaveDiscarded` → `{ kind: "idle" }`、`dirtyKeys` 保持
    - `autosave: { kind: "error", error }` → `autosaveDiscarded` → `{ kind: "idle" }`、`dirtyKeys` 保持
    - `autosave: { kind: "idle" }` → `autosaveDiscarded` → `{ kind: "idle" }`（no-op 相当）
    - `autosave: { kind: "dirty" }` / `{ kind: "saved" }` → `autosaveDiscarded` → `{ kind: "idle" }`
  - 統合 (`noteEditorModeChange.test.tsx`):
    - "saveDraft is called with an AbortSignal" — `saveDraftMock` の引数を `expect.objectContaining({ signal: expect.any(AbortSignal) })` でアサート
    - "confirm OK aborts in-flight saveDraft during mode switch" — `saveDraftMock` を signal abort で reject するように書き、saving 中にモード切替 → confirm OK 後に signal の `aborted === true` を検証
    - "after discard, autosave indicator returns to idle" — discard 後の `state.autosave.kind === "idle"`
    - "discard during autosaveError clears the error banner" — 事前に `dispatch({ type: "autosaveError" })` で error 状態にし、モード切替 confirm OK 後に `kind === "idle"` を検証
    - "confirm cancel keeps in-flight saveDraft alive" — confirm を false にすると abort されないことを検証
    - "wysiwyg → html switch keeps autosave running after discard" — ack 未済の wysiwyg から html に切替（discard）後、新モードで autosave が再開する期待動作を pin
- **理由:** reducer 単体 + happy-dom 統合の既存テスト構造に揃える。特に "saveDraft is called with an AbortSignal" は TanStack Start の signal 伝播が機能しているかの生命線。

### 5. `.issue/286/adr.md` の作成

- **対象ファイル:** `.issue/286/adr.md`（新規）
- **変更内容:** 以下の設計判断を ADR として記録
  - ADR-001: A案（AbortController で in-flight キャンセル）採用、B案（サーバー revert API）不採用
  - ADR-002: `useAutosave` の戻り値で `abortInFlight` を expose する設計（`useImperativeHandle` / ref out-param 不採用）
  - ADR-003: `autosaveDiscarded` action を新設（既存の `autosaveSuccess` / `autosaveError` を流用しない理由）
  - ADR-004: `autosaveError` 状態での「破棄」も同 action で扱う（`dirtyKeys` は保持、エラーバナーのみ dismiss）
  - 既存の `.issue/233/adr.md` ADR-004 は改変せず、本 ADR 内で「Issue #233 ADR-004 のトレードオフを解消」と参照
- **理由:** プロジェクト ADR 文化（`.issue/{n}/adr.md`）に従い、後続レビューや将来の改修時に判断根拠を辿れるようにする。

## 設計判断（サマリー）

- **A案（AbortController）採用、B案（サーバー revert）不採用** — 本Issueの意図は「UX 整合」であって新規ドメイン概念ではない。spec/usecases/note.md に "discard draft" は存在せず、新設は overkill。`AbortController` は既存 effect に組み込み済みで微改修で済む。
- **`useAutosave` の戻り値で abort 公開** — カスタムフック慣習に従う。`useImperativeHandle` / `forwardRef` はオーバーキル。`{ abortInFlight }` を返すだけで `NoteEditor` 側がそのまま閉じる。
- **`autosaveDiscarded` action 新設** — `autosaveSuccess` / `autosaveError` の意味論を汚さず、`dirtyKeys` 保持セマンティクスを reducer に閉じ込める。

詳細は `.issue/286/adr.md` を参照。

## リスクと注意点

- **タイミング競合**: abort 直前に fetch が完了している場合、サーバー側に dirty が永続化される可能性が残る。本実装は「ベストエフォートのキャンセル」と定義し、ユーザーは続けて autosave で上書きできる正常経路に乗る。ADR-001 に明記する
- **`useServerFn` の signal 伝播**: 型上 `signal?: AbortSignal` を受け付けるが、実装時に network レベルで abort が実際に伝播することをテスト・ブラウザ検証で確認する
- **`useCallback` identity**: `abortInFlight` を `useAutosave` 側で `useCallback([dispatch])` 安定化させる。`controllerRef` は `useRef` なので deps に含めない（`ref.current` 読み出しに stale closure リスクは無い — React は同フックインスタンスの ref 同一性を保証）。`NoteEditor.onModeChange` 側は `useCallback([abortInFlight])` で `dispatch` の安定 identity に乗せる
- **既存 effect teardown 経路**: 既存の `controller.abort()` + `timerRef.current` clearTimeout は維持。`abortInFlight` 経路はそれと独立に発火する想定。`controllerRef` の null クリアは effect teardown 側でも `controllerRef.current === controller` の identity ガード付きで実施する（古い teardown が新 effect の controller を消さないため）
- **ADR-008 の stateRef 経路と独立**: `onModeChange` は stateRef で latest を読むが、`abortInFlight` は同イベント内同期実行なので stateRef の commit-phase 制約と干渉しない
- **retry 中の abort**: `abortableSleep` は既に signal で reject する設計なので、retry 待機中の abort も問題なく機能する。`attemptRef` のリセットを `abortInFlight` 側で行うが、`flush()` catch の `signal.aborted` 早期 return により abort 由来の reject が `attemptRef.current += 1` に到達しないため、リセット値が巻き戻る race は発生しない
- **モード切替後の autosave 再走（破棄→新モード）**: `dirtyKeys` を保持する設計上、`setMode` 直後の effect 再評価で `canFlush === true` が維持され、新しい `useEffect` 内で新 controller を作って debounce 後に autosaveStart が走る。これは「破棄」のセマンティクスが「**現在 in-flight な fetch のみキャンセル**」であり、編集内容そのものを消すわけではないため期待動作である。**特殊ケース**: `wysiwyg` モードで `wysiwygUnsupportedTags.length > 0 && !wysiwygUnsupportedAck` の状態（autosave ゲート off）から他モードに切替えると、新モードで `canFlush` が真に変わって新規 effect が走るが、これも「ack 制約から解放されて通常 autosave 経路に乗る」だけで期待動作。新 effect は新 controller を作り、debounce + 新 fetch を実行する。これは「破棄」を意図したフローと矛盾しない（ユーザーが編集内容を保持したいから破棄を選んだ、という解釈に沿う）。テストでこのケースを pin する

## テスト方針

- **reducer 単体テスト** — `autosaveDiscarded` の全 5 状態遷移を pin（idle → 同一 state identity、dirty/saving/saved/error → idle へ遷移、`dirtyKeys` は全ケース保持）
- **happy-dom 統合テスト** — `noteEditorModeChange.test.tsx` に 6 ケース追加:
  1. "saveDraft is called with an AbortSignal" — `expect.objectContaining({ signal: expect.any(AbortSignal) })` で signal 引数をアサート
  2. "confirm OK aborts in-flight saveDraft during mode switch" — `saveDraftMock` を `(opts) => new Promise((_, reject) => { opts.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))); })` で書き、saving 中にモード切替 → confirm OK 後に signal の `aborted === true` を検証。加えて、`AbortError` reject → 既存 catch の `signal.aborted` 早期 return → `.finally` で `inFlightRef.current` が最終的に null 化されることもアサート（計画ステップ2の `inFlightRef` 非クリア方針の整合性確認）
  3. "after discard, autosave indicator returns to idle" — discard 後の `state.autosave.kind === "idle"` を確認
  4. "discard during autosaveError clears the error banner" — 事前に error 状態にし、モード切替 confirm OK で `kind === "idle"` に戻ることを確認
  5. "confirm cancel keeps in-flight saveDraft alive" — confirm false で `controller.abort()` が呼ばれず autosave indicator が `saving` のままであることを確認
  6. "wysiwyg → html switch keeps autosave running after discard" — wysiwyg で ack 未済の状態から html に切替（dirty 保持）した場合、新モードで autosave が再開されることを確認（期待動作の pin）
- **型チェック・lint** — `pnpm typecheck && pnpm lint:fix && pnpm format` を最後に通す
- **ブラウザ検証** — `pnpm dev` で起動し、既存ノート編集画面で saving 中にモード切替 → confirm OK → DevTools Network で fetch が `(canceled)` になることを目視確認

## レビュー履歴

### 1周目
**修正した点**:
- [P-001（arch）への対応]: 「モード切替後の autosave 再走（破棄→新モード）」の挙動を「リスクと注意点」に追記。特に `wysiwyg` ack 未済 → 他モード切替の特殊ケースが「期待動作」（破棄＝編集内容を消すわけではなく、in-flight fetch のみキャンセル）であることを明示し、テストケース 6 でこの挙動を pin
- [P-002（arch）への対応]: `attemptRef` リセットの race 安全性を `useAutosave` の JSDoc 要件として明示（`flush()` catch の `signal.aborted` 早期 return が increment より前にある事実を根拠）

**取り込んだ改善提案**:
- [S-001（req）]: ステップ1の reducer 実装に `state.autosave.kind === "idle"` 短絡を明示的に組み込み、ADR-004 と実装を一直線に
- [S-002（req）]: 「目的」セクション冒頭で A案採用方針を一行宣言
- [S-001（arch）]: `controllerRef` の identity ガード（`controllerRef.current === controller` での null クリア）を「リスクと注意点」に明示
- [S-002（arch）]: `controllerRef` が `useRef` なので `useCallback` deps に含めない理由（ref インスタンス同一性の保証）を `useAutosave` 側 JSDoc 要件に追加
- [S-003（arch）]: `onModeChange` の `useCallback` 依存配列変更（`[]` → `[abortInFlight]`）を ステップ3 に明記
- [S-004（arch）]: テスト方針2の `saveDraftMock` 書き方を具体例で示すよう更新
- [S-005（arch）]: `setMode` より abort 先行の理由（effect 再評価との分離）を ステップ3 JSDoc 要件に追加

**見送った提案とその理由**:
- なし（全提案がスコープ内 + plan の完成度向上に直結するため取り込み）

### 2周目
**両視点とも問題点ゼロで終了**

**取り込んだ改善提案（任意）**:
- [S-001（arch, 任意）]: テスト方針2 (confirm OK で abort) に「abort 後 `inFlightRef` が最終的に null 化されていること」のアサート追加を計画に追記
- [S-002（arch, 任意）]: `useAutosave` effect 本体の `canFlush === false` 早期 return パスにおける `controllerRef` 残置の妥当性を JSDoc 要件として注記（前 effect の teardown で identity ガード経由で null クリア済みのため実害なしを明示）
