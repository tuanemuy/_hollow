# Architecture Decision Records — Issue #221

アップロードのフィードバック改善（進捗表示・楽観的更新・エラー整形）に伴う設計判断の記録。

---

## ADR-001: グローバルバックグラウンド処理バッジは見送り

### Context

Issue 文には「ヘッダー等にバックグラウンド処理のインジケータ（バッジ）を常設」する案が推奨方針として記載されている。アップロード後にモーダルを閉じた状態でも進行状況が一目で分かれば UX は向上する。

### Decision

ヘッダーへの active-job 件数バッジは本 Issue では実装しない。代わりに `/upload` ページの「取り込みキュー」セクション内に active 件数のインジケータを置く（`IngestionQueue` 内で完結）。

### Trade-offs

- **採用案（実装する）**: UX 改善は大きい。ヘッダーから常にキュー状況が見える。
- **見送り案（本案）**: `Header.tsx` は現状 async server component で同期的に props を受ける作り。バッジ用に client polling を組み込むには (a) Header を `"use client"` 化する、(b) 別の client wrapper を挟む、(c) `getIngestionJobsCountFn` 等の usecase を新設、いずれも影響範囲が大きい。Issue #217 のヘッダー周り改修との競合も懸念。

### Consequences

- Issue の必達 5 項目は本 Issue スコープ内の改修で満たせる。
- グローバルバッジは「あれば嬉しい」だが Issue 文では推奨方針として記載されているのみで、必達ではない。
- 後続 Issue で `Header` リファクタとセットで導入する方が筋が良い。

---

## ADR-002: 推定残り時間は表示しない

### Context

Issue 文には「件数・残数・推定残り時間（出せれば）」とある。バックグラウンド処理の見える化として推定残り時間は分かりやすい指標。

### Decision

件数・残数は出すが推定残り時間は出さない。代わりに `UploadDialog.WaitingView` で「この処理には数十秒かかることがあります」のような幅のある定性メッセージを使う。

### Trade-offs

- LLM 推論時間は入力ファイル種別・サイズ・モデル負荷で大きく変動する。
- 信頼できる推定値が出せないまま「あと約 X 秒」と表示すると、誤った推定でかえって UX を損なう。
- 定性メッセージは情報量が少ないが期待値を裏切らない。

### Consequences

- 進捗 UI はステータス遷移（pending → processing → previewing）の可視化に振る。
- 将来、推論時間の統計が十分溜まったら ML ベースの推定を再検討できる余地は残す。

---

## ADR-003: 進捗更新はポーリング（SSE / WebSocket は見送り）

### Context

`/upload` ページに進捗の自動更新が必要。リアルタイム性の選択肢として SSE / WebSocket / polling がある。

### Decision

SSE / WebSocket は導入しない。client polling で進捗を更新する。間隔は active job がある間は 4 秒、無い間は 16 秒、連続失敗時は 12 秒バックオフ。

### Trade-offs

- **SSE**: サーバー → クライアントの単方向ストリーミング。Cloudflare Workers でも対応可能だが、各ユーザーセッションごとに長時間接続を保持するため Workers の実行モデル（リクエスト粒度の課金・実行時間制限）と相性が良くない。Durable Objects を導入すれば実装可能だが、それだけのために DO を入れるのは過剰。
- **WebSocket**: Cloudflare では Durable Objects 必須。SSE と同じ理由で過剰。
- **Polling**: 既に `UploadDialog` で実装済みのパターン。サーバー側は通常の HTTP リクエストで処理でき、Workers との相性が良い。負荷は active job 件数に応じて間隔を可変にすることで抑制。

### Consequences

- 追加インフラ不要、既存ランタイム（Cloudflare Workers + D1 + Queues）と整合。
- ポーリング負荷は間隔可変 + `visibilitychange` でタブ非表示時の tick スキップで緩和（ADR-003 補足: 本 Issue で `visibilitychange` 対応も同時導入）。
- 真にリアルタイム性が必要になったら、Durable Objects 導入と引き換えに SSE / WebSocket に切り替える余地は残る。

