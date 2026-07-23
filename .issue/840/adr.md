# ADR — Issue #840: inline モード保守的 rollback の道連れ消失を防ぐ

## ADR-001: rollback の基準 snapshot を「最後に確認された正当な DOM」へ追従させる（バッチ内逐次逆適用は採らない）

### Status
Accepted（実装済み）

### Context

`InlineEditor` の保守的 rollback（#233 ADR-003）は、許可外 mutation を含むバッチを検出するとエディタ全体を `snapshotRef` まで巻き戻す。`snapshotRef` は `rebuild()`（マウント時 + 外部 `value` 変更時）でしか更新されず、自己 emit のラウンドトリップは resync effect のガードで no-op になる。結果、**正当編集を重ねても snapshot は rebuild 時点に固定**され、rollback トリガーを踏むと rebuild 以降の全編集が道連れで消える（TC-005: 未保存 `TAIL` 消失、TC-007: 保存済み他ブロックの消失 + 巻き戻り後本文のサイレント上書き保存）。

「rollback がユーザーの正当な編集を道連れにしない」ために、Issue は 3 案を挙げた:

- **A. バッチ内 mutation の細粒度化** — MutationRecord を 1 件ずつ reverse-apply し、許可分を残して許可外だけ復元する。
- **B. snapshot 追従** — 正当な編集が確定するたびに snapshot を現在の DOM へ更新し、rollback の基準点を前進させる。
- **C. プレースホルダ `<br>` remove の許容** — `<td>` ケースの即効薬（ADR-002 で扱う）。

### Decision

**候補 B（snapshot 追従）を採用する。** observer コールバックが `allowed` と判定したバッチごと（および compositionend の成功時）に、host を clean 化したクローン（`cleanClone(host)` の子を `<body>` 要素へ移したもの）を `snapshotRef.current` へ捕捉し直す。rollback の「snapshot 全置換」という単純な復元機構（#233 ADR-003 の設計）はそのまま維持し、**基準点だけを前進させる**。

捕捉には 3 ガードを課す:

1. IME 合成中（`isComposingRef`）は捕捉しない — 半確定構造を基準に折り込むと compositionend の構造ドリフト検出が無効化されるため。compositionend の**成功時のみ**捕捉して確定テキストを折り込む。捕捉位置は「pending 分類ブロックの有無に関わらず、構造シグネチャ一致で最終 emit に至る直前」に置く（合成中に observer が確定バッチを処理済みで pending が空の経路でも確定テキストを折り込むため）。
2. ハイライト span 注入中（`isHighlightingRef`）は捕捉しない。
3. 捕捉は clean な形（`contenteditable` なし・`<pre>` 平文化）で行い、rebuild と同一形状に揃える。実装は `serializeHostContent → 文字列 → DOMParser` の往復ではなく、`serializeHostContent` が内部で既に行う `cloneNode(true)` + clean 化を共通ヘルパ `cleanClone(host)` に括り出し、その clean 済みクローンの子を `<body>` 要素へ移して捕捉する（文字列化＋再パースを省く — 下記トレードオフ参照）。

**候補 A は却下する。** #233 ADR-003 が「許可分だけ通そうとすると DOM 状態の再構築が複雑になるため避ける」と明示的に却下済み。MutationRecord の逆適用は順序依存で脆く、compositionend/`<pre>`/ハイライトの各特例と干渉する。B は「正当編集を保持する」という A と同じユーザー体験を、既存の単純な全置換機構を保ったまま堅牢に達成する。

### Consequences

- 良い点:
  - 道連れ消失（TC-005 の `TAIL`、TC-007 の他ブロック）を根絶。rollback は許可外を含んだ最新 1 バッチ分だけを巻き戻す。
  - #233 の「保守的な全体復元」という設計意図（構造ドリフトは疑わしきは巻き戻す）を壊さない。変えたのは基準点だけ。
- トレードオフ / 補正:
  - **snapshot 同期捕捉 と emit デバウンスの時間差（arch-risk P-001 で補正）:** 当初「rollback 後の DOM = 最後の emit 内容 → DOM と親 `value` が常に整合」と述べたが、これは **capture が同期・emit が 50ms デバウンス**である前提差を見落としていた。snapshot（最後に *捕捉* した内容）は最後に *emit* した内容より先行しうるため、rollback が復元した「捕捉済みだが未 emit の正当編集」が、pending デバウンスタイマーの `serialize(host) === lastEmittedHtmlRef` 早期 return でサイレントに失われる窓が残る（#840 のバグクラスがデバウンス窓経由で別再発）。**補正:** `rollback()` に reconciliation を組み込む — (1) 保留中の debounce タイマーを `clearTimeout`、(2) 復元後 DOM を `serializeHostContent` で serialize、(3) それが `lastEmittedHtmlRef.current` と異なれば `lastEmittedHtmlRef` を更新した上で `onChange` を**同期発火**する。これにより「**rollback 後、親 `value` は必ず復元後 DOM に一致する**」を不変条件として保証する（JSDoc 化）。flush を挟まない経路（デバウンス保留中に rollback 発火）の pin テストで固定する。
  - allowed バッチごとに `cleanClone`（`cloneNode(true)` + clean 化）の O(n) 再構築が走る。`DOMParser` 往復は当初案から省いた（arch-risk S-002 — clone は元々 serialize で発生しているコストなので前倒しで削れる）。clone 自体は snapshot 追従方式の本質的コストで、通常ノート規模では実害なしと判断。更なる最適化は別 Issue。
  - IME 合成中の捕捉スキップを誤ると compositionend のドリフト検出が無効化される。ガードの取りこぼしが致命的なため、間接 pin（既存 L882）に加え「合成中は捕捉しない」を直接 assert する pin テストで固定する。

