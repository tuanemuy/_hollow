# ADR — Issue #60: /admin/llm の DataIntegrityError 500 修正

## ADR-001: マイグレーションでの一回限り legacy データ削除 + seed 修正の併用採用

### Status

Proposed

### Context

`/admin/llm` で `SystemError(DataIntegrityError, "Stored instance_settings violates invariants")` が発生する根本原因は、過去の manual-test seed (`.issue/{1,8,29,30}/...seed.sql`) が以下の legacy shape を `INSERT OR IGNORE INTO instance_settings` で挿入していたこと:

- `limits_json = '{"perUserMaxNotes":...,"bulkSelectionMax":100}'`（現行スキーマは `{maxUploadBytesPerDay, maxIngestionBytes, ...}`）
- `design_tokens_json = '{}'`（現行スキーマは `{"tokens": {...}}`）

これらが `D1InstanceSettingsRepository.toEntity` 内で `InstanceSettings.reconstruct` を通る際に `RehydrationError` を引き、adapter で `SystemError(DataIntegrityError)` に翻訳される。

修正方針として以下を比較:

- **A. seed.sql のみ修正**: ファイルだけ直しても、既に汚染された開発者 DB は手動 `DELETE` か `.wrangler/state` リセットしないと復旧しない。Issue 再現手順 `pnpm db:apply:local && pnpm dev` だけでは直らないため要件を満たさない。
- **B. 新規マイグレーションで legacy 行を削除**: `pnpm db:apply:local` で自動的に汚染が除去される。新規環境では no-op。`json_extract IS NULL` で防御的に絞れば本番の正規行は触らない。マイグレーションは本来「スキーマ進化」の責務だが、本件は「過去のテスト系コミットが残したアーティファクト由来の壊れたデータを一回限りで除去する」というデータマイグレーションで、十分正当化可能。
- **C. リポジトリ層で reconstruct 失敗時に `default()` フォールバック**: 「不正データを黙って隠す」設計になり、本番でのデータ破損を発見できなくなる。CLAUDE.md `cross-layer catch policy`（adapter は翻訳のみ）にも反する。fail loud を維持すべき。
- **D. `InstanceSettings.reconstruct` で legacy キーを silent migrate**: ドメインが adapter の歴史的 drift を知るアーキテクチャ違反。`reconstruct` の本来責務（不変条件の強制）を毀損する。

### Decision

**B（マイグレーション削除）+ A（seed 修正）の併用**を採用する。

- B 単独だと、開発者が後から `.issue/{1,8,29,30}` の seed を流せば legacy 行が再投入されて再発する（`INSERT OR IGNORE` なのでマイグレーション後に再 INSERT が通る）
- A 単独だと、既に汚染されている DB は自動修復されず Issue 再現手順 (`pnpm db:apply:local && pnpm dev`) で要件を満たせない
- B + A により「既存汚染環境の自動修復」と「将来再汚染の予防」の両方をカバー

`design_tokens_json` の不正値（`'{}'` → `'{"tokens":{}}'`）もマイグレーション削除条件と seed 修正に同時に含める。両者は同じ RehydrationError を引く root cause。

マイグレーションは drizzle-kit 自動生成ではなく手書きで追加する。本プロジェクトでは `0005_drop_todos.sql` `0007_notes_slug_partial_unique.sql` 等で既に手書きマイグレーションを許容する前例があり、`drizzle.config.ts` も「drizzle-kit は SQL 生成のみで、適用は wrangler」と明記しているため設計判断と整合している。drizzle-kit 再生成で消えるリスクはない。

### Consequences

- 良い点:
  - Issue 再現手順だけで自動修復が完結（手動 DELETE 不要）
  - ドメイン / アダプターのコードに一切手を入れず、fail loud 設計を温存
  - 本番に legacy 行は存在しないため本番影響ゼロ。`json_extract IS NULL` でさらに二重防御
  - 将来 reseed しても再汚染しない
- トレードオフ:
  - マイグレーションが「スキーマ進化」だけでなく「過去アーティファクトのクリーンアップ」も担うパターンを 1 件追加する（先例として残る）。ただし類似ケースが将来発生したら都度判断する方針で、ガイドライン化はしない
  - マイグレーション削除 + seed 修正の 2 箇所変更で、片方だけ取り込んだリビジョンでは部分復旧になる（PR 単位で両方マージされるので実用上問題なし）

### 却下した代替案の補足

- **C / D（コード変更）の却下理由**: hollow プロジェクトの DDD/hexagonal 設計の核は「ドメイン不変条件は domain で守る」「adapter は driver-specific を翻訳するのみ」「不正データを黙って修復するのは bad practice」。C / D を採用するとこの原則に風穴が開き、将来同種の問題で fail loud の機会を失う。
- **シードを凍結して触らない案（Agent 3 の最初の検討）**: `.manual-test/2026-05-17/seed-data.md` § 1 で「ベース seed + Issue 個別 seed」を跨いで検証する暗黙ワークフローが存在し、別 Issue の検証中に再汚染が起きうるため不採用。

### スコープ外（Phase 4 で別 Issue 起票検討）

- `InstanceSettings.reconstruct` の `limits` / `designTokens` フィールド drift をユニットテストでガード（パラメタライズドテスト）
- `D1InstanceSettingsRepository` の統合テスト新設（rehydrate 経路の round-trip + legacy shape での throw 確認）
- 全 seed.sql を CI で実 D1 に流し、リポジトリ rehydrate が throw しないことを検証する統合テスト

---
