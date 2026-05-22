# 実装計画 — Issue #139: refactor(infra): WorkersRoute を Pulumi から wrangler.toml に移管

**Issue:** #139
**作成日:** 2026-05-23
**複雑度:** 中〜大規模

---

## 目的

Pulumi が `WorkersRoute` を Worker 本体より先に作成しようとして失敗するチキン&エッグ問題を解消する。Route 管理を Pulumi から外し、`wrangler.staging.toml` / `wrangler.production.toml` の `routes` フィールドに移す。

## スコープ

### 含まれるもの

- `infra/src/dns.ts` から `WorkersRoute` リソースを削除（AAAA レコードは残す）
- `infra/src/index.ts` から `routePattern` export を削除
- `infra/templates/wrangler.staging.toml.tmpl` / `wrangler.production.toml.tmpl` の **トップレベル**（web Worker）に `routes` を直書き
- `infra/Pulumi.yaml` の description から「Worker Routes」を削除
- `docs/runtime_cloudflare.md` の関連記述を更新（Pulumi が DNS/D1/Queues/R2 を扱い、Routes は wrangler 側へ）
- 操作手順として `pulumi state delete` コマンドを testing.md / PR description に記載

### 含まれないもの

- AAAA レコードの撤去（Cloudflare Proxy 経由のルーティングには DNS レコードが必要なので残す）
- `infra/scripts/renderWrangler.ts` の変更（現状すでに route を扱っていないため変更不要）
- production の本番反映そのもの（メンテナンスウィンドウを要するため、PR 上は変更とドキュメントの提供までを行う）
- 他 Worker（relay / consumer / pruner / dlq）への routes 追加（public route を持つのは web のみ）

## 実装ステップ

### 1. `infra/src/dns.ts` から WorkersRoute を削除

- **対象ファイル:** `infra/src/dns.ts`
- **変更内容:**
  - `cloudflare.WorkersRoute` の宣言と return の `route` を削除
  - `workerNames` import と `scripts` 取得を削除
  - 関数名を `createDnsAndRoutes` から `createDns` に変更（責務に合わせる）
  - 戻り値の型 `DnsOutput` は維持し、`{ aaaa, zone }` を返す
  - AAAA レコードの comment を `Placeholder AAAA for proxied Worker route (route itself is managed by wrangler.<stage>.toml — see ${cfg.appName}/${cfg.stage})` に更新し、責務移管後の役割を明示
- **理由:** Worker 本体より先に Route を作成しようとして CF API が 10019 を返すため、Pulumi 管理から外す

### 2. `infra/src/index.ts` の routePattern export を削除と関数呼び出し更新

- **対象ファイル:** `infra/src/index.ts`
- **変更内容:**
  - `import { createDnsAndRoutes } from "./dns.ts"` → `import { createDns } from "./dns.ts"`
  - `const dns = createDnsAndRoutes(cfg);` → `const dns = createDns(cfg);`
  - `export const routePattern = dns.route.pattern;` の行を削除
- **理由:** routePattern を消費する側はなく、Route を Pulumi で管理しなくなるため

### 3. wrangler ステージテンプレートに routes を直書き

- **対象ファイル:**
  - `infra/templates/wrangler.staging.toml.tmpl`
  - `infra/templates/wrangler.production.toml.tmpl`
- **変更内容:**
  - **トップレベル**（web Worker、`name = "${WORKER_WEB}"` の直下、`[assets]` の前後どこかの自然な位置）に以下を追加:
    ```toml
    # Route — must stay in sync with infra/Pulumi.staging.yaml (hollow:hostname + hollow:zoneName).
    routes = [
      { pattern = "staging.hollow.maku-ja.com/*", zone_name = "maku-ja.com" }
    ]
    ```
    production テンプレートでは `hollow.maku-ja.com/*` + 対応コメントにする。
  - `zone_name` を使い、wrangler 側で zone_id を解決させる（テンプレートに ID を直書きしない設計を尊重）
  - 他 Worker（relay/consumer/pruner/dlq）は public route を持たないので追加しない
  - **renderWrangler.ts は変更不要** — StackOutput 型に `routePattern` フィールドはもともとなく、削除する `routePattern` export は renderer が読み取っていない
- **理由:** wrangler は Worker デプロイと Route 適用がアトミックなので、チキン&エッグが起きない。`zone_name` は wrangler 公式サポートで、ID 解決を CF API に任せられる

### 4. `infra/Pulumi.yaml` の description 更新

- **対象ファイル:** `infra/Pulumi.yaml`
- **変更内容:** description の「Worker Routes」記述を削除。例:
  ```yaml
  description: |
    Hollow — Cloudflare infrastructure (D1, Queues, DNS, R2).
    Worker scripts and routes are deployed by wrangler from CI; this
    stack provisions everything Workers depend on and emits the IDs /
    names that the wrangler config templates consume.
  ```
- **理由:** Pulumi スタックの責務記述を実態と一致させる

### 5. `docs/runtime_cloudflare.md` の更新

- **対象ファイル:** `docs/runtime_cloudflare.md`
- **変更内容:**
  - 「Wrangler config layout」セクションに、`routes` が各 stage の wrangler テンプレートで管理されている旨と、変更時に Pulumi.yaml の `hostname` と同期する必要があることを 2-3 行で追加
  - 「One-time Cloudflare resource creation」セクション（または近接する DNS / Pulumi 記述箇所）に、AAAA プレースホルダ（`100::`）が proxied route 発火のために Pulumi が作成・維持しており、削除すると route が機能しなくなる旨を明示
  - Pulumi の責務記述が「DNS と Worker Routes」になっている箇所があれば「DNS のみ（Worker Routes は wrangler 側）」に修正
