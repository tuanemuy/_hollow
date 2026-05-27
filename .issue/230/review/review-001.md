# PR Review #001 — refactor(note): switch FrontMatter editor to generic key-value model

**PR:** #237
**Date:** 2026-05-27
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 17
- Notes: 20+
- Verdict: **BLOCKED**

---

## Frontend

### Blockers
- なし

### Warnings
- **[W-FE-001]** IME 入力中の Enter キーで未確定の文字列が確定される
  - 場所: `app/components/note/editor/FrontMatterEditor.tsx:125-130, 264-269`
  - 理由: 日本語 IME 変換確定 Enter が即 `commitKey` / `commitNewKey` を発火。既存パターン: `NotePickerDialog.tsx:166`, `Dialog.tsx:207` で `event.nativeEvent.isComposing || event.keyCode === 229` ガード
  - 提案: 両 onKeyDown で composing ガードを追加
- **[W-FE-002]** 重複キー reject 後にローカルバッファが古い状態のまま残る
  - 場所: `FrontMatterEditor.tsx:91-94, 100-111`
  - 理由: reducer reject → `frontMatter` 不変 → `useEffect([fmKey])` 走らず → `keyBuffer` が拒否値のまま。再 blur で同じ拒否が再発火
  - 提案: rename 前に UI 側で重複チェックして dispatch を抑止、または reject 時にバッファを fmKey に巻き戻す
- **[W-FE-003]** 新規キー追加 reject 時に `newKeyBuffer` が消えてユーザーが入力内容を失う
  - 場所: `FrontMatterEditor.tsx:206-211`
  - 理由: `commitNewKey` が成否に関わらず `setNewKeyBuffer("")`
  - 提案: 重複チェックを UI 側で行い dispatch 抑止、または成功時のみクリア
- **[W-FE-004]** モード切替時の強制 blur が ADR-003 違反（実装漏れ）
  - 場所: `FrontMatterEditor.tsx:218-225`, `NoteEditor.tsx:269-272`
  - 理由: ADR-003 で「pending 状態でのモード切替時はフォーカスを強制 blur して commit、失敗時はモード切替中止」と決めているが、`onToggleMode` / `setMode` ともに blur 強制なし → pending な rename が unmount で失われる
  - 提案: トグルボタン onClick / モード切替前に `document.activeElement.blur()` を呼ぶか、`flushSync` 経由で commit する
- **[W-FE-005]** プリミティブ値の型が一律 string に劣化するが UI 上のヒントなし
  - 場所: `FrontMatterEditor.tsx:156-171`
  - 理由: `number: 1` 編集で `"1"` に劣化。ADR-005 で許容済みだが UI に何のヒントもない
  - 提案: `data-value-kind` 属性 + サブテキスト「数値・真偽値は raw モードで型を保持」
- **[W-FE-006]** 構造モードのエラー表示が英語のみで文脈なし
  - 場所: `editorState.ts:268, 274, 292, 298`, `FrontMatterEditor.tsx:227-232`
  - 理由: `"key already exists: foo"` のような裸の英文。日本語 UI で粗い
  - 提案: 構造化エラー（`{ code, key }`）を返し UI で日本語化
- **[W-FE-007]** 重複キー警告に `aria-live` 永続コンテナがない
  - 場所: `FrontMatterEditor.tsx:227-232`
  - 理由: `role="alert"` 要素の動的出し入れで SR 通知が漏れる可能性
  - 提案: 親 div に `aria-live="polite"` を入れた永続コンテナにする
- **[W-FE-008]** `newKeyInputRef` が使われていないデッドコード
  - 場所: `FrontMatterEditor.tsx:203, 260`
  - 理由: `useRef` だけ作って `.focus()` を呼んでいない
  - 提案: 使わないなら ref ごと削除
- **[W-FE-009]** 値表示の三項ネストが冗長
  - 場所: `FrontMatterEditor.tsx:159-165`
  - 理由: `shape.kind === "string"` と末尾 fallback が同じ
  - 提案: `value={shape.kind === "null" ? "" : shape.text}` に縮約

### Notes
- ADR/plan/実装の整合は概ね高い
- `KeyRow` の `useEffect([fmKey])` resync 設計は React 19 controlled input の典型パターン
- `FrontMatterPanel.tsx` の `KNOWN_` 接頭辞定数は撤去後の rename 候補
- 共通スタイル定数の流用、新規 CSS なしで utility-first ポリシーに準拠
- complex 値 disabled + 削除ボタン有効の救済策が正しく実装
- `aria-pressed` 属性が a11y 適切
- テストが豊富

---

## State Management / Reducer

### Blockers
- なし

### Warnings
- **[W-ST-001]** reject 経路の `frontMatterJsonError` がモード切替で消える副作用
  - 場所: `editorState.ts:265-276, 288-300, 326-332`
  - 理由: rename / add reject エラーが残ったまま raw モードへトグルすると `toggleFrontMatterMode` の structured→raw 分岐が `frontMatterJsonError: null` で常に上書きする。ADR-003 で「commit 失敗時はモード切替中止」と決めているが enforcement なし
  - 提案: UI 側で `parseError !== null` のとき onToggleMode を抑止 or reducer 側で分岐
