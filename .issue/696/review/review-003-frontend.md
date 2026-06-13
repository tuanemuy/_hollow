# PR #715 レビュー Round 3 — Frontend 観点（Issue #696）

対象差分: `gh pr diff 715`（Round2 で装飾消失ゲートを `surface === "edit"` 限定に変更したコミットを含む）
実装変更ファイル: `EditorModeSwitch.tsx` / `NoteEditor.tsx` / `editorState.ts`（JSDoc のみ）+ テスト2件（`editorModeSwitch.test.tsx` 新規 / `noteEditorModeChange.test.tsx` 拡張）
照合: `.issue/696/plan.md` / `.issue/696/adr.md`（ADR-005 追記）/ `ConfirmDialog.tsx` / `WysiwygEditor.tsx` / `wysiwygUnsupportedTags.ts` / Round2 frontend レビュー
検証: `pnpm test:unit noteEditorModeChange.test.tsx editorModeSwitch.test.tsx` = 21 passed（2 files）

## 総評

Round2 の唯一の Warning（装飾消失ゲートが surface 非依存で AC-6 と食い違う）は、ゲート条件を `surface === "edit" && nextMode === "wysiwyg"` に絞り、`useCallback` 依存配列に `surface` を追加し、ADR-005 で判断を明文化し、新規画面の「HTML タブで非対応タグ入力 → WYSIWYG 切替でダイアログ非発火」を回帰テストで pin することで、約束（AC-6）・実装・テストの三者のズレが完全に解消された。

ゼロベースで再確認しても、(1) edit 限定ゲートの実装の正確さ、(2) `useCallback` 依存配列の網羅性、(3) 新規画面への影響ゼロ、(4) 二重同意回避の 3 段 dispatch、(5) ConfirmDialog の使い方・a11y・styling 規約のいずれにも問題は無い。AC-1〜AC-8 はすべて実装またはテストで満たされている。

Blocker・Warning ともに無し。

### Frontend

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** Round2 W-001 の修正が正確。`NoteEditor.tsx:246` のゲート条件は `surface === "edit" && nextMode === "wysiwyg"` で、新規画面（`surface === "new"`）はこの分岐に入らず `dispatch({ type: "setMode" })`（`:253`）へ直行する。`surface` は `props.mode === "new" ? "new" : "edit"`（`:196`）で導出され `onModeChange` クロージャが参照するため、`useCallback` 依存配列に `surface` を追加（`:255` `[abortInFlight, surface]`）したのは正しい。`surface` は `props.mode` から導出される実質不変値だが、依存に含めることで lint（exhaustive-deps）・将来の props 変化の双方に対して安全。why コメント（`:242-245`）も「新規画面は pre-#696 挙動を保ち、ペイン内バナーが唯一の装飾消失警告」と edit 限定の理由を明記しており、コードとコメントの乖離なし。

- **[N-002]** 新規画面への影響ゼロが実装・テスト両面で担保。`EditorModeSwitch` は `TABS_NEW`・`surface === "new"` 分岐を無改変（`EditorModeSwitch.tsx:36-40,54`）。`NoteEditor` のゲートは edit 限定。テストは `editorModeSwitch.test.tsx` が新規タブ inventory 不変を pin し、`noteEditorModeChange.test.tsx` の `NoteEditor new surface switching is unchanged` describe が (a) 既定 WYSIWYG マウント、(b) HTML↔WYSIWYG 空コンテンツ往復、(c) **HTML タブに `<section>` 生入力 → WYSIWYG 切替でも装飾ダイアログ非発火**（`:505-546`）の 3 ケースで新規挙動を直接 pin。(c) が Round2 で約束・実装・テストのズレを埋めた肝で、`alertDialog() === null` + `isWysiwygMounted() === true` を実観測している。AC-6 厳守を確認。

