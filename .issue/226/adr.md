# ADR — Issue #226: アップロード時にメタデータ提案ポップアップで確認・修正してから登録

## ADR-001: LLM 推論完了の通知手段はクライアント側ポーリングを採用する

### Status
Proposed

### Context

モーダル内で「ファイル選択 → LLM 推論 → 提案表示」を完結させるには、ジョブが `pending / processing` から `previewing` に遷移したタイミングをクライアントが知る必要がある。選択肢:

1. **ポーリング**: `getIngestionJobFn` を一定間隔で呼ぶ
2. **SSE / Server-Sent Events**: サーバーがジョブ状態の変化を push
3. **WebSocket**: 双方向接続でリアルタイム通知

Cloudflare Workers + Queues 構成では SSE / WebSocket はインフラ追加コストが大きい（Durable Objects 等の導入が必要）。LLM 推論時間は数秒〜数分で、ポーリングなら数〜数十リクエストで完了する。

### Decision

**1.5〜2 秒間隔のクライアントポーリングを採用する。最大 180 秒で諦めて「キュー画面で続きを確認できます」と誘導してモーダルを閉じる。**

### Consequences

- 良い点:
  - インフラ追加なしで実装できる
  - 単体ジョブ取得の server function 追加だけで済む
  - 関連 Issue #221 でリアルタイム化が議題になっている。本 Issue で SSE を先取りせず、#221 でまとめて検討できる
- トレードオフ:
  - ポーリングのため数秒の遅延がユーザー視点では生じる（許容範囲）
  - 180 秒のタイムアウトを超えるジョブはモーダル外で扱う必要がある（キュー画面に誘導）。OCR や音声起こしなど長尺処理を含むファイルは初回タイムアウトに到達する可能性があるが、その場合もキュー画面でジョブを継続観察できる

---

## ADR-002: 本文 HTML 編集は本 Issue スコープ外とする — フォローアップ Issue を起票

### Status
Proposed

### Context

Issue 本文の提案には「タイトル / ディレクトリ / タグ / Front Matter / 本文 HTML を編集可能にする」とある。ただし usecase の `CommitIngestionPreviewModifications` には `contentHtml` 上書きの経路が存在しない。本文編集を本 Issue で実現するには:

- `CommitIngestionPreviewModifications` に `contentHtml?: string` を追加
- usecase の commit 処理で modifications.contentHtml を note に反映するロジックを追加
- ドメインの不変条件（preview の content が validation を通っているか）の再検証
- HTML サニタイズ規約の確認・統一

これは Issue スコープを大きく拡げる作業になる。

### Decision

**本文 HTML は本 Issue では読み取り専用プレビューとして表示する。本文を直したい場合は commit 後にノート詳細／エディタ画面に遷移して編集する形にする。Phase 4 で「取り込みプレビューモーダルで本文 HTML を編集できるようにする」フォローアップ Issue を起票する。**

### Consequences

- 良い点:
  - 本 Issue のスコープが明確になり、UI 中心の変更に集中できる
  - ドメイン層は触らないので backend テストの工数が抑えられる
- トレードオフ:
  - Issue 本文の提案範囲を狭める。フォローアップ Issue で別途対応する必要がある
  - ユーザーは「commit 後にエディタで編集」という 2 ステップになる

---

## ADR-003: 複数ファイル選択時はプレビュー編集をスキップし、全件キューに積む

### Status
Proposed

### Context

ユーザーが一度に複数ファイルを選択した場合の挙動:

1. **全件プレビュー編集に流す**: 順番にプレビュー編集モーダルを表示する。複数の LLM 推論を並列ポーリングするか、シリアル化する必要がある
2. **1 件目のみプレビュー編集、残りはキューに積む**: 1 件目はモーダル内で編集、残りはバックグラウンドでキュー化
3. **複数選択時は全件キューに積む**: モーダル内で「N 件をキューに追加しました」と表示してキュー画面に誘導