- **[W-ST-002]** ADR-003 の「pending 状態でのモード切替時は強制 blur」が UI 未実装
  - 場所: `FrontMatterEditor.tsx:218-226`, `NoteEditor.tsx:269-272`
  - 理由: ブラウザフォーカス遷移の偶発性に依存。EditorModeSwitch でタブ切替時は KeyRow が unmount し pending buffer がサイレントに失われる
  - 提案: モード切替前に `document.activeElement?.blur()` を呼ぶフックを追加
- **[W-ST-003]** 同一キー rename 早期 return パスで残存エラーが画面操作で消せない
  - 場所: `editorState.ts:262-307`, `FrontMatterEditor.tsx:111-121`
  - 理由: 重複拒否後に key 入力に戻り「同じ name に戻して blur」しても `trimmed === fmKey` で `onRenameKey` を呼ばないため `frontMatterJsonError` 残置。autosave も `frontMatterJsonError !== null` でブロック
  - 提案: 同一キー commit でも `frontMatterJsonError` をクリアする dispatch を出す（`clearFrontMatterError` action 追加か）

### Notes
- `Object.entries` ベースの順序保持 rename は堅実
- 不変性徹底
- ADR-005 整合
- テストカバレッジ厚い
- `EditorAction` discriminator + 型安全性維持

---

## Test

### Blockers
- なし

### Warnings
- **[W-TS-001]** reducer 直接の `addFrontMatterKey("")` 経路、`renameFrontMatterKey(oldKey===newKey)` 早期 return が直接テストされていない
  - 場所: `editorState.test.ts:680, 745`
  - 理由: UI 側でガード済みだが、ガードが緩んだ時に検出できない
  - 提案: 上記 2 ケースの reducer 直接テスト追加
- **[W-TS-002]** 重複 rename / add テストが「rawJson / dirtyKeys 不変」を assert していない
  - 場所: `editorState.test.ts:686-688, 745-756`
  - 理由: ADR-003 の中核不変条件（pending に対する rawJson 上書き防止）がテストで担保されていない
  - 提案: `s1.frontMatterRawJson === s0.frontMatterRawJson` と `dirtyKeys` 不変の assert を追加

### Notes
- "preserves existing arbitrary keys" の assert は `mood/topic/new` の全 3 つを含めると意図が明確
- Enter コミットテストのコメント書き直し推奨
- "削除"/"キーを追加" ボタン取得方法の統一性
- React Testing Library 不使用は既存 NotePickerDialog と一貫
- snapshot test なし（適切）

---

## Spec / Documentation

### Blockers
- **[B-SP-001]** `spec/manual-tests/organize.md:245` TC-D6-02 が旧モデル（FrontMatter `tags` 書き換え）期待結果のまま
  - 場所: `spec/manual-tests/organize.md:245`
  - 理由: 本 PR の `scenario/organize.md:50` 改修と ADR-002 と直接矛盾
  - 提案: 期待結果から `tags: [idea] → tags: [concept]` を削除し、「本文 `#idea` → `#concept` のみ書き換え。FrontMatter は変更されない」に修正

### Warnings
- **[W-SP-001]** `spec/scenario/organize.md:34` D3 シナリオが「FrontMatter から付与」を残す
  - 場所: `spec/scenario/organize.md:34`
  - 理由: D4 / D6 の新モデルと内部矛盾
  - 提案: 「本文中の `#hashtag` から付与」に修正
- **[W-SP-002]** `spec/adr/003-metadata-formats.md:15` が FrontMatter 例に `tags` を残す
  - 場所: `spec/adr/003-metadata-formats.md:15`
  - 理由: 本 PR 整合のため例示から `tags` を除く or 注記追加
  - 提案: `tags` を例示から除外、または「現行: タグソースはハッシュタグに一本化」の注記
- **[W-SP-003]** `spec/manual-tests/organize.md:333` で「Front Matter」表記揺れ
  - 場所: `spec/manual-tests/organize.md:333`
  - 理由: 他 39 出現がすべて `FrontMatter` 一語
  - 提案: 一語表記に統一

### Notes
- spec/domains/note.md の `aliases` 記述: 実装で読まれていないなら現状で正しい
- spec/design/pages/P13-upload.html 1123 の `tags` 例示は将来別 Issue で
- spec/manual-tests/publish.md TC-F1-03 は publish 編集 UI のスコープ外と整合検討は別 Issue
- 過剰更新なし、markdown 構造健全、`既知キー`残存ゼロ

---

## Design Decisions

このラウンドで発見した重要な設計判断:

- ADR-003「pending 状態でのモード切替時は強制 blur」が実装漏れ → 修正対応で実装する
- 構造化エラー化 / 日本語化 / aria-live コンテナは UX 品質改善
- ADR-002 の「既存 frontMatter.tags は無視」の運用が manual-test 側で破られていた → 整合性回復

すべて修正対応する（後回しは TC-F1-03 関連の別ファイル更新のみ別 Issue 候補）。
