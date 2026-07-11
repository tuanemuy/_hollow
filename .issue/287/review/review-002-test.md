# PR #839 レビュー Round 2 — Test 観点

対象: PR #839（fix(editor): inline モードでメディア挿入直後の `<img>` 単体ラッパを編集可能にする）
PR head: e995ed3f
計画: `.issue/287/plan.md` / ADR: `.issue/287/adr.md`
前提: Round 1（`review-001-test.md`）の W-001（`<p><a><img></a></p>` / `<td><img></td>` の decorate pin）・W-002（深さ2純粋コンテナの skip pin）は反映済み。本ラウンドはゼロベースのフルレビュー。
レビュー日: 2026-07-11

## 検証プロセス

- PR head で `inlineEditor.test.tsx`（43件）+ `mediaInsert.test.ts`（20件）をローカル実行し全件 green。AC-6 対象の `wysiwygEditorImageButton.test.tsx` + `noteEditorImageButtonWiring.test.tsx`（4件）も green。
- **ミューテーション検証 A（ADR-001 棄却案1の再導入）**: `containsEditableBlock` を「直接メディア子判定 + 空ブロック許容」に置き換え → 「decorates blocks holding media behind an inline wrapper」のみが fail（42 passed / 1 failed）。Round 1 W-001 対応で追加された pin が、ADR の設計判断（一般規則 vs 例外列挙）を弁別できることを実証。
- **ミューテーション検証 B（直接子のみ走査への誤リファクタ）**: `containsEditableBlock` を `Array.from(el.children).some(isEditableTag)` に置き換え → 「skips a pure container whose editable block sits deeper than one level」のみが fail（42 passed / 1 failed）。Round 1 W-002 対応の pin が深さ非依存性を弁別できることを実証。
- 新ゲート真理値表（plan.md 設計節・8行）と pin の突き合わせ:
  | 行 | pin | 由来 |
  |---|---|---|
  | `<p>text</p>` decorate | あり | 既存 |
  | `<p><img></p>` decorate | あり | 本PR新規（AC-1） |
  | `<li><p></p></li>` 外側 skip | あり | 既存 |
  | mixed blockquote 両 decorate | あり | 既存 |
  | `<pre><code>` decorate | あり | 既存（#285） |
  | 空 `<p></p>` decorate | あり | 本PR新規 |
  | `<td><img></td>` decorate | あり | 本PR新規（R1 反映） |
  | `<p><a><img></a></p>` decorate | あり | 本PR新規（R1 反映） |
  加えて深さ2純粋コンテナ skip（R1 反映）で `containsEditableBlock` の任意深さ探索も固定。真理値表は全行 pin 済み。
- 既存テスト無変更の確認: `gh pr diff 839` のテストファイル hunk は import 1行・contract docstring の書き換え・新規テスト 7 本の追加のみ。既存テスト本体への変更なし（AC-5 の「既存スイート green 維持で検証」の建付けが成立）。
- 計画ステップ2の7項目（AC-1 decorate / AC-2 resync / AC-3 emit / AC-4 非漏出＝AC-3 に統合 / 空 `<p>` pin / img force-remove rollback pin / contract docstring 更新）と実装の突き合わせ — 全項目実装済み、過不足なし。
- diff スコープ確認（AC-6 (a)）: コード変更は `InlineEditor.tsx` + `inlineEditor.test.tsx` のみ（他は `.issue/` ドキュメント）。

### Test

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** 新規 pin 群の弁別力が Round 1 分（ミューテーション1: 旧ゲート復元で新規4本 fail）に加えて本ラウンドの再検証でも確認できた。ミューテーション A/B（上記）でそれぞれ対応する pin だけが fail し、他の 42 件は green のまま — pin の粒度が適切で、fail 時に原因箇所を一意に指せる構成になっている。Round 1 で「棄却案1相当への置き換えが全件 green で素通りする」ことを実証していた穴は塞がった。
- **[N-002]** `isPre` の明示バイパス（`InlineEditor.tsx:309`）単体を弁別する pin は存在しない（`isPre` を無効化するミュータントは現行スイートを素通りする）。ただしこれは欠陥とは判断しない: (a) 標準形 `<pre><code>` は新一般規則の帰結としても decorate されるため、現実的な入力でバイパスの有無が観測可能になるのは「`EDITABLE_TAGS` に `code` 等が追加された将来」のみで、その時点では既存の `<pre><code>` decorate pin（`inlineEditor.test.tsx:410`）が fail して回帰を捕捉する。(b) バイパスが観測可能になる現在の入力（`<pre><p>x</p></pre>` 等）は `serializeHostContent` の pre 平坦化で最初の emit 時に消える過渡形であり、それを固定するテストは正規化で消える入力への pin になる。ADR-001 の「明示バイパスは defense-in-depth」という意図と整合する状態。
- **[N-003]** 真理値表 7 行目の第2変種 `<li><img></li>` は未 pin（`<td><img></td>` のみ）。同一述語経路（許可タグ・直接テキスト子なし・editable 子孫なし → decorate）で `<td>` が代表しており、タグ差で分岐するロジックは存在しないため追加不要と判断。
- **[N-004]** AC-2（resync 後の decorate）と AC-3（decorate 済み media `<p>` へのテキスト入力 emit）は別テストで、「resync → 入力」の合成経路そのものの1本はない。ただし `applyEditable` は 4 呼出経路（mount/resync/rollback/disabled）で同一述語、`classifyRecords` は decorate 結果の `isContentEditable` のみに依存するため、合成は2本の pin から論理的に導ける。AC-2 が実物の `insertMediaIntoHtml` を import して挿入経路の出力形をモジュール間契約として固定している点（Round 1 N-002 指摘の美点）も維持されている。
- **[N-005]** img force-remove rollback pin（`inlineEditor.test.tsx:1082`）は既存の td force-remove（`:108`、target 非 contentEditable 分岐）と異なり「contentEditable target 上の Element removal」という分類器の別分岐（`:429-430`）を通っており、#287 で新たに到達可能になった rollback 経路を正しく押さえている。アサーションも `src` 値まで検査しており、rollback 不発（img 消失）でも復元不完全でも fail する。

## サマリー

Blockers: 0 / Warnings: 0 / Notes: 5

Round 1 の指摘2件は反映済みで、ミューテーション検証により両 pin の弁別力を実証した。新ゲートの真理値表は全行 pin され、旧ゲート・棄却案1・直接子走査ミュータントのいずれもスイートが検出する。既存テストは無変更で AC-5/AC-6 の検証建付けも成立。テスト観点で新規の欠陥はなく、クリーン収束。
