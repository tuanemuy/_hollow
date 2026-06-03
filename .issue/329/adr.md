# ADR — Issue #329: 内部リンクバックフィル運用 usecase の起動口整備

## ADR-001: 起動口は管理画面メンテナンスアクション（Jobs ページ）を採用

### Status
Accepted

### Context
`backfillInternalLinkResolution` の起動口として Issue は (a) 管理画面メンテナンスアクション、(b) 内部 API / server function、(c) cron / worker での一括実行 を候補に挙げている。Issue 本文は「起動経路を1つ用意する」と明記。

### Decision
管理画面のメンテナンスアクションを採用し、`/admin/jobs`（ジョブ監視）ページに追加する。

### Consequences
- 良い点:
  - 全く同型の admin メンテナンス usecase `rebuildSearchIndex` が既に `/admin/jobs` に同居しており（検索インデックス再構築）、server function + Jobs ボードセクションの規約が確立済み。新規パターンを発明せず既存テンプレートに乗れる。
  - admin 認可（`requireAdminUser` / `assertAdmin`）・CSRF・error middleware・DTO 越境が既存の仕組みでそのまま満たせる。
- トレードオフ:
  - cron 化（候補 c）は worker entry + `wrangler.{staging,production}.toml` env + DI wiring の新設が必要で、「#127 修正前の既存滞留行を運用で修復する（手動・冪等・数回）」という ADR-009 の usecase 性質に対し過剰。CLI（候補なし基盤）も新設コストが高い。将来 owner 数が極端に増えて手動実行が非現実的になった場合は cron 化が選択肢だが本 Issue スコープ外。

---

## ADR-002: 全 owner ループを採用（owner 個別指定ではなく）

### Status
Accepted

### Context
バックフィルの対象範囲として「owner 個別指定」と「全 owner 一括ループ」のどちらを起動口に持たせるか。

### Decision
全 owner ループを採用。新 admin usecase が `userRepository.listAll` のカーソルページングで全 owner を walk し、各 owner に既存 owner usecase を適用する。

### Consequences
- 良い点:
  - 滞留行は #127 修正前から全 owner に存在しうるため、運用者が owner を1人ずつ指定する運用は非現実的。全 owner walk なら1回の起動で全体を修復できる。
  - `rebuildSearchIndex` と同じ全 owner walk 構造に揃うため、ページング戦略（owner はカーソル / note は offset / 各ページ独立 UoW）の前例をそのまま踏襲できる。
- トレードオフ:
  - 実行時間が owner 数・ノート数に比例して長くなる。冪等性（resolved 行は `findUnresolvedTitleLinkRows` から落ちる）と決定性により再実行で収束するため、タイムアウト時も再実行で完了できる。`rebuildSearchIndex` が同規模 walk を server function で許容している前例に乗る。

---

## ADR-003: owner usecase を改変せず admin usecase でラップして再利用

### Status
Accepted

### Context
admin 認可・全 owner ループという新たな関心を、既存 owner usecase `backfillInternalLinkResolution` 本体に追加するか、別 usecase でラップするか。

### Decision
既存 owner usecase は変更せず、新 admin usecase `backfillAllOwnersInternalLinkResolution` から呼び出して再利用する。

### Consequences
- 良い点:
  - 既存 owner usecase は owner スコープ・無認可で統合テスト済み。admin 認可・全 owner ループを本体に混ぜると単一責務が崩れ既存テストの前提も変わる。ラップにより既存の決定規則・冪等性・テストをそのまま保てる。
  - `rebuildSearchIndex` も「admin usecase が内部で per-owner 処理を回す」構造であり、レイヤー責務分割が一貫する。
- トレードオフ:
  - usecase が1つ増える。ただし admin 認可を持つ層と持たない owner スコープ層を分離する設計上の利点が上回る。owner usecase は無認可のため、必ず admin usecase 経由で呼ぶ規約を JSDoc に明記する。