LLM 推論を複数並列で見守るのは UX 設計が複雑（プログレス表示、エラー処理の集約など）。

### Decision

**複数ファイル選択時は全件キューに積み、モーダル内で「N 件をキューに追加しました」を表示してキュー画面への動線を出す。1 件選択時のみプレビュー編集モーダルに進む。**

**Issue 完了条件①「モーダル／ドロワー内で完結」は次のように解釈する: 単一ファイル時はモーダル内で完結、複数ファイル時はモーダル（投入完了通知） → キュー画面（プレビュー編集）の組み合わせで完結を担保する。**

### Consequences

- 良い点:
  - 並列推論ポーリングの複雑さを避けられる
  - 既存の「キューに積んで後で確認」フローと自然に統合できる
  - 1 件選択時の「即座に確認・編集できる」体験は確保される
- トレードオフ:
  - 複数選択ユーザーは「即座に確認」体験を得られない。ただしキュー画面でカード単位の commit / discard は維持されるので操作可能
  - `spec/scenario/ingest.md` B2 を「複数ファイル時はキュー画面で順次プレビュー操作」と明示する必要がある

---

## ADR-004: FrontMatter は `frontMatterJson` 規約に従って transport する（note 系 ADR-008 準拠）

### Status
Proposed

### Context

Front Matter 編集の実装に当たって、wire format の選択肢:

1. **`z.record(z.string(), z.unknown())` で受ける**: JS オブジェクトとして直接渡す
2. **`frontMatterJson: z.string()` で受ける**: JSON 文字列にエンコードして渡し、handler 側で `JSON.parse`

note 系 server function（`createNoteFn` / `saveNoteFn` / `createNoteRevisionFn` 等）は ADR-008（Issue #1）で **FrontMatter を `frontMatterJson: z.string()` として transport する規約**を確立している。これは TanStack Start の transport-serialisation が `Record<string, unknown>` を型付けできない問題への対応で、handler 側に `parseFrontMatterJson` ヘルパー（`BusinessRuleError("FRONT_MATTER_JSON_INVALID")` を投げる）も既に存在する。

### Decision

**`commitIngestionPreviewSchema` に `frontMatterJson: z.string().max(FRONT_MATTER_JSON_MAX_BYTES).optional()` を追加し、`commitIngestionPreviewFn` の handler で既存 `parseFrontMatterJson` を再利用して usecase の `modifications.frontMatter` に渡す。**

### Consequences

- 良い点:
  - 既存 usecase の対応範囲を活用できる（`frontMatter?: FrontMatterDTO` 受け口あり）
  - note 系の transport 規約・エラーメッセージ系統と統一される
  - `FRONT_MATTER_JSON_MAX_BYTES`（64 KiB）の上限で payload サイズが自然に制約される
- トレードオフ:
  - クライアント側で `JSON.stringify` してから送る必要がある（`IngestionPreviewForm` 側で対応）
  - usecase は引き続き `Record<string, unknown>` を受け取るので、handler が wire format ↔ application format の翻訳を担う

---

## ADR-005: spec デザインモックは「新フローの 3 ステート」だけ別ファイル追加で表現する

### Status
Proposed

### Context

`spec/design/pages/P13-upload.html` は現状「`/upload` ページのキュー上インライン編集」を前提に作られている。新フロー（モーダル）を反映する方法:

1. **既存 P13-upload.html を新フロー用に書き換える**
2. **新フロー用に別ファイル `P13a-upload-modal.html` を追加し、既存はキュー閲覧として残す**
3. **モック更新は省略し、Markdown の P13 節更新のみで完了条件を満たす**

(3) は Issue 完了条件「spec/design 配下のページ設計に新フロー反映」を満たすか曖昧。HTML モックは実装と UI レビューの基準として価値があるので残しておきたい。

### Decision

