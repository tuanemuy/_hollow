# PR Review #001 — feat(note): P12 WYSIWYG editor with TipTap (Issue #9)

**PR:** #35
**Date:** 2026-05-17
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 14（Frontend 6 + Test 8）
- Notes: 13（Frontend 8 + Test 5）
- Verdict: **BLOCKED**（Warning 修正後に再レビュー）

---

### Frontend

#### Blockers
なし

#### Warnings

- **[FE-W-001]** ツールバーのアクティブ状態表示なし
  - 場所: `app/components/note/editor/WysiwygEditor.tsx:107-190`
  - 理由: Bold/Italic 等のボタンが `editor.isActive(...)` を反映せず、`aria-pressed` も付かない。コードベース慣習（EditorModeSwitch の `aria-selected`、FrontMatterEditor の `aria-pressed`）から乖離
  - 提案: `aria-pressed={editor?.isActive("bold")}` を付与し、`className` で active 状態を表す

- **[FE-W-002]** `window.prompt` のリンク URL にスキーム検証なし
  - 場所: `app/components/note/editor/WysiwygEditor.tsx:90-102`
  - 理由: ユーザーが `javascript:` を入力するとサーバー保存時には弾かれるが、エディタ表示中はそのまま残る。`Link.configure({ isAllowedUri })` で許可スキームを `["http", "https", "mailto"]` に絞ると整合
  - 提案: `Link.configure` に `isAllowedUri` を追加 or 入力時のプレチェック

- **[FE-W-003]** `onChange` プロップが `onUpdate` クロージャに初回キャプチャされる
  - 場所: `app/components/note/editor/WysiwygEditor.tsx:50-66`
  - 理由: TipTap `useEditor` の挙動として既知。現状は `dispatch` 経由なので動くが、将来 `onChange` で他の state を参照しようとすると即座にバグ化
  - 提案: latest-ref パターン（`onChangeRef = useRef(onChange)` + `useEffect`）に変更

- **[FE-W-004]** `value` 同期 effect が自己発火由来の更新を区別しない
  - 場所: `app/components/note/editor/WysiwygEditor.tsx:68-72`, `NoteEditor.tsx:281`
  - 理由: ガードで無限ループは防げているが、TipTap parse 正規化の差分でカーソルリセット副作用の可能性
  - 提案: JSDoc に注記、または `lastEmittedHtml` ref で自己発火フィルタ

- **[FE-W-005]** ツールバー a11y ラベルが英語のまま
  - 場所: `app/components/note/editor/WysiwygEditor.tsx:107-190`
  - 理由: 周辺コンポーネントは日本語で統一されているのに、このツールバーだけ「Bold/Italic/Strike/...」が英語表示・英語スクリーンリーダー読み上げ
  - 提案: 各ボタンに `aria-label="太字"` 等の日本語ラベル付与

- **[FE-W-006]** `setMode` で WYSIWYG タブに切替直後の TipTap 正規化で dirty 化される
  - 場所: `app/components/note/editor/editorState.ts:280-283`, `NoteEditor.tsx:277-291`
  - 理由: TipTap マウント時の `content: value` parse → `getHTML()` がユーザー HTML と異なると `onUpdate` が発火して dirty 化。「触ってないのに保存ボタン押せる」状態
  - 提案: 初回マウント時 `onUpdate` を抑止（latest-ref パターンで `editor.getHTML() === initialContent` を判定）

#### Notes
- N-001〜N-008: WysiwygEditor の `immediatelyRender: false` / `emitUpdate: false` / `StarterKit.configure({ link: false })` / `Image.configure({ inline: false, allowBase64: false })` 等は ADR 整合。JSDoc も WHY 記述あり。ADR-004（v3 採用）・ADR-005（happy-dom）も適切に記録

---

### Test

#### Blockers
なし

#### Warnings

- **[TS-W-001]** `MEDIA_ID_FROM_URL` 正規表現の重複定義
  - 場所: `app/components/note/editor/__tests__/wysiwygSanitizerIntegration.test.ts:98`
  - 理由: `service.ts:51` の `MEDIA_ID_FROM_URL` は非 export。テスト側で同じ regex を再定義しているため、実装側が変更されてもテストは通過する偽 PASS リスク
  - 提案: `service.ts` から `MEDIA_ID_FROM_URL` を export してテストで import 使用

