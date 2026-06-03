# ADR — Issue #453: ローカル dev 用の認証シードスクリプト

## ADR-001: 静的 SQL ファイルではなく Node ラッパースクリプトで実装する

### Status
Accepted

### Context
seed の実装手段として2案あった:

1. **静的 SQL ファイル** (`scripts/seed-dev-admin.sql`) + `package.json` で
   `wrangler d1 execute ... --file` するだけ。
2. **Node スクリプト** (`scripts/seed-dev-admin.mjs`) が SQL を生成・実行し、
   さらに出力を整形する。

Issue の要件には「実行後に投入したセッショントークンと使い方（cookie 注入手順 or
直接 URL）を**標準出力に表示する**」（やること #3）が含まれる。静的 SQL では
wrangler の実行結果しか出ず、トークンや cookie 注入コマンドの案内を出せない。

### Decision
案2（Node スクリプト）を採用する。SQL 生成・冪等 DELETE→INSERT・実行・出力整形を
1ファイルに集約し、実行は既存の `pnpm db:execute:local`（= `wrangler d1 execute
hollow-local-d1 --local --file`）を子プロセスで再利用する。これにより D1 名や
`--local` フラグをスクリプト内に再定義せず、ローカル D1 への正規の書き込み口に一本化する。

決定論を保つため `Date.now()` は使わず、`created_at` / `updated_at` / `expires_at` は
固定 ISO 文字列にする（`expires_at` は十分先の `2999-...`）。

### Consequences
- 良い点: 要件 #3 を満たせる。トークン・cookie 注入コマンド・アクセス URL を
  一貫した形で案内でき、暗黙知を完全に排除できる。冪等ロジックとトークン定義が
  単一ソースに集約される。
- 良い点: 追加依存なし（`node:child_process` / `node:fs` / `node:os` のみ。
  リポジトリは `"type": "module"` なので `.mjs` がそのまま動く）。
- トレードオフ: 純粋な SQL より1段階間接的（Node → pnpm → wrangler）。ただし
  ローカル dev 専用ツールであり、得られる UX（トークン案内）の価値が上回る。

---