---

## ADR-004: business `code` / pipeline 識別子のマッピングは presentation 層に集約

### Context

`SerializedError.kind = "business"` の `code` 値や、`IngestionJobWire.errorCode` に格納される pipeline 識別子は、UI に届くと「ユーザー向け文言」に変換する必要がある。マッピングをどの層に置くかが論点。

### Decision

ドメイン側に「ユーザー向け文言」を持たせず、`app/core/presentation/errorDisplay.ts` に集約する。`renderBusinessMessage` / `renderIngestionBusinessMessage` / `displayJobErrorCode` の 3 関数で文字列リテラル分岐により網羅する。

### Trade-offs

- ドメイン定数 (`IngestionErrorCode`) を直接 import する案: 型安全だが、presentation → domain の依存方向に逆らう。CLAUDE.md「presentation 層は kind ベースで構造的に分岐」原則と衝突する。
- 文字列リテラル分岐 + テスト網羅の案（本案）: 型依存を持たないため層構造がクリーン。`*ErrorCode` 命名規約で値が `lower_snake_case` に固定されているため、リテラル比較で安全。Step 9 のテストで `Object.values(IngestionErrorCode)` を反復してカバレッジを保証する。

### Consequences

- CLAUDE.md「エラーは構造的にシリアライズし、presentation 層で `kind` ベースに表示用に変換」「HTTP status mapping is presentation-only」と一貫。
- i18n を将来導入する場合も presentation 層の 1 ファイル差し替えで済む。
- ドメイン側に新コードを追加した時は、`errorDisplay.ts` のマッピング追加とテスト更新が必要（テストでカバレッジ漏れを自動検出）。

---

## ADR-005: pipeline 識別子という別グループのコード値を許容し、(a)/(b)/(c) 区分でマッピングする

### Context

レビュー 1 周目で発覚した重要な事実: `runIngestionJob.ts` の `classifyPipelineError`（L319-329）と `markFailedSafely` が `job.errorCode` に書き込む値には、`IngestionErrorCode` 列挙には含まれない pipeline 識別子が含まれる:

- `llm_failure` / `ocr_failure` / `speech_failure` / `pdf_parse_failure` / `office_parse_failure`
- `ingestion.invalid_state` / `ingestion.temp_storage` / `ingestion.unknown`

これらは実運用で `failed` 状態のジョブが持つ errorCode の大半を占める。当初の plan はこれらを fallback に落としており、ユーザーには「取り込みに失敗しました（汎用）」しか表示されない設計だった。

### Decision

`displayJobErrorCode` / `renderIngestionBusinessMessage` のマッピング表を以下の 3 区分構造で明文化する:

- **(a) usecase が `BusinessRuleError(code)` で throw する `IngestionErrorCode` 列挙値**: 必ず日本語マッピングを持つ。
- **(b) `runIngestionJob.ts` の `classifyPipelineError` が `job.errorCode` に書き込む pipeline 識別子**: 必ず日本語マッピングを持つ。
- **(c) value-object 構築時エラー（`InvalidId` 等）**: UI に届かない前提で fallback 許容。

pipeline 識別子は `IngestionErrorCode` と命名規則が異なる（`.` を含む `ingestion.invalid_state` 等）が、wire 経由で `job.errorCode` フィールドに乗ってくるため presentation 層では同じテーブルで扱う。

### Trade-offs

- **pipeline 識別子を `IngestionErrorCode` に統合する案**: ドメイン側の列挙が太る。また `classifyPipelineError` は外部依存（LLM / OCR / 音声 / PDF / Office パーサ）の失敗を識別する関数であり、ビジネス不変条件違反とは性質が異なる。同じ列挙に混ぜると意味論が崩れる。
- **2 系統のコード値を分けて扱う案（本案）**: 命名規則の違い（`.` 区切り vs `_` 区切り）が読者に「2 系統あること」を示唆する。テーブルでもセクションコメント `// ---- (a) ... ----` / `// ---- (b) ... ----` で分離する。

