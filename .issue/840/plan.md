# 実装計画 — Issue #840: inline モード: 保守的 rollback が最後の rebuild snapshot まで全体を巻き戻し、rebuild 前の編集がサイレント消失する

**Issue:** #840
**作成日:** 2026-07-19
**複雑度:** 中〜大規模

---

## 目的

inline エディタの保守的 rollback が、許可外 mutation を検出したときに「最後の rebuild 時点の snapshot」まで全体を巻き戻し、それまでの正当な編集を道連れに消してしまう問題を解消する。rollback は許可外 mutation を含んだ**その 1 バッチ分だけ**を巻き戻し、直前までの正当な編集は保持する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ（実装 / 検証テスト） |
|---|---|---|---|
| AC-1 | rebuild 以降に正当なテキスト編集を複数行った後、許可外 mutation（要素 remove）で rollback が発動しても、直前までの正当な編集が DOM に保持される（初回 rebuild 時点まで巻き戻らない） | Issue ゴール / TC-005 / TC-007 | 実装 1, 2 / 検証 4-T1（AC-1/2） |
| AC-2 | `<p>before<img>after</p>` 末尾に `TAIL` を入力後に `<img>` を Backspace 削除試行 → `<img>` は復元されつつ、直前入力の `TAIL` も保持される（TC-005 の実害解消） | TC-005 | 実装 1, 2 / 検証 4-T1（AC-1/2） |
| AC-3 | 複数ブロックに入力（各々自動保存到達）した後、別ブロックで rollback トリガーを踏んでも、先行入力済みブロックの本文は DOM から消えず、後続 emit が巻き戻り前の本文で上書き保存しない（TC-007 のサイレント消失解消） | TC-007 | 実装 1, 2 / 検証 4-T2（AC-3・TC-007 再現） |
| AC-3′ | rollback 発動時に「捕捉済みだが未 emit（デバウンス保留中）の正当編集」も含めて、rollback 直後の親 `value` が復元後 DOM と必ず一致する（デバウンス窓経由のサイレント消失を防ぐ） | arch-risk P-001 | 実装 2 / 検証 4-T3（P-001・flush 非挿入経路） |
| AC-4 | プレースホルダ `<br>`（属性なし・ブロックが以後テキストのみ）を remove して文字を入力するバッチは rollback せず入力が残る（`<td><br></td>` / `<p><br></p>` 空ブロックへの 1 文字入力が定着する） | Issue 候補 C / TC-007 | 実装 3 / 検証 4-T4（AC-4） |
| AC-5 | 装飾要素（`<strong>`/`<em>`/`<a>`）・`<img>` の remove、および**他要素が残るブロック**での `<br>` remove は従来どおり rollback される（#233 ADR-003 の構造保持は不変） | #233 ADR-003 回帰防止 | 実装 2, 3 / 検証 4-T5（AC-5(a)(b)(c)） |
| AC-6 | IME 合成中の一時的な構造変化を snapshot に取り込まず、compositionend の構造ドリフト検出（既存 pin テスト）が引き続き機能する | #233 ADR-003 / 既存テスト | 実装 1 / 検証 4-T6（AC-6）, 4-T7（合成中の編集が rollback で巻き戻ることの振る舞い pin） |
| AC-7 | `<pre>` のハイライト span 注入中は snapshot を更新せず、serialize / structureSignature の `<pre>` 不透明性が維持される | #233/#498 既存不変条件 | 実装 1 / 検証 既存 #498 pin（L693/L733）+ 4-T8（rollback 復元後 `<pre>` が平文である振る舞い pin） |

## スコープ

### 含まれないもの

- **バッチ内 mutation の逐次逆適用（候補 A）** — MutationRecord を 1 件ずつ reverse-apply して許可分だけ残す方式は採らない。#233 ADR-003 が「許可分だけ通そうとすると DOM 状態の再構築が複雑になるため避ける」と明示的に却下済み。snapshot 追従（候補 B）で同じユーザー体験（正当編集の保持）をより堅牢に達成できる（詳細は adr.md ADR-001）。
- **IME で空プレースホルダブロックへ最初の 1 文字を入力するケースの定着** — 候補 C は非 IME 経路に限定する。IME 合成中の `<br>` remove は compositionend の構造シグネチャ比較で依然ドリフト扱いとなり、その 1 文字はロールバックされうる（データ道連れは B が防ぐので消失ではなく「その文字が残らない」既知制約）。compositionend 比較へのプレースホルダ許容の織り込みは複雑化に見合わずスコープ外（adr.md ADR-002 Consequences に残存制約として記載）。
- rollback 粒度をブロック単位に局所化する DOM 差分エンジンの導入。snapshot 全体置換という #233 の設計を維持したまま基準点を追従させるのが本 Issue の方針。
- inline モードでの `<img>` 削除・装飾要素削除の正規サポート（従来どおり html モードへ切替）。

## 調査結果

