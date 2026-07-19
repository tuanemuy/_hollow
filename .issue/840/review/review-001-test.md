# レビュー #840 — Test 観点（review-001）

- **PR:** #845
- **対象:** `app/components/note/editor/__tests__/inlineEditor.test.tsx`（追加 9 テスト）＋ `InlineEditor.tsx`（本体）
- **実施:** 全 52 テスト green を確認（新規 9 / 既存 43）。さらに実装本体へ変異注入（mutation testing）を行い、各 pin テストが狙った不変条件を本当に固定できているか（ガード/実装を消して red 化するか）を検証した。

## 検証サマリ（変異注入による pin 能力の裏取り）

| 変異（実装の破壊） | 期待して red 化すべきテスト | 結果 |
|---|---|---|
| allowed 分岐の `captureSnapshot()` を無効化（snapshot 追従を殺す） | 4-T1 / 4-T2 | 両方 red ✅ |
| `if (changed) onChangeRef.current(restored)` を削除（reconcile 発火を殺す） | 4-T3 | red ✅ / **4-T8 は green のまま（下記 W-001）** |
| capture ガードの `!isComposingRef.current` を外す（合成中も捕捉） | 4-T7 | red ✅ |
| `isPlaceholderBr` を常に false に（候補 C を殺す） | 4-T4（td/p） | 両方 red ✅ |
| `removedBr && querySelector("*") !== null` ガードを外す（要素子残存でも許可） | 4-T5(c) | red ✅ |
| `cleanClone` の `<pre>` 平文化ループを削除 | 4-T8（DOM assert） | red ✅ |

結論: AC-1〜AC-7・AC-3′ は各々「実装を壊すと落ちる」テストで固定されており、false green は 4-T8 の onChange assertion 1 点（W-001）に限られる。双方向トレーサビリティ（AC ↔ 4-Tn）も成立している。

## Test

### Blockers

なし

### Warnings

- **[W-001]** 4-T8 の onChange assertion が reconcile 経路を pin できておらず false green（実質は既存 #498 と重複）。
  - 場所: `inlineEditor.test.tsx` の `"restores a plain <pre> ... and reconciles onChange (Issue #840 AC-7)"`（span 注入後の `await flushMutations()` → 末尾の `lastArg` 系 assert）
  - 理由: span 注入直後に `await flushMutations()`（80ms）が入るため、rollback に到達する**前に**通常の debounce emit が `<p>seed</p><pre><code>foobar</code></pre>` を発火し、`lastEmittedHtmlRef` を確定させてしまう。続く rollback では `restored === lastEmittedHtmlRef` → `changed === false` となり、**reconcile の `onChange` は発火しない**。よって `lastArg` は「rollback 前の通常 emit」の値であり、reconcile 経路を通っていない。変異注入で裏取り済み: reconcile 発火（`if (changed) onChange...`）を削除しても 4-T8 は green のまま（＝この assert は reconcile を何も pin していない）。テストのコメント「The reconciled onChange argument is also span-free plain `<pre>`」は事実と食い違う。plan 4-T8（L133）が R3 で「remove 前に `<pre>` テキストを変えて onChange を発火させよ」と指示した意図は、間の 80ms flush を挟む構成では達成不能（4-T3 のように flush を挟まない 2-バッチ構成でなければ reconcile 窓を踏めない）。
  - 影響の限定: AC-7 の実質（snapshot が `<pre>` を平文で捕捉し、rollback 復元後 DOM に span が漏れない）は **DOM assert（`restoredPre.querySelector("span")` null / `code.textContent === "foobar"`）が単独で pin できている**（`cleanClone` の平文化ループ削除で red 化を確認済み）。したがって coverage 欠落ではなく「onChange assert が冗長＋コメントが誤導」という精度問題。
  - 提案: (a) 最小対応として、onChange assert と該当コメントを削除し「4-T8 は復元後 DOM の `<pre>` 平文性を pin」に用途を明確化する（reconcile 経路の pin は 4-T3 が担う）。または (b) reconcile 経路まで本当に pin したいなら、span 注入バッチと rollback トリガーの**間の 80ms flush を除去**し（4-T3 と同じ 2-`act` 構成にして emit を pending のまま rollback を踏ませ）、`onChange` の最終 call が reconcile 由来であることを `expect(onChange).not.toHaveBeenCalled()` ガードとともに固定する。

### Notes

- **[N-001]** 4-T3（AC-3′ / P-001）の構成が正確。E1 を独立 `act`（microtask flush で別 observer バッチとして allowed 捕捉＋50ms タイマー予約）→ 間に 80ms flush を挟まず別 `act` で img remove、という plan R2 の指示どおりの 2-バッチ構成。さらに step A 直後の `expect(onChange).not.toHaveBeenCalled()` が「E1 の emit が rollback 時点でまだ pending」であることを明示ガードしており、万一 emit が早発しても静かに false green 化せず落ちる。変異注入（reconcile 削除）で red 化することも確認。デバウンス窓を専用に pin できている。
- **[N-002]** 4-T6 が既存 L882 に対して固有の価値を持つ。allowed 編集で snapshot を `foo → foobar` に前進させた後に compositionend drift を起こし、**復元先が `foobar`（前進後 snapshot）であって初期 `foo` でない**ことを assert。「drift 検出が無効化されていない」かつ「rollback が追従後 snapshot へ戻る」を同時に固定しており、snapshot 追従と AC-6 の両立を pin できている。
- **[N-003]** 4-T7 が「合成中は捕捉しない」を振る舞いで間接 pin。`captureSnapshot` は mount-once effect 内の private クロージャで直接観測不能という制約を正しく認識し、「合成中に打った characterData が compositionend の drift rollback で巻き戻る」観測可能挙動で固定。capture ガードから `!isComposingRef.current` を外す変異で red 化を確認。compositionend ハンドラも drift 時は `captureSnapshot` 到達前に return しており（本体 L835-850）、drift をベースラインへ折り込まない実装と整合。
- **[N-004]** 4-T5(c) が arch-risk S-001 のテスト作法を正しく踏襲。行結合で guard を通り抜ける 2-テキストラン構成（`<p>a<br>b</p>`）を避け、remove 後も要素子（`<img>`）が残る `<p>a<br><img></p>` で組んでいる。querySelector ガード除去の変異で red 化を確認。AC-5 の「他要素残存ブロックでの `<br>` remove は従来どおり rollback」を確実に pin。
- **[N-005]** 回帰なし。テストファイルの差分は L1116 以降への純粋な追記のみで、#233/#287/#498 の既存 pin（L693/L733 の `<pre>` 平文化、L882 の compositionend drift、L1076 の img force-remove 等）を 1 行も削除・弱体化していない。既存 43 テスト＋新規 9 テストの計 52 が全 green。
- **[N-006]** ヘルパ（`flushMutations` / `findHost` / `requireNode`）を一貫再利用し、テスト名が検証意図（AC 番号・Issue 番号・TC 番号）を明示。マジックナンバー（50ms debounce / 80ms flush）はコメントで根拠を説明済み（4-T3 の「`act` は実時間を進めないので debounce は pending のまま」等）で、意図が追える。
- **[N-007]** 軽微（設計許容範囲）: 4-T5 は (a) strong / (b) img / (c) br+要素子 を 1 つの `it` に束ねており、(a) が落ちると (b)(c) が評価されず fail-fast でマスクされる。plan が 4-T5 を単一テストと規定しているため逸脱ではないが、将来分割すると失敗箇所の切り分けが容易になる。ブロッカーではない。
