# 動作確認計画 — Issue #5: [spec-sync] tests: note / media / ingestion でアプリケーション層 integration test が完全に欠落

**Issue:** #5
**作成日:** 2026-05-18

---

## 確認環境

本 Issue は **アプリケーション層の integration test 追加のみ** で、UI / API 動作には影響しない。確認は自動テストで行う。

### 検証環境の起動

ブラウザ起動は不要。テストランナーで完結する。

```bash
# 個別ファイル走行（開発中の素早いフィードバック）
pnpm vitest run app/core/application/note/__tests__/<file>.integration.test.ts

# ドメイン単位走行
pnpm vitest run app/core/application/note/__tests__
pnpm vitest run app/core/application/media/__tests__
pnpm vitest run app/core/application/ingestion/__tests__

# 統合テスト全体走行
pnpm test:integration

# 静的検証
pnpm typecheck
pnpm lint:fix
pnpm format
```

### デプロイ方法

本 Issue はテスト追加のみのためデプロイ不要。

## 確認項目

### 1. note ドメインの全 integration test が green

- **目的:** spec/testcases/note/index.md 全 10 セクション・全ケースが green になることを確認
- **手順:**
  1. `pnpm vitest run app/core/application/note/__tests__` を実行
  2. 各 `*.integration.test.ts` ファイルの it 数と spec/testcases/note/index.md の行数が一致するか目視照合
  3. `it.todo` が残っていれば理由が adr.md (ADR-004) に記載されているか確認
- **期待結果:** 全テストが PASS（`it.todo` は仕様乖離由来のみ）
- **確認ポイント:** spec 表 1 行と it 名が 1:1 で対応していること、`describe` 冒頭に spec パスのアンカーコメントがあること

### 2. media ドメインの全 integration test が green

- **目的:** spec/testcases/media/index.md 全 7 セクション・全ケースが green になることを確認
- **手順:**
  1. `pnpm vitest run app/core/application/media/__tests__` を実行
  2. `media.integration.test.ts` と `purgeOrphans.integration.test.ts` の it 数を確認
  3. `DownloadMedia` の `unlisted + viaShareLinkId 未指定 → BusinessRuleError` が `it.todo` で残っており、adr.md ADR-004 に記載があるか確認
- **期待結果:** 全テスト PASS、`it.todo` は ADR-004 記載分のみ
- **確認ポイント:** `media_assets.status` の `pending → attached / orphan / deleting` の遷移が DB row 直読みで検証されていること

### 3. ingestion ドメインの全 integration test が green

- **目的:** spec/testcases/ingestion/index.md 全 7 セクション・全ケースが green になることを確認
- **手順:**
  1. `pnpm vitest run app/core/application/ingestion/__tests__` を実行
  2. `ingestion.integration.test.ts` と `runIngestionJob.integration.test.ts` の it 数を確認
  3. `runIngestionJob` のパイプライン分岐（HTML / Markdown / Office / PDF textual / PDF scanned / 画像 / 音声）が全て個別 it として実装されているか確認
- **期待結果:** 全テスト PASS
- **確認ポイント:** LLM / OCR / sanitize 失敗系がローカル subclass で再現されており、`FakeLLMProvider` 本体には変更が入っていないこと

### 4. 既存テストの回帰がない

- **目的:** 新規ファイル追加で既存テスト（identity / directory / tag / publication / export 等）に副作用がないことを確認
- **手順:**
  1. `pnpm test:integration` を実行
  2. 全テストの PASS / SKIP 数を新規追加前後で比較（既存分の数値が変わらないこと）
- **期待結果:** 既存テスト全件 PASS、新規追加分のみ件数増加
- **確認ポイント:** `app/core/application/__tests__/helpers.ts` / `fakes/` に変更が入っていないか `git diff` で確認

### 5. 静的検証が通る

- **目的:** 型 / lint / format がプロジェクト規約に準拠していることを確認
- **手順:**
  1. `pnpm typecheck` を実行
  2. `pnpm lint:fix` を実行
  3. `pnpm format` を実行
- **期待結果:** 全て exit 0
- **確認ポイント:** lint:fix で自動修正されなかった warning / error が無いこと

## エッジケース・異常系

### 1. テスト走行時間の許容範囲

- **目的:** 14 ファイル追加で `pnpm test:integration` の走行時間が許容範囲（既存比 +50% 程度）に収まるか確認
- **手順:**
  1. 新規追加前の `pnpm test:integration` 走行時間を控える
  2. 新規追加後の走行時間と比較
- **期待結果:** 走行時間が大幅に悪化していない（許容範囲は ~5 分以内が目安）
- **対応:** 大幅悪化があれば note のファイル分割数を減らす（progress.md に記録）

### 2. `_occ_guard` 不変条件違反の検出

- **目的:** テストで直接 insert を使う seed helper が `version: 0` を守っているか確認
- **手順:**
  1. `pnpm test:integration` 実行中・実行後に `_occ_guard` テーブルが空であることを setup.ts の `afterEach` フックが assert している
- **期待結果:** どのテストでも `_occ_guard` violation が発生しない

## 既存機能への影響確認

本 Issue はテストファイル追加のみのため、本番コードへの影響はない。ただし以下を確認:

- `app/core/application/__tests__/helpers.ts` / `__tests__/fakes/` が変更されていない
- `app/core/application/{note,media,ingestion}/*.ts`（usecase 本体）が変更されていない
- `app/core/domain/{note,media,ingestion}/*.ts` が変更されていない
- spec/testcases の md ファイルが変更されていない（spec/実装の乖離は ADR-004 で別 Issue 化）

## 確認チェックリスト

- [ ] `pnpm vitest run app/core/application/note/__tests__` が全 PASS（`it.todo` は ADR-004 由来のみ）
- [ ] `pnpm vitest run app/core/application/media/__tests__` が全 PASS（`it.todo` は ADR-004 由来のみ）
- [ ] `pnpm vitest run app/core/application/ingestion/__tests__` が全 PASS
- [ ] `pnpm test:integration` 全体走行が全 PASS（既存分の件数が変わっていない）
- [ ] `pnpm typecheck` exit 0
- [ ] `pnpm lint:fix` exit 0、warning なし
- [ ] `pnpm format` exit 0
- [ ] spec/testcases/{note,media,ingestion}/index.md の表行と各テストの `it` が 1:1 で対応している（目視）
- [ ] `git diff app/core/application/__tests__/helpers.ts app/core/application/__tests__/fakes/` が空
- [ ] `git diff app/core/application/{note,media,ingestion}/*.ts app/core/domain/{note,media,ingestion}/*.ts` が空（テスト追加のみ）
- [ ] ADR-004 で記録した spec 乖離について Phase 4 で別 Issue を起票
