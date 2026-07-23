# Round 1 レビュー — アーキテクチャ整合性・実現可能性・リスク

**対象:** Issue #840 / `.issue/840/plan.md` / `.issue/840/adr.md`
**視点:** あるべきアーキテクチャとの整合・実現可能性・リスク
**レビュー日:** 2026-07-19

---

## 総評

方針（候補 B: snapshot 追従 ＋ 候補 C: プレースホルダ `<br>` remove 許容、A は却下）は **アーキテクチャ的に正しく、#233 ADR-003 の「保守的全体 rollback」機構を壊さず基準点だけ前進させる**という発想は妥当。プレゼンテーション層コンポーネント内部に閉じており、I/O 契約・依存方向・スタイリング規約への波及は正しく「なし」と判定されている。IME / ハイライト捕捉スキップの二大リスクも自覚され、既存 pin テスト（`inlineEditor.test.tsx` L882）で構造ドリフト検出が守られる点も概ね押さえている。

一方、**snapshot が同期的に前進する一方 emit がデバウンスされる**という時間差に起因する、rollback 時の DOM↔親 value 乖離エッジ（P-001）が計画・ADR の「DOM = 最後の emit 内容で常に整合」という主張の隙間に残っており、しかも計画の AC-3 テストの構成ではこのエッジを踏めない。ここを要修正として挙げる。それ以外は改善提案レベル。

---

## 問題点（要修正）

- **[P-001]** snapshot は allowed バッチごとに**同期**捕捉されるが emit は 50ms **デバウンス**のため、両者の間に時間差がある。rollback は `lastEmittedHtmlRef = serializeHostContent(host)`（= 復元後 snapshot）で上書きするため、**「捕捉済みだが親へ未 emit の正当編集」が pending デバウンス経由でも親へ届かなくなる**乖離が残る。
  - 再現: T0 で正当編集 E1 → `captureSnapshot`（snapshot に E1 入り）＋ emit タイマー（T0+50ms）予約。T0+10ms に許可外バッチ → `rollback()` で host=snapshot(E1入り) を復元し `lastEmittedHtmlRef` を E1 入り serialize に更新。T0+50ms にタイマー発火 → `serialize(host) === lastEmittedHtmlRef` → **早期 return で emit されない**。結果、DOM と snapshot は E1 を保持するが**親 `value`（＝自動保存/submit が読む値）は E1 を含まないまま**になる。ユーザーが rollback 直後に編集を止めれば、E1 は永続化されずサイレントに失われる（本 Issue が潰そうとしている #840 のバグクラスが、窓は狭いが別経路で再発）。実ブラウザでは Backspace-on-img が最後の打鍵から 50ms 以内に来ると踏む。
  - 理由: ADR-001 Consequences の「rollback 後の DOM = 最後の emit 内容 → DOM と親 value が常に整合」は、**capture が同期・emit がデバウンスである**という前提差を見落としている。snapshot（= 最後に *捕捉* した内容）は最後に *emit* した内容より先行しうる。
  - 提案: rollback 時の reconciliation を明示的に決める。案として (a) rollback で pending デバウンスを `clearTimeout` した上で、復元後 snapshot の内容を**無条件に onChange へ流す**（`lastEmittedHtmlRef` を更新する前に「親 value と異なるなら emit」）、または (b) rollback では `lastEmittedHtmlRef` を上書きせず pending タイマーに snapshot 内容を emit させる（ただし pending が無い純 rollback 経路で親が stale に残らないようガード）。どちらでも「rollback 後、親 value は必ず復元後 DOM に一致する」を不変条件として JSDoc 化する。
  - テスト補強: 計画の **AC-3 テストは各編集後に `flushMutations()`（80ms > 50ms）を挟むため、rollback 時点で pending デバウンスが存在せずこのエッジを踏まない**。編集と force-remove の**間に flush を挟まない**ケース（allowed 編集 → 同一 tick 内で要素 remove → 1 回だけ flush）を追加し、「編集が DOM に残る」だけでなく「**その編集が最終的に onChange で親へ届く**」ことまで assert する pin を要求する。

---

## 改善提案（検討推奨）

