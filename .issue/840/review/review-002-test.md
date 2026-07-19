# レビュー #840 — Test 観点（review-002 / round 2）

- **PR:** #845（`issue/840/inline-rollback-snapshot-follow`, head `310122a6`）
- **対象:** `app/components/note/editor/__tests__/inlineEditor.test.tsx`（追加 9 テスト）＋ `InlineEditor.tsx`（本体）
- **前提:** round 1（review-001-test.md）の唯一の指摘 W-001（4-T8 が reconcile 経路を pin できず false green）の反映確認を含む、ゼロベースのフル再レビュー。
- **実施:** 全 52 テスト green を確認（新規 9 / 既存 43）。実装本体へ変異注入（mutation testing）を行い、各 pin テストが狙った不変条件を本当に固定できているかを裏取り。特に W-001 修正の効果と「テスト自身の防御（`not.toHaveBeenCalled()` ガード）」を検証した。

## W-001 修正の裏取り（最重要）

round 1 の W-001 は「4-T8 の span 注入 `act` 直後に `await flushMutations()`（80ms）が入るため、rollback 前に通常 emit が発火して `lastEmittedHtmlRef` を確定させ、rollback 側は `changed === false` となり reconcile の `onChange` が発火しない ＝ 4-T8 の onChange assert は reconcile を何も pin していない」というものだった。

修正コミット `310122a6` は W-001 提案 (b) をそのまま採用:

1. span 注入 `act` 直後の `await flushMutations()` を**除去**（emit を pending のまま rollback を踏ませる）。
2. step A 直後に `expect(onChange).not.toHaveBeenCalled()` を**追加**（デバウンスが未発火であることを明示ガード）。
3. rollback 後に `expect(onChange).toHaveBeenCalled()` を追加。
4. 全体を 4-T3 と同一の 2-`act`（2-バッチ）構成へ揃え、誤導していたコメントを事実に一致するよう書き換え。

### 変異注入による確認

| 変異（実装の破壊） | round 1 の 4-T8 | round 2 の 4-T8（本 PR） |
|---|---|---|
| `if (changed) onChangeRef.current(restored)` を削除（reconcile 発火を殺す） | **green のまま（false green）** | **red 化 ✅**（4-T3 と同時に落ちる） |
| `cleanClone` の `<pre>` 平文化ループを削除 | red（DOM assert） | red 化 ✅（#498 pin 3 本と同時に落ちる） |

- reconcile 削除 → 4-T3（P-001）と 4-T8（AC-7）の**両方が red**。round 1 では 4-T3 のみ red・4-T8 は green だったので、false green は解消。
- `<pre>` 平文化ループ削除 → 4-T8 は #498 の serialize 平文化 pin（L693/L733 + `<pre>` 内要素 strip）と同時に red。つまり 4-T8 は「reconcile 経路」に加えて「rollback 復元後 `<pre>` が平文である」という AC-7 固有の主張も pin しており、4-T3 に対する冗長ではない。

### テスト自身の防御の確認（回帰耐性）

step A 直後の `expect(onChange).not.toHaveBeenCalled()` が、将来のリファクタで再び 80ms flush が step A に混入した際に false green へ戻るのを**声高に防ぐ**かを検証した。テストへ flush を再挿入する変異を注入したところ、reconcile 発火の有無に依存する末尾 assert ではなく **`expect(onChange).not.toHaveBeenCalled()`（L1468）が先に fail** し `expected "vi.fn()" to not be called at all, but actually been called 1 times` を出力した。W-001 提案 (b) が求めた「ガードとともに固定」が正しく実装され、reconcile 窓を踏めない構成へ退行したら静かに緑化せず落ちる。修正は堅牢。

## 検証サマリ（全 pin の変異注入・裏取り）

| 変異（実装の破壊） | red 化すべきテスト | 結果 |
|---|---|---|
| allowed 分岐の `captureSnapshot()` を無効化 | 4-T1 / 4-T2 | 両方 red ✅（round 1 で確認・本 PR で不変） |
| `if (changed) onChangeRef.current(restored)` 削除 | 4-T3 / 4-T8 | **両方 red ✅（round 2 で 4-T8 が新たに red 化）** |
| capture ガード `!isComposingRef.current` を外す | 4-T7 | red ✅ |
| `isPlaceholderBr` を常に false に | 4-T4（td/p） | 両方 red ✅ |
| `removedBr && querySelector("*") !== null` ガードを外す | 4-T5(c) | red ✅ |
| `cleanClone` の `<pre>` 平文化ループを削除 | 4-T8 + #498 pin（L693/L733/pre-strip） | 4 本 red ✅ |

