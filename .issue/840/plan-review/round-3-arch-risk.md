# Round 3 レビュー — arch-risk 視点（最終）

**対象:** Issue #840 / `.issue/840/plan.md` / `.issue/840/adr.md`
**視点:** あるべきアーキテクチャとの整合性・実現可能性・リスク
**結論:** 問題点ゼロ。設計・テストとも実コードで成立することを最終確認した。改善提案 1 件（4-T8 のテスト記述の微補正・非ブロッキング）。

---

## 検証したこと（実コードとの突き合わせ）

### 1. rollback の reconciliation 設計は実コードで成立する

`rollback()`（InlineEditor.tsx L510-533）は `snapshotRef` 全置換の末尾で L522 `lastEmittedHtmlRef.current = serializeHostContent(host)` を無条件に上書きしている。plan ステップ 2 の reconciliation は、この L522 を「(1) `debounceTimerRef` を `clearTimeout`→null、(2) `restored = serializeHostContent(host)`、(3) `restored !== lastEmittedHtmlRef.current` なら `lastEmittedHtmlRef` を更新した上で `onChangeRef.current(restored)` を同期発火、一致なら更新のみ」へ差し替える設計。

- `rollback` は mount-once effect 内のクロージャで、`debounceTimerRef` / `onChangeRef` / `lastEmittedHtmlRef` / `serializeHostContent` すべてスコープ内。**実装可能**。
- **比較順序が正しい:** `restored` を先に計算し、上書き前の `lastEmittedHtmlRef`（＝最後に実際に emit した値）と比較する設計なので、pending デバウンス窓（capture 済み・未 emit）を正しく検出できる。
- **再入ループなし:** 差し替え位置は L522（observe 再開 L523-530 の手前）なので、`onChange` は **observer が disconnect された状態**で発火する。controlled パターンでは `onChange → 親 setState → value===lastEmittedHtmlRef` となり resync effect（L844-847）が no-op、rebuild ループは生じない。
- `emit()` の早期 return（L504 `next === lastEmittedHtmlRef.current`）でサイレント消失する P-001 の窓は、pending タイマー clear ＋ 同期 onChange で確実に塞がれる。「rollback 後、親 value = 復元後 DOM」の不変条件は成立する。

### 2. 4-T3 / 4-T7 / 4-T8 は狙った不変条件を pin でき、現実的に書ける

**4-T3（P-001・flush 非挿入経路）— 成立。** 既存 composition テスト（L860-908）が各 DOM mutation を個別 `act` で包む流儀と同じ 2 バッチ構成で書ける。
- 手順 A（独立 `act` で E1 テキスト編集）: `await act` が microtask を flush し observer コールバックが走る → allowed → `captureSnapshot`（snapshot に E1）＋ 50ms emit タイマー予約。`act` は実時間 50ms を進めないのでデバウンスは pending、`lastEmittedHtmlRef` は E1 前のまま。
- 手順 B（80ms flush を挟まず別 `act` で img.remove）: observer が remove 単独バッチを rollback 判定 → reconciliation が pending タイマー clear、`restored`（E1 入り・img 復元）が `lastEmittedHtmlRef`（E1 前）と異なるため `onChange` を E1 入りで同期発火。
- (1) E1 が DOM に残る＋(2) onChange 引数が E1 を含む、の両方が観測可能。plan が明記する「E1 と remove を同一バッチに畳み込まない／ただし 80ms flush は挟まない」の制約も正しい（同一バッチだと E1 が allowed 捕捉されず snapshot が前進しない＝candidate B の正しい限界で窓を踏めない）。

