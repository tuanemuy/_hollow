# PR #715 レビュー — Test 観点（Issue #696）/ Round 2

対象: `gh pr diff 715`（Round1 のテスト補強コミット含む）
実装計画: `.issue/696/plan.md` / 設計判断: `.issue/696/adr.md`
Round1 テストレビュー: `.issue/696/review/review-001-test.md`（B:0 / W:4 / N:7）

照合したテスト/実コード:
- `app/components/note/editor/__tests__/noteEditorModeChange.test.tsx`（拡張）
- `app/components/note/editor/__tests__/editorModeSwitch.test.tsx`（新規）
- `app/components/note/editor/__tests__/editorState.test.ts`（既存・reducer latch）
- `app/components/note/editor/NoteEditor.tsx` / `EditorModeSwitch.tsx` / `WysiwygEditor.tsx` / `HtmlEditor.tsx` / `ConfirmDialog.tsx`

ローカル実行: `pnpm vitest run noteEditorModeChange editorModeSwitch` → **2 files / 20 tests passed**（Round1 の 16 件 + 補強 4 件）。

---

## Round1 指摘の解消状況

| 指摘 | 内容 | 解消状況 |
|---|---|---|
| **W-001** | AC-4「装飾が破壊されない」がモード非切替のみで content 保持を直接 assert せず | **解消**。`keeps mode and content when the dialog is cancelled (AC-4)` がキャンセル後に HTML タブへ切替→`htmlTextareaValue()`（= `state.contentHtml` バインド）が `original` と完全一致＋`<section>` 残存を assert。HtmlEditor は `value={state.contentHtml}`（NoteEditor.tsx:447）で、HTML タブ時は他ペイン非マウント＝textarea 一意なのでセレクタも誤検出しない。字義どおりの装飾保持を pin できている。 |
| **W-004** | AC-2/AC-5 が単一タグ `toContain("<section>")` のみで複数/ソート/対応タグ除外を未 pin | **解消**。`lists every unsupported tag in sorted order and excludes supported tags` を新設。`<section><table><tr><td>x</td></tr></table><p>y</p></section>` フィクスチャで `dialogListedTags()`（ダイアログ内 `<code>` 抽出）を `detectUnsupportedTags(html).map(t => <${t}>)` と `toEqual` で照合。サニティとして `expected.length > 1` と `<p>` 非含有も assert。ダイアログ描画 ↔ detector の結合がドリフトしたら落ちる堅い pin。二重テスト回避の判断（detector 単体は別ファイル）も適切。 |
| **W-002** | AC-6「new 画面の切替挙動不変」がタブ在庫比較のみで orchestrator 結合無し | **解消**。`NoteEditor new surface switching is unchanged` describe を新設し、`mode="new"` の NoteEditor で (1) 直接 WYSIWYG マウント＋ダイアログ非出現、(2) HTML→WYSIWYG 往復でゲート（`onModeChange`）を実際に通しても空 content で無ダイアログ＋`confirmMock` 未呼出、を pin。「ゲートは surface 非依存で nextMode 条件発火、空 content だから new は安全」という挙動を orchestrator レベルで固定。`editorModeSwitch.test.tsx` 側にも検証範囲がタブ在庫のみである旨のスコープコメントを追加済み。 |
| **W-003** | AC-8 を WYSIWYG 経路の autosave で直接示すテストが無く HTML 経路の green を流用 | **部分解消**（下記 W-001 参照）。WYSIWYG decoration-gate 経路で `abortInFlight` が走る（in-flight `saveDraft` の signal が aborted になる）ことは新規テストで直接 pin された。一方「切替が contentHtml を書き換えない」の観測が tautological（下記）。 |

Round1 で「直す」に仕分けされた 4 件はいずれも対応コミットが入り、AC→テスト対応マトリクスの抜けは実質埋まった。Round1 で良点として挙げた latch 結合の end-to-end pin（ADR-004）、a11y ロール基準のセレクタ、最小モック、文言一致は維持されている。

---

## Test

### Blockers

なし。