- **関連ファイル:**
  - `app/components/note/editor/InlineEditor.tsx` — rollback / snapshot / MutationObserver ロジックの本体。`snapshotRef`（rollback 基準）、`rebuild()`（snapshot 生成）、`rollback()`（snapshot 全置換）、`classifyRecords()`（許可/rollback 判定）、`serializeHostContent()`（clean な保存形へ正規化）、observer コールバック（`verdict.kind === "allowed" → emit()`）。
  - `app/components/note/editor/__tests__/inlineEditor.test.tsx` — 構造保持契約の pin テスト群（1119 行）。rollback・compositionend・#287 ゲート・`<pre>` の各挙動を happy-dom で pin。
  - `.issue/233/adr.md` ADR-003 — 保守的 rollback（characterData 常時 + childList/attributes は IME 中またはテキストノードのみ許容、許可外を含むバッチは全体 rollback）の設計判断。
  - `.issue/287/adr.md` ADR-001 — 空 `<p>` / `<td><br></td>` 等の「テキスト子なしブロック」を editable 化した変更（rollback トリガー遭遇頻度上昇の原因）。
  - `.issue/287/manual-test/results/TC-005.md` / `TC-007.md` — 実害シナリオの実機記録。
- **あるべきアーキテクチャ:** これはプレゼンテーション層（`app/components/`）のクライアントコンポーネント内部ロジックの問題。バックエンドのドメイン/ユースケース/アダプターには一切波及しない。`InlineEditor` は `{ value, onChange, disabled, onInitFailed }` の I/O 契約（`HtmlEditor`/`WysiwygEditor` と対称）を保ち、内部の DOM 同期・snapshot 機構だけを閉じて改善する。CLAUDE.md「フロントエンド」方針（値の受け渡しは onChange、状態は data-* 属性、境界でのみ検証）を踏襲。設計はコンポーネント内部の状態管理（`snapshotRef` のライフサイクル）の再設計から入る。
- **既存実装の状態（乖離点）:**
  - `snapshotRef.current` は `rebuild()`（= マウント時 + 外部 `value` 変更時）でしか更新されない。自己 emit のラウンドトリップは resync effect の `value === lastEmittedHtmlRef.current` ガードで no-op となり rebuild が走らないため、**正当編集を重ねても snapshot は rebuild 時点のまま固定される**。
  - `rollback()` は `host.replaceChildren()` で snapshot を丸ごと復元 → rebuild 以降の全編集が消える。さらに rollback は `onChange` を呼ばないが、直後のユーザー入力で走る debounced emit が「巻き戻り後の本文」を保存するため、一度自動保存まで到達していた編集がサイレント消失する（TC-007）。
  - これは #233 の設計意図（構造ドリフトは保守的に全体復元）を満たしてはいるが、**基準点（snapshot）が古すぎる**ことに起因する副作用。#287 で editable ブロックが増え遭遇頻度が上がって顕在化した。
- **依存関係:** `NoteEditor.tsx` の autosave / submit / edit-lock 配管は `InlineEditor` の I/O 契約越しにのみ接続しており、契約は不変なので影響なし。`highlighter`（`<pre>` ハイライト）とは `isHighlightingRef` 経由で協調しており、snapshot 追従はこのフラグを尊重する必要がある。

## 設計

レイヤーの内側（`InlineEditor` 内部の状態機構）から設計する。バックエンド 3 層への影響は**なし**（本 Issue はプレゼンテーション層コンポーネント内部の DOM 同期ロジックに閉じる）。

### ドメインモデルへの影響
なし。ドメイン/アプリケーション/アダプターには波及しない。

### ユースケース / アプリケーションロジック
なし。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション

`InlineEditor` 内部の snapshot ライフサイクルと mutation 分類を再設計する。

**核心（候補 B: snapshot 追従）** — 現状 `snapshotRef` は「rebuild 時点の DOM」に固定されている。これを「**最後に確認された正当な DOM**」へ追従させる。observer コールバックが `allowed` と判定したバッチごとに、その時点の host 内容を clean な snapshot として捕捉し直す。こうすると rollback は「許可外を含んだ最新の 1 バッチ分」だけを巻き戻し、それ以前の正当編集はすべて保持される。#233 の「snapshot 全置換」という単純な復元機構はそのまま維持し、**基準点だけを前進させる**のがポイント（差分エンジンを導入しない）。

snapshot 捕捉の正しさを保つ 3 つのガード:

