# PR Review #001 — feat(issue-63): add FilterBar note picker UI for referencingNoteId filter

**PR:** #103
**Date:** 2026-05-21
**Round:** 1 回目

---

## Summary

- Blockers: 0
- Warnings: 16
- Notes: 21
- Verdict: **BLOCKED (Warning multiple)**

---

## Frontend / UX / Performance

### Blockers
なし

### Warnings

- **[F-W-001]** `aria-busy` を input 自体に付けている
  - 場所: `app/components/note/list/NotePickerDialog.tsx:179`
  - 理由: `aria-busy` は通常コンテナに付ける属性で、`role="combobox"` 単体に付けると SR で「ビジー」読み上げが入力毎に発火する事例がある。
  - 提案: listbox 側に付けるか、削除して loading 文言の `aria-live="polite"` に任せる。

- **[F-W-002]** debounce 後発リクエスト後勝ち上書き検証のテスト不足
  - 場所: `NotePickerDialog.tsx:98-104`
  - 理由: 単体テストでは即時 resolve のため `signal.aborted` の早期 return が踏まれない。
  - 提案: 遅延付き mock で後発リクエストの items 状態 pin を追加（任意）。

- **[F-W-003]** `noteId as unknown as string` を多用
  - 場所: `NotePickerDialog.tsx:149, 210, 223`
  - 理由: NoteId ブランド型を毎回剥がすのは型の意図を毛羽立たせる。
  - 提案: `const id = item.noteId as unknown as string;` を 1 箇所で作って集約。

- **[F-W-004]** `ready & items=0` でも `aria-expanded={true}` / `aria-controls` を渡す
  - 場所: `NotePickerDialog.tsx:113-117, 178`
  - 理由: `aria-controls` が指す要素が存在しない状態は WAI-ARIA 仕様違反。
  - 提案: `hasListbox = status === "ready" && items.length > 0` に絞り、loading/error/0件は `aria-expanded={false}`。

- **[F-W-005]** `useEffect(open)` リセットの意図がコメント不足
  - 場所: `NotePickerDialog.tsx:62-69`
  - 理由: Dialog の unmount と重複している意図を明示しないと将来誤読される。
  - 提案: コメントで意図を明記。

- **[F-W-006]** `isPending` 中のダブル Enter で navigate 二重発火の余地
  - 場所: `FilterBar.tsx:262`
  - 理由: trigger は disabled だが、Dialog 内 input は disable されない。
  - 提案: `Dialog` に `closable={!isPending}` を渡すか、`commit` ガードに `isPending` 追加。

### Notes
- **[F-N-001]** searchRef = useRef(search) の安定化は WysiwygEditor パターン踏襲で適切
- **[F-N-002]** nextSuggestionIndex の横断 import は ADR-005 通り
- **[F-N-003]** onMouseDown + preventDefault は ADR-005 と一致
- **[F-N-004]** event.nativeEvent.isComposing は React 19 制約に正しく対応
- **[F-N-005]** handlePick の close → startTransition 順序は ADR-006 整合
- **[F-N-006]** Dialog 背景クリック/× 未サポートは本 PR 責務外
- **[F-N-007]** tag client filter (ADR-003) は妥当

---

## Test

### Blockers
なし

### Warnings

- **[T-W-001]** debounce 計時テストの境界条件が脆い
  - 場所: `__tests__/NotePickerDialog.test.tsx:124-128, :131-164`
  - 理由: 100ms ちょうどに依存、microtask 排出が綱渡り。
  - 提案: `advanceTimersByTimeAsync(99)` で 0 回 / +1 で 1 回の境界を pin、`vi.runOnlyPendingTimersAsync()` で統一。

- **[T-W-002]** エラーテストの resolve 待ちが rejected promise に不十分
  - 場所: `__tests__/NotePickerDialog.test.tsx:264-285`
  - 理由: microtask 複数ターンを `await Promise.resolve()` 2 回で代用しており flaky 化リスク。
  - 提案: `vi.waitFor(...)` or `vi.runAllTimersAsync()` + act で確実に排出。