結論: AC-1〜AC-7・AC-3′ はいずれも「実装を壊すと落ちる」テストで固定されており、round 1 に残っていた唯一の false green（4-T8 の reconcile assert）が解消。双方向トレーサビリティ（AC ↔ 4-Tn）が完全に成立した。

## Test

### Blockers

なし

### Warnings

なし

（round 1 の W-001 は解消。新規の Blocker / Warning は検出されず。）

### Notes

- **[N-001]** W-001 修正が模範的。flush 除去＋2-バッチ化だけでなく、`expect(onChange).not.toHaveBeenCalled()` を前提ガードとして挿入し、コメントも「なぜここで flush してはいけないか（flush すると lastEmittedHtmlRef が先に確定し reconcile が沈黙する）」まで明記。誤導していた旧コメント「The reconciled onChange argument is also span-free plain `<pre>`」も事実整合へ書き換え済み。変異注入で reconcile 削除 → red、flush 再挿入 → ガードで red の双方を確認。
- **[N-002]** 4-T8 が 4-T3 に対して固有価値を持つことを確認。reconcile 削除では両者 red だが、`<pre>` 平文化ループ削除では 4-T8 のみ red（4-T3 は green）。AC-7 の実質（rollback 復元後 `<pre>` が span を含まない平文）を DOM assert（`restoredPre.querySelector("span")` null / `code.textContent === "foobar"`）＋ onChange assert（`lastArg` に `<span` を含まず `<pre><code>foobar</code></pre>` を含む）で二重に pin。
- **[N-003]** 回帰なし。round 1（初期実装 `5d98906b`）から PR head までのコード差分は 4-T8 の 32 行（+25/-7）のみで、他の 8 テスト・#233/#287/#498 の既存 pin（L693/L733 の `<pre>` 平文化、L882 の compositionend drift、img force-remove 等）を 1 行も削除・弱体化していない。既存 43＋新規 9 の計 52 が全 green。
- **[N-004]** AC-7 の literal 主張「ハイライト span 注入中は snapshot を更新しない」に対応する実装ガード `!isHighlightingRef.current`（`InlineEditor.tsx` L685）は、観測上いかなる振る舞いテストでも弁別不能（`cleanClone` が `<pre>` を常に平文化するため、ガードを外して highlighting 中に captureSnapshot しても snapshot は同じ平文 `<pre>` になる）。これは plan R3（arch-risk P-001）で明示的に分析・受容済みの限界で、4-T8 は「復元結果の平文性」という観測可能な代替不変条件へ格下げして pin している。本 PR の判断は plan と整合しており、指摘ではなく既知の設計上の制約として記録。
- **[N-005]** 4-T3（AC-3′/P-001）の構成が依然正確。E1 を独立 `act` で allowed 捕捉＋50ms タイマー予約 → 間に 80ms flush を挟まず別 `act` で img remove の 2-バッチ構成。step A 直後の `expect(onChange).not.toHaveBeenCalled()` ガードも維持。4-T8 がこの流儀を正しくミラーしたことで、`<pre>` あり／なしの reconcile 経路が一対一で対応する。
- **[N-006]** 軽微（設計許容範囲・round 1 N-007 の継続）: 4-T5 は (a) strong / (b) img / (c) br+要素子 を 1 つの `it` に束ねており、(a) が落ちると (b)(c) が fail-fast でマスクされる。plan が 4-T5 を単一テストと規定しているため逸脱ではない。ブロッカーではない。

## 判定

**APPROVED（Test 観点）。** round 1 の唯一の指摘 W-001 は false green を解消する形で正しく反映され、変異注入により reconcile 経路の pin 化と回帰耐性ガードの双方を裏取り済み。AC-1〜AC-7・AC-3′ の全てが変異で red 化する実効的な pin で固定され、既存 pin の回帰もない。新規の Blocker / Warning なし。