1. **IME 合成中は捕捉しない（AC-6）** — `isComposingRef.current` が true の間は childList mutation が「合成中ゆえ許可」で通るが、これは一時的な半確定構造。ここで snapshot を更新すると compositionend の `structureSignature(host)` vs `structureSignature(snapshot)` 比較が常に一致してしまい、IME による構造ドリフト検出が無効化される。よって合成中は捕捉をスキップし、compositionend の**成功時にのみ**捕捉する（IME 確定テキストを基準へ折り込む）。
2. **ハイライト span 注入中は捕捉しない（AC-7）** — `isHighlightingRef.current` が true の間は表示専用 span の churn。捕捉は `serializeHostContent`（`<pre>` を平文化）経由なので実害は無いが、無駄なので明示スキップ。
3. **clean な形で捕捉** — snapshot は rollback 復元時に `applyEditable` + `highlightAll` を再適用する前提なので、`contenteditable` 属性なし・`<pre>` 平文化された形で持つ（`rebuild()` と同一形状 → 既存の rollback/compositionend ロジックがそのまま効く）。実装上は `serializeHostContent → 文字列 → DOMParser` の往復を避け、**`serializeHostContent` が内部で既に行っている `host.cloneNode(true)` + clean 化（`contenteditable` 除去・`<pre>` 平文化）を共通ヘルパ（`cleanClone(host)`）に括り出し、その clean 済みクローンの子を `<body>` 要素へ移して `snapshotRef` に持つ**（`serializeHostContent` は `cleanClone(host).innerHTML` を返すよう再構成）。文字列化＋再パースを丸ごと省け、打鍵ごとの捕捉コストを最小化しつつ rebuild と同一形状を保てる（arch-risk S-002）。

**補完（候補 C: プレースホルダ `<br>` remove の許容）** — #287 で空 `<td><br></td>` / 空ブロックが editable になったことで、「空ブロックへの 1 文字入力」がブラウザのプレースホルダ `<br>` remove を伴い rollback を誘発する。B だけだとこの入力は（道連れ消失こそ防げるが）その 1 文字ごと巻き戻る＝空セルにそもそも打てない。`classifyRecords` の childList 分岐を拡張し、**「contentEditable 下 target で、addedNodes が全て TEXT_NODE、removedNodes が TEXT_NODE か属性なし `<br>` のみ、かつ target が mutation 後に要素子を一切持たない（`querySelector("*") === null`）」バッチを許可**する。これで空プレースホルダブロックへの入力が定着する。要素子が残るブロック（`<img>` や装飾要素と同居）での `<br>` remove は guard により従来どおり rollback（AC-5 を守る）。

> **注意（arch-risk S-001）:** ヘルパ `isPlaceholderBr` は実体としては「属性なし `<br>` 全般」にマッチする。ユーザーが打った改行 `<br>`（`<p>a<br>b</p>` の中間）とブラウザ生成のプレースホルダ `<br>` を DOM 上で区別する術は無い（厳密判別には mutation 前状態の復元が必要でコストに見合わない）。したがって「要素子が残らないブロック」に限る `querySelector("*") === null` guard 下では `<p>a<br>b</p>` → `<p>ab</p>` の**行結合も allowed**になる（構造 `<p>` は保持されるため実害小、ADR-002 が受容）。この緩みゆえ、**AC-5(c) の「他要素が残るブロックでの `<br>` remove は rollback」テストは、remove 後も要素子が残る構造（例 `<p>a<br><img></p>` / `<p>a<br><strong>x</strong></p>`）で組む**こと。2 テキストラン構成（`<p>a<br>b</p>`）だと guard を通って allowed になり AC-5 の意図と食い違うため使わない。`isPlaceholderBr` の JSDoc にも「プレースホルダ限定ではなく属性なし `<br>` 全般を通す」旨を明記する。

**rollback / emit の整合（P-001 の reconciliation を含む）** — B により snapshot は「最後に**捕捉**した正当な DOM」を指すが、`emit` は 50ms デバウンスされるため、snapshot（同期捕捉）は「最後に**実際に onChange した**内容」より先行しうる。この時間差を無視すると次の乖離が残る（arch-risk P-001）:

- T0 で正当編集 E1 → `captureSnapshot`（snapshot に E1 入り）＋ emit タイマー（T0+50ms）を予約。
- T0+10ms に許可外バッチ → `rollback()` が host=snapshot(E1 入り) を復元し `lastEmittedHtmlRef` を E1 入り serialize で上書き。
- T0+50ms にタイマー発火 → `serialize(host) === lastEmittedHtmlRef` で**早期 return し emit されない**。

結果、DOM/snapshot は E1 を保持するのに**親 `value`（自動保存/submit が読む値）は E1 を含まないまま**になり、#840 のバグクラスが別経路（デバウンス窓）で再発する。実ブラウザでは Backspace-on-img が最後の打鍵から 50ms 以内に来ると踏む。

よって `rollback()` に **reconciliation を明示的に組み込む**: rollback は復元後に (1) 保留中の debounce タイマーを `clearTimeout` で確実に無効化し、(2) 復元後 DOM を `serializeHostContent(host)` で serialize して `restored` を得、(3) `restored !== lastEmittedHtmlRef.current`（＝親がまだ受け取っていない）なら `lastEmittedHtmlRef.current = restored` を更新した上で `onChangeRef.current(restored)` を**同期的に発火**する。一致していれば onChange は不要（従来どおり `lastEmittedHtmlRef` 更新のみ）。これにより「**rollback 後、親 `value` は必ず復元後 DOM に一致する**」を不変条件として保証し、pending デバウンス経由の未 emit 正当編集がサイレントに失われる経路を塞ぐ。rollback は許可外を含んだ最新 1 バッチ分だけを巻き戻すという B の効果はそのまま維持される。