全 AC に対応するテストが存在し、ローカルで 20 件すべて green。最重要結合点（ADR-004 の seed→ack→setMode dispatch 順＝latch 依存の二重同意回避）が AC-7 ケースで end-to-end に pin され、reducer latch 仕様は `editorState.test.ts` で網羅。既存テスト（`tabByLabel("HTML")` 経路の confirm 条件、Issue #286 の in-flight cancel 群）の破壊も無い。Blocker 相当の抜けは無い。

### Warnings

- **[W-001]** AC-8 の「WYSIWYG 切替で `contentHtml` が書き換わらない」の assertion が tautological で、切替*後*の状態を観測していない。
  - 場所: `app/components/note/editor/__tests__/noteEditorModeChange.test.tsx:799-839`（`aborts in-flight saveDraft and preserves contentHtml on the WYSIWYG decoration-gate path (AC-8)`）
  - 理由: テストは切替*前*の in-flight payload を `const inFlightHtml = ...data.contentHtml` で捕捉し（L799-802 で `toBe(original)` 確認）、ダイアログ同意で切替を完了させた*後*に再度 `expect(inFlightHtml).toBe(original)`（L838）を assert している。`inFlightHtml` は捕捉済みの不変な文字列定数なので、L838 は L802 と同一の検査であり、切替後に `state.contentHtml` が誤って書き換えられても検出できない（confirm 経路では WYSIWYG ペインがマウントし textarea が消えるため、切替後の `contentHtml` はこのテストでもどこでも観測されない）。AC-8 の合格条件「切替自体は `contentHtml` を変更しない」のうち、**確認して切り替える経路**の content 不変は直接 pin されていない。abort 半分（`signal.aborted === true`、L817）は確実に pin できており、ここは堅い。
  - 補足: キャンセル経路の content 不変は W-001 対応で HTML textarea 経由に pin 済みだが、確認経路（実際に WYSIWYG へ遷移する経路）は別系統（confirm handler が `wysiwygUnsupportedDetected`/`Ack`/`setMode` を発行）なので、キャンセル経路の pin では代替にならない。
  - 提案: 任意（plan の AC-8 合格条件「既存 in-flight cancel テスト green」は満たすため必須ではない）。確認経路の content 不変を直接示すなら、(a) 同意で WYSIWYG マウント後にいったん HTML タブへ戻して `htmlTextareaValue()` が `original` のままであることを assert する、もしくは (b) `dispatch` をスパイして confirm handler が `setContent` を一切発行しないことを assert する。どちらかで L838 の tautology を実観測に置き換えられる。

### Notes

- **[N-001]** W-004 補強の `dialogListedTags()` ヘルパが優秀。ダイアログ内 `<code>` を抽出して `detectUnsupportedTags` の正準出力（ソート済み・重複排除・対応タグ除外）と `toEqual` で照合し、サニティ（`length>1` / `<p>` 非含有）も併記。実装が「全タグ羅列」や「順序崩れ」へ退行した瞬間に落ちる、結合点として正しい粒度の pin。detector 単体ロジックを `wysiwygUnsupportedTags.test.ts` に委ねて二重化を避けた判断も `docs/test.md` の層分担方針に沿う。

- **[N-002]** W-001 補強の content 保持確認が、モード非切替（`isWysiwygMounted()===false`）と content 不変（HTML textarea === original）を分けて assert しており、AC-4 の「モード維持」と「装飾破壊なし」を別軸で固定している。HtmlEditor の `value={state.contentHtml}` バインドを観測点に選んだのは最も直接的で、コメントで「cancel 経路が正規化/書換を入れた退行を捕まえる」意図も明示。

- **[N-003]** W-002 補強の new-surface 結合テストが、タブ在庫（純コンポーネント）と切替フロー（orchestrator）の検証責務をファイル間で明確に分離し、双方にスコープコメントを残している。`editorModeSwitch.test.tsx` の冒頭 JSDoc が「new 切替フローは noteEditorModeChange 側で pin」と相互参照しており、将来の読者が「new 画面の挙動不変はどこで担保されているか」を辿れる。

