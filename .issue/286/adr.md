# ADR — Issue #286: モード切替「破棄」時の in-flight autosave をキャンセル/ロールバックする

## ADR-001: in-flight `saveDraft` は `AbortController` でキャンセルする（A案採用、B案不採用）

### Status
Proposed

### Context
Issue #233 ADR-004 でモード切替時の `window.confirm` を実装した際、「`saving` 中に『破棄』を選んでも in-flight な保存リクエスト自体はキャンセルされない」というトレードオフを明記して別 Issue に持ち越した。本 Issue (#286) で解消する。

選択肢:
1. **A案 — `AbortController` で in-flight な fetch をキャンセル**
2. **B案 — `discard draft` 用の新規 server function を追加し、サーバー状態を巻き戻す**

### Decision
A案を採用する。`useAutosave` は既存の `useEffect` 内で生成している `AbortController` を外部からも abort できるよう `controllerRef` に保持し、`useAutosave` の戻り値経由で `abortInFlight` を expose する。`saveDraft({ data, signal })` の形で TanStack Start の `FetcherBaseOptions.signal` 経由で fetch に AbortSignal を伝播させる。

### Consequences
- 良い点:
  - サーバー保存を未然に防げる（fetch が server に到達する前に abort されれば書き込みは発生しない）
  - 既存の `AbortController` 経路と統合的で、`useAutosave` の effect teardown 経路と二重実装にならない
  - `AbortError` の catch は既存ハンドラ (`if (e instanceof DOMException && e.name === "AbortError") return;`) で吸収されるため、新たな error 表示は出ない
  - ドメイン / ユースケース / アダプター層への変更が一切不要で、本Issueをフロントエンド層に閉じられる
- トレードオフ:
  - abort 直前に fetch が server に到達して書き込み完了済みのリクエストは戻せない（タイミング競合）。ユーザー視点では「破棄したのに最後の保存が残った」状態になりうるが、続けて autosave で上書きできる正常経路に乗るため致命的でない
  - 「破棄」のセマンティクスを「ベストエフォートで in-flight をキャンセルする」と定義する必要がある
  - サーバー側の状態保証が完全ではないため、将来「強い破棄保証」が必要になればその時点で B案を別 Issue として検討する

### B案を見送った理由
- `spec/usecases/note.md` に "draft を破棄する" ユースケースは存在せず、新設は本Issueの意図（UX 整合）を超える
- ドメインに「破棄前の状態」を保持するライフサイクル概念が無く、巻き戻し先の選び方（最後の saved revision? 何も書かない状態?）に新たな設計判断が必要
- スコープが膨らみ、レビュー / テストコストが A案の数倍になる

---

## ADR-002: `useAutosave` の戻り値で `abortInFlight` を expose する

### Status
Proposed

### Context
`useAutosave` の外部から in-flight な fetch を abort する経路を新設する必要がある。実装選択肢:

1. **戻り値で `{ abortInFlight }` を返す**
2. **`useImperativeHandle` / `forwardRef` 経由**
3. **`ref out-param`（caller が用意した `MutableRefObject<() => void>` を埋める）**

### Decision
選択肢 1（戻り値）を採用する。`useAutosave` は `{ abortInFlight: () => void }` を返す。`abortInFlight` は `useCallback([dispatch])` で identity 安定化させる。

### Consequences
- 良い点:
  - React のカスタムフック慣習に忠実（戻り値で公開）
  - 呼び出し元 (`NoteEditor`) は `const { abortInFlight } = useAutosave({...})` で直接受け取れる
  - `useImperativeHandle` / `forwardRef` は子コンポーネント向けの抽象であり、フック呼び出し元との通信には不要
  - `useCallback([dispatch])` で identity が安定するため、`onModeChange` の依存配列に追加しても再生成が起きない
  - `controllerRef`（および `inFlightRef` / `timerRef` 等）は `useRef` なので `useCallback` の deps に含めない。`ref.current` 読み出しは React の同フックインスタンスにおいて常に最新を返すため stale closure は発生しない。`useCallback([dispatch])` の `dispatch` は `useReducer` が安定 identity を保証
  - **`abortInFlight` を呼ぶ順序は `setMode` dispatch より先**が原則。`setMode` 後に effect 再評価が走ると `canFlush` の真偽が変動するモードペアで新 `useEffect` がすぐに新 controller を作るため、abort と新 controller 生成が交錯するリスクを避けるため