**`spec/design/pages/P13a-upload-modal.html` を新規追加し、新フローの 3 ステート（ドロップゾーン / 推論待ちスケルトン / プレビュー編集フォーム）+ モバイル幅 1 枚を表現する。既存 `P13-upload.html` は `/upload`（キュー閲覧）として残す。**

### Consequences

- 良い点:
  - 新フローと既存キュー画面の役割が HTML レベルでも分離される
  - 1 ファイルに 3 ステートを並べる構成は仕様参照時に状態遷移を一目で把握できる
  - `P13a` のような suffix 命名は `spec/design/pages/` に既存例（`P01b-admin-setup.html` 等）あり
- トレードオフ:
  - ファイルが 1 つ増える。保守対象が増えるが、UI 基準の明確化のメリットが上回る

---

## ADR-006: 「再生成」アクションを本 Issue スコープ外とする — フォローアップ Issue を起票

### Status
Proposed

### Context

Issue 本文の提案には「『登録』『破棄』『再生成』のアクションをモーダル内で完結」とある。ただし現状の `regenerateIngestionPreview` usecase は spec と実装に乖離がある:

- **spec** (`spec/usecases/ingestion.md`): 「キューに RunIngestionJob を再 enqueue」と記述
- **実装** (`app/core/application/ingestion/regenerateIngestionPreview.ts`): `previewing → processing` に遷移するが、`runIngestionJob` 側の `isPending` ガードに引っかかり no-op になる
- **`dispatchDomainEvent`** (`app/core/application/workers/dispatchDomainEvent.ts:84-86`): `ingestion.regenerated` イベントを意図的に routing から除外している（Issue #57 ADR-004 の決定）

つまり現状の `regenerateIngestionPreview` は「LLM を再駆動しない」状態で、本 Issue でモーダルに再生成ボタンを置いてもユーザーは 180 秒タイムアウトに到達するだけになる。修正には:

- `runIngestionJob` の `isPending` ガード緩和、または
- 新イベント `ingestion.regenerationRequested` の新設、または
- `regenerate` usecase の `previewing → pending → processing` 二段遷移化

のいずれかが必要で、OCC / 既存テスト / outbox / dispatch ルーティング への影響範囲が広い。

### Decision

**本 Issue では新規追加するプレビュー編集モーダルのアクションを「登録」「破棄」「キャンセル」の 3 つに絞り、「再生成」を置かない。**

**この判断の射程はモーダル限定とする。** `/upload` ページの既存 `IngestionJobRow` 上の再生成ボタンには触らない（現状維持）。`IngestionJobRow` の再生成ボタンも実際には LLM を再駆動しないが、それは既に main にある既存不具合であり本 Issue で踏み抜くと修正対象が増える。フォローアップ Issue では `regenerateIngestionPreview` の修正と一緒に `IngestionJobRow` 側の挙動も検証する。

**Phase 3 レビュー APPROVED 後、PR を Ready for review に切り替えた後にマージ前に「`regenerateIngestionPreview` の実装と spec を一致させる」フォローアップ Issue を起票する。**

### Consequences

- 良い点:
  - 本 Issue のスコープが UI 中心に絞られる
  - 既存の `regenerate` 不整合を Issue 226 で踏み抜かない
- トレードオフ:
  - Issue 本文の提案から「再生成」が一部欠ける。フォローアップで対応する必要がある
  - ユーザーは「再生成したい」場合、現状は「破棄 → 再アップロード」の 2 ステップになる

---

## ADR-007: failed 時の「再試行」アクションは本 Issue スコープ外とする — フォローアップ Issue を起票

### Status
Proposed

### Context

シナリオ B1 異常系には「LLM 呼び出し失敗 / タイムアウト: プレビュー画面に失敗状態を表示し、『再試行』ボタンを置く」とあり、これは owner による retry を期待している。

ただし既存 `retryIngestionJob` usecase（`app/core/application/ingestion/retryIngestionJob.ts`）は `assertAdmin` を呼び出す admin 専用 usecase（P46 admin dashboard 用途）。一般ユーザーがアップロードモーダルから自分の failed ジョブを retry する経路は存在しない。

