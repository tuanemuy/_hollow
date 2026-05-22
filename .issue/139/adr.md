# ADR — Issue #139: WorkersRoute を Pulumi から wrangler.toml に移管

## ADR-001: Route 宣言を wrangler テンプレートにハードコード

### Status
Accepted

### Context
Route の `pattern` は hostname を含む。hostname は現状 Pulumi 側 (`infra/Pulumi.<stage>.yaml`) で stage 毎に設定されている。テンプレート変数化（renderWrangler.ts から hostname を注入）するか、テンプレートに直書きするかの選択肢があった。

### Decision
テンプレート（`infra/templates/wrangler.<stage>.toml.tmpl`）に直書きする。

### Consequences
- 良い点:
  - renderWrangler.ts に追加変数を増やさず、変更面を最小化できる
  - テンプレートを読めば route が一目で分かる
  - 各 stage で 1 行ずつ、合計 2 行のハードコードで済む（DRY の懸念は無視できる規模）
- トレードオフ:
  - hostname を変える場合に `Pulumi.<stage>.yaml` と wrangler テンプレートの 2 箇所を更新する必要がある（コメントで両者の同期を促す）

---

## ADR-002: `zone_id` ではなく `zone_name` を使用

### Status
Accepted

### Context
wrangler の `routes` は `zone_id` または `zone_name` を受け取る。Pulumi 側では `cloudflare.getZoneOutput({ filter: { name: cfg.zoneName } })` で zone_id を解決していたが、wrangler テンプレートに zone_id を直書きすると CF アカウント固有の secret-ish な ID をリポジトリに残すことになる（実害は薄いが冗長）。

### Decision
`zone_name = "maku-ja.com"` を使う。wrangler が deploy 時に Cloudflare API で zone_id を解決する。

### Consequences
- 良い点: テンプレートが人間に読みやすく、zone を引っ越す場合も zone_name 変更だけで済む
- トレードオフ: deploy 時に CF API 呼び出しが 1 回増えるが無視できるオーバーヘッド

---

## ADR-003: AAAA プレースホルダは Pulumi 側に残す

### Status
Accepted

### Context
Cloudflare の proxied ルート発火には、ホスト名に対応する DNS レコードが必要。現状 Pulumi は `100::` という placeholder AAAA を `proxied: true` で作っている。Issue の指示は「DNS の AAAA レコードは残す」。

### Decision
AAAA レコードは Pulumi 側に残す。`infra/src/dns.ts` の関数名は `createDns` に改名（route 責務を外したため `createDnsAndRoutes` のままだと誤解を招く）。

### Consequences
- 良い点: Pulumi=DNS、wrangler=Workers + Routes という綺麗な境界
- トレードオフ: AAAA が「Worker route のためのプレースホルダ」という事実は comment に残して誤削除を防ぐ

---

## ADR-004: Pulumi state からの削除は手動オペレーション

### Status
Accepted

### Context
PR マージ後の CI 実行で Pulumi up が走る。WorkersRoute リソースが Pulumi コードから消えた状態で pulumi up すると、Pulumi は「削除されたリソース」とみなして Cloudflare 上から実リソースを destroy しに行く。これでは本番ルートが消える。

### Decision
`pulumi state delete` を**手動オペレーション**として PR description のチェックリストに置き、マージ前に staging / production 両方で実施することを必須化する。CI で自動化しない。

### Consequences
- 良い点: state 操作という重要オペレーションを人間が意識的に実行する。CI で自動化すると一度きりの操作にロジックを増やす羽目になる
- トレードオフ: 手順を見逃すと事故るため、PR description のチェックリスト化と staging 先行で安全側に倒す
