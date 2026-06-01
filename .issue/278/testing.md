# 動作確認計画 — Issue #278: IngestionQueue polling 専用テストの追加

**Issue:** #278
**作成日:** 2026-06-02

---

## 確認環境

本 Issue はコンポーネント単体テスト（Vitest + happy-dom）の追加のみで、ランタイム UI の挙動は一切変更しない。確認は自動テストの実行で完結する。

### 検証環境の起動

```bash
# 追加したテストファイルのみ実行
pnpm test:unit -- app/components/ingestion/__tests__/IngestionQueue.test.tsx

# ユニット全体（既存テストへの副作用が無いことの確認）
pnpm test:unit

# 型・lint・format
pnpm typecheck
pnpm lint:fix
pnpm format
```

### デプロイ方法

なし（テスト追加のみ。アプリ挙動を変えないためデプロイ不要）。

## 確認項目

### 1. 6 シナリオが全て PASS する

- **目的:** Issue が要求する polling 制御の代表シナリオが全て検証され、グリーンであること
- **手順:**
  1. `pnpm test:unit -- app/components/ingestion/__tests__/IngestionQueue.test.tsx` を実行
  2. 6 つの `it(...)` が全て PASS することを確認
- **期待結果:** 全テスト PASS、failure / skipped が 0
- **確認ポイント:** 間隔切替 / visibility 即時 tick / fatal 永久停止 / notFound failures / inflight 抑止 / unmount cleanup が個別の it として存在し PASS していること

### 2. ユニットテスト全体への副作用が無い

- **目的:** 新規テストが他テストの fake timer / グローバル状態を汚染しないこと
- **手順:**
  1. `pnpm test:unit` を実行
- **期待結果:** 既存テストを含め全 PASS（新規追加分以外の増減・新規 failure が無い）
- **確認ポイント:** `vi.useRealTimers()` / `root.unmount()` / `document.visibilityState` の復元が `afterEach` で確実に行われ、後続テストに漏れないこと

### 3. 型・lint・format がクリーン

- **目的:** リポジトリ規約への適合
- **手順:**
  1. `pnpm typecheck` → エラー 0
  2. `pnpm lint:fix` → 差分が出ても再実行で安定
  3. `pnpm format` → フォーマット適用後に差分なし
- **期待結果:** いずれもエラーなし
- **確認ポイント:** `biome` が CI と同じ結果を返すこと（ローカル biome バイナリで確認）

## エッジケース・異常系

### 1. flaky 検出（fake timer × async fetch）

- **目的:** タイマー発火 → fetch 解決 → state 反映の flush 不足による flaky が無いこと
- **手順:**
  1. テストファイルを複数回連続実行（例: `pnpm test:unit -- IngestionQueue.test.tsx` を 3 回）
- **期待結果:** 毎回安定して全 PASS
- **確認ポイント:** 不安定なら `advanceTimersByTimeAsync` の後に `act(async () => await Promise.resolve())` の flush 回数を増やす

## 既存機能への影響確認

- `IngestionQueue.tsx` 本体は変更しないため、`/upload` ページの polling 挙動に実機影響は無い。
- 既存テスト（`UploadForm.test.tsx`, `IngestionJobRow.test.tsx` 等）が引き続き PASS することで回帰なしを担保。

## 確認チェックリスト

- [ ] 6 シナリオが個別の it として実装され全 PASS
- [ ] `pnpm test:unit` 全体がグリーン
- [ ] `pnpm typecheck` エラーなし
- [ ] `pnpm lint:fix` / `pnpm format` 適用後に差分なし
- [ ] 連続実行で flaky が無い

## ブラウザ実機検証について

本 Issue はランタイム UI を変更しないテスト追加であり、画面操作で確認すべき項目が存在しない。よって manual-test（agent-browser）によるブラウザ検証はスキップする（スキップ理由: testing.md に画面操作項目が 1 件も無い／アプリ挙動を変えないテストのみの変更）。
