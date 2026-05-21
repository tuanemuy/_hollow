# 実装計画 — Issue #60: /admin/llm が "Stored instance_settings violates invariants" で 500

**Issue:** #60
**作成日:** 2026-05-21
**複雑度:** 中〜大規模（根本原因調査 + 修正方針比較あり）

---

## 目的

`/admin/llm`（および同経路で `instance_settings` を読む他の admin 画面 / `/signup`）を開いた際に
`SystemError(DataIntegrityError, "Stored instance_settings violates invariants")` で 500 になる既存不具合を解消し、
`pnpm db:apply:local && pnpm dev` だけで admin が `/admin/llm` を 200 で開ける状態にする。

## スコープ

### 含まれるもの

- ローカル D1 に残存する legacy shape の `instance_settings` 行を `pnpm db:apply:local` で除去する一回限りのマイグレーション追加
- 過去 manual-test seed (`.issue/{1,8,29,30}/...seed.sql`) の `instance_settings` INSERT を現行スキーマに修正し、将来 reseed で再汚染しないようにする
- `design_tokens_json` の不正値 (`'{}'` → `'{"tokens":{}}'`) も同じ箇所で修正（同じ RehydrationError を引く別ソース）
- 動作確認: 既存汚染環境 / 新規環境 / 正規行が既に存在する環境の3パターンで `/admin/llm` が 200 になること

### 含まれないもの

- ドメイン (`InstanceSettings.reconstruct`) / アダプター (`D1InstanceSettingsRepository.toEntity`) のコード変更
  → 現行設計は「不正データを黙って修復せず fail loud」が意図通り（CLAUDE.md cross-layer catch policy）
- 「シード SQL がドメイン不変条件に違反していないか」を CI で検知する統合テスト追加
  → 価値はあるが Issue の意図（特定の 500 を直す）の外。Phase 4 で別 Issue 起票候補
- リポジトリ統合テスト (`D1InstanceSettingsRepository` 専用) の新設
  → 同上。Phase 4 検討
- `.manual-test/2026-05-17/seed.sql` に `instance_settings` 行を追加すること
  → 行不在時の `default()` フォールバックが既に正しく機能するため不要

## 実装ステップ

### 1. 新規マイグレーション `0009_drop_legacy_instance_settings.sql` を追加

- **対象ファイル:** `app/core/adapters/d1/migrations/0009_drop_legacy_instance_settings.sql`（新規）
- **変更内容:**

  ```sql
  -- Issue #60: drop the singleton instance_settings row when its
  -- limits_json predates the current InstanceLimits shape (or
  -- design_tokens_json is missing the `tokens` key). Past
  -- manual-test seeds (.issue/{1,8,29,30}/...) inserted a legacy
  -- shape ({perUserMaxNotes, perUserMaxMediaBytes, ...}) that no
  -- longer satisfies InstanceLimits invariants, causing
  -- D1InstanceSettingsRepository.toEntity to translate the
  -- RehydrationError into SystemError(DataIntegrityError) on
  -- /admin/llm, /admin/metrics, /admin/prompts, /admin/design,
  -- /admin/registration, and /signup.
  --
  -- Once the row is gone, D1InstanceSettingsRepository.get()
  -- materialises InstanceSettings.default(now) on read, restoring
  -- the affected pages. Rows whose limits_json already matches the
  -- current shape and whose design_tokens_json has the `tokens`
  -- key are preserved.

  DELETE FROM instance_settings
  WHERE id = 'singleton'
    AND (
      json_type(limits_json, '$.maxUploadBytesPerDay') IS NULL
      OR json_type(design_tokens_json, '$.tokens') IS NULL
    );
  ```

