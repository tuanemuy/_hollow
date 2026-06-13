# PR #715 レビュー — Test 観点（Issue #696）

対象: `gh pr diff 715`
実装計画: `.issue/696/plan.md` / 設計判断: `.issue/696/adr.md`
照合した実コード/テスト:
- `app/components/note/editor/__tests__/noteEditorModeChange.test.tsx`（拡張）
- `app/components/note/editor/__tests__/editorModeSwitch.test.tsx`（新規）
- `app/components/note/editor/__tests__/editorState.test.ts`（既存・reducer latch）
- `app/components/note/editor/NoteEditor.tsx` / `EditorModeSwitch.tsx` / `WysiwygEditor.tsx` / `ConfirmDialog.tsx`

ローカル実行: `pnpm vitest run noteEditorModeChange editorModeSwitch` → **2 files / 16 tests passed**。

---

## AC → テスト対応マトリクス

| AC | 内容 | 対応テスト | 判定 |
|---|---|---|---|
| AC-1 | edit 画面に WYSIWYG タブが出て切替できる | `editorModeSwitch.test.tsx`「renders the WYSIWYG tab on the edit surface in the fixed order」+ `noteEditorModeChange`「switches without a dialog when only supported tags exist (AC-3)」で実切替も確認 | カバー |
| AC-2 | 非対応タグありなら切替前にダイアログ・同意まで切替らない | 「opens the warning dialog and defers the switch when unsupported tags exist」（`alertDialog()!=null` ＋ `isWysiwygMounted()==false`） | カバー |
| AC-3 | 非対応タグ無しはダイアログ無しで即切替 | 「switches without a dialog when only supported tags exist」 | カバー |
| AC-4 | キャンセルでモード・コンテンツ維持 | 「keeps mode and content when the dialog is cancelled」 | カバー（W-001 参照） |
| AC-5 | 失われる要素が一覧で確認できる | AC-2 テスト内 `toContain("<section>")` ＋本文文言 | カバー |
| AC-6 | new 画面のタブ構成・切替挙動は不変 | `editorModeSwitch.test.tsx`「leaves the new surface tab set unchanged」 | 部分カバー（W-002 参照） |
| AC-7 | 未保存→装飾警告の順、二重同意なし（latch 依存） | 「switches and acks the in-pane banner when confirmed」＋「runs unsaved-confirm before the decoration dialog…」 | カバー（良好） |
| AC-8 | 切替は contentHtml 不変・in-flight cancel テスト green | 既存 Issue #286 cancel テスト群（HTML タブ経路）が green | 部分カバー（W-003 参照） |

---

## Test

### Blockers

なし。

全 AC に対応するテストが存在し、ローカルで 16 件すべて green。新規導入の最重要結合点（ADR-004 の dispatch 順序＝latch 依存の二重同意回避）が `noteEditorModeChange` の AC-7 ケースで end-to-end に pin され、その前提となる reducer の latch 挙動（`setsEqual` 短絡・reset-on-change・冪等 ack）が `editorState.test.ts` L586-660 で網羅されている。既存テストの破壊も無し（HTML タブ経路はダイアログを挟まないため `tabByLabel("HTML")` 系は不変、in-flight cancel 系も無傷）。Blocker 相当の抜けは見当たらない。

### Warnings

- **[W-001]** AC-4「コンテンツ維持（装飾が破壊されない）」のうち「コンテンツ維持」がモード非切替の確認に留まり、装飾そのものの保持を直接 assert していない。
  - 場所: `app/components/note/editor/__tests__/noteEditorModeChange.test.tsx:285-297`
  - 理由: テストは `isWysiwygMounted()==false`（= inline ペインのまま）でモード維持を pin しているが、AC-4 の主旨である「`<section>` 等の装飾コンテンツが破壊されずに残る」ことは検証していない。実装上 `setMode` しない＝`contentHtml` に触れないので維持されるが、回帰時に「キャンセル経路で誤って正規化/書き換えが入った」場合をこのテストは捕まえられない。
  - 提案: キャンセル後に inline ペイン（または `state.contentHtml`）へ `<section>` が残存していることを 1 行 assert する（例: 復帰した inline ペインの DOM もしくは HTML タブに切り替えて `<section>` を含むことを確認）。コストは低く、AC-4 の「装飾が破壊されない」を字義どおり pin できる。

