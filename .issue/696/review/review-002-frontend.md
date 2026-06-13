# PR #715 レビュー Round 2 — Frontend 観点（Issue #696）

対象差分: `gh pr diff 715`（Round1 のテスト補強コミット `f2dd2e34` を含む）
実装変更ファイル: `EditorModeSwitch.tsx` / `NoteEditor.tsx` / `editorState.ts`（JSDoc のみ）+ テスト2件（`editorModeSwitch.test.tsx` 新規 / `noteEditorModeChange.test.tsx` 拡張）
照合: `.issue/696/plan.md` / `.issue/696/adr.md` / `ConfirmDialog.tsx` / `Dialog.tsx` / `WysiwygEditor.tsx` / `wysiwygUnsupportedTags.ts`
検証: `pnpm test:unit app/components/note/editor` = 262 passed（15 files）

## 総評

ゼロベースで見直しても、コンポーネント設計・状態管理・ConfirmDialog の使い方・styling 規約・a11y・二重同意回避はいずれも妥当で、AC-1〜AC-8 は実装またはテストで満たされている。reducer をモデル状態に限定し一過性 UI 状態（`pendingWysiwygSwitch: { lostTags } | null`）を orchestrator local state に置く判断、3段 dispatch（tags seed → ack → setMode）の順序、`subject` 不使用 + `description` ReactNode 構築、`role="alertdialog"` の既存 Dialog 流用（フォーカストラップ・スクロールロック・focus 復元込み）はすべて適切。新規 CSS は無く既存 utility/`data-*` パターンを踏襲しており styling 規約逸脱なし。

Blocker は無い。ただし **AC-6（新規作成画面の挙動は変わらない）に対して、装飾消失ゲートが surface 非依存に実装されている**ため、新規作成画面でも特定経路で挙動が変わる点を Warning として1件挙げる（実害は小さく、むしろ一貫性の向上だが、AC-6 の文言・テストカバレッジと食い違う）。

### Frontend

#### Blockers

なし

#### Warnings

- **[W-001]** 装飾消失ゲートが surface 非依存のため、新規作成画面（`mode="new"`）でも「HTML タブで非対応タグを入力 → WYSIWYG タブ」の経路で挙動が変わる（AC-6 の「新規作成画面の挙動は変わらない」と食い違う・かつ未テスト）
  - 場所: `app/components/note/editor/NoteEditor.tsx:241-247`（`onModeChange` の `nextMode === "wysiwyg"` 分岐は surface を見ていない）
  - 理由: ゲートは `nextMode === "wysiwyg"` のみを条件にしており `surface`/`props.mode` で分岐していない。新規作成画面の既定は WYSIWYG で初期 content が空のため通常は `detectUnsupportedTags("") === []` でダイアログは出ない。しかし新規作成画面でも「HTML タブに切り替えて `<section>` 等を含む生 HTML を入力 → WYSIWYG タブ」という操作をすると、本 PR 以降は装飾消失 `ConfirmDialog` が新たに出る。PR 前の新規作成画面ではこの経路にゲートは無く（同意は WYSIWYG ペイン内バナーのみが担っていた）、ダイアログは出なかった。したがって AC-6「新規作成画面の挙動には影響しない」は、空コンテンツ経路では成立するが、非空・非対応タグ経路では成立しない。テスト（`NoteEditor new surface switching is unchanged` の2ケース）はいずれも**空コンテンツ**のみを確認しており、この経路は pin されていない。
  - 提案: 挙動として「新規作成でも切替前に同意を取る」のは一貫性の向上であり、機能的にはむしろ望ましい。よって実装を edit 限定に絞る必要はおそらく無いが、(1) ADR/plan の AC-6 を「タブ構成は不変／ゲートは surface 共通だが新規は通常 content 空のため通常はダイアログ非発火」と実態に合わせて明記し直すか、(2) 新規作成画面で「HTML タブに非対応 HTML 入力 → WYSIWYG」でダイアログが出る（=新規でもゲートが効く）ことを意図挙動として1ケース pin する、のいずれかを推奨。現状は「AC-6 で不変と約束 → 実装は surface 共通 → テストは空 content のみ」で、約束・実装・テストの三者にズレがある点が弱い。

#### Notes