### Consequences

- マッピング表を読む側が「この code はどこから来るか」を把握しやすくなる。
- Step 9 のテストで (a) は `Object.values(IngestionErrorCode)` 反復、(b) は pipeline 識別子配列の列挙でグループ別に網羅検証する。
- 将来 pipeline 識別子が追加されたら adr.md の本記録も更新し、`errorDisplay.ts` のマッピングとテスト配列を同時更新する。
- 実 throw 元の把握には以下の grep を使う:

  ```bash
  grep -rn "BusinessRuleError(IngestionErrorCode" app/core/application/ingestion/
  grep -n "markFailedSafely\|classifyPipelineError" app/core/application/ingestion/runIngestionJob.ts
  ```

---

## ADR-006: `extractSerializedError` に SerializedError 形状の直接認識を追加

### Context

実装中に発覚した既存バグ: `displayError(error)` を `error: SerializedError | null` の state 変数で呼び出すパターンが `IngestionJobRow.tsx` / `MoveNoteDialog.tsx` 等 多数のコンポーネントで使われている。

`displayError` は `renderErrorMessage(extractSerializedError(error))` と実装されているが、`extractSerializedError` は (a) `instanceof AppServerError`、(b) `.serialized` 残骸を持つラッパー、(c) `.toSerialized()` を持つ `SerializableError` の 3 経路しか認識せず、**bare な `SerializedError` 形状のオブジェクト**（`{ kind, code, message }`）が入ると `serializeError` の fallback パスで `kind: "unknown"` に潰してしまう。

結果として `UploadForm` / `IngestionJobRow` / `MoveNoteDialog` 等の `<p>{displayError(error)}</p>` 表示は、本来「このファイル形式には対応していません…」等の文言を出すべき場面で「エラーが発生しました」（unknown kind の fallback）しか出していなかった。

### Decision

`extractSerializedError` に **bare SerializedError 形状の直接認識** を追加する（既存の `asSerializedError` ヘルパを再利用して `error` 自体に対しても評価）。

```ts
const direct = asSerializedError(error);
if (direct !== null) return direct;
```

### Trade-offs

- **採用案**: 1 ファイル・3 行追加で UI 表示パスがマッピングを通るようになる。Issue #221 の主目的「エラー表示がユーザー向け文言になる」をマッピング表だけでなく UI 経路全体で達成できる。`asSerializedError` の構造チェック（`kind` が `SERIALIZED_ERROR_KINDS` に含まれる文字列、`message` が文字列）で誤検出のリスクは抑えられる。
- **見送り案 1**: UI コンポーネント側で `displayError(error)` ではなく `renderErrorMessage(error)` を使う形に書き換える — 30 箇所近い修正が必要で本 Issue スコープを超える。
- **見送り案 2**: 何もしない（fallback 文言のまま放置）— Issue #221 の完了条件「内部のスタック／原文 message がユーザー画面に露出しない」とは別に、「`SerializedError.kind` に応じたユーザー向け文言になる」も完了条件である。これを満たすには本修正が必要。

### Consequences

- 既存 30 箇所近い `displayError(SerializedError)` 呼び出しが期待通り動作するようになる。
- Step 9 の `UploadForm` テストで `unsupported_format` → 「このファイル形式には対応していません…」が実 UI 上で assert できる。
- `extractSerializedError` の意味論は「`unknown` から `SerializedError` を取り出す」のままで、JSDoc に書かれた意図と整合する（直接形状はゼロ階のラップとして扱う）。

---

### No-comments 原則の例外について