- **[W-002]** AC-6 のうち「切り替え挙動は変わらない」がタブ在庫（`tabLabels()`）の比較のみで、new 画面の `onChange`/切替フローの不変は pin されていない。
  - 場所: `app/components/note/editor/__tests__/editorModeSwitch.test.tsx:1060-1063`
  - 理由: `EditorModeSwitch` は純コンポーネントのため、ここで検証できるのはタブ集合と click→`onChange` 通知まで。AC-6 が言う「切替挙動が変わらない」（= new 画面では WYSIWYG への装飾ゲートが働かない＝ダイアログを挟まず即切替）の保証は、`NoteEditor` を `mode="new"` でレンダリングする結合テストが無いと担保されない。本変更のゲートは `surface` 非依存ではなく `nextMode === "wysiwyg"` 条件で発火するため、new 画面でも非対応タグ HTML を初期値に持てば理屈上ダイアログが出うる（new は初期 contentHtml が空なので実害は無いが、その「実害無し」自体がテストで固定されていない）。
  - 提案: 任意。`mode="new"` の `NoteEditor` で WYSIWYG が初期表示・タブ切替してもダイアログが出ないことを 1 ケース足すと AC-6 の「挙動不変」が orchestrator レベルで pin できる。最低限、テスト名／コメントで「`editorModeSwitch` の検証範囲はタブ在庫のみ、new 画面の切替フロー不変は別途担保が無い」ことを明示しておくと誤解を防げる。

- **[W-003]** AC-8 に「WYSIWYG 切替で autosave が壊れない」を WYSIWYG 経路で直接示すテストが無く、既存の HTML 経路の in-flight cancel テスト（Issue #286）の green を流用している。
  - 場所: `app/components/note/editor/__tests__/noteEditorModeChange.test.tsx:392-637`（既存・HTML タブ経路）
  - 理由: plan AC-8 は「既存 in-flight saveDraft cancel テストが green のまま」を合格条件にしており、その条件は満たしている。ただし「WYSIWYG への切替時に `contentHtml` が変更されない」「装飾ゲート同意経由でも autosave が破壊されない」を WYSIWYG タブ経路で観測するテストは無い。confirm ハンドラは `setMode` に加え `wysiwygUnsupportedDetected`/`wysiwygUnsupportedAck` を発行するため、HTML 経路とは dispatch 列が異なる。autosave 停止ゲート（`shouldFlushAutosave`）が WYSIWYG×ack 済みで非停止であることは `useAutosave` 側で担保されるが、本 PR の confirm 経路と autosave の結合は pin されていない。
  - 提案: 任意（plan の合格条件は満たすため必須ではない）。AC-3/AC-7 の WYSIWYG マウント後、autosave が `ack=true` で停止していない（=「確認するまで自動保存は一時停止」バナーの停止文言が出ない／flush が走る）ことを 1 行添えると、AC-8 を WYSIWYG 経路でも closed-loop にできる。

- **[W-004]** AC-2/AC-5 の「失われる要素」assertion が `toContain("<section>")` の単一タグ確認に留まり、複数タグ／並び（ソート）／対応タグの混在除外を pin していない。
  - 場所: `app/components/note/editor/__tests__/noteEditorModeChange.test.tsx:268`
  - 理由: フィクスチャが `<section><p>x</p></section>` のため lostTags は `[section]` のみ。`detectUnsupportedTags` のソート（`wysiwygUnsupportedTags.ts` L111）や「対応タグ `<p>` は一覧に出ない」という選別ロジックは、ここでは効いていない（`<p>` 一致でも `toContain` は別物）。実装が将来「全タグを羅列する」誤りに退行しても `<section>` を含む限りこのテストは通る。なお `detectUnsupportedTags` 自体の選別・ソートは `wysiwygUnsupportedTags.test.ts` でカバーされているため二重テストは不要だが、ダイアログ描画が「lostTags をそのまま並べる」結合点は未 pin。
  - 提案: 任意。複数非対応タグ（例 `<section><table>...`）フィクスチャで、ダイアログ本文が複数 `<code>` を期待順に出し、かつ対応タグ（`<p>`）を含まないことを 1 ケース足すと AC-5 の「一覧で確認できる」を厳密化できる。seed-data には既に table 系フィクスチャがある（手動テスト TC-2）ので、ユニットでも同等を固定する価値はある。

