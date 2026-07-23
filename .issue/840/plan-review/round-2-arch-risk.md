# Round 2 レビュー — アーキテクチャ整合性・実現可能性・リスク

**対象:** Issue #840 / `.issue/840/plan.md` / `.issue/840/adr.md`
**視点:** あるべきアーキテクチャとの整合・実現可能性・リスク（1周目反映の検証）
**レビュー日:** 2026-07-19

---

## 総評

1周目の要修正 **[P-001]（snapshot 同期捕捉 vs emit デバウンスの時間差）は適切に反映されている。** 計画・ADR に組み込まれた reconciliation（`rollback()` で pending debounce を `clearTimeout` → 復元後 DOM を serialize → `lastEmittedHtmlRef` と異なれば `onChange` を同期発火）を実コード（`InlineEditor.tsx` L496-533 の emit/rollback、L504 の早期 return、L522 の `lastEmittedHtmlRef` 上書き、L721-755 の compositionend）に突き合わせて検証した。**設計は実コードで成立し、compositionend / onInput / rebuild / disabled の各既存フローと競合しない**（詳細は下記「検証した観点」）。計画中の行参照（L510-533 rollback、L522、L727-742 pending、L743-752 signature）も現行コードと一致しており正確。改善提案 S-001〜S-004 も設計・テスト・ADR に反映済みで、候補 B が #233 の保守的 rollback を無効化しない点・IME 捕捉ガードのタイミングも round-1 の所見どおり保たれている。

一方、**1周目反映で新規追加されたテスト（round-1 coverage 反映の 4-T8、および P-001 反映の 4-T3）に、happy-dom テストハーネスの制約と MutationObserver のバッチ境界に起因する実現性の問題**が残る。4-T8 は狙った不変条件を pin できず（要修正）、4-T3 は記述どおり書くと P-001 の窓を再現できない恐れがある（要改善）。実装本体の設計は妥当なので、指摘はテスト計画の現実性に限られる。

---

## 問題点（要修正）

- **[P-001]** **4-T8（AC-7・ハイライト中 no-op ガード）は狙った不変条件を pin できない。**
  - 内容: 計画 4-T8 は「`isHighlightingRef` を立てた状態で allowed バッチを流し、`snapshotRef` が span を含まない clean 形のまま更新されないことを**直接 assert**する」と書くが、(1) `isHighlightingRef` も `snapshotRef` も `InlineEditor` 内部の `useRef`（private closure）で、テスト（happy-dom + `findHost` + `onChange` mock、`inlineEditor.test.tsx`）からは設定も参照もできない。既存テストは全て DOM と `onChange` 引数越しの**振る舞い assert**で書かれている（`snapshotRef` を直接触るテストは 1 本も無い）。
  - さらに本質的な問題: `isHighlightingRef` が true になるのは `<pre>` の highlight 経路（`highlightPre` / `onFocusIn`）だけで、churn は常に `<pre>` 内に閉じる。捕捉パイプライン `cleanClone` は `serializeHostContent` と同様に**`<pre>` を常に平文化する**（L360-364）。つまり「ハイライト中に捕捉した snapshot」と「ガードで捕捉をスキップした snapshot」は**観測上まったく同一（どちらも span を含まない平文 `<pre>`）**になる。ガードの有無で結果が変わらないため、いかなる振る舞いテストもこのガードを弁別できない（テストはガードを消しても green のまま = 何も pin しない）。
  - 理由: round-1 の coverage 反映で追加された 4-T8 が、実装できない前提（内部 ref の直接 assert）に依存し、かつ pin 対象のガードが `cleanClone` の平文化と冗長で観測不能。このまま実装フェーズに渡すと「AC-7 を守っているつもりで実は何も固定していない」テストが生まれ、偽の安心を与える。
  - 提案: 4-T8 を次のいずれかに改める。(a) AC-7 の実質（snapshot 経路に `<pre>` の span が漏れない）は既存 #498 の serialize 平文化 pin（L693 `strips highlight <span>s from <pre>`、L733 bare-`<pre>` 版）が既にカバーしているので、4-T8 を「rollback 後の復元 `<pre>` が平文である」ことの振る舞い pin（既存 #498 の延長）に格下げし、`snapshotRef` 直接 assert の文言を撤回する。あるいは (b) 「`isHighlightingRef` 中の捕捉スキップは `cleanClone` の平文化と観測等価な純粋な微最適化であり、独立した pin テストは不要」と AC-7 の但し書きに明記して 4-T8 を削る。どちらでも計画の他部分（B/C/reconciliation）に影響はない。

---

## 改善提案（検討推奨）