## 実装ステップ

内側（状態機構）→ 外側（分類器・テスト）の順。

### 1. snapshot 追従機構の導入

- **対象ファイル:** `app/components/note/editor/InlineEditor.tsx`
- **変更内容:**
  - `serializeHostContent` 内の `host.cloneNode(true)` + clean 化（`contenteditable` 除去・`<pre>` 平文化）を共通ヘルパ `cleanClone(host: HTMLElement): HTMLElement` に括り出し、`serializeHostContent` は `cleanClone(host).innerHTML` を返すよう再構成する（挙動不変のリファクタ）。
  - mount-once effect 内に `captureSnapshot()` を追加する。`cleanClone(host)` の子ノードを新規 `<body>` 要素（`host.ownerDocument.createElement("body")`）へ移し、それを `snapshotRef.current` に代入する（`DOMParser` 往復を回避しつつ rebuild と同一形状 — arch-risk S-002）。生成に失敗した場合は既存 snapshot を据え置く（防御的）。
  - observer コールバックの `verdict.kind === "allowed"` 分岐で、`!isComposingRef.current && !isHighlightingRef.current` のときに `captureSnapshot()` を呼んでから `emit()`。
  - `onCompositionEnd` の捕捉挿入位置は、**pending 分類ブロック（L727-742）の有無に関わらず**、構造シグネチャ一致で最終 `emit()` に至る直前（L753 の `isComposingRef.current = false` → `emit()` の直前）に置く。`observerRef.takeRecords()` が空（合成中に observer が確定バッチを処理済み）で pending 分類をスキップし、シグネチャ一致チェックだけ通って最終 emit へ到達する経路でも IME 確定テキストが基準へ折り込まれるようにするため（arch-risk S-003）。`pending.length > 0` を捕捉の前提条件にはしない。
  - `snapshotRef` を書き換える箇所（`rebuild` / `captureSnapshot`）の意図を JSDoc/invariant 2・3 の記述に合わせて補足（「snapshot は rebuild 時点ではなく最後に確認された正当な DOM を指す」旨）。
- **理由:** rollback の基準点を rebuild 時点から「最後の正当な DOM」へ前進させ、道連れ消失（AC-1〜3）を根絶する。IME/ハイライトのガードで既存の構造ドリフト検出（AC-6/7）を保つ。捕捉パイプラインは clone+clean で `DOMParser` 往復を省く。

### 2. rollback の reconciliation と invariant コメントの整合

- **対象ファイル:** `app/components/note/editor/InlineEditor.tsx`
- **変更内容:**
  - `rollback()`（L510-533）に **P-001 の reconciliation** を組み込む。snapshot 全置換ロジック（`replaceChildren` による復元）は維持したまま、復元後の末尾処理を次のように変える:
    1. 保留中の debounce タイマーがあれば `clearTimeout` して `debounceTimerRef.current = null`（復元後 DOM を serialize する pending emit が早期 return でスキップされる経路を断つ）。
    2. `const restored = serializeHostContent(host)` を得る。
    3. `restored !== lastEmittedHtmlRef.current` のとき（＝親がまだ受け取っていない正当編集が含まれる）は `lastEmittedHtmlRef.current = restored` を更新した上で `onChangeRef.current(restored)` を**同期発火**する。一致していれば従来どおり `lastEmittedHtmlRef.current = restored` の更新のみ（onChange 不要）。
  - これにより「rollback 後、親 `value` は必ず復元後 DOM に一致する」を保証する。この不変条件を `rollback` の JSDoc および invariant 3 に明記する。
  - invariant 2（"A snapshot of the parsed `<body>` is kept"）と invariant 3（Rollback procedure）の JSDoc を、snapshot が正当編集に追従する新契約（「snapshot は最後に確認された正当な DOM を指し、rollback は許可外を含む最新 1 バッチ分だけを巻き戻す」「rollback 後は復元内容を親へ reconcile する」）に更新する。
- **理由:** arch-risk P-001 — snapshot は同期捕捉・emit はデバウンスのため、rollback が復元した正当編集（未 emit 分）が pending タイマーの早期 return でサイレントに失われうる。reconciliation で親 value と DOM を必ず一致させ、#840 のバグクラスがデバウンス窓経由で再発するのを塞ぐ。あわせて #233 ADR-003 の「保守的全体 rollback」意図を壊さず基準点だけ変えた設計を invariant ドキュメントへ反映する（CLAUDE.md「library-level JSDoc は歓迎」）。

