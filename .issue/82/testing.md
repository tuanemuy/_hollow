# 動作確認計画 — Issue #82: refactor: normalize ErrorCode naming convention across domains

**Issue:** #82
**作成日:** 2026-05-21

---

## 確認環境

本 Issue は `*ErrorCode` の文字列リテラル値を変更する純粋なリファクタリングであり、UI / API 表面の挙動は変わらない。したがって主たる確認は **型チェック・lint・自動テスト** で完結する。動作確認はスポットチェックのみ。

### 検証コマンド

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

### 検証環境の起動（スポット確認用）

```bash
pnpm dev
```

### デプロイ方法

デプロイは行わない（本 PR では検証環境での確認のみで完了する）。

## 確認項目

### 1. 型チェックがクリーンであること

- **目的:** `(typeof *ErrorCode)[keyof typeof *ErrorCode]` の literal union が新値に追従し、全 callsite で型エラーが出ないことを確認する
- **手順:**
  1. `pnpm typecheck` を実行
- **期待結果:** エラー 0 件で終了する
- **確認ポイント:** ErrorCode を受ける関数シグネチャ（`BusinessRuleError<NoteErrorCode>` 等）の型推論が壊れていないこと

### 2. Lint / Format がクリーンであること

- **目的:** 機械的な書き換えで Biome のルールに違反していないことを確認する
- **手順:**
  1. `pnpm lint` を実行
  2. `pnpm format:check` を実行
- **期待結果:** 両方ともエラー 0 件で終了する

### 3. ユニットテスト / インテグレーションテストが全件 PASS すること

- **目的:** 既存テスト 200+ 件が値変更に追従していることを確認する
- **手順:**
  1. `pnpm test` を実行
- **期待結果:** 全件 PASS
- **確認ポイント:**
  - `NoteErrorCode.X` 経由のシンボル参照テストは自動追従しているはず
  - UPPER_SNAKE 文字列を直接 assert していたテストは新値に書き換わっているはず
  - 新規追加した `errorCodeNaming.test.ts` も PASS していること

### 4. 再発防止テストが正しく機能すること

- **目的:** `errorCodeNaming.test.ts` が命名規約違反を検出できることを確認する
- **手順:**
  1. 一時的に任意の `*ErrorCode` に `Bogus: "BOGUS_VALUE"` を追加して `pnpm test:unit` を実行
  2. 該当テストが FAIL することを確認
  3. 追加を取り消して通常状態に戻す
- **期待結果:** UPPER_SNAKE 値を追加すると即座に test が FAIL する
- **確認ポイント:** 検証ロジックの正規表現が `lower_snake_case` を正しく強制している

### 5. note 編集ロックの動作（スポット確認）

- **目的:** `NoteErrorCode.EditLockedByOther` の値（`"edit_locked_by_other"`）が変わらないため、`useEditLock.ts` の `HELD_BY_OTHER_CODES` 判定が無傷であることを確認する
- **手順:**
  1. `pnpm dev` で起動
  2. ノートエディタを開き、別ユーザーが編集中のノートを開く操作（または該当条件を再現）
  3. ロック表示が出ることを確認
- **期待結果:** ロック表示が変わらず表示される
- **確認ポイント:** value 不変のため理論上影響なしだが、念のため目視

### 6. ShareLinkGate の副次バグ修正（★必須・レビュー P-004 反映）

- **目的:** `PublicationErrorCode.ShareLinkRevoked` を `"PUBLICATION_SHARE_LINK_REVOKED"` → `"share_link_revoked"` に変更することで、フロントエンドの `state.error.code === "share_link_revoked"` 比較が一致するようになる（既存バグの副次修正）
- **手順:**
  1. `pnpm dev` で起動
  2. share link を発行し、admin 側で revoke 操作を行う（あるいは DB で `revoked_at` を更新）
  3. revoked 状態の share link URL を踏む
- **期待結果:** `ShareLinkGate` の revoked 表示が出る（修正前は別表示か未定義動作だった可能性）
- **確認ポイント:** 修正前後の差分。bug 修正であることを PR 説明にも明記

### 7. auth フローのスポット確認（任意）

- **目的:** `error.code === "token_expired"` / `"unverified"` 等を見ている frontend 比較が無傷であることを確認する（値不変のため影響なしの想定）
- **手順:**
  1. 確認が必要なケース（例: 期限切れの認証メールリンクを踏む等）を再現
- **期待結果:** 該当エラー表示が従来通り表示される

## エッジケース・異常系

### 1. 異ドメインで同値を持つ `media_not_owned` の挙動

- **目的:** `MediaErrorCode.NotOwned`, `NoteErrorCode.MediaNotOwned`, `PublicationErrorCode.MediaNotOwned` がすべて `"media_not_owned"` になり、test が「ドメインで識別」していないことを確認する
- **手順:**
  1. `grep -rn '"media_not_owned"' app/` で参照箇所を確認
- **期待結果:** 値で識別している箇所は存在しない（property key 経由参照のみ）

## 既存機能への影響確認

- **frontend 表示**: `app/components/auth/*` / `app/components/public/ShareLinkGate` / `app/components/note/editor/useEditLock.ts` で `error.code` を文字列リテラル比較している箇所は全て値が不変（既に lower）。`ExportJobDetail/Page.tsx` の `ExportErrorCode.Unauthorized` 経由比較は自動追従
- **presentation 層**: `errorResponse.ts` は `code` 値非依存。`errorDisplay.ts` は `SystemErrorCode`（UPPER）のみ参照しており本 Issue の影響なし
- **adapters 層**: `*ErrorCode` への直接的な値依存は無い（grep で確認済）

## 確認チェックリスト

- [ ] `pnpm typecheck` が PASS
- [ ] `pnpm lint` が PASS
- [ ] `pnpm format:check` が PASS
- [ ] `pnpm test:unit` が PASS
- [ ] `pnpm test:integration` が PASS
- [ ] `errorCodeNaming.test.ts` が regex 検証ロジックの自己テストを含めて PASS
- [ ] `useEditLock` の動作確認（スポット）
- [ ] **`ShareLinkGate` の revoked 表示が出る（副次バグ修正の確認）**
- [ ] `grep -rnE '"[A-Z][A-Z0-9_]+"' app/core/domain/*/errorCode.ts` で UPPER_SNAKE 値の残存が 0 件
- [ ] `.issue/82/error-code-mapping.md` の正解値テーブルと errorCode.ts の値が一致