---

## ADR-002: プレースホルダ `<br>` remove を非 IME 経路に限り許容する

### Status
Accepted（実装済み）

### Context

#287 で空 `<td><br></td>` / 空ブロックが editable になった結果、「空ブロックへの 1 文字入力」がブラウザのプレースホルダ `<br>` remove を伴い rollback を誘発する（TC-007 手順 2）。ADR-001（B）は道連れ消失を防ぐが、この入力バッチ自体は許可外（Element remove）なので rollback され続け、**空セルにそもそも打てない**という #287 由来の使い勝手劣化が残る。

Issue は候補 C（プレースホルダ `<br>` remove を許可 mutation として扱う）を `<td>` ケースの即効薬として挙げている。

### Decision

`classifyRecords` の childList 分岐を拡張し、以下を**全て**満たすバッチを許可する:

- `target.isContentEditable === true`
- addedNodes が全て TEXT_NODE
- removedNodes が TEXT_NODE または「属性なし `<br>`（`isPlaceholderBr`）」のみ
- removedNodes に `<br>` を含む場合、追加ガードとして target（mutation 後の生 DOM）が要素子を持たない（`querySelector("*") === null`）

IME 合成中の経路には拡張を適用しない（合成中は既存規則で childList が通るが、compositionend の `structureSignature` 比較で `<br>` 消失がドリフト扱いとなり、その 1 文字はロールバックされうる）。

### Consequences

- 良い点:
  - 空プレースホルダブロック（`<td><br></td>` / `<p><br></p>`）への 1 文字入力が非 IME 経路で定着する。#287 の editable 拡張と噛み合った即効的解消。
  - `querySelector("*") === null` guard により、要素子（`<img>`・装飾要素）が残るブロックでの `<br>` remove は従来どおり rollback。装飾/`<img>` 削除の保守的挙動（#233 ADR-003）は不変。
- トレードオフ:
  - guard 下では複数行 `<p>a<br>b</p>` の Backspace 行結合も許容される（構造 `<p>` は保持されるため実害小と判断）。厳密にプレースホルダのみへ絞るには mutation 前状態の復元が必要でコストに見合わないため、この緩みは受容する。`isPlaceholderBr` は名称に反し実体は「属性なし `<br>` 全般」にマッチする（ユーザー改行とプレースホルダを DOM 上で区別できない）— JSDoc にその旨を明記し、AC-5(c) の回帰テストは「remove 後も要素子が残る構造」で組む（2 テキストラン構成は allowed 経路になり回帰を pin できない）。arch-risk S-001。
  - **残存制約:** IME で空プレースホルダブロックへ最初の 1 文字を打つと、compositionend の構造シグネチャ比較でその文字がロールバックされうる。道連れ消失は ADR-001（B）が防ぐため「他の編集は無事だがその 1 文字は残らない」挙動に留まる。compositionend 比較へのプレースホルダ許容の織り込みは複雑化に見合わずスコープ外とする。

---

## ADR-003: `captureSnapshot` に防御的 try/catch を置かない（実装時の判断）

### Status
Accepted（実装済み）

### Context

計画（plan.md 実装ステップ 1）は「snapshot 生成に失敗した場合は既存 snapshot を据え置く（防御的）」と記していた。実装した `captureSnapshot` は `cleanClone(host)`（`host.cloneNode(true)` + 属性除去 + `<pre>` 平文化）→ `ownerDocument.createElement("body")` → `replaceChildren(...clone.childNodes)` の 3 手順のみで構成される。

### Decision

`captureSnapshot` に try/catch は置かない。`cloneNode` / `createElement` / `replaceChildren` はいずれも DOM 標準で例外を投げない操作であり、「生成失敗」は到達不能なため据え置きロジックは死コードになる。CLAUDE.md の「Avoid broad try / catch in ordinary application logic. Use it only at explicit boundaries」方針にも反する。既存 `rebuild()` の snapshot 生成（`body.cloneNode(true)`）も同様に無防御で、対称性を保つ。

### Consequences

- 良い点: 到達不能な分岐を持ち込まず、既存 snapshot 生成箇所と同じ無防御スタイルで統一。
- トレードオフ: 将来 `cleanClone` に I/O や外部依存が入り例外可能性が生じた場合は、この判断を見直す必要がある（現状は純 DOM 操作のみ）。

---
