# ADR — Issue #228: アップロード前にカスタムプロンプトを入力できる画面を追加する

## ADR-001: override をジョブ集約の永続フィールドとして運ぶ

### Status
Accepted

### Context
`runIngestionJob` は `jobId` だけを受け取り、`ingestion.created` イベント経由で非同期キューから起動される。アップロードは「pending ジョブ作成 → 非同期処理」という流れであり、override を usecase input やイベントペイロードで運ぶのはこの非同期境界に反する。

なお Issue 完了条件の「上書きはそのジョブ単位のみ（永続化しない）」が言う「永続化しない」は、**ユーザー横断で再利用されるデフォルト設定として残さない**（それは #218 の管轄）という意味であり、ジョブ行への保存（その回限りの provenance）はこれに反しない。

### Decision
override を `IngestionJob` 集約の `IngestionJobBase` に永続フィールド `promptOverride: { structure: PromptOverride | null; metadata: PromptOverride | null }` として持たせ、`uploadFile` の `IngestionJob.create` で受け取り DB に保存。`runIngestionJob` は冒頭 UoW の `startProcessing` 戻り値 `promoted`（`ProcessingIngestionJob`、base フィールドを継承し override を載せる）を `runPipeline` に渡し、`runPipeline` がその override を resolver より優先して読む。`attachPreview` 側の DB 再ロードでは override を使わないため、`promoted` 経由で十分。

### Consequences
- 良い点: 非同期境界をまたいで override が確実に運ばれる。集約の状態として型安全に表現できる。
- トレードオフ: DB スキーマ変更（2列追加）とマイグレーションが必要。

---

## ADR-002: override 列は insert 時のみ確定し save では書かない

### Status
Accepted

### Context
override はアップロード回に確定し、ジョブのライフサイクル（processing / previewing / regenerate / retry）中に変化しない provenance である。`save` の OCC 更新パスで書けるようにすると、途中で override が変わりうる余地が生まれる。

### Decision
アダプターの `toRowValues`（insert 用）には override 2列を含めるが、`save` の `.set()` には含めない。既存 `save` が owner / originalFileName 等の provenance 列を意図的に書かないのと同じ扱いにする。

### Consequences
- 良い点: 「再生成後も同じ override」が DB レベルで保証される。不変条件が更新パスから守られる。
- トレードオフ: なし（override を後から変更する要件は存在しない）。

---

## ADR-003: プロンプト長は VO で 16 KiB 上限、変数補間は行わない

### Status
Accepted

### Context
override は LLM の `prompt: string` にそのまま渡るテキストで、resolver の返り値（補間済みプレーンテキスト）と同じ契約。一方 textarea は巨大入力が可能で DoS リスクがある。

### Decision
`PromptOverride` VO にバイト長上限を設定し、`adminSettings` の `PromptTemplate`（16 KiB）に揃える。変数 `{{...}}` 検証は付けない（override は補間済みリテラル）。transport boundary（`uploadFileFn`）でも VO 構築前に同等の長さガードを置き、2点検証の原則に従う。

### Consequences
- 良い点: 既存プロンプト上限と一貫。巨大 payload を usecase 手前で弾ける。
- トレードオフ: 管理画面テンプレートとは別 VO になるが、purpose・契約が異なるため許容。

---

## ADR-004: マイグレーションは手書き 0012 とする（drizzle-kit generate のクリーン diff は不採用）

### Status
Accepted

### Context
plan ステップ4は `pnpm db:generate` を実行して `0012_*.sql` が `ALTER TABLE ADD COLUMN` 2本だけになることを期待していた。しかし本リポジトリの drizzle meta（`migrations/meta/_journal.json` / `0000_snapshot.json`）は **git 管理外**であり、ベースラインも `0000` スナップショット止まりで `0001`〜`0011` の手書きマイグレーションを反映していない。そのため `drizzle-kit generate` は現スキーマ全体を新規ベースライン（`0000_tough_medusa.sql`、18.5 KiB の全テーブル CREATE）として吐き出し、増分 ADD COLUMN にはならない。

### Decision
生成された `0000_tough_medusa.sql` は破棄し、既存の手書きマイグレーション慣習（例: `0010_add_llm_base_url.sql`）に倣って `0012_ingestion_prompt_override.sql` を手書きで作成する。中身は nullable 2列の `ALTER TABLE ingestion_jobs ADD COLUMN` 2本のみ。適用は `pnpm db:apply:local`（wrangler 経由）。

### Consequences
- 良い点: 既存マイグレーションの追記方式と一貫。余計な全テーブル差分が混入しない。
- トレードオフ: drizzle-kit の自動 diff には頼れない（このリポジトリでは元々頼っていない）。スキーマ変更時は手書きマイグレーションを書く運用を継続する。