- **[N-003]** 二重同意回避の 3 段 dispatch が ADR-002/ADR-004 どおりで reducer latch と整合（`NoteEditor.tsx:276-278`）。`wysiwygUnsupportedDetected({ tags: pending.lostTags })`（同一集合 seed → `editorState` の `setsEqual` 短絡に当てる）→ `wysiwygUnsupportedAck`（reset-on-change を回避する後置）→ `setMode "wysiwyg"` の順。WYSIWYG ペイン `onCreate` の再検出（`WysiwygEditor.tsx:348-351`、original `value` に対して `detectUnsupportedTags` 実行）が同一集合を返すため ack が消えず、バナーは `role="note"`（控えめ・autosave 非停止）でマウント。AC-7 テスト（`:371-400`）が「同意 → WYSIWYG マウント → `onCreate` 再検出後もバナーは `role="note"` で『了解した』ボタン無し」を pin。`confirmWysiwygSwitch` の `pending === null` 早期 return（`:259-260`）も防御的で妥当。

- **[N-004]** 状態配置・型設計が引き続き適切。`pendingWysiwygSwitch: { lostTags } | null` を reducer ではなく orchestrator の `useState`（`:144-146`）に置く判断は editorState を content/mode/autosave/dirty に限定する既存方針（ADR-002）と一致。`null`=閉／非null=開＋表示タグで illegal state を排している。`editorState.ts` の変更は `EditorSurface` JSDoc を edit タブ集合 `inline / wysiwyg / frontMatter / html` に更新する 1 箇所のみ（reducer ロジック無改変）で、コメントが実態に追随。

- **[N-005]** ConfirmDialog の使い方が ADR-001 どおり。`subject` 不使用で「削除対象」+`Trash2` 経路を回避し、`subject === undefined` 分岐の `AlertTriangle`（warning トーン）+ タイトルが出る（`ConfirmDialog.tsx:128-141`）。`description` は `pendingWysiwygSwitch !== null`（=`open===true`）のときのみ非 undefined（`NoteEditor.tsx:532-546`）になるため `descId` が確実に `aria-describedby` に織り込まれる。`lostTags.map` の `<code>{`<${tag}>`}</code>` 区切り（`Fragment key={tag}`）は `detectUnsupportedTags` が sort 済み・重複なし集合を返すため key として安全。外側 `<form>` 内配置は ConfirmDialog の submit `stopPropagation`（`ConfirmDialog.tsx:105-115`）で保存フォーム誤送信を防ぐ。

- **[N-006]** a11y・styling 規約は既存 `ConfirmDialog`/`Dialog` の流用で担保され、新規 CSS は無く `data-*` + utility パターンを踏襲。`role="alertdialog"`・フォーカストラップ・Esc・スクロールロック・focus 復元は Dialog 側に実装済み。EditorModeSwitch のタブは `role="tab"`/`aria-selected`/`data-primary={isActive || undefined}`（`EditorModeSwitch.tsx:62-66`）で規約準拠。`role="tablist"` に `aria-label="編集モード"` あり。

- **[N-007]** 既知トレードオフは Round2 までで記録済みのため再掲のみ（蒸し返さない）: バレ `<code>`（className 無し）の等幅化はダイアログ／ペイン内バナー双方の共通パターンでフォローアップ余地（Round1 N-006）、二重同意回避が latch reset-on-change への暗黙結合に依存する点（Round1 W-001 / ADR-004、AC-7 テストで pin 済み）、判定対象が committed `contentHtml` で InlineEditor debounce 未フラッシュ分を含み得ない割り切り（ADR-002、コメント `:231-240` 明記）。いずれも本ラウンドで追加対応不要。

- **[N-008]** ADR-005 のトレードオフ（新規画面は「HTML→WYSIWYG」で事前ダイアログ無し・ペイン内バナーのみ、編集画面は事前ダイアログ、という二系統の UI 差）は妥当な判断。新規作成は「未保存の下書き」で喪失リスクが相対的に低く、AC-6（既存挙動の維持）を優先する根拠が明確。Frontend 観点でも一貫性より既存挙動保全を取る判断は受容範囲。