- **理由:** ハイブリッド構成の現状を正しくドキュメント化し、後続のオペレータが誤解しないようにする

### 6. Pulumi state からの既存リソース削除（操作手順）

- **対象:** Cloudflare 上の `WorkersRoute`（staging / production）の Pulumi state エントリ
- **作業内容（PR description / testing.md に記載、CI で自動化はしない）:**
  ```bash
  cd infra
  pulumi state delete --stack staging   'urn:pulumi:staging::hollow::cloudflare:index/workersRoute:WorkersRoute::route-staging'
  pulumi state delete --stack production 'urn:pulumi:production::hollow::cloudflare:index/workersRoute:WorkersRoute::route-production'
  ```
- **実施タイミング（必ずこの順序で）:**
  1. PR マージ**前**に staging で `pulumi state delete --stack staging ...` 実施
  2. PR マージ**前**に production でも同コマンド実施
  3. PR マージ → deploy-staging.yml の Pulumi up が走る → state には WorkersRoute がもう無いので no-op、destroy は発生しない
  4. 続いて CI の `wrangler deploy` が web Worker と routes を一括適用 → Cloudflare 側のルートはそのまま、管理元だけ wrangler に切り替わる
- **見落とした場合のリカバリー:** Pulumi up が WorkersRoute を destroy してしまった場合、`wrangler deploy --config wrangler.<stage>.toml` を即時実行すれば routes ブロックから再作成される（ダウンタイムは destroy 〜 deploy 完了の数十秒〜数分）
- **理由:** リソース本体は wrangler が管理することにしたが、Cloudflare 上の現実のルートを残したまま Pulumi の管理範囲だけ外す必要がある

## 設計判断

詳細は `adr.md` 参照。要点:

- **ADR-001**: Route の宣言を wrangler テンプレートにハードコード（テンプレート変数化しない）
- **ADR-002**: `zone_id` ではなく `zone_name` を使用
- **ADR-003**: AAAA レコードは Pulumi 側に残す
- **ADR-004**: Pulumi state からの削除は手動オペレーションとして PR description に明記（CI 自動化しない）

## リスクと注意点

- **destroy 誤操作**: `pulumi state delete` ではなく `pulumi destroy` を打つと Cloudflare 上の実リソースが消える。staging で先に試して挙動を確認する。
- **CI 実行順序**: Step 6 の state delete をマージ前に実施しないと、初回 CI の Pulumi up でルートが削除される。マージ前手順として PR description のチェックリストに置く。
- **DNS 必要性**: AAAA プレースホルダがないと、proxied 経由のルート発火が起きないため AAAA は絶対残す。
- **production 反映タイミング**: production はメンテナンスウィンドウを推奨。state delete → wrangler deploy が短時間で完了するなら影響は無視できるが、念のため低トラフィック帯で実施。
- **route 衝突**: wrangler が `routes` を初めて適用する際、すでに Cloudflare 側で同じ pattern のルートが存在するので、wrangler は既存ルートを再関連付けるか上書きする想定。挙動は staging で確認する。

## テスト方針

詳細は `testing.md` を参照。要点:

- `pnpm infra:render:staging` がエラーなく走り、`wrangler.staging.toml` に `routes = [...]` ブロックが含まれる
- `wrangler deploy --dry-run` で web Worker のビルドに失敗がない
- `pnpm infra:preview:staging` でルート削除以外の差分がないこと（staging 環境で実機検証）
- 本番反映は手順だけ用意し、PR スコープでは行わない

## レビュー履歴

### 1周目

**修正した点（要件レビュー）:**
- P-001: テンプレートにコメント `# Route — must stay in sync with infra/Pulumi.<stage>.yaml (...)` を追加し、Pulumi.yaml との同期を促す（Step 3）
- P-003: docs/runtime_cloudflare.md の追加場所を「Wrangler config layout」と「One-time Cloudflare resource creation」と具体化（Step 5）

**修正した点（アーキレビュー）:**
- P-002: state delete の実施タイミングを「マージ前 staging → マージ前 production → マージ → CI Pulumi up no-op → CI wrangler deploy」と順序を明示し、見落とし時のリカバリー手順も追加（Step 6）
- P-003: AAAA レコードの comment を `Placeholder AAAA for proxied Worker route (route itself is managed by wrangler.<stage>.toml ...)` に更新し責務を明示（Step 1）

**見送った提案とその理由:**
- 要件レビュー P-002（routePattern 削除の影響確認）: 既に renderWrangler.ts を確認済みで StackOutput 型に `routePattern` フィールドはなく問題なし。Step 3 末尾に明記。
- アーキレビュー P-001（zone_name の StackOutput 出力）: テンプレート直書き方針（ADR-001/002）と整合。renderer 拡張は不要。
- S-001（zone_name 変数化の将来拡張）: Issue スコープ外。ハードコード 2 箇所で実用上問題なし。
- S-002（state delete 漏れリカバリー）: P-002 修正で取り込み済み。

### 2周目: 両視点とも問題点ゼロで終了（実施せず）

1周目で挙がった指摘がすべてスコープ内で解消されたため、2周目は省略する。残課題は無し。
