# PR #831 レビュー（観点: Test）

対象 PR: #831 (`issue/825/mobile-editor-ux`, head `301934ad`)
実装計画: `.issue/825/plan.md`（AC-1〜AC-9 / テスト方針）
レビュー日: 2026-07-10

## サマリー

- 対象テスト: `noteEditorModeChange.test.tsx`（書き換え）, `wysiwygEditorToolbarOverflow.test.tsx`（新規）, `wysiwygEditorLinkDialog.test.tsx`（新規）, `wysiwygEditorImageButton.test.tsx` / `noteEditorImageButtonWiring.test.tsx`（影響再確認）
- 実行結果: 対象 5 ファイル 35 tests / editor `__tests__` 全体 30 files 481 tests いずれも **緑**（worktree で `vitest run` 実行、`pnpm test:unit` 相当の happy-dom 環境）。
- AC-8（テスト緑）は達成。`window.confirm` / `window.prompt` / `window.alert` のモックは editor テスト全体から**完全に除去**されており（残存はコメントのみ）、ネイティブダイアログ廃止後の検証はアプリ内ダイアログの DOM（`role="alertdialog"` / `role="dialog"` / `role="menu"`）ベースに正しく移行している。
- AC-4 / AC-5 は弁別的（1 ダイアログずつ・順序・二重プロンプト回避）に担保済み。#286 の fake-timers describe もボタン click 経路へ正しく書き換わり緑。
- 一方で **AC-6 の「挿入」「解除」の中核挙動（リンク実挿入 / unsetLink）に弁別的なユニット担保が無い**のが最大の弱点（下記 Warnings）。

## Test

### Blockers

- なし。テストは緑で、廃止したネイティブダイアログの検証移行・AC-4/AC-5・#286 fake-timers 書き換え・image button 再確認はいずれも妥当。

### Warnings

- **[W-001]** リンク挿入（AC-6 中核「挿入ができる」）が弁別的に検証されていない / `app/components/note/editor/__tests__/wysiwygEditorLinkDialog.test.tsx:117-124`（"closes the dialog on a valid URL submit"）
  - 理由: このテストは有効 URL 送信後に `linkDialog()` が null になること（＝ダイアログが閉じること）しか assert していない。`onChange` を捕捉しておらず（`mount()` の `onChange` は `vi.fn()` で捨てられる）、`onLinkSubmit` が実際に `editor...setLink({href})` を実行したことは一切確認していない。仮に `onLinkSubmit` が `setLink` を呼ばず `setLinkDialog(null)` だけしても、このテストは緑のまま通る。AC-6 の「挿入ができる」に対する回帰ゲートになっていない。
  - 提案: 同ファイルの overflow テスト（`onChange.mock.calls.at(-1)?.[0]).toContain("<h2")`）と同様に、`mount` で `onChange` スパイを渡し、有効送信後に `onChange` が `href="https://example.com"` を含む HTML で発火することを assert する。ハーネス（happy-dom + TipTap）が editor transaction → onChange 発火を扱えることは overflow テストで実証済み。

- **[W-002]** リンク解除（unsetLink / AC-6「解除ができる」）のユニット担保が皆無 / `app/components/note/editor/__tests__/wysiwygEditorLinkDialog.test.tsx` 全体
  - 理由: `hasLink=false`（新規挿入）時に「解除」ボタンが**無い**ことしか確認していない（L115）。既存リンクありのケース（`hasLink=true` → 「解除」表示 → クリックで `onRemove`/`unsetLink`）を通す弁別的テストが 1 本も無い。plan のテスト方針は明示的に「空/解除で `unsetLink`」を要求しており、本レビュー依頼でも「解除」を抜けケースとして指定している。
  - 提案: `LinkDialog` は `export` されており（`LinkDialog.tsx:41`）TipTap の選択状態に依存せず単体マウントできる。`hasLink={true}` + `onRemove` スパイでレンダーし、「解除」ボタンが出現し click で `onRemove` が呼ばれることを決定的に検証する（`WysiwygEditor` 経由だと `editor.isActive("link")` が cursor 位置依存で不安定になりやすいので、`LinkDialog` 直接テストが堅い）。