新規 owner 向け usecase（または既存 retry の owner 経路への分岐）を追加するには:

- 認可ロジックの調整
- リトライ回数制限の検討
- 再 enqueue 経路（ADR-006 と同じく `dispatchDomainEvent` ルーティングの問題に当たる可能性）
- spec 側の更新

これは本 Issue 範囲を超える。

### Decision

**本 Issue では新規追加するモーダルの failed view に「再試行」アクションを置かない。アクションは「破棄」と「キュー画面で詳細を見る」の 2 つに絞る。**

**この判断の射程はモーダル限定とする。** `/upload` ページの既存 `IngestionJobRow` は現状 failed カードに「破棄」しか出していないので retry 残存問題はそもそも発生しない。

**Phase 3 レビュー APPROVED 後、PR を Ready for review に切り替えた後にマージ前に「failed ジョブを所有者が再試行できるようにする」フォローアップ Issue を起票する。**

### Consequences

- 良い点:
  - 本 Issue のスコープが守られる
  - admin 専用 retry を一般ユーザー経路に流用する誤実装を避けられる
- トレードオフ:
  - failed 時の体験が「破棄 → 再アップロード」になる。ADR-006（再生成）と同じパターン
  - フォローアップ Issue で対応するまで Issue B1 異常系の「再試行」要件が満たされない（B1 異常系を spec で「将来対応」と明記する）

---

## ADR-008: ディレクトリツリーは `editing` view 突入時に client から server function でロードする

### Status
Proposed

### Context

`IngestionPreviewForm` でディレクトリ選択 UI を表示するにはツリーが必要。データ受け渡し経路の選択肢:

1. **`AppShell` でツリーを毎リクエスト読み、`UploadDialogMount` → `UploadDialog` → form に props で渡す**
2. **`editing` view 突入時に server function (`getDirectoryTreeFn`) を呼ぶ**
3. **`UploadDialog` 初回オープン時に `useEffect` で取りに行く**

(1) は `AppShell` が全認証ルートが mount する server component で、現状は同期で何も I/O していない。ここに `loadDirectoryTreeFlat` を入れると、ユーザーがアップロードモーダルを一切開かないセッションでも全ページで D1 クエリが走る。`routes/index.tsx` / `routes/notes/new.tsx` で必要な画面だけが個別ロードしている既存設計と整合しない。

### Decision

**`app/components/note/actions.ts` に `getDirectoryTreeFn` を追加し、`IngestionPreviewForm` のマウント時（`editing` view 突入時）に client から呼ぶ。`AppShell` には I/O を追加しない。**

**actor は server function 内で `requireCurrentUser()` から取得する。client から `actorUserId` を渡せる設計にしない**（他ユーザーのツリーを読める脆弱性を防ぐ）。

### Consequences

- 良い点:
  - `AppShell` を同期のままに保てる（既存設計と整合）
  - ツリーロードはモーダルを実際に編集ステートで開いたユーザーにのみ発生する
  - server function は既存 `loadDirectoryTreeFlat` のラッパで実装可能（重複ロジックは出ない）
- トレードオフ:
  - `editing` view 突入時に 1 リクエスト分のレイテンシが乗る（スケルトン表示でカバー）
  - 既存ノートエディタ系の loader と server function の両方がツリーを取得するので、適宜重複ロジックを整理する余地が残る（本 Issue では深追いしない）

---

## ADR-009: FrontMatter 編集 UI は MVP として raw JSON 編集に絞る

### Status
Proposed

### Context

既存 `FrontMatterEditor`（`app/components/note/editor/FrontMatterEditor.tsx`）は `editorReducer` 由来の state shape に強く依存しており、props は `mode / parsed / rawJson / parseError / onToggleMode / onSetField / onRenameKey / onAddKey / onSetRawJson`。これを `IngestionPreviewForm` で再利用するには `editorState.ts` の関連ユーティリティを切り出すか、ローカルで等価ロジックを書く必要がある。