### 3. プレースホルダ `<br>` remove の許容（候補 C）

- **対象ファイル:** `app/components/note/editor/InlineEditor.tsx`
- **変更内容:** `classifyRecords` の childList 分岐を拡張。ヘルパ `isPlaceholderBr(node)`（ELEMENT_NODE かつ `tagName==="br"` かつ `attributes.length === 0`）を追加し、removedNodes 判定を「TEXT_NODE または placeholder `<br>`」に緩める。ただし removedNodes に `<br>` が含まれる場合のみ、追加ガードとして「target（mutation 後の生 DOM）が要素子を持たない（`(target as Element).querySelector("*") === null`）」を要求する。addedNodes は従来どおり全 TEXT_NODE 必須。
- **理由:** #287 で editable 化した空プレースホルダブロックへの 1 文字入力を定着させ、`<td>` ケースの実害（TC-007 手順 2）を即効的に解消する（AC-4）。要素子が残るブロックでの `<br>` remove は guard で従来どおり rollback（AC-5）。

### 4. テストの追加・更新

- **対象ファイル:** `app/components/note/editor/__tests__/inlineEditor.test.tsx`
- **変更内容:** 以下の pin テストを追加（happy-dom + 既存 `flushMutations`/`findHost` ヘルパ流用）。番号は AC 表の「検証テスト」列と対応。
  - **4-T1（AC-1/AC-2, snapshot 追従・TC-005）:** `<p>before<img>after</p>` の末尾テキストを `characterData` で `afterTAIL` に更新 → flush（allowed → snapshot 追従・emit）→ `<img>` を `remove()` → flush → **`<img>` 復元 かつ 本文に `TAIL` が残る**ことを assert（現行だと TAIL が消えることの回帰 pin）。
  - **4-T2（AC-3, TC-007 の道連れ消失・上書き保存防止）:** 複数段落 A/B に順次テキスト編集し、**各編集後に `flushMutations()`（>50ms でデバウンス発火）を挟んで各々自動保存到達を再現** → 別要素を force-remove（rollback トリガー）→ flush → (1) 先行編集済みブロック A の本文が DOM に保持されることを assert（DOM 消失なし）。加えて **TC-007 の実害メカニズムを忠実に再現**するため、(2) rollback **後にさらにテキスト入力 → flush で走る emit** の `onChange` 引数が先行編集 A を含み、巻き戻り前の古い本文になっていないことを別 assert で確認する（サイレント上書き保存の回避 — coverage S-003）。DOM 保持の確認と上書き保存回避の確認を分離し、AC-3 の 2 主張を一対一で pin する。
  - **4-T3（AC-3′, P-001・flush 非挿入経路）:** **編集と force-remove の間に 80ms 相当の `flushMutations()` デバウンス flush を挟まない**ケースを追加。ただし E1 と rollback トリガーを**同一 MutationObserver バッチに畳み込んではならない**（同一バッチだと `classifyRecords` が remove を検出してバッチ全体を rollback 判定 → E1 が allowed 経路を通らず `captureSnapshot` されず、snapshot が E1 以前のままになり E1 ごと巻き戻る＝candidate B の正しい限界で、P-001 の窓は踏めない）。手順を次のとおり明示する: **(手順 A) allowed テキスト編集 E1 を独立した `act`（microtask flush で observer が E1 を別バッチとして allowed 捕捉 ＋ 50ms emit タイマーを予約。`act` は実時間 50ms を進めないのでデバウンスは pending のまま）で確定 → (手順 B) 間に 80ms の `flushMutations` を挟まず、別の `act` で許可外 remove を発火 → 1 回だけ flush**。この 2 バッチ構成（既存の composition テスト L864-908 が各 DOM mutation を個別 `act` で包む流儀と同じ）で、(1) E1 が DOM に残ることに加え、(2) **rollback の reconciliation が pending デバウンスを clear した上で E1 を含む復元内容を `onChange` で親へ同期発火している**ことを assert する。plan の 4-T2 は各編集後に 80ms flush を挟むため pending デバウンスが無くこのエッジを踏まない — 本テストが P-001 の窓（capture 済み・未 emit で rollback）を専用に pin する。
  - **4-T4（AC-4, 候補 C 定着）:** `<td><br></td>`（および `<p><br></p>`）に対し、text `X` insert + placeholder `<br>` remove のバッチを再現 → flush → **rollback せず `X` が残る**ことを assert。
  - **4-T5（AC-5, C の guard 回帰）:** (a) `<strong>` の remove、(b) `<img>` の remove、(c) **他要素が残るブロックでの `<br>` remove**、いずれも従来どおり rollback されることを pin。**(c) は remove 後も要素子が残る構造で組む**こと（例 `<p>a<br><img></p>` / `<p>a<br><strong>x</strong></p>` から `<br>` を remove）。`<p>a<br>b</p>` は guard（`querySelector("*")===null`）を通って allowed（行結合）になり AC-5 の意図と食い違うため使わない（arch-risk S-001）。既存 "rolls back when the `<img>` is force-removed"（1076 行）等が green のままであることも確認。
  - **4-T6（AC-6, IME ドリフト検出の非無効化）:** 非合成の allowed 編集で snapshot を進めた後、compositionstart → 要素 append → compositionend で **rollback が発動する**（snapshot 追従が compositionend 比較を無効化していない）ことを pin。既存の "rolls back on compositionend when structure drifted"（L882）が引き続き green であることも確認。
  - **4-T7（AC-6, 合成中は捕捉しないを振る舞いで pin — arch-risk S-002）:** `captureSnapshot` は mount-once effect 内のローカルクロージャで呼び出し有無をテストから直接観測できないため、「`captureSnapshot` を呼ばないことを直接 assert」は literal には実装不可。観測可能な**振る舞い**で間接 pin する: 合成中（compositionstart 後）に allowed 編集（例 characterData）を打つ → compositionend で要素 drift → rollback により**合成中に打ったテキストも巻き戻る**ことを assert する（ガードを外すと合成中テキストが snapshot に折り込まれ、drift rollback 後も残ってしまうため red 化する）。L882 の間接依存に加え、捕捉ガードが将来のリファクタで外れた際の検出を速める。既存 L882 との差分（4-T7 は characterData 編集の巻き戻りまで見る）は妥当。
  - **4-T8（AC-7, `<pre>` 不透明性の振る舞い pin — arch-risk P-001）:** `snapshotRef`/`isHighlightingRef` は private `useRef` でテストから設定も参照もできず、かつ捕捉パイプライン `cleanClone` は `<pre>` を常に平文化するため、「ハイライト中は snapshot 非更新」ガードの有無は観測上まったく同一（どちらも span を含まない平文 `<pre>`）で、いかなる振る舞いテストも弁別できない（ガードを消しても green のまま = 何も pin しない）。よって当初案の「`snapshotRef` を直接 assert」は撤回する。AC-7 の実質（snapshot / serialize 経路に `<pre>` の highlight span が漏れない）は既存 #498 の serialize 平文化 pin（`strips highlight <span>s from <pre>`（L693）、bare-`<pre>` 版（L733）が `onChange` 引数越しに `<pre>` の平文化を pin 済み）が既にカバーしている。4-T8 はこれを補完する**観測可能な振る舞い pin**へ格下げする: `<pre>` へ span 注入相当の allowed バッチ → 別要素 force-remove で rollback → **復元後 DOM（および reconcile された `onChange` 引数）の `<pre>` が span を含まない平文である**ことを assert する（snapshot 経路が `<pre>` を平文で捕捉している＝ハイライト churn を基準へ折り込んでいないことを、観測可能な復元結果から間接 pin）。private ref への直接 assert には依存しない。**テスト作法の注意（arch-risk R3 S-001）:** onChange 引数まで pin する場合、remove 前の allowed バッチで `<pre>` テキストを実際に変える（例: `code` テキストを `foo`→`foobar`、または `foobar` テキストで span 注入する）こと。`cleanClone` が `<pre>` を常に平文化するため、テキストを変えずに span 注入だけを行うと serialize 結果が mount 時と不変になり、reconciliation が `restored === lastEmittedHtmlRef` と判定して onChange を発火しない（DOM 主張のみ成立し onChange 引数が観測できない）。4-T3 の E1 が content を変えて onChange を発火させるのと同じ仕組み。