- **[S-001]** **4-T3（AC-3′・P-001 の flush 非挿入経路）の「同一 tick 内で remove」記述は、E1 と rollback トリガーを 1 つの MutationObserver バッチに畳み込む書き方を誘発しうる。** その場合 P-001 の窓を再現できない。
  - 内容: P-001 の reconciliation が効くのは「**先行する allowed バッチで E1 が `captureSnapshot` 済み（snapshot に E1 が入っている）**が、emit の 50ms デバウンスが未発火」の状態で rollback が来たときだけ。ところが `MutationObserver` は 1 microtask 内の全 mutation を 1 バッチにまとめる。E1 編集と別要素 remove を**同一の `await act()` 内**（＝同一 microtask）で行うと、observer コールバックは両者を 1 バッチで受け取り、`classifyRecords` が remove を検出して**バッチ全体を rollback 判定** → E1 は allowed 経路を通らず `captureSnapshot` されない → snapshot は E1 以前のまま → rollback で E1 ごと巻き戻り、assert (1)「E1 が DOM に残る」が**失敗**する（＝そもそも同一バッチの編集は保持不能で、これは candidate B の正しい限界）。
  - 理由: 実ブラウザでは E1（input）と Backspace-on-img が別イベントループ turn なので別バッチになり reconciliation が効く。テストで窓を再現するには、E1 を**独立した `await act()`**（microtask flush で observer が E1 を allowed 捕捉 ＋ 50ms タイマー予約）してから、**別の `await act()`**で remove する必要がある。`await act()` は実時間 50ms を進めないのでデバウンスは pending のまま保たれる。既存テストは各 DOM mutation を個別の `act` で包む流儀（例 L864-908 の composition テスト）なので自然に書けば 2 バッチになるが、「同一 tick 内で」の文言は逆に 1 act へ畳ませる読みを招く。
  - 提案: 4-T3 の手順を「E1 を 1 つの `act` で確定（observer が allowed 捕捉、デバウンスは未発火のまま）→ **別の** `act` で別要素 remove → flush」と明示し、「編集と remove を同一バッチにしない／ただしその間に 80ms の `flushMutations` は挟まない（＝デバウンスは発火させない）」ことを本文に書き添える。これで P-001 の窓を正しく踏み、reconciliation の `onChange(E1)` 発火を pin できる。

- **[S-002]** **4-T7（AC-6・合成中は捕捉しない）の「`captureSnapshot` を呼ばないことを直接 pin」という表現は、実際には振る舞い pin であり literal には実装できない。** `captureSnapshot` は mount-once effect 内のローカルクロージャで、呼び出し有無をテストから直接観測できない。計画が併記する振る舞い形（合成中に characterData 編集 → compositionend で要素 drift → rollback で合成中テキストも巻き戻る）は実装可能かつ有効（ガードを外すと snapshot に合成中テキストが入り、drift rollback 後に残ってしまうため red 化する）。文言を「振る舞いで間接 pin する（合成中編集が rollback で巻き戻ることを assert）」に統一し、「直接 assert」の語を外すと、実装者が内部 ref を覗く不可能なテストを書こうとする混乱を避けられる。既存 L882 との差分（4-T7 は characterData 編集の巻き戻りまで見る）は妥当。

---

## 検証した観点と所見

- **P-001 reconciliation が実コードで成立するか（最重点）:** 現行 `rollback()`（L510-533）は末尾で `lastEmittedHtmlRef.current = serializeHostContent(host)` を無条件上書きしている（L522）。reconciliation はこの行を「`restored = serializeHostContent(host)` を得て、**上書き前の** `lastEmittedHtmlRef.current`（＝親が最後に受け取った値）と比較 → 異なれば `lastEmittedHtmlRef=restored` にした上で `onChangeRef.current(restored)` を同期発火、同一なら従来どおり更新のみ」に差し替える形で、比較順序さえ守れば正しく成立する。`debounceTimerRef` / `onChangeRef` / `serializeHostContent` / `lastEmittedHtmlRef` は全て rollback のスコープ内。**問題なし。**
- **rollback→onChange 同期発火が既存フローと競合しないか:**
  - *resync ループ:* onChange(restored) → 親 `value=restored` → resync effect（L844-847）は `value === lastEmittedHtmlRef.current`（＝restored）で **no-op** → rebuild しない。無限ループ・二重 rebuild は発生しない。**問題なし。**
  - *compositionend 経路:* drift 時 `rollback()` → `isComposingRef=false; return`（L748-751）。rollback 内の同期 onChange 発火時点で `isComposingRef` は true だが、onChange は親コールバックを呼ぶだけで副作用は React の非同期 setState に閉じる。むしろ「合成前の正当編集が captured 済みだが未 emit」のケースで restored を親へ届けられる**改善**になる。**問題なし。**
  - *observe/highlightAll 順序:* reconciliation は L522 の位置（`obs.observe` L523 と `highlightAll` L532 の**前**）。onChange の setState は React が現 microtask 完了後にバッチ適用するため、`obs.observe` は onChange より先に同期実行される。再 observe 前に親再レンダが割り込む競合はない。**問題なし。**
  - *純 drift（未 emit 編集なし）:* `restored === lastEmittedHtmlRef` となり onChange は発火せず、`clearTimeout` も `debounceTimerRef===null` ガードで no-op。従来挙動を維持し回帰なし。**問題なし。**