選択肢:

1. **`FrontMatterEditor` をフル再利用する**: editorState の reducer / parse / duplicate-key チェック / mode toggle を ingestion 側で抽出して再利用
2. **MVP として raw JSON 編集に絞る**: `<textarea>` + `JSON.parse` バリデーション + `BusinessRuleError("FRONT_MATTER_JSON_INVALID")` のエラー表示

### Decision

**MVP として raw JSON 編集に絞る。`<textarea>` で `frontMatterJson` を直接編集し、送信時に `JSON.parse` で validate。structured mode への拡張は本 Issue 後のタスクとして検討。**

**UI 体験は既存 `FrontMatterEditor` の raw JSON タブと同等の見た目（モノスペースフォント、行番号なし、エラー時のインライン表示）を踏襲する。** `spec/design/pages/P13a-upload-modal.html` の editing ステートでこの方針を視覚的に示し、デザインレビュー時の揺れを防ぐ。

### Consequences

- 良い点:
  - `editorState.ts` 抽出によるレイヤー越境を避けられる
  - 完了条件「Front Matter を編集可能」は raw JSON 編集で満たせる
  - エラーハンドリングは既存 `parseFrontMatterJson` 経路と整合
- トレードオフ:
  - 構造化編集（キーごとのフォーム）には未対応。Front Matter を頻繁に編集するユーザーには既存ノートエディタへのリダイレクトが必要
  - 将来 structured mode に拡張する際は `editorState.ts` のユーティリティ抽出が必要

---

## ADR-010: `getIngestionJobFn` は transport-safe な `IngestionJobWire` 形に詰め替える

### Status
Proposed (実装中に追加)

### Context

ステップ 1 で `getIngestionJobFn` を実装した際、`IngestionJobDTO` をそのまま `createServerFn` の handler から返そうとすると TanStack Start の transport-serialisation 型検査が以下のエラーを返す:

```
Type 'FrontMatterDTO' is not assignable to type 'ValidateSerializableMapped<FrontMatterDTO, ...>'.
  'string' index signatures are incompatible.
    Type 'unknown' is not assignable to type 'SerializationError<"Type may not be serializable">'.
```

`IngestionJobDTO.preview.frontMatter: FrontMatterDTO` が `Record<string, unknown>` で、TanStack Start がこの index sig（値が `unknown`）を「シリアライズ不能」と判定するため。

これは note 側 `actions.ts` 冒頭の注意書きと同じ問題（"All note server fns return only the minimal scalar payload the UI needs"）。

### Decision

`IngestionPreviewWire` / `IngestionJobWire` という transport-safe 型を `app/components/ingestion/actions.ts` に定義し、`getIngestionJobFn` の handler でドメイン側 `IngestionJobDTO` から詰め替えて返す。

- `preview.frontMatter: FrontMatterDTO` → `preview.frontMatterJson: string`（`JSON.stringify` 済み）
- branded id 型（`IngestionJobId`, `NoteId`, `UserId`, `DirectoryId`, `MediaAssetId`）→ 素の `string`
- `IngestionPreviewForm` 側ではこの wire 形から JSON.parse して再構築

これは note 系の `frontMatterJson` 規約（ADR-004）の出力方向版で、対称性がある。

### Consequences

- 良い点:
  - 型検査を通過し、ランタイムでも transport-safe（FrontMatter は素 JSON のため `Record<string, unknown>` の `unknown` を回避）
  - `IngestionPreviewForm` で `frontMatterJson` を表示用 raw JSON 編集に使うので、無駄なシリアライズ往復が発生しない
  - 既存 `loadIngestionJobs` ローダー（`serverData` 経由でシリアル化を回避）には影響しない