**4-T7（合成中は捕捉しないの振る舞い pin）— 成立し、既存 L882 より強い。** 実コードで観測差を確認した。
- ガード有り（`!isComposingRef.current` で captureSnapshot スキップ）: 合成中の characterData 編集も span drift も snapshot に折り込まれない → compositionend で `structureSignature(host)`[span 有] ≠ `structureSignature(snap)`[合成前] → rollback → 合成中テキストも span も巻き戻る。
- ガード無し（合成中も捕捉）: span 追加バッチまで snapshot に折り込まれ signature が一致 → rollback が発火しない → 合成中テキスト・span が残る。
- よって「合成中テキストが巻き戻る」assert はガード除去で red 化する。加えて 4-T7 は **characterData 編集の巻き戻り**まで見るため、childList だけをガードし characterData をガードし損ねた部分退行（snap にテキストだけ折り込まれ drift rollback 後もテキストが残る）も検出でき、span のみ見る L882 より弁別能力が高い。plan の「L882 との差分は妥当」の主張は正しい。

**4-T8（`<pre>` 不透明性の振る舞い pin）— DOM 主張は成立。** 別要素 force-remove で rollback を起こし「復元後 `<pre>` が span を含まない平文」を assert する構成は書ける（`cleanClone` が常に `<pre>` を平文化するため snapshot は平文 `<pre>` を持つ）。plan が round 2 で「private ref 直接 assert は撤回、実質は既存 #498 L693/L733 がカバー、4-T8 は補完的な弱い振る舞い pin」と正直に格下げした判断は妥当。→ onChange 引数部分のみ後述の微補正あり。

### 3. snapshot 追従は #233 の安全機構を無効化せず、各ガードが効く

- **#233 の保守的 rollback は不変:** snapshot 追従は allowed バッチでのみ基準点を前進させるだけで、rollback 機構（全置換）も compositionend の drift 検出（L743-752）も childList/attributes 分類（L422-441）も変更しない。許可外バッチは従来どおり全体 rollback。変わるのは基準点だけ。
- **IME ガード:** 合成中は childList/attributes が allowed で通る（L423/L439）が、observer コールバックの捕捉は `!isComposingRef.current` で skip されるため半確定構造が基準へ折り込まれない。compositionend は依然「合成前 snapshot」と比較し drift を検出する（4-T7 で確認）。
- **ハイライトガード:** highlightPre 中は `isHighlightingRef` true で classifyRecords が allowed 短絡（L413）、捕捉も `!isHighlightingRef.current` で skip。加えて `cleanClone` が `<pre>` を平文化するため二重に安全（plan がこの重複を認識し 4-T8 の限界として正しく扱っている）。
- **compositionend 捕捉位置（S-003）:** plan は「pending 分類ブロックの有無に関わらず、signature 一致で最終 emit に至る直前（L753 の `isComposingRef=false`→`emit()` の直前）」に置くと明記。`takeRecords()` が空で pending をスキップし signature 一致だけ通る経路でも IME 確定テキストを基準へ折り込める。実コードの分岐（L727-742 の pending 経路と L743-754 の signature 経路）と整合。
- **候補 C guard:** classifyRecords 拡張は実コードの childList 分岐（L422-436）に自然に載る。`isPlaceholderBr`（属性なし `<br>`）＋ removedNodes に `<br>` を含む場合のみ `target.querySelector("*") === null`。
  - AC-4: `<td><br></td>` への 1 文字入力 → target `<td>` が mutation 後テキストのみ（`querySelector("*")===null`）→ allowed。成立。
  - AC-5(a)(b): `<strong>`/`<img>` remove は TEXT/br いずれでもない → rollback。成立。
  - AC-5(c): `<p>a<br><img></p>` から `<br>` remove → guard で img 残存 → `querySelector("*")!==null` → rollback。plan が「2 テキストラン `<p>a<br>b</p>` は guard を通り allowed になるため使わない、要素子が残る構造で組む」と明記しており正しい（既存 L1076 が green のままである確認も妥当）。
  - `target.querySelector("*")` は live post-mutation DOM を読む（plan の「mutation 後の生 DOM」）— MutationRecord.target は live ノードなので正しい。

### 既存テストへの回帰（サンプル確認）

