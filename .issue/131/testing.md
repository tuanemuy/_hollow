# 動作確認計画 — Issue #131: refactor: 定数化されていない BusinessRuleError リテラル直書きを *ErrorCode 定数化

**Issue:** #131
**作成日:** 2026-05-22

---

## 確認環境

本 Issue は純粋なリファクタリングで、`*ErrorCode` の value は spec verbatim を維持（`token_*`, `media_not_owned`, `note_trashed` は不変）。`INVALID_VERSION` / `INVALID_EVENT_ID` のみ UPPER → lower（`invalid_version` / `invalid_event_id`）に変更されるが、これらの value は外部観測者（frontend / driver / log）から参照されていない（grep 検証済み: production code 内で `INVALID_VERSION` / `INVALID_EVENT_ID` を assert する箇所は実装の 2 箇所以外ゼロ）。

そのため、検証は **自動テスト（unit + integration + type + lint）** のみで完結する。実機ブラウザ操作による動作確認は不要。

### 検証コマンド

```bash
# 命名規約の網羅検証（新 CommonErrorCode が glob / Set に登録され、value/key 規約に合格すること）
pnpm test:unit -- app/core/domain/__tests__/errorCodeNaming.test.ts

# 全 unit テスト
pnpm test:unit

# 全 integration テスト（identity / publication / note 周りの error.code 比較が壊れていないことを確認）
pnpm test:integration

# 型チェック + lint + format
pnpm typecheck
pnpm lint:fix
pnpm format
```

### デプロイ方法

なし（本 Issue は production 挙動に影響しないリファクタリング。ステージング・本番への配布は通常の merge → CI フローで完結）。

## 確認項目

### 1. `CommonErrorCode` が `errorCodeNaming.test.ts` に登録され、命名規約に合格する

- **目的:** ADR-001（本 Issue）で新設した `CommonErrorCode` が、Issue #82 ADR-005 のピン留め Set 検証に含まれ、`VALUE_REGEX` / `KEY_REGEX` に合格することを確認
- **手順:**
  1. `pnpm test:unit -- app/core/domain/__tests__/errorCodeNaming.test.ts` を実行
  2. テスト出力で `CommonErrorCode (../common/errorCode.ts)` describe ブロックの全 it が PASS することを確認
  3. `discovers every expected *ErrorCode module via glob` テストが PASS することを確認（`CommonErrorCode` が EXPECTED_ERROR_CODE_NAMES に登録され glob 発見数と一致）
- **期待結果:** すべて PASS、`CommonErrorCode` の `InvalidVersion` / `InvalidEventId` が key/value 規約に合格

### 2. `*ErrorCode` 定数追加が他テストの回帰を起こさない

- **目的:** `IdentityErrorCode` / `NoteErrorCode` への property 追加と、`challenge.ts` / `updateProfile.ts` / publication 配下 3 ファイルの定数経由化が、既存挙動を壊さないことを確認
- **手順:**
  1. `pnpm test:unit` を実行
  2. `pnpm test:integration` を実行
- **期待結果:** 全テスト PASS。特に identity / publication / note 周りで `error.code === "token_*"` / `"media_not_owned"` / `"note_trashed"` を比較している integration テストが PASS

### 3. `INVALID_VERSION` / `INVALID_EVENT_ID` の値変更が回帰を起こさない

- **目的:** UPPER → lower 値変更（`INVALID_VERSION` → `invalid_version` / `INVALID_EVENT_ID` → `invalid_event_id`）が、既存テストに影響しないことを確認
- **手順:**
  1. `grep -rn "INVALID_VERSION\|INVALID_EVENT_ID" app/` を実行し、`app/core/domain/common/{version,event}.ts` 以外で参照されていないことを確認
  2. `pnpm test` を実行
- **期待結果:** grep ヒットが実装 2 ファイルのみ。`pnpm test` 全 PASS

### 4. 型チェック・lint・format が通る

- **目的:** TypeScript 型・Biome lint / format 整合
- **手順:**
  1. `pnpm typecheck`
  2. `pnpm lint:fix`
  3. `pnpm format`
- **期待結果:** いずれもエラーゼロ

## エッジケース・異常系

### 1. `EXPECTED_ERROR_CODE_NAMES` Set への追記漏れ検出

- **目的:** Step 8（plan.md）で `EXPECTED_ERROR_CODE_NAMES` への `CommonErrorCode` 追加を忘れた場合、`discovers every expected *ErrorCode module via glob` テストが落ちる挙動を確認（再発防止メカニズムが機能しているか）
- **手順:**
  1. （シミュレーション）試しに `EXPECTED_ERROR_CODE_NAMES` から `CommonErrorCode` を一時除外して `pnpm test:unit -- app/core/domain/__tests__/errorCodeNaming.test.ts` を実行
  2. 該当テストが FAIL することを確認
  3. 元に戻す
- **期待結果:** Set への追記漏れが機械検出される（FAIL → 修正で復帰）。**任意実施** — 余裕があれば確認

## 既存機能への影響確認

- **identity 関連の usecase（VerifyEmail / ResetPassword / VerifyEmailChange / UpdateProfile）**: 各 usecase の `error.code` は value 不変のため frontend 比較・integration テストともに影響なし
- **publication 関連の usecase（changePublicationVisibility / issueShareLink / listShareLinks）**: 同じく value 不変のため影響なし
- **`Version` / `EventId` の rehydration エラー**: value が UPPER → lower に変わるが、`RehydrationError.cause` 経由で扱われ、value を直接観測する箇所がないため挙動不変

## 残存リテラル直書きの最終確認

実装完了後、production code に Issue 本文「既知の直書き箇所」のリテラルが残っていないことを以下の grep で確認:

```bash
grep -rn '"token_not_found"\|"token_expired"\|"token_consumed"\|"token_purpose_mismatch"\|"media_not_owned"\|"note_trashed"\|"INVALID_VERSION"\|"INVALID_EVENT_ID"' app/core/domain app/core/application app/core/adapters
```

期待結果: ヒットゼロ（あるいは integration テスト内の string assertion のみで、`new BusinessRuleError(...)` の引数として直書きされている箇所はゼロ）。

## 確認チェックリスト

- [ ] `pnpm test:unit -- app/core/domain/__tests__/errorCodeNaming.test.ts` PASS
- [ ] `pnpm test:unit` PASS
- [ ] `pnpm test:integration` PASS
- [ ] `pnpm typecheck` PASS
- [ ] `pnpm lint:fix` PASS
- [ ] `pnpm format` PASS
- [ ] production code 内の残存リテラル grep ヒットゼロ