- トレードオフ:
  - `actions.ts` に詰め替え関数 `toIngestionJobWire` が増える
  - クライアント側コンポーネントは `IngestionJobDTO` ではなく `IngestionJobWire` を扱うので、loader 経由のコンポーネントとは型を共有しない。`IngestionJobRow`（loader 経由）は引き続き `IngestionJobDTO` を使う

---

## ADR-011: ポーリング失敗時の `select` フォールバック動線

### Status
Proposed (実装中に追加)

### Context

ステップ 4 計画では「ポーリング失敗時 (Business 系 / transient 3 連続) → 停止」とあるが、その後に**どの view に遷移するか**が明文化されていなかった。選択肢:

1. `view = "failed"` に遷移（実装上は `IngestionJobWire` が必要だが、ジョブを取得できなかったので持っていない）
2. `view = "select"` に戻し、`error` state にエラーを表示
3. `view = "timedOut"` に遷移（誤りのジョブ状態を主張することになる）

(1) は job が無いのでデータ不整合になる。(3) は意味的に誤り（タイムアウトではない）。

### Decision

**`view = "select"` に戻して `error` をドロップゾーン下の alert region に表示する。** ユーザーは「アップロードをやり直す」「キュー画面で詳細を見る」のどちらでも選べる。

### Consequences

- 良い点:
  - データ整合性を保ったまま失敗を可視化できる
  - 既存のドロップゾーン UI に "やり直す" 動線が自然に乗る
- トレードオフ:
  - `failed` view へ遷移するパスは「サーバーから `status: "failed"` のジョブが返って来た時」だけに限定される

---

## ADR-012: `IngestionPreviewForm` では `<form>` の外側に `ConfirmDialog` を配置する

### Status
Proposed

### Context

`ConfirmDialog`（`app/components/common/ConfirmDialog.tsx`）は内部に `<form onSubmit={...}>` を持つ実装。`IngestionPreviewForm` の `<form>` の中に `ConfirmDialog` をレンダリングするとネストフォーム（HTML 不正）になり、Confirm dialog 内の「破棄」ボタン submit が親 form の submit を発火し、`commit` 経路が走ってしまう不具合が manual-test (TC-2) で観察された。

選択肢:

1. **`ConfirmDialog` 自体の form を div に変える**: confirm ボタンを `type="button"` にして onClick で onConfirm を呼ぶ。他の全 ConfirmDialog 利用箇所に影響
2. **`IngestionPreviewForm` 側で `<form>` の外側に `<ConfirmDialog>` を出す**: Fragment で並列配置、ローカル修正のみ
3. **状態管理を上位（`UploadDialog`）に上げて、`ConfirmDialog` を form の外でレンダリングする**: 状態のリフトアップ

(1) は他コンポーネントへの副作用が広い。(3) は状態の場所を変えるので意図と乖離する。

### Decision

**`IngestionPreviewForm` で `<>` (React Fragment) でラップし、`<form>...</form>` の外側に `<ConfirmDialog>` を配置する。**

### Consequences

- 良い点:
  - 修正範囲が `IngestionPreviewForm.tsx` のみで局所化される
  - ネストフォーム HTML 不正が解消され、Confirm dialog 内 submit が親 form を発火しない
  - manual-test TC-2 の不整合が解消される
- トレードオフ:
  - `ConfirmDialog` 自体は引き続き内部に form を持つので、別箇所で同じパターン（form 内 ConfirmDialog）を導入した場合に再発するリスクが残る。将来的に `ConfirmDialog` の form を `<div>` に置き換えるか、規約として「ConfirmDialog は form の外に置く」を明文化する余地がある（フォローアップ）

---

## ADR-013: `editing` ステート中の backdrop click は無効化し、明示ボタン / Esc のみで閉じる

### Status
Proposed (review-001 W-F-005 への応答)

### Context