- **候補 B が #233 の安全機構を無効化しないか:** snapshot が前進するのは characterData / テキストのみ childList / 候補 C の `<br>` remove（構造保存 or 受容済み変化）のみ。許可外を 1 件でも含むバッチは `classifyRecords` の全 record ループで rollback（L414-442）される保守性は不変。基準点前進で安全機構が抜ける経路は round-1 同様見当たらない。**問題なし。**
- **IME 合成中の捕捉スキップが実タイミングで効くか:** observer コールバック（L578-590）は `isComposingRef.current` を**実行時**に読む。compositionstart（task, L717-719）で true 化後の microtask コールバックは、計画の `!isComposingRef.current` ガードで captureSnapshot をスキップする。`isHighlightingRef` も `highlightPre` の `await` 中は true のままなので、その窓の observer コールバックも捕捉をスキップする。ガードの読み取りタイミングは適切。**問題なし。**
- **候補 C の guard が意図しない mutation を通さないか:** `querySelector("*") === null` は要素子が残らないブロックに限定し、`<img>`/装飾要素同居ブロックの `<br>` remove は従来どおり rollback（AC-5）。行結合 `<p>a<br>b</p>→<p>ab</p>` は allowed になるが構造 `<p>` は保持され ADR-002 が受容。混在バッチ（`<br>` remove ＋ 別要素 add）は addedNodes 非テキストで rollback。round-1 S-001 のとおり AC-5(c) テストを「remove 後も要素子が残る構造」で組む注記も計画・ADR に反映済み。**設計は妥当。**
- **compositionend の捕捉位置（S-003 反映）:** 計画は「pending 分類の有無に関わらずシグネチャ一致で最終 emit（L753-754）に至る直前」に捕捉を置くと明記し、`takeRecords()` が空で pending 分類（L727-742）をスキップする経路（L743-752 のみ通過）でも確定テキストを折り込めるようにしている。実コードの制御フローと一致。**問題なし。**
- **1周目反映で新たな副作用が生じていないか:** reconciliation・cleanClone・候補 C いずれもプレゼンテーション層コンポーネント内部に閉じ、`{value,onChange,disabled,onInitFailed}` I/O 契約は不変。バックエンド 3 層・`NoteEditor` 配管・スタイリング規約への波及なし。新規副作用は上記テスト計画の実現性（P-001/S-001/S-002）に限られ、実装本体には無い。

---

## 良い点

- 1周目の要修正 [P-001] を、設計「rollback / emit の整合」節・実装ステップ 2・ADR-001 Consequences・AC-3′・リスク欄・4-T3 まで**一貫して**反映し、「rollback 後、親 value は必ず復元後 DOM に一致する」を明示の不変条件へ昇格させている。反映の網羅性が高い。
- reconciliation の設計が実コードの `lastEmittedHtmlRef` 上書き行（L522）・emit 早期 return（L504）・debounce タイマー（L500-507）と正確に噛み合っており、行参照も現行コードと一致。実装可能な粒度に落ちている。
- 候補 B の 3 ガード（IME / ハイライト / clean 形捕捉）と #233 の保守的 rollback の関係が ADR で丁寧に整理され、基準点だけ前進させるという最小侵襲の性質を崩していない。
- スコープ境界（候補 A 却下・IME 空セル初手入力の残存制約・差分エンジン非導入）が round-1 から一貫して維持され、無理な拡張をしていない。

---

## サマリー

- 問題点: 1 / 改善提案: 2
- `[P-001]` 4-T8（AC-7）は内部 ref を直接 assert できず、かつガード対象が `cleanClone` の `<pre>` 平文化と観測等価で弁別不能 → 何も pin しない。#498 既存 pin へ格下げ or 微最適化として但し書き化を提案
- `[S-001]` 4-T3（P-001 の flush 非挿入経路）は E1 と rollback トリガーを別 `act`（別 observer バッチ）に分けないと窓を再現できず assert 失敗しうる。手順に「別バッチ・ただし 80ms flush は挟まない」を明示
- `[S-002]` 4-T7 の「`captureSnapshot` を呼ばないことを直接 pin」は literal 不可。振る舞い pin（合成中編集が rollback で巻き戻る）へ文言統一を提案
