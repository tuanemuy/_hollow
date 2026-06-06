# Issue #532 動作確認計画

## 確認環境

ローカル（Cloudflare Workers ランタイム = `pnpm dev` / workerd）。設定値・テンプレ残骸の差し替えのみで、DB スキーマやシードに依存しない。

## 静的検証

```bash
pnpm typecheck
pnpm lint:fix
pnpm format
```

- `app/config.ts` が `Omit<AppConfig, "appUrl">` に適合し型エラーが出ないこと。

## 自動テスト

統合テストのキュー名（config / test 両側）を変更するため、両層を実行する。

```bash
pnpm test:unit
pnpm test:integration
```

- `app/worker/cloudflare/__tests__/handlers.integration.test.ts` がキュー名変更後もグリーンであること（config と test のキュー名が一致していること）。

## 残骸ゼロ確認

```bash
grep -rn "tanstack-start-template\|TanStack Start Template" . \
  --include="*.ts" --include="*.tsx" --include="*.json" --include="*.toml" --include="*.mjs" --include="*.js" \
  | grep -v node_modules | grep -v "/.issue/" | grep -v "/docs/" | grep -v "/spec/" | grep -v pnpm-lock
```

- コード/設定からの出力が 0 件であること（docs/spec/.issue の歴史的記述は対象外）。

## ブラウザ確認（メタデータ露出）

```bash
pnpm dev   # http://localhost:3000
```

トップページおよび `/about` を開き、ページソース（View Source）の `<head>` を確認:

- `<title>` が `hollow`（またはサブページで `… — hollow`）になっている。
- `<meta property="og:site_name" content="hollow">`。
- `<meta name="apple-mobile-web-app-title" content="hollow">`。
- `<meta name="description" content="…">` が hollow 固有の説明文になっている。
- `"TanStack Start Template"` がページソースのどこにも出現しない。