- トレードオフ: 特になし。React の自然な書き方の範囲内

---

## ADR-003: `autosaveDiscarded` action を新設する

### Status
Proposed

### Context
abort 後に reducer 上の `autosave.kind === "saving"` が残ると `AutosaveIndicator` が誤表示する。既存 action でカバーできないか検討:

- `autosaveSuccess`: 「成功」のセマンティクスが入るため不適切
- `autosaveError`: エラー扱いになるが、ユーザー主体の「破棄」はエラーではない

### Decision
新規 action `Readonly<{ type: "autosaveDiscarded" }>` を `EditorAction` に追加する。reducer は `autosave` を `{ kind: "idle" }` に遷移させ、`dirtyKeys` は保持する。受理範囲は全 5 状態（idle / dirty / saving / saved / error）で、結果はいずれも `{ kind: "idle" }`。

### Consequences
- 良い点:
  - 「破棄」というユーザー意図が action 名から明確に読み取れる
  - `autosaveSuccess` / `autosaveError` の意味論を汚さない
  - `dirtyKeys` を保持することで、モード切替後にユーザーが続けて編集して autosave が走る正常経路に乗る
- トレードオフ:
  - `EditorAction` ユニオンの分岐が 1 つ増える
  - reducer / テスト / フックの 3 箇所で新 action に触れる必要がある（影響範囲は限定的）

---

## ADR-004: `autosaveError` 状態での「破棄」も `autosaveDiscarded` で扱う

### Status
Proposed

### Context
Issue 検討事項に「`autosaveError` 状態でモード切替『破棄』を選んだケースの取扱い」と明記されている。`error` 状態では in-flight は無い（既に終端状態）が、ユーザー視点では「破棄を選んだのにエラーバナーが残る」のは UX 不整合。

選択肢:
1. `error` 状態は特別扱いせず、`autosaveDiscarded` 一本で `idle` にリセット
2. `autosaveError` 状態は `confirm` から除外し「破棄」対象にしない
3. 専用の `autosaveErrorDismiss` action を追加

### Decision
選択肢 1 を採用する。`abortInFlight` は `controllerRef.current` の有無に関わらず `dispatch({ type: "autosaveDiscarded" })` を発火する。`controller` が無ければ `controller.abort()` 呼び出しはスキップする（no-op）。

### Consequences
- 良い点:
  - 呼び出し側 (`NoteEditor`) は autosave 状態を意識せずに `abortInFlight()` を呼ぶだけで済む
  - `error` バナーが「破棄」で消えるのはユーザー期待と整合
  - `dirtyKeys` は保持されるため、モード切替後に再 autosave が走る経路を阻害しない
- トレードオフ: `idle` 状態で `abortInFlight()` を呼ぶと state は変化しないが reducer は走る（無害だが理論上 reducer の identity 変化はある — `{ kind: "idle" }` を返す reducer で `Object.is` 比較されるため、`state.autosave` の identity を保つ最適化が必要なら `case "autosaveDiscarded": return state.autosave.kind === "idle" ? state : { ...state, autosave: { kind: "idle" } };` のように書く）

---

## 参考

- 関連 Issue: #233（親）/ `.issue/233/adr.md` ADR-004 のトレードオフを本Issueで解消
- 関連ファイル:
  - `app/components/note/editor/useAutosave.ts`
  - `app/components/note/editor/NoteEditor.tsx`
  - `app/components/note/editor/editorState.ts`
  - `app/components/note/actions.ts` の `saveNoteDraftFn`
- TanStack Start `FetcherBaseOptions.signal`: `node_modules/.pnpm/@tanstack+start-client-core@1.168.2/.../createServerFn.d.ts:50`