- **[N-004]** W-003 補強テストの abort 半分は質が高い。`saveDraft` を abort 時のみ reject させ、未保存 confirm 通過→ゲート開放*前*に `abortInFlight` が走る（`signal.aborted===true` かつ `isWysiwygMounted()===false`＝まだダイアログ段階）ことを pin。`abortInFlight` が装飾ゲートより手前で実行される順序契約を捉えている。

- **[N-005]** モック追加が最小限。WYSIWYG ペインのマウントで読まれる `searchInternalLinkTargetsFn` を `useServerFn` ルーターと `@/components/note/actions` の両方に追加し、「モジュールレベル read で throw させないためでクエリ自体は走らない」と理由コメント付き（L46-53）。Issue #696 で初めて edit 経路の WYSIWYG をマウントするようになったための必要十分な追加。

- **[N-006]** セレクタが a11y ロール基準で堅牢（`role="toolbar"][aria-label="書式"]` で WYSIWYG マウント判定、`role="alertdialog"` でダイアログ、`role="note"`/`role="alert"` でバナー ack 状態）。AC-7 の「同意済みバナー」判定が `role="note"` 存在＋`了解した` 不在の二重 assertion で、WysiwygEditor の ack 分岐（WysiwygEditor.tsx:512/535：未 ack のみ `role="alert"`＋`了解した` ボタン）を正しく利用している。スタイル変更に強い。

- **[N-007]** ダイアログ本文文言の一致が取れている。実装 `NoteEditor.tsx`「次の要素は WYSIWYG モードでは保持されません:」/ 確認「切り替える」/ キャンセル「キャンセル」と、テスト期待文字列が一致。バナー側の acked 文言「以下の要素は…」（WysiwygEditor.tsx:516）と AC-7 テストの整合も維持。plan テスト方針「本文文言とテスト期待文字列を一致させる」が守られている。

- **[N-008]** flaky 対策が適切。TipTap の `onCreate` が happy-dom 上で rAF 内に走るため、AC-7 と new-surface テストで `requestAnimationFrame` 二段の flush を挟んでマウント完了を待ってから assert している。fake timers を使う AC-8 テストでは「onCreate の実マウントは AC-7 実時間テストで担保済み」とコメントし、fake-timer テストは abort+content 契約に絞る、という層分けも明示。

---

## 総評

Round1 で「直す」とされた W-001/W-002/W-003/W-004 はいずれも対応され、AC-4（装飾保持）・AC-2/AC-5（複数タグ・ソート・対応タグ除外）・AC-6（new orchestrator 結合）が字義どおり pin された。テスト設計の質は高く、latch 結合の end-to-end pin・a11y ロール基準セレクタ・最小モック・文言一致・rAF/fake-timer の層分けはいずれも堅実。既存テストの破壊も無い。**Blocker は無し。**

唯一の Warning（W-001）は AC-8 の WYSIWYG **確認経路**における `contentHtml` 不変が tautological な assertion に留まる点。abort 契約は確実に pin できており、plan の AC-8 合格条件自体は満たすため Blocker ではないが、「切替が content を書き換えない」を確認経路でも実観測にするには 1 行の補強で足りる。

- Blockers: 0 / Warnings: 1 / Notes: 8
- [W-001] AC-8 WYSIWYG 確認経路の contentHtml 不変が tautological（捕捉済み const の再 assert で切替後 state 未観測） / `noteEditorModeChange.test.tsx:799-839`
- [N-001] W-004 補強 `dialogListedTags()` で detector 正準出力と toEqual 照合＝結合ドリフト検出
- [N-002] W-001 補強で AC-4 のモード維持と content 不変を別軸 pin（HTML textarea 観測）
- [N-003] W-002 補強で純コンポーネント/orchestrator の検証責務をファイル間分離＋相互参照コメント
- [N-004] W-003 補強の abort 半分は質高（ゲート開放前に abortInFlight が走る順序契約を pin）
- [N-005] モック追加最小（searchInternalLinkTargetsFn を理由コメント付きで両所に追加）
- [N-006] a11y ロール基準セレクタで堅牢、AC-7 は role="note"＋"了解した"不在の二重 assertion
- [N-007] ダイアログ/バナー文言とテスト期待文字列が一致
- [N-008] rAF 二段 flush と fake-timer 層分けで flaky 回避