- **[S-001]** `isPlaceholderBr`（`ELEMENT_NODE && tagName==="br" && attributes.length===0`）は名称が実体より特異的。**属性なしの `<br>` すべて**にマッチするため、ユーザーが打った `<p>a<br>b</p>` の改行 `<br>` とブラウザのプレースホルダ `<br>` を区別できない。これは ADR-002 が受容する「行結合の許容」の根拠そのものだが、
  - AC-5(c)「他要素が残るブロックでの `<br>` remove は rollback」の**テストは、必ず remove 後も要素子が残る構造**（例 `<p>a<br><img></p>` / `<p>a<br><strong>x</strong></p>`）で組む必要がある。`<p>a<br>b</p>` では `querySelector("*")===null` で **allowed（行結合）**になり rollback しないため、そのままだと AC-5 の意図と食い違う。テスト作者が誤って 2 テキストラン構成にしないよう、plan の AC-5 記述に「要素子が残る」明示を残すこと。
  - 併せて `isPlaceholderBr` の JSDoc に「実際は属性なし `<br>` 全般を通す。プレースホルダ限定ではない（mutation 前状態を復元しないと厳密判別不可）」旨を書き、後続実装者の誤読を防ぐ。
  - 理由: ADR で受容済みの緩みだが、命名と AC-5 テスト構成が噛み合わないと「回帰防止のつもりが実は allowed 経路」を pin してしまう危険がある。

- **[S-002]** `captureSnapshot` の `serializeHostContent → 文字列 → DOMParser 再パース`は allowed バッチごとに O(n) の文字列化＋パースを走らせる。`serializeHostContent` は**内部で既に host を `cloneNode(true)` して clean 化している**（L350-365）ので、文字列を経由せず「clean 化したクローンの `<body>` 相当」を直接返す変種を用意すれば DOMParser 往復を丸ごと省ける。plan は「体感遅延が出れば別 Issue」としているが、低コストで前倒しできる（clone は元々必要）。
  - 理由: rebuild と同一形状（`contenteditable` 無し・`<pre>` 平文化）を保てば既存 rollback/compositionend ロジックはそのまま効くので、パイプライン一致という plan の要件は文字列往復なしでも満たせる。打鍵ごとのコストは snapshot 追従方式の本質的オーバーヘッドなので、削れるところは削っておく価値がある。

- **[S-003]** `onCompositionEnd` の捕捉挿入位置は「pending 分類 allowed **かつ** 構造シグネチャ一致」と書かれているが、実コードでは `takeRecords()` が空（合成中に observer が既に処理済み）で pending 分類ブロック（L727-742）を丸ごとスキップし、**シグネチャ一致チェック（L743-752）だけ通って L753-754 の最終 `emit()` に到達する経路**がある。捕捉は「pending の有無に関わらず、シグネチャ一致で最終 emit に至る直前（L753 の位置）」に置くべき。plan の文言だと `pending.length > 0` を捕捉の前提条件と誤読しかねない。
  - 理由: IME 確定テキストを基準へ折り込む捕捉は「合成が構造ドリフトなく確定した」全経路で必要。pending 有無で分岐すると、合成中に observer が確定バッチを処理し切ったケース（pending 空）で確定テキストが snapshot に折り込まれず、後続 rollback で IME 入力が失われうる。

- **[S-004]** 「合成中は snapshot を捕捉しない」不変条件は、既存テスト `rolls back on compositionend when the structure drifted`（L882）が**間接的に強く pin している**（合成中に span を append → もし捕捉されると snapshot に span が入り compositionend のシグネチャ一致で rollback しなくなりテスト red）。plan もこれを green 維持対象に挙げており妥当。ただし依存が間接的なので、**「合成中の allowed childList では `captureSnapshot` が呼ばれない」ことを直接 assert する pin**（例: 合成中に characterData 編集 → compositionend で要素 drift → rollback で合成中編集も巻き戻る、を明示）を 1 本足すと、将来リファクタで捕捉ガードが外れた際の検出が速くなる。

---

## 検証した観点と所見