- **[N-001]** 状態配置・型設計が適切。`pendingWysiwygSwitch` を reducer ではなく `useState` に置く判断（ADR-002）は editorState を content/mode/autosave/dirty に限定する既存方針と一致。`{ lostTags } | null`（null=閉、非null=開＋表示タグ）は illegal state を排しており良い。`confirmWysiwygSwitch` が `pending === null` で早期 return するガードも防御的で妥当（`NoteEditor.tsx:253-275`）。
- **[N-002]** 3段 dispatch の順序が ADR-004 どおりで、reducer latch と整合。`wysiwygUnsupportedDetected`（同一集合 seed＝`editorState.ts:521` の `setsEqual` 短絡に当てる）→ `wysiwygUnsupportedAck`（`517` 空配列 no-op・`525` reset-on-change を回避）→ `setMode` の順で、WYSIWYG ペイン `onCreate` の再検出が ack を消さない。意図が手厚くコメント化されており（`NoteEditor.tsx:256-270`）、結合理由が追える。`onClose`（キャンセル）は保留クリアのみで `setMode` しないため AC-4 を満たす。
- **[N-003]** ConfirmDialog の使い方が ADR-001 どおり。`subject` を渡さないことで「削除対象」ラベル + `Trash2` 経路を回避し、`subject===undefined` 分岐で `AlertTriangle`（warning トーン）+ タイトルが出る（`ConfirmDialog.tsx:128-141`）。danger 固定の confirm ボタンを「切り替える」に当てる受容も ADR-001 のとおり。`Fragment key={tag}` は `detectUnsupportedTags` が sort 済み・重複なし集合を返すため key として安全。
- **[N-004]** a11y は既存 `ConfirmDialog`/`Dialog` の流用で担保され、Round2 で再確認しても穴は無い。`role="alertdialog"`（パネル自身が初期フォーカスを受ける）・`aria-labelledby`(title)・`aria-describedby`(desc) の woven・Tab フォーカストラップ・Esc（IME 合成中は無視）・スクロールロック・focus 復元はすべて `Dialog.tsx` 側に実装済み。`description` は `pendingWysiwygSwitch !== null`（= `open===true`）のときのみ非 undefined になるので `descId` が確実に `aria-describedby` に織り込まれ読み上げ対象になる。外側 `<form>` 内配置は ConfirmDialog の submit `stopPropagation`（`ConfirmDialog.tsx:105-115`）で保存フォーム誤送信を防ぐため安全。
- **[N-005]** EditorModeSwitch の変更は最小。`TABS_EDIT` への1行追加のみで `TABS_NEW`・`surface==="new"` 分岐は無改変。タブ並び `[ビジュアル, WYSIWYG, FrontMatter, HTML]` は ADR-003 どおりで既定モード(inline)のタブ位置を保持。先頭 JSDoc も「`wysiwyg` is reserved for the new-note surface」という旧記述を実態（edit でも WYSIWYG 選択可）に更新済みで、コメントとコードの乖離なし。`editorModeSwitch.test.tsx` が両 surface のタブ inventory を pin。
- **[N-006]** バレ `<code>`（className 無し）はダイアログ本文・WYSIWYG ペイン内バナー双方で共通の既存パターンであり本 PR 単体の逸脱ではない（Round1 W-002 と同件）。等幅化は両箇所まとめたフォローアップが筋。本 Issue では修正不要。
- **[N-007]** 二重同意回避が WysiwygEditor の `value` 不変性と reducer latch の reset-on-change 仕様への暗黙結合に依存する点（Round1 W-001）は ADR-004 が既知トレードオフとして認めており、AC-7 テストで pin・コメントで結合理由明示済みのため許容範囲。Round2 でも追加対応不要と判断。
- **[N-008]** エッジケースの割り切りが plan/ADR-002 と整合。判定対象は `latest.contentHtml`（= `stateRef.current`、committed HTML）で InlineEditor の debounce 未フラッシュ分は含まれ得ない点をコメント（`NoteEditor.tsx:231-240`）に明記。空 content は `detectUnsupportedTags` が `[]` を返し AC-3 経路（ダイアログ無し即切替）に乗るため illegal state にならない。
- **[N-009]** テストが AC を網羅し、Round1 指摘の補強も反映済み。AC-5 は単一 `toContain` から `detectUnsupportedTags` の正準出力（sort・重複排除・supported 除外）との完全一致 pin に強化（`lists every unsupported tag in sorted order...`）。AC-4 はキャンセル後に HTML タブで `<section>` 込みの原文保持を assert。AC-8 は WYSIWYG ゲート経路での abort + `contentHtml` 不変を pin。`isWysiwygMounted()` を `[role="toolbar"][aria-label="書式"]` で判定する手法も堅牢。