- **理由:** TC-005/TC-007 の実害シナリオ（道連れ消失・サイレント上書き保存）と P-001 のデバウンス窓を回帰テスト化し、#233/#287/#498 の既存不変条件（IME ドリフト検出・`<pre>` 不透明性・装飾/`<img>`/他要素残存 `<br>` の rollback）を破っていないことを保証する。

## 設計判断

詳細は `adr.md` を参照。要約:

- **ADR-001:** rollback の基準点を「最後に確認された正当な DOM」へ追従させる（候補 B）ことで道連れ消失を根絶。バッチ内逐次逆適用（候補 A）は #233 で却下済みのため採らず、snapshot 全置換の単純さを維持したまま基準点だけ前進させる。
- **ADR-002:** プレースホルダ `<br>` remove を非 IME 経路に限り許容（候補 C）。空プレースホルダブロックの入力定着という #287 由来の即効薬。IME 経路と要素子残存ブロックは従来どおり保守的 rollback。

## リスクと注意点

- **IME 中の捕捉スキップ漏れ:** `isComposingRef` が true の間に snapshot を捕捉すると compositionend の構造ドリフト検出が無効化される。ガードの取りこぼしが致命的（AC-6）。間接 pin（既存 L882）に加え「合成中の編集が rollback で巻き戻る」ことを観測可能な振る舞いで pin する 4-T7 で補強する（`captureSnapshot` の呼び出し有無は private クロージャで直接観測できないため、振る舞いベースで pin — arch-risk S-002）。
- **snapshot 捕捉コスト:** allowed バッチごとに `cleanClone`（`host.cloneNode(true)` + clean 化）で O(n) の再構築が走る。`DOMParser` 往復は本計画で省いた（arch-risk S-002）が、clone 自体は snapshot 追従方式の本質的コスト。通常ノート規模では実害なしと判断。体感遅延が出た場合の更なる最適化（差分捕捉等）は別 Issue。
- **候補 C の過剰許容と `isPlaceholderBr` の命名（arch-risk S-001）:** `isPlaceholderBr` は実体としては「属性なし `<br>` 全般」にマッチし、ユーザー改行 `<br>`（`<p>a<br>b</p>`）とブラウザのプレースホルダ `<br>` を DOM 上で区別できない。`querySelector("*") === null` guard で「要素子が残らないブロック」に限定するが、その範囲では行結合（`<p>a<br>b</p>` → `<p>ab</p>`）も allowed になる（構造 `<p>` は保持されるため実害小、ADR-002 が受容）。この緩みゆえ **AC-5(c) のテストは remove 後も要素子が残る構造で組む**必要があり（2 テキストラン構成は allowed になり回帰を pin できない）、実装ステップ 4-T5 と設計に明記済み。`isPlaceholderBr` の JSDoc にも「プレースホルダ限定ではない」旨を記載する。装飾/`<img>` 削除は guard 外で従来どおり rollback。
- **rollback の reconciliation（arch-risk P-001）:** snapshot は同期捕捉・emit は 50ms デバウンスのため、rollback が復元した「捕捉済みだが未 emit の正当編集」が pending タイマーの早期 return でサイレントに失われうる。`rollback()` に「pending debounce を clear → 復元後 DOM を serialize → 親と異なれば onChange 同期発火」を組み込み、「rollback 後は親 value = 復元後 DOM」を不変条件として保証する。flush を挟まない経路の pin テスト（4-T3）で固定する。
- **IME 空プレースホルダ入力の残存制約:** 候補 C を非 IME に限定したため、IME で空セルへ最初の 1 文字を打つと compositionend 比較でその文字がロールバックされうる（道連れ消失は B が防止）。既知制約として adr.md に記載。