### Notes

- **[N-001]** latch 依存の暗黙結合（ADR-004）を pin する意図が、テストコメント（`noteEditorModeChange.test.tsx:247-256`, `316-323`）で明確に言語化されている。「ConfirmDialog の lostTags と onCreate 再検出が同一集合 → `setsEqual` 短絡で ack 維持 → 再同意ボタンが出ない」という結合理由が将来の読者に伝わる形で残っており、plan のテスト方針「latch 依存の暗黙結合をテストコメントに残す」が確実に履行されている。良い。

- **[N-002]** AC-7 の二重同意回避を 2 軸（「同意後に再同意ボタンが出ない」＝`role="note"` 存在＋`了解した` 不在 / 「未保存確認→装飾警告の順序＋ダイアログは 1 枚だけ」＝`confirmMock` 呼数＋`querySelectorAll('[role="alertdialog"]').length===1`）で pin しており、ADR-002/ADR-004 の意図に正確に対応している。特に `了解した` テキスト不在の否定 assertion は、WysiwygEditor の ack 分岐（`WysiwygEditor.tsx:512-539`：未 ack 時のみ `了解した` ボタン）を正しく利用した堅い判定。

- **[N-003]** モック戦略が妥当。WYSIWYG ペインのマウントで必要になる `searchInternalLinkTargetsFn` を `useServerFn` ルーター・`@/components/note/actions` の両方に追加し、追加理由（「モジュールレベル読み取りで throw させないため、クエリ自体は走らない」）をコメントで明示（L39-46）。過剰モックではなく、新たにマウントされる依存だけを最小限で塞いでいる。

- **[N-004]** セレクタが脆弱でない。モード判定を class 名でなく `role="toolbar"][aria-label="書式"`（WYSIWYG 固有マーカー）、ダイアログを `role="alertdialog"`、バナーを `role="note"`/`role="alert"` というアクセシビリティロールで拾っており、スタイル変更に強い。`isWysiwygMounted()` のヘルパ化とコメントも適切。

- **[N-005]** 追加の堅牢性ケース「does not switch to WYSIWYG when the unsaved confirm is cancelled」（`confirmMock.mockReturnValue(false)`）が AC に直接対応しないが、「未保存確認キャンセル → 装飾ゲートに到達しない（ダイアログも出ない・切替もしない）」という分岐順序を pin しており、回帰防止として有用。AC 表に無い経路まで押さえている点は加点。

- **[N-006]** reducer の latch 不変条件（空配列 no-op / 同一集合・順序違いの referential no-op / 異集合での ack reset / 冪等 ack）が `editorState.test.ts` L586-660 で網羅済み。本 PR の confirm ハンドラ（ADR-004 の seed→ack→setMode 順）はこの latch 仕様の上に成立しており、ユニット（reducer）＋結合（NoteEditor）の二層で重複なく守られている。テスト層の分担が `docs/test.md` の「domain/ロジックは局所 unit、orchestration は結合」方針に沿う。

- **[N-007]** ダイアログ本文文言の一致が取れている。実装 `NoteEditor.tsx`「次の要素は WYSIWYG モードでは保持されません:」/ 確認ラベル「切り替える」/ キャンセル「キャンセル」（`ConfirmDialog.tsx:172`）と、テストの期待文字列（`noteEditorModeChange.test.tsx:269-271, 305, 292`）が一致。plan テスト方針「本文文言とテスト期待文字列を一致させる」が守られている。バナー側の文言（acked: 「以下の要素は…」）と実装（`WysiwygEditor.tsx:516`）も整合。

---

## 総評

テスト設計は質が高い。最重要の latch 依存結合（ADR-004）が end-to-end と reducer の二層で pin され、セレクタはアクセシビリティロール基準で堅牢、モックは最小限、文言一致も取れている。既存テストの破壊も無い。Blocker は無し。

Warning はいずれも「合格条件は満たすが、AC の字義をより厳密に固定する余地」のレベル（AC-4 の装飾保持の直接確認、AC-6 の new 画面切替フロー、AC-8 の WYSIWYG 経路 autosave、AC-5 の複数タグ／選別）。W-001 は AC-4「装飾が破壊されない」を直接 pin していない点で優先度がやや高いが、実装が `setMode` のみで `contentHtml` 不変であることから実害は低く、Blocker には当たらない。
