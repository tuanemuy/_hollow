# dev server 情報 — Issue #48 マニュアルテスト

**起動日時:** 2026-05-20
**コマンド:** `pnpm dev` (= `vite dev --config vite.config.cloudflare.ts`)

---

## 起動情報

| 項目 | 値 |
|---|---|
| URL | http://localhost:3000/ |
| ポート | 3000 |
| PID ファイル | `/tmp/manual-test-server.pid` |
| ログファイル | `/tmp/manual-test-server.log` |
| 親プロセス PID | 5933 (`pnpm dev`) |

> Vite v8 のデフォルトポートは 5173 だが、このプロジェクトの `vite.config.cloudflare.ts` /
> `wrangler` 連携の構成では 3000 が割り当てられる。3000 が占有されている場合は
> Vite が自動で 3001/3002 にフォールバックするので、ログから読み取ること。

ヘルスチェック実績:

```bash
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://localhost:3000/
# 307 -> http://localhost:3000/?page=1&limit=20    (ルート→デフォルトクエリへのリダイレクト)

curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
# 200
```

ルート `/` は **307 リダイレクト** を返すので、ヘルスチェックで `200` のみを
判定するスクリプトは誤判定する。`200|301|302|307` を許容するか、`/login` を叩く。

---

## ネットワークアドレス（ログから抽出）

| Scope | URL |
|---|---|
| Local | http://localhost:3000/ |
| Network | http://192.168.10.117:3000/ |
| Network | http://100.93.6.5:3000/ |
| Network | http://192.168.139.3:3000/ |
| Network | http://192.168.97.0:3000/ |
| Debug | http://localhost:3000/__debug |

通常は **Local (`http://localhost:3000/`)** を使う。

---

## 操作コマンド

### ログを見る

```bash
tail -f /tmp/manual-test-server.log
```

### サーバー停止

```bash
kill $(cat /tmp/manual-test-server.pid)
# 親プロセスは `pnpm` なので子の vite まで含めて落とすには
pkill -P $(cat /tmp/manual-test-server.pid) ; kill $(cat /tmp/manual-test-server.pid)
```

### 再起動

```bash
nohup pnpm dev > /tmp/manual-test-server.log 2>&1 &
echo $! > /tmp/manual-test-server.pid
```

---

## 次フェーズへの引き継ぎ

- ブラウザ自動化 (`agent-browser` 等) は `http://localhost:3000/login` から開始
- ログイン: `mt48-eve@example.com` / `Password123!` （詳細は [seed-data.md](./seed-data.md)）
- スクリーンショット保存先: `.issue/48/.manual-test/screenshots/`
- 検証 URL 一覧は seed-data.md 末尾の表を参照