- **[W-003]** リンク編集分岐（`hasLink=true`：タイトル「リンクを編集」・URL プレフィル・「更新」ラベル）にユニットカバレッジが無い / `wysiwygEditorLinkDialog.test.tsx`
  - 理由: 新規挿入（`hasLink=false`）分岐のみユニットで押さえ、編集分岐は手動テスト（`.issue/825/manual-test/results/TC-4.md`）頼み。`initialHref` の seed（ADR-003-1「mount==open で reset effect 不要」）はまさに回帰しやすい実装判断であり、ユニットで固定しておく価値が高い。
  - 提案: W-002 と同じ `LinkDialog` 直接テストで、`initialHref="https://x.com"` `hasLink={true}` 時に URL 入力が当該値で初期化され、タイトル/ボタン文言が編集用に切り替わることを assert（W-002/W-003 は 1〜2 ケースで併せて解消可能）。

- **[W-004]** AC-3 の「メニューを開いた時点で適用中状態が判別できる（Check 表示）」に自動ゲートが無い / `wysiwygEditorToolbarOverflow.test.tsx`
  - 理由: overflow メニューの各項目に active 時 `Check` アイコンを出す実装（`WysiwygEditor.tsx:667-669`）に対し、ユニットで「active な書式を持つ状態でメニューを開くと該当項目に Check が出る」ことを検証していない。手動テスト `TC-1.md` 備考でも「選択位置依存で決定的に確認できず副次確認にとどめた」とされており、AC-3 のこの節は**自動・手動とも実質未担保**。
  - 提案: `WysiwygEditor` を `value="<h2>x</h2>"` 等（マウント時 cursor が見出し内に入る想定）でマウントしてメニューを開き、「見出し 2」項目内に Check（`text-accent` の SVG 等）が存在することを 1 ケース試みる。選択位置で不安定なら、少なくとも「非 active 時は Check が出ない」側だけでも固定するとゲート化できる。

### Notes

- **[N-001]** AC-1（390px で主要 6 + `⋯` が横スクロールなしに収まる）と AC-2（デスクトップは全 11 ボタンをインライン表示・`⋯` は DOM から消える）は CSS レイアウト依存で、happy-dom（CSS 非適用）では検証不能。`wysiwygEditorToolbarOverflow.test.tsx:1120-1122` が「`sm:hidden` は inert」と明記し、手動テスト（`TC-1`/`TC-desktop`：scrollWidth=clientWidth=358、desktop snapshot に `⋯` 不在）へ委譲している。ユニット層のスコープ境界として妥当。ただし AC-1/AC-2 の担保はレビュー時点で手動テストのみに依存している点は認識しておくべき。
- **[N-002]** overflow メニューの外側クリック dismiss・roving tabindex は手動テスト（`TC-edge2` / `TC-1`）と `Menu` プリミティブ側テストへ委譲。ユニットでは Escape + フォーカス復帰（`wysiwygEditorToolbarOverflow.test.tsx:1205-1218`）とメニュー項目集合の完全一致（L1196-1203、primary が混入しないことも同時に担保）を弁別的に押さえており、プリミティブ再利用の前提で許容範囲。
- **[N-003]** `disabled`（`isDisabled`）伝播はオーバーフロートリガー・メニュー項目については未検証（image/primary ボタンの disabled は `wysiwygEditorImageButton.test.tsx` で担保）。実装（トリガー `disabled={isDisabled}`、`MenuItem disabled={isDisabled}`）は妥当なので影響は小さいが、plan「disabled を一貫伝播」の観点では薄い。
- **[N-004]** セレクタは概ね堅い（`role` + `aria-label` / `textContent` 基準、CSS クラスや id 直打ちに依存しない）。unsaved/decoration ダイアログの弁別を文言サブストリング（"未保存の変更" / "WYSIWYG モードでは保持されません"）で行う設計（`noteEditorModeChange.test.tsx:160-173`）は、`role="alertdialog"` が両者共通のため妥当。`htmlTextareaValue()` の fallback セレクタ `'textarea[id*=":r"], textarea'`（同 L219-222）はやや緩いが単一 textarea 前提で実害なし。
- **[N-005]** AC-7 は非対応スキーム（`javascript:`）で `role="alert"` 表示 & ダイアログ継続を弁別的に担保（`wysiwygEditorLinkDialog.test.tsx:119-132`）。ただしエラー後に URL を修正して再送信できる（`onChange` で error クリア）ことは未検証。実装（`LinkDialog.tsx:83-85`）はあるので副次的。
