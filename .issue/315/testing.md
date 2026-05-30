# 動作確認手順 — Issue #315: admin UsersTable の自己操作禁止ガード

本 PR は「ログイン中の admin が自分自身に対して demote / suspend を実行できない」ことを、UI（自分の行のボタン非表示）とサーバー（usecase ガード）の両方で保証する。確認対象は (1) 自動テスト、(2) 自分の行にボタンが出ないこと、(3) 他 admin の行には出ること。

---

## 1. 自動チェック（必須）

リポジトリルートで以下を順に実行し、すべて成功すること。

```bash
pnpm typecheck
pnpm lint:fix
pnpm format
pnpm test
```

確認ポイント:
- `pnpm typecheck`: 新しい prop（`currentUserId`）・エラーコード・`assertNotSelf` の型が通る。
- `pnpm test`: 追加した自己 demote/suspend 拒否テストが green。既存の「最後の admin」テストも green（ADR-003 の順序判断に従い、必要なら書き換え済み）。`errorCodeNaming.test.ts` が新コード `self_operation_not_allowed` を許容（lower_snake_case）。

---

## 2. 開発サーバー起動

```bash
pnpm dev
```

起動後、表示された URL をブラウザで開く。admin アカウントでログインし、ユーザー管理画面（admin の UsersTable）へ遷移する。

> シードデータ準備（admin 2 名以上 + member 数名）は manual-test スキルが用意する。最低条件: ログイン中の admin に加えて **もう 1 人 active な admin** が存在すること（他 admin 行にボタンが出ることを確認するため）。

---

## 3. 自分の行（ログイン中 admin）の確認（必須）

- [ ] ユーザー管理テーブルで、自分（ログイン中 admin）の行の「アクション」列に **「一時停止」ボタンが表示されない**
- [ ] 同じく自分の行に **「管理者を解除」ボタンが表示されない**
- [ ] 自分の行に他の操作ボタン（昇格・復帰）も表示されない（active + admin のため元々出ない）

## 4. 他ユーザーの行の確認（必須・非退行）

- [ ] **他の active admin** の行には「一時停止」「管理者を解除」が従来どおり表示される
- [ ] **active member** の行には「一時停止」「管理者に昇格」が表示される
- [ ] **suspended ユーザー**の行には「復帰」が表示される
- [ ] 他ユーザーへの demote / suspend が従来どおり実行でき、テーブルが更新される

## 5. サーバー側ガードの確認（多重防御・任意）

UI を迂回した直接呼び出しでも拒否されることの確認（手動 or 結合テストで代替可）。

- [ ] （結合テストで担保）複数 admin がいる状態で `demoteAdmin({ actorAdminId: X, targetUserId: X })` が `self_operation_not_allowed` で拒否される
- [ ] （結合テストで担保）`suspendUser({ actorAdminId: X, targetUserId: X })` が `self_operation_not_allowed` で拒否される

---

## 6. 想定スクリーンショット

- 自分の行＋他 admin 行が並んだテーブル全体（自分の行だけアクションが空、他 admin 行にはボタンがある状態）