- **候補 B が #233 の安全機構を無効化しないか:** snapshot が前進するのは「characterData / テキストのみ childList / 候補 C の `<br>` remove」= 構造保存 or 受容済みの構造変化のみ。許可外（要素 add/remove、非 IME 属性変化）は依然 rollback を誘発し、`classifyRecords` がバッチ内全 record をループするため**1 件でも許可外があればバッチ全体 rollback**という保守性は保たれる。基準点前進で安全機構が無効化される経路は見当たらない（唯一 snapshot に焼き込まれる構造変化は候補 C の `<br>` 除去だが、これは ADR-002 が意図的に許容する範囲で無害）。**問題なし。**
- **IME 捕捉タイミング:** observer コールバックは `isComposingRef.current` を**実行時**に読むため、compositionstart（task）で `true` 化した後の microtask コールバックは capture をスキップする。compositionend は takeRecords→isComposing=true で確定バッチを分類し、シグネチャ一致時のみ capture。合成中に前進した snapshot でドリフト検出が骨抜きになる経路は無い（L882 テストが守る）。**ガードは適切。** 残る注意点は S-003（捕捉位置）と S-004（明示 pin）のみ。
- **候補 C の guard と行結合:** `querySelector("*")===null` は行結合（`<p>a<br>b</p>` → `<p>ab</p>`）を通すが `<p>` 構造は保持され ADR-002 が受容。ブロック跨ぎのマージ（前段落へ結合＝`<p>` 要素が removedNodes に入る）は `isPlaceholderBr`/TEXT 判定を外れ従来どおり rollback。要素子が残るブロックの `<br>` remove も guard で rollback。**設計は妥当**（テスト構成の注意は S-001）。
- **自動保存・#287 との相互作用:** `NoteEditor` の autosave/submit/edit-lock は `InlineEditor` の `{value,onChange,disabled,onInitFailed}` 契約越し接続で契約不変、波及なし。#287 の editable 拡張（空ブロック decorate）と候補 C が噛み合い、`<td><br></td>` への 1 文字入力は**そもそも rollback せず allowed になる**（テキスト挿入＋`<br>` 除去が同一バッチで guard 通過）ため、TC-007 実害は候補 C 単独でも解消。候補 B は「force-remove 等の真の許可外」経路での道連れを防ぐ二重防御。整理は正しい。
- **エッジケース:** 連続 rollback は snapshot を都度 `cloneNode` する既存挙動（invariant 3）に乗るので独立性維持。rebuild と capture の競合は、rebuild が debounce タイマーを kill しつつ snapshot を作り直すため capture より優先で問題なし。**主要な穴は P-001 のデバウンス窓のみ。**

---

## 良い点

- 候補 A 却下の根拠を #233 ADR-003 の明示的却下（「許可分だけ通すと DOM 再構築が複雑」）に接続し、**snapshot 全置換という単純機構を維持したまま基準点だけ動かす**という最小侵襲の設計を選べている。アーキテクチャ判断として筋が良い。
- 「IME 捕捉スキップ漏れが致命的」「compositionend 成功時のみ捕捉」という #233 の最重要不変条件を設計の中心に据え、リスク欄でも最上位に置いている。リスク認識の粒度が高い。
- レイヤー分析が正確（プレゼンテーション層内部・I/O 契約対称性・`.note-detail-content` 例外・`isHighlightingRef` 協調）。バックエンド 3 層への波及「なし」の断定に根拠がある。
- AC ↔ 実装ステップ ↔ テストの対応表が具体的で、#233/#287/#498 の既存 pin（img force-remove L1076、compositionend drift L882、`<pre>` opacity L782 等）を green 維持ゲートとして明示しており、回帰防止設計が実装可能な粒度に落ちている。
- 候補 C を非 IME 経路に限定し、IME 空セル初手入力の残存制約を ADR-002 Consequences に「消失ではなく残らない」と正確に切り分けて記載している。スコープ境界の説明が誠実。

---

## サマリー

- 問題点: 1 / 改善提案: 4
- `[P-001]` snapshot 同期捕捉と emit デバウンスの時間差 → rollback 時に未 emit の正当編集が親へ届かず DOM↔value 乖離（AC-3 テストは flush 挟むため踏めない）
- `[S-001]` `isPlaceholderBr` は属性なし `<br>` 全般にマッチ。AC-5(c) テストは要素子が残る構造で組む必要
- `[S-002]` capture の `serialize→文字列→DOMParser` 往復は clone+clean で省ける（clone は元々発生）
- `[S-003]` compositionend の捕捉位置は「pending 有無に関わらずシグネチャ一致で最終 emit 直前」に置くべき
- `[S-004]` 「合成中は捕捉しない」を直接 assert する pin を 1 本追加推奨