- **理由:** Issue 再現手順 `pnpm db:apply:local` で必ず走るため、汚染環境が自動修復される。新規環境では対象行なしで no-op。正規行（admin UI から保存された行）は `json_type IS NOT NULL` で温存される。
  `json_type` を採用したのは「キー不在」のみを判定するため。`json_extract` は値が空オブジェクト `{}` のときも TEXT `'{}'` を返すため誤判定の懸念はないが、`json_type` のほうが「キーの有無」という意図がコード上で明示的になる（SQLite 3.38+ で標準サポート、D1 で利用可能 — `app/core/adapters/d1/repositories/savedViewRepository.ts:443,458` で `json_extract` の利用実績あり、`json_type` も同 JSON1 拡張に含まれる）。

### 2. legacy seed.sql 4本の `instance_settings` INSERT を現行スキーマに修正

- **対象ファイル:**
  - `.issue/1/manual-test/seed.sql`
  - `.issue/8/manual-test/seed.sql`
  - `.issue/29/.manual-test/seed.sql`
  - `.issue/30/manual-test/seed.sql`
- **変更内容:** 4ファイルとも `instance_settings` INSERT ブロックの以下2箇所を置換:
  - `design_tokens_json`: `'{}'` → `'{"tokens":{}}'`
  - `limits_json`: `'{"perUserMaxNotes":...,"bulkSelectionMax":100}'` → `'{"maxUploadBytesPerDay":1073741824,"maxIngestionBytes":33554432,"maxNoteBytes":1048576,"maxExportArtifactBytes":268435456,"maxShareLinksPerNote":16,"editLockTtlSec":300,"trashRetentionDays":30}'`（`defaultLimits()` (`app/core/domain/adminSettings/entity.ts:65-75`) と一致）
- **理由:** ステップ 1 のマイグレーションで現行 DB の汚染は除去されるが、開発者がこれらの seed を後から流すと再度同じ legacy 行が挿入される。`INSERT OR IGNORE` のままなので、マイグレーション後に流せば「行不在 → 正規 INSERT」が成立する。
- **`prompts_json: '{}'` の温存（意図的）:** `prompts_json` は現行スキーマでも `'{}'` で問題ない。`InstanceSettings.reconstruct` 内の `rehydratePrompts` が各 `PromptPurpose` についてデフォルトの空テンプレートを補完するため `RehydrationError` を引かない (`entity.ts:107-128`)。`design_tokens_json` (TypeError) や `limits_json` (BusinessRuleError) とは挙動が異なる。

## 設計判断

複数の修正方針を比較した結果、マイグレーション追加 + seed 修正の2軸採用となった。詳細は [`adr.md`](./adr.md) ADR-001 を参照。

要点:
- ドメイン / アダプターのコードは触らない（fail loud 設計を維持）
- マイグレーションでの「過去のテストシードが残した汚染データの削除」は `json_extract IS NULL` で防御的に絞り込み、本番への副作用ゼロを担保
- 既存 seed.sql を保守する／凍結資料として放置するかの判断は「保守する」を選択（同一 DB を跨いだ Issue 検証ワークフローが暗黙の前提）

## リスクと注意点

- **本番影響:** 本番 D1 には `instance_settings` の legacy 行は存在しない（admin UI 経由で書き込まれた行のみで、それは常に現行スキーマ）。本件は完全にローカル開発者環境 / staging のクリーンアップ問題。
- **マイグレーション越境責務への懸念:** 「過去のテストシードの汚染データを修復する」のはマイグレーションの本来責務外という意見もあるが、本件は一回限りで本番無影響、かつ `json_extract IS NULL` で防御的に絞っているため、合理的なトレードオフと判断（ADR-001 参照）。
- **`design_tokens_json: '{}'` の同時修正:** Agent 2 が指摘した通り、`limits_json` だけでなく `design_tokens_json` も同じく不正（`DesignTokens.create({tokens: undefined})` で TypeError → RehydrationError）。マイグレーション削除条件と seed 修正に両方含める。
- **`InstanceLimits` 値:** マイグレーションで削除した行は `default()` で補完されるため、UI 上は `defaultLimits()`（1 GiB / 32 MiB / ...）が表示される。staging 等で誤って legacy 行があった場合、admin が設定したカスタム値が失われるが、そもそも legacy shape では現コードで読めず壊れているので望ましい挙動。