## テスト方針

- **単体（happy-dom, `inlineEditor.test.tsx`）:** 上記ステップ 4 の 4-T1〜4-T8（AC-1〜AC-7 + AC-3′/P-001）を pin。既存の rollback/compositionend/#287/`<pre>` テスト群が全て green のままであること（回帰なし）を必須ゲートとする。
- **型/静的:** `pnpm typecheck && pnpm lint:fix && pnpm format`。
- **ブラウザ手動検証（`.issue/287/manual-test` の TC-005 / TC-007 を再実行）:** TC-005 で `TAIL` が保持されること、TC-007 で先行ブロックの編集が保持され後続 emit が上書きしないこと、`<td>` への 1 文字入力が（非 IME で）定着することを実機確認する。`.issue/840/testing.md` に手順を落とすのは実装フェーズで行う。

## レビュー履歴

### 1周目

**修正した点**:
- **[arch-risk P-001]** snapshot 同期捕捉と emit デバウンス（50ms）の時間差により、rollback が復元した「捕捉済みだが未 emit の正当編集」が pending タイマーの早期 return（`serialize(host) === lastEmittedHtmlRef`）でサイレントに失われる窓を特定。設計「rollback / emit の整合」を書き換え、`rollback()` に reconciliation（保留 debounce を `clearTimeout` → 復元後 DOM を serialize → 親と異なれば `onChange` を同期発火）を組み込む方針を明記。「rollback 後、親 value は必ず復元後 DOM に一致する」を不変条件化。実装ステップ 2 を「rollback の reconciliation と invariant コメントの整合」へ拡張し、ADR-001 Consequences の「DOM = 最後の emit 内容で常に整合」という前提を「capture 同期 / emit デバウンスの前提差」で補正。受け入れ基準に AC-3′ を追加。flush を挟まない経路の pin テスト 4-T3 を追加。