CLAUDE.md の no-comments 原則は「WHY が非自明な場合のみコメントを許す」。Step 1 の `errorDisplay.ts` 内マッピングテーブルにおけるセクション区切りコメント (`// ---- (a) IngestionErrorCode 列挙値（usecase が BusinessRuleError(code) で throw） ----` / `// ---- (b) pipeline 識別子（runIngestionJob.ts の classifyPipelineError 由来） ----`) は、本 ADR で区分した「2 系統のコード出所（IngestionErrorCode 列挙値 vs pipeline 識別子）」という非自明な情報をコードリーダーに伝えるためのもので、no-comments 原則の **例外として許容する**。コメントが無いと「なぜ命名規則（`_` 区切り vs `.` 区切り）が混在しているのか」が読者には不可視となり、将来コードを追加する開発者がどちらの区分に入れるべきか判断を誤る恐れがある。よってマッピング表のセクション区切りコメントは保持する。

---

## ADR-007: 0 バイトファイルは application 層で reject する（value-object 層は 0 許容のまま）

### Status
Accepted

### Context

ブラウザ検証 (TC-04) で、0 バイトファイル (`empty.md`) をアップロードすると HTTP 409 / `kind=conflict, code=CONSTRAINT_VIOLATION` が返り、UI に「他の操作と競合しました。もう一度お試しください」が表示される問題が発覚した。

- `validateByteSize` (`app/core/domain/ingestion/valueObject.ts:259`) はコメントで「non-negative finite integer」と明記され、0 を意図的に許容している（既存テストも `validateByteSize(0)` が成功することを assert）。
- そのため 0 バイトのアップロードは value-object 構築をパスし、`IngestionJob.insert` で DB 制約違反を起こす。
- `errorDisplay.ts` の `renderConflictMessage` に `CONSTRAINT_VIOLATION` 用のマッピングは存在せず、汎用文言にフォールバック。
- 結果としてユーザーは retry を促されるが、retry しても永久に同じエラーになる（Issue #221 の核心要件「ユーザーには『何が起きたか + 何をすればいいか』を平易に」と相反）。

選択肢:
- **A: `uploadFile` ユースケースで `byteSize === 0` を `BusinessRuleError(InvalidByteSize)` として早期 reject**
- **B: `validateByteSize` 自体で 0 を reject（value-object 層の意味論を変更）**
- **C: `renderConflictMessage` に `CONSTRAINT_VIOLATION` ケースを追加**

### Decision

**A を採用**。

```ts
// app/core/application/ingestion/uploadFile.ts
if (input.byteSize === 0) {
  throw new BusinessRuleError(
    IngestionErrorCode.InvalidByteSize,
    "Empty file: byteSize must be greater than zero",
  );
}
```

### Trade-offs

- **A (採用)**: 局所的（uploadFile.ts のみ）で副作用なし。既存の `validateByteSize` の意味論（数値型レベルの妥当性検証）と既存テストを温存したまま、「アップロードという文脈では 0 byte は無効」というドメインルールを application 層で表現できる。既存の `ingestion_invalid_byte_size` 日本語マッピングがそのまま効くので、エラー表示も統一される。
- **B (見送り)**: value-object 層は形式的妥当性のみを担保するべきという hexagonal/DDD の原則と矛盾する。また `validateByteSize` は `IngestionJob.create` などの他経路からも呼ばれており、それらが意図的に 0 を許容している可能性を破壊する恐れがある。
- **C (見送り)**: `CONSTRAINT_VIOLATION` は実装内部の DB エラーであり、これをユーザー向けにマッピングすると将来の DB 制約変更で文言が乖離する。本質はそもそも UoW に到達させないこと。

### Consequences

- 0 バイトアップロードは UoW より前に弾かれ、UI には既存マッピング「ファイルが正しく読み取れませんでした。別のファイルでお試しください」が出る。
- `app/core/application/ingestion/__tests__/ingestion.integration.test.ts` に "empty file rejected with InvalidByteSize before UoW" テストを追加（回帰防止）。
- value-object 層の `validateByteSize` テストは無変更（0 許容のまま）。
- 同種の問題（`renderConflictMessage` の `default` 経路が誤った retry 文言を返すリスク）は他コードでも将来起こり得る。W-P-002（review-001）対応で `CONSTRAINT_VIOLATION` 専用ケースを `renderConflictMessage` に追加し、リトライを促さない「データの形式に問題があります。入力を見直してください」を返すよう恒久対策した。

