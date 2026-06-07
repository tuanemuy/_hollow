# Seed Data — Issue #549 manual-test

**owner:** dev-admin（`01950000-0000-7000-8000-000000000001`）
**session token:** `dev-admin-session-token`（cookie `__Host-session`）
**投入 SQL:** `.issue/549/manual-test/seed.sql`（冪等。再実行可）

## 準備手順

```bash
pnpm db:migrate           # No migrations to apply（適用済み）
pnpm seed:dev-admin       # admin + セッション
pnpm wrangler d1 execute hollow-local-d1 --local --file .issue/549/manual-test/seed.sql
```

## 投入データ

### ディレクトリ
- `Research`（depth1, root 直下）
- `Research / 書籍要約`（depth2）

### ノート
| id 末尾 | タイトル | 配置 | 役割 |
|---|---|---|---|
| ...0001 | 静かなインターフェース | root | **検証対象**。本文に解決/未解決 wikilink・#design #essay・コードブロック |
| ...0002 | A Pattern Language を読みながら | root | 解決済み wikilink のリンク先 |
| ...0003 | 朝の散歩で考えたこと | root | backlink referrer（**ルート直下 → meta 行なし**） |
| ...0004 | TanStack Start に乗り換えた理由 | Research/書籍要約 | backlink referrer（**meta 行 = RESEARCH / 書籍要約**） |

### 内部リンク（note_internal_links）
- 検証対象ノートの wikilink: 解決済み（→ ...0002）/ 未解決（title「未解決ノート」）
- backlink: ...0003 / ...0004 が検証対象（...0001）を resolved 参照

## 検証対象 URL
- 詳細: `http://localhost:<port>/notes/019e9900-0000-7000-8000-000000000001`
