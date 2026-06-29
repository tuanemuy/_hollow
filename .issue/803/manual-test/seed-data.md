# シードデータ — Issue #803

- migration: `pnpm db:migrate`（適用済み）
- login user: `node scripts/seed-dev-login.mjs` → `dev-login@example.com` / `DevPassw0rd!2024`（role member, active）
- フィクスチャ: user_id `01950000-0000-7000-8000-000000000010` に tags 5件（tag-alpha/beta/gamma/delta/epsilon、全て先頭"t"）＋ノート1件（全タグ添付済み）

## 検証時の前提（重要）
候補は「未コミットの既存タグ」のみ表示（コミット済みチップは除外）。
→ 検証は **`/notes/new`** でタグ欄に "t" を入力する。5候補が並び、viewport クランプ/外側クリッククローズを確認できる。