**取り込んだ改善提案**:
- **[coverage S-001]** 受け入れ基準表の「対応ステップ」列を「実装 / 検証テスト」に拡張し、各 AC に検証テスト（4-T1〜4-T8）への参照を付与。AC→検証テストのトレーサビリティを表から追えるようにした。
- **[coverage S-002]** AC-7（`<pre>` ハイライト中の no-op ガードで snapshot 非更新）の pin テスト 4-T8 をステップ 4 に追加。`isHighlightingRef` を立てた状態で `snapshotRef` が span を含まない clean 形のまま更新されないことを直接 assert。
- **[coverage S-003]** AC-3 テスト（4-T2）を TC-007 の実害メカニズムに忠実化。「rollback 後にさらに入力 → flush で走る emit の `onChange` 引数が先行編集を含む」ことを DOM 保持とは別 assert で確認する構成に補正（サイレント上書き保存の回避を一対一で pin）。
- **[arch-risk S-001]** `isPlaceholderBr` が属性なし `<br>` 全般にマッチしユーザー改行と区別できない点をリスク/注意点と設計に明記。AC-5(c) テスト（4-T5(c)）を「remove 後も要素子が残る構造」で組むよう設計へ反映（2 テキストラン構成は allowed 経路のため使わない）。ADR-002 Consequences にも命名の注意を追記。
- **[arch-risk S-002]** capture の `serialize→文字列→DOMParser` 往復を、`serializeHostContent` が内部で既に行う `cloneNode(true)` + clean 化を共通ヘルパ `cleanClone` に括り出す clone+clean 変種へ変更（`DOMParser` 往復を省く）。実装ステップ 1・ADR-001・リスク欄に反映。
- **[arch-risk S-003]** compositionend の捕捉位置を「pending 分類ブロックの有無に関わらず、構造シグネチャ一致で最終 emit に至る直前」に置くよう実装ステップ 1 と ADR-001 の文言を補正（`pending.length > 0` を前提条件と誤読させない）。
- **[arch-risk S-004]** 「合成中は snapshot を捕捉しない」を直接 assert する pin テスト 4-T7 をステップ 4 に追加。既存 L882 の間接依存を補強。

**見送った提案とその理由**:
- なし（両視点の指摘はすべて取り込み。coverage の問題点はゼロ、arch-risk の P-001 は要修正として反映済み）。

### 2周目

coverage は問題点ゼロ、arch-risk も実装本体の設計は妥当と確認済み。指摘はステップ 4 のテスト記述の実現性（happy-dom ハーネスの制約＋ MutationObserver バッチ境界）に限られ、テスト設計の記述のみを補正した。設計・ADR 本体・実装ステップ 1〜3 に変更はない。

**修正した点**:
- **[arch-risk P-001]** 4-T8（AC-7・ハイライト中 no-op ガード）が狙った不変条件を pin できない問題を修正。`snapshotRef`/`isHighlightingRef` は private `useRef` でテストから設定・参照不可、かつ捕捉パイプライン `cleanClone` が `<pre>` を常に平文化するため、ガードの有無は観測上同一（どちらも span を含まない平文 `<pre>`）でどの振る舞いテストも弁別できない（消しても green）。4-T8 の「`snapshotRef` を直接 assert」を撤回し、AC-7 の実質は既存 #498 の serialize 平文化 pin（L693/L733）が既にカバーしている旨を明記。4-T8 を「rollback 復元後の `<pre>`（および reconcile された `onChange` 引数）が span を含まない平文である」ことの**観測可能な振る舞い pin**へ格下げ。AC 表 AC-7 行の検証テスト参照も「既存 #498 pin ＋ 4-T8（振る舞い pin）」へ更新。

**取り込んだ改善提案**:
- **[arch-risk S-001]** 4-T3（P-001・flush 非挿入経路）の手順を補正。「同一 tick 内で remove」だと E1 編集と rollback トリガーが 1 つの MutationObserver バッチに畳み込まれ E1 が allowed 捕捉されず窓を再現できない。手順を「(A) E1 を独立した `act`（別 observer バッチで allowed 捕捉＋ 50ms タイマー予約、`act` は実時間を進めないのでデバウンスは pending 維持）→ (B) 間に 80ms の `flushMutations` デバウンス flush を挟まず、別の `act` で許可外 remove を発火」と明示し、「同一バッチに畳み込まない／ただし 80ms flush は挟まない」を本文へ書き添えた。
- **[arch-risk S-002]** 4-T7（合成中は snapshot 非捕捉）の文言を統一。`captureSnapshot` は mount-once effect 内のローカルクロージャで呼び出し有無を直接観測できず「直接 assert」は literal 不可のため、「合成中の編集が compositionend の drift rollback で巻き戻る」ことを観測可能な振る舞いで間接 pin する形へ文言を統一（AC 表 AC-6 行・リスク欄も同様に補正）。

**見送った提案とその理由**:
- なし（arch-risk の P-001／S-001／S-002 はすべてテスト記述の実現性補正として反映。coverage は問題点ゼロ）。

### 3周目

両視点とも問題点ゼロで終了（arch-risk S-001 のテスト作法注記を 4-T8 に反映）。

- **[arch-risk S-001（非ブロッキング・テスト作法の補正）]** 4-T8 の onChange 引数 assert について、remove 前の allowed バッチで `<pre>` テキストを実際に変えないと、`cleanClone` の平文化により serialize 結果が不変となり reconciliation の onChange が発火しない（DOM 主張のみ成立）ハマりどころを、実装ステップ 4 の 4-T8 記述にテスト作法の注意として添えた。設計・AC・実装ステップ 1〜3 は変更なし。