captureSnapshot（allowed バッチで実行）と reconciliation を足しても既存 green テストは壊れない:
- L1096（characterData debounced emit）/ L989（img 隣接テキスト emit）: captureSnapshot は透過的、onChange 引数は不変。
- L108 / L1076 / L813（rollback 系）: rollback 前に allowed バッチが無いため `restored === lastEmittedHtmlRef`（mount 値）→ reconciliation の onChange は発火せず、これらは onChange 呼数を assert しないため影響なし。
- L882 / L910（compositionend）: 合成中ガードで snapshot が前進しないため drift 検出・巻き戻りは従来どおり。

---

## 問題点（要修正）

**問題点ゼロ。**

設計（ADR-001 の snapshot 追従＋P-001 reconciliation、ADR-002 の候補 C guard）は実コードのクロージャ構造・分類器・compositionend 分岐すべてと整合し、実装可能。新たなアーキテクチャリスクは検出されなかった。#233 ADR-003（保守的 rollback）・#287・#498 の既存不変条件はいずれも破られない。

---

## 改善提案

- **[S-001（非ブロッキング・テスト記述の微補正）]** 4-T8 の「reconcile された `onChange` 引数の `<pre>` が平文」という assert 部分は、記述どおり「span 注入 → 別要素 remove」だけだと onChange が発火しない可能性がある。理由: `cleanClone` は `<pre>` を平文化するため、span 注入バッチの serialize 結果は mount 時と同一で、rollback の reconciliation が `restored === lastEmittedHtmlRef` と判定し onChange を発火しない（DOM 主張のみ成立）。
  - **提案:** 4-T8 で onChange 引数まで pin したい場合は、remove 前の allowed バッチで `<pre>` テキストを実際に変える（例: `code` テキストを `foo`→`foobar`、または span を `foobar` テキストで注入）ことで `restored !== lastEmittedHtmlRef` を作り reconcile onChange を発火させる。4-T3 の E1 が content を変えるため onChange が発火するのと同じ仕組み。
  - これは実装フェーズで自然に吸収できるテスト作法レベルの補正であり、4-T8 の核（復元後 DOM の `<pre>` 平文）と AC-7 の実質カバレッジ（既存 #498 L693/L733）は plan のとおり成立するため、**計画修正は必須ではない**。実装者への注意として記録する。

## 良い点

- P-001（capture 同期 / emit デバウンスの時間差によるサイレント消失）を rollback 内の明示 reconciliation で塞ぎ、「rollback 後 親 value = 復元後 DOM」を不変条件として言語化。1〜2 周目で最も危うかった経路が実コードで確実に閉じる設計になっている。
- private `useRef` / mount-once クロージャの観測不能性という happy-dom ハーネスの制約を正しく認識し、直接 assert 不能なガード（合成中捕捉スキップ・ハイライト中捕捉スキップ）を**観測可能な振る舞い pin**へ現実的に落とし込んでいる（4-T7 は成立、4-T8 は限界を認めて弱い pin へ格下げ＋既存 #498 に委譲）。テストの実現可能性が実コードレベルで詰められている。
- 候補 C の `isPlaceholderBr` が「属性なし `<br>` 全般」にマッチする緩さ（行結合 allowed）を隠さず、AC-5(c) テストを「要素子が残る構造で組む」よう設計・実装ステップ・JSDoc 方針に一貫して反映。回帰を pin できないテスト構成を事前に排除している。
- `serializeHostContent` の `cloneNode`+clean 化を `cleanClone` に括り出し capture パイプラインで共用（`DOMParser` 往復を省く）ことで、打鍵ごとの捕捉を rebuild と同一形状に保ちつつコスト最小化。既存の rollback/compositionend ロジックがそのまま効く。

---

## 返答

- 問題点: 0 / 改善提案: 1
- [S-001] 4-T8 の onChange 引数 assert は remove 前に `<pre>` テキストを変えないと reconcile onChange が発火しない（非ブロッキング・テスト作法の補正、計画修正不要）