- **[TS-W-002]** サニタイザ通過後の `/media/<id>` 保持が未検証
  - 場所: `app/components/note/editor/__tests__/wysiwygSanitizerIntegration.test.ts:85-104`
  - 理由: TipTap 出力 → サニタイザ → `MEDIA_ID_FROM_URL` 抽出の 3 段ラウンドトリップが必要だが、現状は 1 段目で停止
  - 提案: `sanitizer.sanitize(html, POLICY).html` の結果に対して `MEDIA_ID_FROM_URL.exec` を実行

- **[TS-W-003]** `removed` フィルタの意図が不明瞭
  - 場所: `app/components/note/editor/__tests__/wysiwygSanitizerIntegration.test.ts:76-79`
  - 理由: `result.removed.filter(r => editorTags.includes(r.tag))` だと「想定外 attr が出ても通過」する可能性
  - 提案: `reason === 'disallowed tag'` でフィルタするか、`result.html` の存在 assert に変更

- **[TS-W-004]** エッジケース未カバー（空 HTML、`javascript:`、`data:` URL）
  - 場所: `app/components/note/editor/__tests__/wysiwygSanitizerIntegration.test.ts` 全体
  - 理由: 受入条件 (3) 自動保存互換と TC-008 既知リスクが自動回帰されていない
  - 提案: 空 HTML / `javascript:` href / `data:` src の 3 ケースを追加

- **[TS-W-005]** `setMode` テストが「dirty 立てない」のみで autosave 不変条件が浅い
  - 場所: `app/components/note/editor/__tests__/editorState.test.ts:243-249`
  - 理由: dirty 状態 / saving 状態で setMode しても autosave が壊れないことが未検証
  - 提案: saving / dirty 状態からの setMode テストを追加

- **[TS-W-006]** WysiwygEditor 本体の自動テスト欠落
  - 場所: `app/components/note/editor/WysiwygEditor.tsx` 全体
  - 理由: 初回マウント `onUpdate` の発火有無（TC-008 観察事象の根本）が自動回帰されていない
  - 提案: 初回マウントで `onChange` が呼ばれないこと、外部 value 更新で `onChange` が呼ばれないことの 2 件追加

- **[TS-W-007]** TC-005 / TC-006 が PARTIAL PASS のままステージング再検証のフォローアップ追跡なし
  - 場所: `.issue/9/manual-test/results/TC-005.md`, `TC-006.md`, `summary.md`
  - 理由: dev 環境制約による SKIP のままで progress.md 以外に追跡先なし
  - 提案: progress.md / PR description に明示

- **[TS-W-008]** TC-008 で観察した「切替時点で contentHtml がロスト済み」事象の根本原因解析未了
  - 場所: `.issue/9/manual-test/results/TC-008.md:32-43`
  - 理由: `WysiwygEditor.tsx:62-64` の `onUpdate` 初回呼出疑い。`emitUpdate: false` と矛盾する挙動が放置されている
  - 提案: `onUpdate` 初回呼出を確認・抑止、もしくは ADR / progress.md で明示記録

#### Notes
- N-001〜N-005: happy-dom 環境指定、`editor.destroy()` の try/finally、既存テスト非破壊、`setMode` referential no-op の確認等は適切

---

## Design Decisions

- **本ラウンドで修正対象**: FE-W-001, FE-W-002, FE-W-003, FE-W-005, FE-W-006, TS-W-001, TS-W-002, TS-W-004, TS-W-005, TS-W-006 + 初回 onUpdate 抑止（FE-W-006 と TS-W-008 と TS-W-006 を一括で解消）
- **記録のみ（progress.md 追記）**: TS-W-007（dev 環境制約のステージング再検証）, FE-W-004（JSDoc 注記）
- **本 PR 内で完結**: 全 Warning。Issue 本体スコープ外の指摘は無し
