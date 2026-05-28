# PR Review #001 — feat(editor): add inline mode for editing existing notes

**PR:** #282
**Date:** 2026-05-28
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 16
- Notes: 16
- Verdict: **BLOCKED**

---

## Frontend

### Blockers
なし

### Warnings

- **[W-F-001]** `onInitFailed` の副作用契約が JSDoc に未明示
  - 場所: `app/components/note/editor/InlineEditor.tsx:265-289`
  - 理由: parse 失敗時に `onInitFailed` を呼ぶ → 親が即時 unmount する前提に依存。契約を JSDoc で明示すべき
  - 提案: `onInitFailed` の JSDoc に「呼ばれた直後に親が unmount することを期待する」旨を追記

- **[W-F-002]** 装飾要素を含む選択範囲のペーストで rollback されるトレードオフが未明示・未テスト
  - 場所: `InlineEditor.tsx:358-372` / `__tests__/inlineEditor.test.tsx:130-158`
  - 理由: `<p>foo<strong>bar</strong>baz</p>` 内の "foo" 〜 "baz" を選択してペーストすると `<strong>` removedNodes でバッチ rollback されるが、ユーザー体験として驚き
  - 提案: ADR-003 Consequences に「装飾範囲を含むペーストは反映されない」を明記し、テストで pin

- **[W-F-003]** ⚠ `contenteditable="true"` 属性が `host.innerHTML` 経由で `state.contentHtml` に混入する
  - 場所: `InlineEditor.tsx:296, 305-308`
  - 理由: `onChange` が emit する `host.innerHTML` には編集時専用属性 `contenteditable="true"` が含まれ、サーバー保存・表示時にまで漏れる
  - 提案: emit 前に host を `cloneNode(true)` して `contenteditable` 属性を除去してからシリアライズ

- **[W-F-004]** `useEffect([disabled])` の初回 mount 時の冗長 observer 再 attach
  - 場所: `InlineEditor.tsx:445-471`
  - 理由: `useEffect([value])` で既に `applyEditable` 済みだが `[disabled]` effect が同じ操作を再実行し、observer も disconnect/observe する
  - 提案: 初回マウントは `prevDisabledRef` でガードして skip

- **[W-F-005]** `structureSignature` の JSDoc に「比較目的のみ、innerHTML に注入してはならない」を明示すべき
  - 場所: `InlineEditor.tsx:155-176`
  - 理由: attribute エスケープを行わない実装で、誤って innerHTML 経由で再注入されると XSS の温床
  - 提案: 関数 JSDoc 追記

- **[W-F-006]** `onModeChange` の `state.dirtyKeys` 読み取りが stale（W-S-001 と同一）
  - 場所: `NoteEditor.tsx:160-184`
  - 理由: `active.blur()` で FrontMatter の commitKey から `dispatch` が走るが、その新しい dirtyKeys は同イベント内で reflect されない
  - 提案: `flushSync(() => active.blur())` で同期 flush するか、`stateRef.current = state` パターンで最新値を読む

- **[W-F-007]** host 要素に `aria-label` / `role` が無く screen reader でエリアの意味が伝わらない
  - 場所: `InlineEditor.tsx:473-481`
  - 理由: a11y 観点。複数 contentEditable ブロックを内包するエリアの意味が伝わらない
  - 提案: `role="region"` `aria-label="ノート本文"` を host に付与

### Notes
- N-F-001〜N-F-006: `EDITABLE_TAGS` のmodule-scope hoist、`data-disabled` のaria規約準拠、StrictMode 二重マウント対応、`onCompositionEnd` の順序、ref 群の race 設計が綿密、`onMediaInsert` の inline 経路設計が良い

---

## State / Logic

### Blockers
なし

### Warnings

- **[W-S-001]** ADR-004「blur → dirty 再評価 → confirm → dispatch」の順序が React のバッチ更新で実態と乖離
  - 場所: `NoteEditor.tsx:160-184` の `onModeChange`
  - 理由: `active.blur()` で commitKey → dispatch が走るが、`state` クロージャは更新されない。confirm 評価時には pre-blur の dirtyKeys を読む
  - 提案: `flushSync(() => active.blur())` で同期 flush するか、`stateRef.current = state` パターン