---

## ADR-008: 未マッピング business code の fallback はユーザー向け汎用文言に倒す

### Status
Accepted

### Context

`renderBusinessMessage` は当初、未マッピングの business code に対して `fallback = error.message`（=サーバー内部の spec 文言、英語）をそのまま返していた。これは Issue #221 の完了条件「内部のスタック／原文 message がユーザー画面に露出しない」と矛盾し得る。具体的には:

- `BusinessRuleError(code, "Empty file: byteSize must be greater than zero")` のようなサーバー側ログ用 message が UI に出る可能性。
- 将来 ingestion 以外の usecase が新しい business code を追加した時、マッピング忘れで internal message が即時 leak する。

review-001 W-P-003 で指摘された。

### Decision

未マッピング business code に対しては、`error.message` を露出させず汎用文言「操作を完了できませんでした。時間をおいて再度お試しください」を返すよう変更する。`FRONT_MATTER_JSON_INVALID` および `renderIngestionBusinessMessage` でマッピング済みの code は影響を受けない（既存挙動のまま）。

```ts
const BUSINESS_FALLBACK_MESSAGE =
  "操作を完了できませんでした。時間をおいて再度お試しください";

function renderBusinessMessage(code: string | null): string {
  if (code === null) return BUSINESS_FALLBACK_MESSAGE;
  // ... マッピング分岐 ...
  return BUSINESS_FALLBACK_MESSAGE;
}
```

### Trade-offs

- **採用案**: 「内部 message を絶対に出さない」原則を errorDisplay 単一ファイルで担保できる。マッピング忘れによる leak リスクがゼロになる。
- **見送り案（従来通り fallback に message を流す）**: 開発者目線では情報量が多いが、ユーザー画面では英語の内部文言が出てしまい #221 完了条件に反する。

### Consequences

- マッピングテーブルに無い business code は「汎用文言」に潰れる。開発者がマッピング不足を気付くには `errorDisplay.test.ts` の `IngestionErrorCode` 列挙網羅テスト or 手動確認が頼り。
- 将来 ingestion 以外の domain で `*ErrorCode` を追加する場合、`renderBusinessMessage` 側に case を増やすか、ingestion と同じ「列挙網羅テスト」スタイルを別 domain でも適用する必要がある。

---

## ADR-009: polling fatal kind を `unauthorized` / `forbidden` に絞る

### Status
Accepted

### Context

`IngestionQueue` の polling tick が catch する `SerializedError.kind` のうち、fatal（即時 polling 停止）扱いにすべきものを当初 `unauthorized` / `forbidden` / `notFound` の 3 種としていた。しかし `notFound` は通常は局所的・一過性のリソース消滅（特定ジョブ削除など）を示すことが多く、polling 全体を恒久停止する根拠としては過剰。

review-001 W-F-004 で指摘された。

### Decision

`fatalRef` を立てるトリガーを `unauthorized` と `forbidden` の 2 種に限定する。`notFound` は通常の非 fatal エラー扱い（連続失敗時のみ表示）に戻す。

```ts
if (err.kind === "unauthorized" || err.kind === "forbidden") {
  fatalRef.current = true;
  // stop polling
}
```

### Trade-offs

- **採用案（unauthorized / forbidden のみ）**: 「認可が失効した」「権限が剥奪された」など、polling を続けても回復しない種別だけを fatal とする。意味論として明快。
- **見送り案（notFound を含む）**: 過剰停止。jobs 一覧 API が一過性 404 を返した場合に polling が永久停止し、ユーザーが画面リロードしないと回復しない UX 退行のリスク。

### Consequences

- ADR-003（polling 設計）の補強。ADR-003 の「fatal 検出後の polling 復活防止」記述で言及している fatal kind の集合が `unauthorized` / `forbidden` の 2 種に絞られた。
- 通常の API 一過性失敗（network / 5xx / 404）はすべて failures カウンタで扱い、連続 3 回失敗で UI 通知 → 次の tick で復活可能。