`UploadDialog` の `editing` ステートでは、ユーザーがタイトル / ディレクトリ / タグ / FrontMatter を編集しているため、誤って backdrop（モーダル外側）を click したときに入力内容を破棄してダイアログを閉じると体験上の損失が大きい。一方で `uploading` / `waiting` 中は backdrop click も既に無効化されている（`closeOnBackdropClick={!isPending}`）。

`editing` で backdrop click を無効化する場合の挙動の選択肢:

1. backdrop click も Esc も両方無効化（uploading / waiting と同じ厳密さ）
2. backdrop click のみ無効化、Esc は通す（明示的な意図表明と捉えて受理）
3. backdrop click も Esc も通す（変更なし、現在の挙動）

(3) は誤操作リスクが残る。(1) は escape ハッチが消えてアクセシビリティ的に弱い（キーボード操作で閉じられない）。

### Decision

**`editing` 中は `closeOnBackdropClick={false}` 相当の扱いとし、Esc キーは Dialog の標準動作で通す。** 明示的に「閉じる」「キャンセル」ボタン、または Esc キーを押さない限りダイアログは閉じない。

実装上は既存の `isPending` 判定（`uploading` / `waiting` / `editing`）が既にこの動作を兼ねており、本 ADR はその意図を文書化するもの。コード変更は伴わない。

### Consequences

- 良い点:
  - 編集中の誤クローズによる入力ロストを防げる
  - キーボードユーザーには Esc という escape ハッチが残る（アクセシビリティ準拠）
  - `uploading` / `waiting` と同じ backdrop ポリシーで一貫している
- トレードオフ:
  - マウスのみのユーザーは「閉じる」「キャンセル」ボタンを明示クリックする必要がある（テキストで明示されているので発見可能）

---

## ADR-014: 重複 logic / 内部実装漏出は本 PR 対象外とし、フォローアップ Issue で対応する

### Status
Proposed (review-001 W-B-001 / W-B-003 / W-T-010 への応答)

### Context

review-001 で次の 3 件が指摘された:

- **W-B-001**: `getDirectoryTreeFn` のフラット化ロジックが `loadDirectoryTreeFlat` と重複（`app/components/note/actions.ts:474-507` と `app/components/note/loaders.ts:314-346`）
- **W-B-003**: `IngestionJobWire.errorCode` / `errorReason` がそのままクライアントへ流出（`errorReason` は自由文字列なので内部実装の漏洩リスク）
- **W-T-010**: `useServerFn` モックの無限 chain Proxy が脆い（テスト基盤の問題で本 Issue の実装ロジックとは独立）

これらはいずれも本 PR の実装で導入された欠陥というよりは:

- W-B-001 は ADR-008 でも「重複ロジックを整理する余地が残る（本 Issue では深追いしない）」と明記済みの既知の整理対象
- W-B-003 は `loadIngestionJobs` でも同じ挙動で、本 PR のレグレッションではない
- W-T-010 は `useServerFn` モック規約自体の問題で、別途規約整備が必要

選択肢:

1. 本 PR 内ですべて修正する
2. 本 PR 対象外として個別フォローアップ Issue を起票する

(1) は PR スコープを大きく拡げ、それぞれが独立した設計判断を必要とするため、レビューサイクルが長期化するリスクがある。

### Decision

**いずれも本 PR 対象外とし、Phase 4 でフォローアップ Issue を起票する。** 起票時には本 ADR と review-001 の該当項を参照し、それぞれの対応方針を独立に検討する。

### Consequences

- 良い点:
  - 本 PR のスコープが守られ、Phase 3 レビュー → マージのフローが進む
  - それぞれのフォローアップが独立した設計判断として扱える
  - W-B-001 は ADR-008 で既に予告されている整理であり、別 Issue 化が自然
- トレードオフ:
  - 3 件の課題が残置される（追跡は Phase 4 の Issue 起票で担保）
  - W-B-003 の `errorReason` 漏出は内部実装メッセージが UI に露出するため、フォローアップまでに重大な漏洩が起きないか定期的に確認する必要がある