- **[T-W-003]** useServerFn 戻り値 identity 不安定への耐性が pin されていない
  - 場所: `__tests__/NotePickerDialog.test.tsx:23-30`
  - 理由: モックは安定参照を返す。本物が毎レンダ別関数を返しても OK な実装の検証が弱い。
  - 提案: 任意で 1 ケース毎レンダで別関数を返すバリエーション（todo 残しでも可）。

- **[T-W-004]** `@tanstack/react-start` 全体 stub の Proxy が `then` を踏むとリスク
  - 場所: `__tests__/NotePickerDialog.test.tsx:23-30`
  - 理由: `await createServerFn()(...)` 等で then を踏むと thenable 扱いで hang する可能性。
  - 提案: `get: (_, prop) => (prop === "then" ? undefined : chain())` で then を除外。

- **[T-W-005]** ↑↓ テストの focus 前提が暗黙
  - 場所: `__tests__/NotePickerDialog.test.tsx:194-208`
  - 理由: happy-dom は focus なしでも合成イベントを届けるため、focus 外れたときの挙動が未検証。
  - 提案: `input.focus()` を pressKey 前に明示するか、focus 外 ↑↓ で何もしないケース追加。

### Notes
- **[T-N-001]** 8 ケース網羅は plan.md 実装ステップ3を 1:1 でカバー
- **[T-N-002]** React 19 controlled input の native value setter 経由は適切
- **[T-N-003]** IME テストで KeyboardEventInit の isComposing 直接渡しは網羅
- **[T-N-004]** tag 除外テストの assertion は spec 上問題なし
- **[T-N-005]** afterEach の順序は正しい
- **[T-N-006]** useId のテスト抽象度は適切
- **[T-N-007]** ADR-007 の signature 検知は Proxy で隠蔽されているのを認識

---

## Accessibility

### Blockers
なし

### Warnings

- **[A-W-001]** input に accessible name がない
  - 場所: `NotePickerDialog.tsx`
  - 理由: placeholder は SC 1.3.1 で accessible name の代替にならない。SR は「コンボボックス、検索」と読み上げ、何の欄か曖昧。
  - 提案: visually-hidden label or `aria-labelledby` で結合（既存 `FilterBar.tsx:188-208` の date input 手法）。

- **[A-W-002]** aria-live 領域で hint も idle 中に常駐
  - 場所: `NotePickerDialog.tsx`
  - 理由: status 遷移のたびに hint も再アナウンス。
  - 提案: `aria-live={status === "idle" ? "off" : "polite"}` か hint を別 `<p>` 分離。

- **[A-W-003]** `aria-expanded` の値が WAI-ARIA 1.2 とずれる（F-W-004 と同根）
  - 場所: `NotePickerDialog.tsx`
  - 理由: listbox が DOM になくても `true` を返す。
  - 提案: `aria-expanded={status === "ready" && items.length > 0}` に揃える。

- **[A-W-004]** option commit が `onMouseDown` のみ
  - 場所: `NotePickerDialog.tsx`
  - 理由: タッチデバイス / Pointer Events で onMouseDown が走らないケースあり。
  - 提案: `onClick` も併設するか、`onPointerDown` + preventDefault。

- **[A-W-005]** activedescendant 化された option の `scrollIntoView` 未対応
  - 場所: `NotePickerDialog.tsx`
  - 理由: 候補が listbox の max-h を越えた場合に視覚的に見えない。
  - 提案: `useEffect(() => optionRef.current?.scrollIntoView({block: "nearest"}), [selectedIndex])`。

### Notes
- **[A-N-001]** WAI-ARIA combobox + listbox パターン準拠は概ね適切（W-003 を除く）
- **[A-N-002]** `<div role="listbox">` / `<button role="option">` 選択は妥当
- **[A-N-003]** IME-safe Enter (event.nativeEvent.isComposing) は正しい
- **[A-N-004]** Dialog の Esc 処理 IME-safe + focus 復元
- **[A-N-005]** picker トリガーの aria-haspopup / aria-expanded は適切
- **[A-N-006]** Dialog.closable={!isPending} の検討余地（F-W-006 と同源）
- **[A-N-007]** `<input type="search">` + role="combobox" 重複の念のため指摘
- **[A-N-008]** aria-setsize/posinset 付与は MVP 後の改善余地

---

## Design Decisions

特になし（Warning 修正で完結する範囲）。
