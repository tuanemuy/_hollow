# PR #722 レビュー — Frontend 観点 (Issue #697)

対象: `app/components/note/editor/` 配下（FrontMatter モード廃止＋メタデータ下部常設）
基準: `.issue/697/plan.md` / `.issue/697/adr.md` / CLAUDE.md（Frontend / Styling 規約）

検証済み事項:
- `pnpm typecheck` パス（`tsgo`、エラーなし）
- editor 配下テスト 318 件すべてパス（18 ファイル）
- `biome check` を PR 変更対象 8 ファイルに実行 → 警告ゼロ（残る 15 警告は未変更の `inlineEditor.test.tsx` 由来で本 PR 無関係）

---

## Frontend

### Blockers

なし。

`EditorMode` から `frontMatter` 除去の波及は漏れなく潰れている。型・タブ定義・テストの参照箇所をすべて確認し、残存する本文モードとしての `"frontMatter"` 参照は無い。WYSIWYG 装飾消失ゲート（#696）・confirm・abortInFlight の同居ロジックは完全に温存され、blur コメントの書き換えも実コードの挙動（アンマウント前提の消滅／dirty 鮮度のための blur）と整合している。

### Warnings

- **[W-001]** 常設化した `FrontMatterEditor` 領域に programmatic なラベル（landmark / heading / `aria-label`）が無い
  - 場所: `app/components/note/editor/FrontMatterEditor.tsx:281`（ルート `<div className="mt-4 rounded-lg border ...">`）
  - 理由: 従来は「FrontMatter」タブ＋タブパネルが「ここはメタデータ編集領域」という文脈をスクリーンリーダーに与えていた。常設化でタブが消え、ルートは無名の `<div>` になったため、本文エディタ直下に現れる一連のキー/値入力が「何の領域か」を支援技術が判別する手がかりが減った。`NoteEditor` 側にも `<section>`/heading のラップは無い（`grep` で landmark なし、唯一の `<h1 className="sr-only">` はフォーム全体タイトル）。視覚的には border+elevated 背景で区切られるが、非視覚ユーザーには区切りが伝わらない。
  - 提案: plan ステップ4・arch-risk S-002 で「見出しラベルは任意（AC 外）」とされた範囲だが、アクセシビリティ回帰の観点では `<section aria-label="メタデータ">` などの軽量ラベル付与を推奨。AC を満たすための必須ではないため Blocker ではなく Warning。スコープを締めて見送る場合は、その判断を本 Issue または follow-up に明記しておくとよい。

### Notes

- **[N-001]** `EditorMode` 型から本文モードとしての `frontMatter` を除去し、`DirtyKey` の `"frontMatter"`（editorState.ts:81, 644）と FrontMatter 状態/アクション群（`setFrontMatterField` 等）・`frontMatterMode`/`frontMatterRawJson`/`frontMatterJsonError` は正しく温存している。型値（本文モード）とダーティキーの同名衝突を取り違えず切り分けられており、ADR-002 の「`frontMatterMode` を reducer に残し EditorMode と直交させる」方針どおり。reducer の純粋性も維持。
- **[N-002]** `FrontMatterEditor` の常設マウント配置は妥当。html/inline/wysiwyg の各本文ペイン（条件分岐）の後、`submitError` 表示の手前にフラットに置かれ、本文モードと完全に独立して動く（条件分岐なし）。props 受け渡しは旧排他分岐から無変更で流用され、欠落なし。`disabled={isPending}` も維持。
- **[N-003]** `onModeChange`（NoteEditor.tsx:194-254）の整理が良い。blur → dirty 再評価 → unsaved-confirm → `abortInFlight` → WYSIWYG 装飾消失ゲート（`surface==="edit" && nextMode==="wysiwyg"` → `detectUnsupportedTags` → `setPendingWysiwygSwitch`）→ `setMode` の順序がそのまま保たれている。コメントの書き換えは ADR-001(B) のとおり「アンマウント前提」を削除し「フォーカス中フィールド（title / tag draft / FrontMatter KeyRow buffer）の未コミット commit を flush し dirty 鮮度を担保する」根拠へ正確に置換されており、事実と整合している。`FrontMatterEditor.handleToggleMode` 内の blur コメントも「FrontMatter」→「inline」へ追従修正済み。
- **[N-004]** Styling 規約準拠。新規の手書き CSS・`@apply` は無し。utility-first を維持し、既存の `mt-4 rounded-lg border border-hairline bg-surface-elevated p-5` をそのまま流用（純レイアウト、新規ハンドラ無し）。`styles.ts` への不要な定数追加も無い。data-* state styling・reducer 純粋性に影響する変更も無い。
- **[N-005]** テスト更新が AC を的確に pin している。`editorModeSwitch.test.tsx`（edit=[ビジュアル,WYSIWYG,HTML] / new=[WYSIWYG,HTML]）で AC-1、`noteEditorModeChange.test.tsx` の新規 describe で AC-2（本文モード問わず常設マウント）と AC-5（dirty→unsaved-confirm 経路を通した上で FrontMatter 値が保持される）をカバー。`editorState.test.ts` の `setMode mode:"frontMatter"` ケース削除、`autosaveLogic.test.ts` の `frontMatter`→`inline` 置換とコメント更新も plan どおり。コメントは why 中心でノイズが無い。
- **[N-006]** plan-review S-001 で指摘された `htmlTextareaValue()`（noteEditorModeChange.test.tsx:208、`'textarea[id*=":r"], textarea'` の first-match）と常設 raw textarea の衝突は実害なし。FrontMatter 既定は `structured` で raw textarea が DOM に出ず、かつ `FrontMatterEditor` は HTML ペインより後ろの DOM 順に置かれるため first-match は常に HTML 側。テストも全パス。ただし「DOM 順 + structured 既定」という暗黙の前提に依存する点は将来 raw 既定化やレイアウト変更時に脆い。現状は問題なし（情報共有）。
- **[N-007]** 常設化により autosave / 保存の FrontMatter JSON エラーゲート（`saveDisabled` の `frontMatterJsonError !== null`、`shouldFlushAutosave`）が本文モードに関わらず常時効くようになる副作用は、plan リスク欄・manual-test TC-EDGE-1 で意図どおりと確認済み。本文編集中でも raw JSON が壊れていれば保存ボタンが無効化される挙動は仕様として妥当。
- **[N-008]** AC-6（typecheck/lint/format）・AC-7（関連テスト）は本レビューで再現確認済み（typecheck パス／editor テスト 318 件パス／変更ファイル biome 警告ゼロ）。`spec/design/pages/P12-editor.html` のドキュメント乖離は plan どおりスコープ外（spec-sync 委譲）。
