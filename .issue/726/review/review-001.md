# Review Round 1 — Issue #726

対象 PR: #763 / ブランチ `issue/726/p21-profile-identity`

## レビュー観点と結果

### 1. 要件カバレッジ

Issue の想定対応をすべて満たす:

- ✅ `.avatar-large` `YK` → `YI`（desktop / mobile）
- ✅ 表示名 `柏木 結衣` → `山田 一郎`（desktop / mobile）
- ✅ ハンドル `@yui_k` → `@ichiro_y`（要決定だった項目。既存 `@yui_k`=名前_姓イニシャル パターンに整合する形をユーザー確認のうえ採用）

### 2. 整合性（本人アイデンティティ）

- ✅ P21 のサイドバー（山田 一郎 / yumenaut@gmail.com）とフォームが同一人物で一致。
- ✅ `柏木 / 結衣 / yui_k / >YK<` の残存を grep で 0 件確認（P21 desktop / mobile）。

### 3. 関連箇所スキャン（同根の不整合）

`spec/design/pages/` 全体を走査した結果:

- **P24-settings-account-delete.html（desktop / mobile）**: `confirm-username` の placeholder が `@yui_k`。
  これはログインユーザー本人（サイドバー＝山田 一郎）が自分のユーザー名を入力して本人確認する欄であり、
  #726 と同根の本人アイデンティティ不整合。同じ設定動線・1行修正のため本 PR で `@ichiro_y` に修正した
  （Phase 4 の「数分で直せる同動線の些細な問題はその場で直す」方針）。
- **P45-admin-users.html（desktop / mobile）**: `YK` / `@yui.ishikawa · 石川 結衣` 等は admin が管理する
  他ユーザーのリスト項目であり、意図的に別人格。スコープ外・対応不要。
- **drafts/P10-header-*.html**: scratch 探索ファイルで正本ではない。スコープ外・対応不要。

### 4. スコープ規律

- ✅ bio（自己紹介）は名前依存ではなく Issue 未記載のため未変更。
- ✅ 機能・実装コードへの影響なし（モック表示の磨き込みのみ）。

## 判定

**APPROVED** — 要件を満たし、同根の不整合（P24）も同 PR で解消。残ブロッカーなし。