- **[W-S-002]** `EditorMode` の exhaustive check が無く、将来モード追加時の silent failure リスク
  - 場所: `NoteEditor.tsx:309-360` の連続三項
  - 理由: 新モード追加時にペインがレンダーされない silent failure
  - 提案: 将来モード追加時に exhaustive check リファクタを検討（本 Issue スコープ外）

- **[W-S-003]** `edit` surface で `wysiwyg` モードへ reducer は遷移を許すが UI 経路は無い
  - 場所: `editorState.ts` の `setMode` / `EditorModeSwitch.tsx` の TABS_EDIT
  - 理由: UI からは到達不能だが reducer が受理する不整合
  - 提案: 本 Issue スコープでは現状維持（型レベルで surface×mode を縛るのは別 Issue）

### Notes
- N-S-001〜N-S-006: `EditorInit.surface` 必須化の影響範囲限定、surface ベース初期 mode 更新が漏れなし、ADR-006 inline 素通し pin、`onModeChange` の deps が安定、`onMediaInsert` の inline 経路設計、confirm メッセージのスコープ整合

---

## Test

### Blockers
なし

### Warnings

- **[W-T-001]** `onInitFailed` のポジティブパス未検証
  - 提案: (a) `value="<x>"` で非空入力 → empty body → onInitFailed 呼出 (b) 複数回 props 更新で 1 度だけ呼ばれること、をテスト追加

- **[W-T-002]** IME (`compositionstart` / `compositionend`) パスがゼロカバレッジ
  - 提案: `compositionstart` 中の childList 変化が許容されること、`compositionend` で構造ドリフト検出でロールバックすること、`isComposingRef` リセットを pin

- **[W-T-003]** ADR-002 の混在子・ネストケース未検証
  - 提案: `<li><p>foo</p></li>` で `<li>` が editable にならず内側 `<p>` だけ editable、`<blockquote>foo<p>bar</p></blockquote>` で外側内側両方 editable をテスト

- **[W-T-004]** `<pre>` 排除のスナップショット未取得
  - 提案: `<pre><code>...</code></pre>` で `<pre>` に contentEditable が付かないことを assert

- **[W-T-005]** Enter 抑止テストが Tab を検証していない
  - 提案: Tab キーも pin

- **[W-T-006]** Enter 抑止テストの観測ロジック（追加リスナで defaultPrevented を読む）がアンチパターン
  - 提案: `dispatchEvent` の戻り値 or 直接 `event.defaultPrevented` を読む

- **[W-T-007]** paste テストが「実際に text/plain が挿入されたこと」を検証していない
  - 提案: `host.textContent.includes("<script>x</script>")` を追加 assert

- **[W-T-008]** onChange の正経路（characterData → emit → onChange）が未検証
  - 提案: leaf textNode に値を変更し debounce 後に onChange 呼出を pin

- **[W-T-009]** `attributes` ロールバック経路が未検証
  - 提案: `p.setAttribute('data-foo', 'x')` で rollback されることを pin

- **[W-T-010]** `NoteEditor.onModeChange` の confirm 発動条件と blur → confirm → dispatch がユニット未検証
  - 提案: dirty / autosave saving / autosave error の 3 ケースで window.confirm が呼ばれることを pin

### Notes
- N-T-001〜N-T-007: 既存テストの surface 更新漏れなし、inline 素通し pin、happy-dom 枠選択妥当、external-value-sync テスト pin、disabled テスト pin、`pnpm test:unit` グリーン

---

## Design Decisions

このラウンドで見つかった設計判断:

- **ADR-008 候補**: 装飾範囲を含むペーストは rollback される（W-F-002 / W-T 関連）。ADR-003 の Consequences に追記する
- W-F-003（contenteditable リーク）と W-F-006/W-S-001（blur stale read）は要修正のため、ADR 追加ではなく実装修正で対応

---

## 修正方針

1. **要修正**: W-F-003 (contenteditable リーク)、W-F-006/W-S-001 (blur stale read)、W-F-001/W-F-005 (JSDoc)、W-F-007 (a11y)
2. **テスト追加**: W-T-001/002/003/004/005/006/007/008/009/010 を `inlineEditor.test.tsx` および `noteEditorModeChange.test.tsx`(新規) に追加
3. **ADR 追記**: W-F-002（装飾範囲ペーストの rollback トレードオフ）、W-S-001（blur stale read の解決手段）
4. **見送り**: W-F-004 (パフォ影響なし。冗長だが冪等)、W-S-002/W-S-003 (本 Issue スコープ外、別 Issue として記録または現状維持)