## テスト方針

### 自動テスト

コード変更なし（マイグレーション SQL と seed SQL のみ）のため、既存テストへの影響なし。`pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test` で回帰がないことを確認。

### マニュアルテスト

[`testing.md`](./testing.md) 参照。以下4パターンを確認:

1. **汚染環境再現 → 修正反映 → save 動作**: legacy 行を投入 → `pnpm db:apply:local` でマイグレーション適用 → 行削除確認 → `/admin/llm` が 200 で開ける → 設定を保存 → 再描画して永続化を確認
2. **新規環境**: `.wrangler/state` 削除 → `pnpm db:apply:local` のみ → `/admin/llm` がフォールバック経路で 200
3. **正規行温存**: 現行スキーマに準拠した `{"tokens":{}}` + `defaultLimits()` 形式の行を投入 → `pnpm db:apply:local` 適用後も温存されている
4. **`/signup` 経路の回復**: legacy 行 → マイグレーション → `/signup` でアカウント作成まで通る（Issue コメントで報告された致命的経路）

## レビュー反映

### 修正した点

- **R2 P-001への対応**: testing.md のパターン1に「マイグレーション後 admin UI から save → 永続化確認」を追加。adapter `save()` 経路の OCC バージョン 0 → 1 の遷移まで含めて検証する
- **R1 S-001 への対応（防御的修正）**: マイグレーションの判定を `json_extract IS NULL` から `json_type IS NULL` に変更。`json_extract` は値が空オブジェクトでも TEXT `'{}'` を返すため誤判定の懸念はないが、「キーの有無」を判定する意図が `json_type` のほうがコード上で明示的になるため採用

### 取り込んだ改善提案

- **R1 S-002**: ステップ2の `prompts_json: '{}'` を意図的に温存する理由を plan に明記。`rehydratePrompts` が各 purpose のデフォルトを補完するため `RehydrationError` を引かないことを根拠として記述
- **R1 S-003**: ステップ2の `limits_json` ハードコード値が `defaultLimits()` (`entity.ts:65-75`) と一致するべきことを明示
- **R2 S-004**: 手書きマイグレーションが drizzle-kit と整合する根拠を ADR-001 に追記
- **R2 S-005**: testing.md にパターン4「`/signup` 経路の回復」を追加

### 見送った提案とその理由

- **R2 S-001**: `seed-data.md` への `INSERT OR IGNORE` 挙動の追記 — `INSERT OR IGNORE` は SQL の標準セマンティクスで、追加ドキュメントを足す価値が低い。スコープ抑制を優先
- **R2 S-002**: マイグレーションを `json_type IS NOT 'object'` のような広い条件にする — 現在の legacy seed が産んでいるのは `'{}'` のみで、過剰防御は YAGNI。S-001 の `json_type IS NULL` 化で十分。仮に別の壊れ方が出た場合は新規マイグレーションで対応する方針
- **R2 S-003**: commit message や seed ファイル末尾に変更履歴コメント追記 — git log で十分追跡可能、追加コメントは保守負担を増やす
- **R2 P-002**: マイグレーション SQL コメント長さの懸念 — SQLite は `--` 以降を行末までコメント扱いするため安全。長い説明は ADR に寄せている

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|--------------------------------|------------------------|-----------------------------|
| ベース採用 | × | × | ○ |
| 取り込んだ点 | legacy seed 4本も併せて修正する判断 | `design_tokens_json: '{}'` も同じく壊れているという発見 / マニュアルテストパターン分け | マイグレーション1本での汚染データ削除アプローチ全体 |
| 見送った点 | ベース seed への `instance_settings` 行追加 / `ON CONFLICT DO UPDATE` 化（マイグレーションがあれば不要）| 統合テスト3種の新設（スコープ外、Phase 4 検討）/ CLAUDE.md への規約追記 | seed 4本の修正（マイグレーションだけでは将来 reseed で再汚染するので必要と判断） |
