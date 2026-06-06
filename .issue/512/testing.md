# 動作確認計画 — Issue #512: seed:dev-admin の冪等化

**Issue:** #512
**作成日:** 2026-06-06

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の準備
- スキーマ適用（未適用の場合のみ）: `pnpm db:migrate`
- 対象スクリプト実行: `pnpm seed:dev-admin`
- ローカル D1 への任意 SQL 投入（再現データ作成用）: `pnpm db:execute:local <SQLファイルパス>`

### デプロイ方法
なし（ローカル開発専用スクリプトの修正であり、ステージング/本番への反映は対象外）。

## 確認項目

### 1. ネストした directory を所有する dev-admin で冪等に再 seed できる（本丸）

- **目的:** RESTRICT の CASCADE 中断が起きず、exit 0 で成功すること。
- **手順:**
  1. `pnpm seed:dev-admin` で一度 dev-admin を作る。
  2. dev-admin（`owner_id='01950000-0000-7000-8000-000000000001'`）配下にルート directory と、その子 directory（`parent_id` = ルート）を `pnpm db:execute:local` で投入する。
  3. `pnpm seed:dev-admin` を再実行する。
- **期待結果:** exit 0 で成功。`FOREIGN KEY constraint failed` が出ない。
- **確認ポイント:** 修正前は `SQLITE_CONSTRAINT_TRIGGER` で失敗する scenario であること。

### 2. 所有データが破壊されない

- **目的:** 再 seed しても dev-admin の所有 notes/directories が残る。
- **手順:**
  1. 確認項目1の状態（dev-admin がネスト directory を所有）で `pnpm seed:dev-admin` を実行。
  2. ローカル D1 で `SELECT count(*) FROM directories WHERE owner_id='01950000-0000-7000-8000-000000000001';` を確認。
- **期待結果:** 投入した directory 件数が seed 前後で保持される。

### 3. dev-admin が canonical admin 状態になる

- **目的:** role/active 条件が再宣言される。
- **手順:** seed 後に `SELECT role, banned, email_verified, deleted_at FROM users WHERE id='01950000-0000-7000-8000-000000000001';`
- **期待結果:** `role='admin'`, `banned=0`, `email_verified=1`, `deleted_at=NULL`。
- **確認ポイント:** 仮に既存行が member/banned だった場合でも admin/active に戻ること。

### 4. session が張り直される

- **目的:** 固定トークンの有効 session が存在する。
- **手順:** seed 後に `SELECT id, user_id, token FROM sessions WHERE token='dev-admin-session-token';`
- **期待結果:** SESSION_ID / USER_ID / TOKEN の行が1件存在する。

## エッジケース・異常系

### 1. dev-admin が存在しない初期状態

- **目的:** 新規作成パスが壊れていない。
- **手順:** dev-admin 行が無い状態（または別 DB）で `pnpm seed:dev-admin`。
- **期待結果:** exit 0 で user と session が新規作成される。

### 2. 連続2回実行

- **目的:** 完全な冪等性。
- **手順:** `pnpm seed:dev-admin` を2回連続実行。
- **期待結果:** 2回とも exit 0。

## 既存機能への影響確認

- ブラウザ認証フロー（cookie に固定トークンを注入して `/admin` にアクセス）が従来どおり機能すること。session の張り直し方式は変えていないため影響は無い想定。

## 確認チェックリスト

- [ ] ネスト directory 所有時に再 seed が成功する（FK エラーなし）
- [ ] 所有 notes/directories が保持される
- [ ] dev-admin が admin/active 状態になる
- [ ] 固定トークンの session が存在する
- [ ] dev-admin 不在の初期状態でも作成される
- [ ] 連続2回実行しても成功する
