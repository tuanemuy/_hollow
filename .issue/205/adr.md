# ADR — Issue #205: 公開ページの不足

## ADR-001: robots.txt は静的配置を採用する

### Status
Proposed

### Context

robots.txt の提供方法として、以下の選択肢があった:

- 案A: `public/robots.txt` を静的に配置し、Vite の `publicDir` 経由で `dist/client/robots.txt` に出力。Cloudflare の `[assets]` binding（`wrangler.toml` の `directory = "./dist/client"`）から配信。
- 案B: `app/routes/robots[.]txt.tsx` で動的に生成し、`APP_URL` 等を埋め込んだレスポンスを返す。

robots.txt の中身は完全に固定で、認証必須パスの Disallow リストのみ。`Sitemap:` 行は Google / Bing が相対 URL に対応するため絶対 URL である必要がない。

### Decision

**案A（静的配置）を採用する。**

`public/robots.txt` を新規作成し、`Sitemap: /sitemap.xml` を相対指定する。

### Consequences

- 良い点:
  - Worker 起動コストゼロ。CDN/edge のキャッシュが自動的に効く。
  - 既存 `[assets]` binding と一貫した運用（`favicon.ico` / `site.webmanifest` 等と同じ経路）。
  - 実装コストが最小。
- トレードオフ:
  - `Sitemap:` を絶対 URL にしたい / 環境ごと（staging/prod）に内容を変えたい要件が出た場合は動的化が必要。現状は不要。
  - 認証必須パスを増やした際の Disallow 更新漏れリスクは運用ルール（README 対照表）でカバーする。
  - **`vite.config.cloudflare.ts` に `publicDir` 設定が無く、リポジトリに `public/` ディレクトリも存在しないため、Vite のデフォルト `<root>/public` → `dist/client/` コピーが実際に発生するか未確認**。Step 7 の実装後に `pnpm build` を実行し `dist/client/robots.txt` の存在を確認する。

### フォールバック

`dist/client/robots.txt` が生成されない、または `[assets]` 経由で配信されない場合は、`app/routes/robots[.]txt.tsx` で動的化する:

```tsx
import { createFileRoute } from "@tanstack/react-router";
const ROBOTS_TXT = `User-agent: *\nDisallow: ...\nSitemap: /sitemap.xml`;
export const Route = createFileRoute("/robots.txt")({
  loader: () => {
    throw new Response(ROBOTS_TXT, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
});
```

判断は実装時。フォールバック発動の場合は ADR を追記する。

---

## ADR-002: sitemap.xml は動的ルートで生成し、CDN キャッシュで負荷を吸収する

### Status
Proposed

### Context

sitemap.xml は公開ノートを動的に列挙する必要がある。クローラからのアクセスが続いた際に D1 を圧迫しないキャッシュ戦略が必要。

選択肢:
- 案A: 動的ルートで毎回 D1 を叩く（キャッシュなし）
- 案B: 動的ルート + `Cache-Control` で Cloudflare edge にキャッシュさせる
- 案C: ビルド時に静的生成（公開ノートの追加が即座に反映されない）

### Decision

**案B（動的ルート + edge キャッシュ）を採用する。**

- `app/routes/sitemap[.]xml.tsx` で動的レスポンス
- `Cache-Control: public, max-age=300, s-maxage=600` — ブラウザ 5 分 / エッジ 10 分
- `publicationStateRepository.findAllPublic({ limit: 1000 })` で件数を頭打ち
- application 層に `listSitemapEntries` usecase を新設し、presentation → domain 直叩きを回避
- **公開ノート URL 形式は `${appUrl}/u/<username>/<note-slug>`、公開トップは `${appUrl}/u/<username>`**（既存ルート `app/routes/u/$username/$noteSlug.tsx` に整合）
- **`<lastmod>` は `updatedAt.toISOString()`** （W3C Datetime / ISO 8601）
- **静的 URL（`/`, `/signup`, `/login`, `/search`, `/terms`, `/privacy`, `/about`）は presentation 層（route）で結合**し、usecase は動的部分のみ返す（presentation 知識を application に漏らさない）
- **公開ノート取得は既存の `noteRepository.findByIds`**（read-only listing 用途、N+1 回避済み）を使う
- **`userRepository` には read-only バルクポートが無いため、`findByIds(ids): Promise<readonly User[]>` を新設**する（`NoteRepository.findByIds` と同じパターン）。`findById` は OCC token 込みの `Versioned<User>` を返す write-after-read 用途であり、read-only listing で使うのは `TransactionalRepository` の契約（line 44-47「Read-only access patterns ... live as additional methods on the concrete repository interface」）に反するため避ける

### Consequences

- 良い点:
  - 公開ノート追加が最大 10 分で sitemap に反映される（クローラの再取得周期と整合）。
  - D1 への負荷はキャッシュで吸収される。
  - usecase 層に責務が集約され、テスタブル。
  - 静的 URL を presentation に置くことで application 層がルート定義に依存しない。
- トレードオフ:
  - 公開ノートが 1000 件を超えた時は `sitemap-index.xml` 化が必要（フォロー Issue 候補）。
  - キャッシュ最大 10 分の鮮度遅延。クローラ用途では問題なし。
  - `findById` ループによる N+1 は limit=1000 で頭打ち。キャッシュで吸収されるため許容。

---

## ADR-003: 法的文書 Markdown は `app/content/legal/` 配置 + Vite `?raw` インポート

### Status
Proposed

### Context

Cloudflare Workers ランタイムは FS API を持たないため、`fs.readFile` 等は使えない。法的文書を動的に読み込む手段が必要。

選択肢:
- 案A: `spec/legal/` に置き、ビルド時に `dist/client/` にコピー（静的アセット経由で fetch）
- 案B: `app/content/legal/` に置き、Vite の `?raw` インポートでバンドルに同梱
- 案C: `__root.tsx` で DB に挿入し DB から取得

### Decision

**案B（`app/content/legal/` + `?raw` インポート）を採用する。**

`app/content/legal/{terms,privacy,about}.md` を配置し、ルート側で `import md from "@/content/legal/terms.md?raw"` の形で文字列として取り込む。

### Consequences

- 良い点:
  - Workers ランタイム互換性が確保される（FS 不要）。
  - ビルド時にバンドルされるため取得失敗のエラーパスが不要。
  - Markdown を spec ではなく app に置くことで、設計（spec）と配信（app）の責務が分離される。
- トレードオフ:
  - `*.md?raw` の型宣言を `vite-env.d.ts` に追加する必要がある。
  - Markdown を変更するたびにビルドが必要（雛形運用としては許容範囲）。

---

## ADR-004: about ページの AppConfig 差し込みは単純テンプレート置換

### Status
Proposed

### Context

about ページに `siteName` / `appUrl` / `twitterHandle` 等の動的値を差し込む必要がある。完全な templating engine は過剰。

`appVersion` を表示するために Vite の `define` で `package.json` の `version` を埋め込む案も検討したが、`vite.config.cloudflare.ts` に既存の `define:` 設定が無く、対応するアンビエント宣言の追加も必要になる。AppConfig にも `appVersion` フィールドは存在しない。本 Issue の MVP スコープに見合うか不明。

### Decision

`{{siteName}}` 形式の単純な文字列置換を about ページのみで実施する。Markdown → HTML 変換前に置換し、その後 `HtmlSanitizer` を通すことで安全性を担保する。

**置換キーは `{{siteName}}` / `{{appUrl}}` / `{{twitterHandle}}` の 3 つに限定する。`{{appVersion}}` は本 Issue の MVP スコープから除外し、必要なら別 Issue で AppConfig 拡張＋ Vite define 設定を導入する。**

### Consequences

- 良い点:
  - YAGNI を守る（templating ライブラリ追加なし、Vite config 変更なし）。
  - sanitize 経路は既存のままで安全。
  - 置換ロジックが 5 行程度で完結する。
- トレードオフ:
  - 置換ロジックが about 専用で、terms / privacy には流用しない。これは意図的な設計判断。
  - バージョン表示は別 Issue に分離（運用要件次第）。

---

## ADR-005: spec 番号は P08 / P09 / P09b を採用

### Status
Proposed

### Context

新規 3 ページに付与する番号体系。既存は P01〜P07 / P30〜P34 が定義済みで、P08〜P29 は未使用。

選択肢:
- 案A: P08 / P09 / P09b（Issue 提案通り）
- 案B: P08 / P09 / P10（純粋連番、ただし P10 以降を全てずらす破壊的変更）

### Decision

**案A（P08 / P09 / P09b）を採用する。**

既存の `P01b`（初期管理者セットアップ）や `P11h` 等で b サフィックスが既に使われているため、命名規則として一貫する。

### Consequences

- 良い点:
  - 既存 P 番号への影響なし。
  - 命名規則の一貫性。
- トレードオフ:
  - 純粋連番ではない。

---

## ADR-006: `.note-detail-content` を再利用し新規 CSS を追加しない

### Status
Proposed

### Context

法的文書 3 ページの Markdown レンダリング先に新しい `@layer components` クラスを追加するか、既存の `.note-detail-content` を流用するか。

CLAUDE.md ADR-002 は「`dangerouslySetInnerHTML` を使う Markdown レンダリング先のみ `@layer components` 例外を認める」と明記している。新規追加には ADR レビューが必要。

### Decision

**既存の `.note-detail-content` を流用する。**

`<article className="note-detail-content max-w-prose mx-auto py-8 px-4">` のように、外側のラッパに既存クラスを当てる。新規クラスは追加しない。

### Consequences

- 良い点:
  - CLAUDE.md ADR-002 の例外を増やさない。
  - スタイルの一貫性（公開ノートと同じ見た目）。
- トレードオフ:
  - クラス名の意味（"note-detail"）が法的文書には厳密にはマッチしない。許容範囲。

---

## ADR-007: 法的文書のサニタイズポリシーは `allowMedia: false` / `allowInternalLinks: false`

### Status
Accepted（実装時に決定）

### Context

`LegalDocument` から `HtmlSanitizer.sanitize` を呼び出す際の `SanitizePolicy` を決める必要がある。Note 本文は `allowMedia: true, allowInternalLinks: true` だが、法的文書 / インスタンス情報ページは:

- 画像 / 動画を埋め込む要件がない（雛形に `<img>` 等は登場しない）
- `[[...]]` 内部リンク記法も使われない（公開閲覧者は他ユーザーのノート ID 体系を知らない）

不要な機能を許容するとサニタイズ通過後に予期しないノードが残るリスクがあるため、明示的に最小ポリシーに落とす。

### Decision

`LegalDocument` 内で `sanitize(rawHtml, { allowMedia: false, allowInternalLinks: false })` を固定で呼ぶ。`SanitizePolicy` を `LegalDocument` の props で外部から差し替え可能にはしない（YAGNI）。

### Consequences

- 良い点:
  - 法的文書経路に意図しないメディア / 内部リンク記法が紛れ込んでも、サニタイズ段階で安全に除去される。
  - ポリシーを 1 か所に閉じ込められる。
- トレードオフ:
  - 将来「インスタンス情報ページにロゴ画像を入れたい」等の要件が出たら、`LegalDocument` の props に `policy?: SanitizePolicy` を追加するか、別コンポーネントに分岐する。現時点ではその要件はない。

---

## ADR-008: about ページのテンプレ置換は route 内のローカル関数で完結する

### Status
Accepted（実装時に決定）

### Context

`{{siteName}}` / `{{appUrl}}` / `{{twitterHandle}}` の置換ロジックをどこに置くかの判断:

- 案A: `LegalDocument` の props として `substitutions: Record<string, string>` を受け取り、コンポーネント側で置換
- 案B: 共通ユーティリティ（`app/lib/` または `app/core/presentation/`）に切り出す
- 案C: `app/routes/about.tsx` 内のローカル関数として完結させる

レビュー 1 周目で「about 専用ロジックが 5 行程度で完結するため YAGNI、関数化はしない」と判断済み（plan.md 視点1 [S-002] 見送り）。

### Decision

**案C を採用する。** `applyAboutSubstitutions` は `app/routes/about.tsx` 内の private な関数として実装する。`LegalDocument` 自体は markdown 文字列を受け取るだけのシンプルな契約に保つ。

### Consequences

- 良い点:
  - `LegalDocument` の props が `{ markdown: string }` のみで済み、契約が最小。
  - terms / privacy（置換不要）と about（置換あり）の差分が route 層に閉じる。
- トレードオフ:
  - 将来 terms / privacy にも置換が必要になったら関数を共有層に上げる必要がある。現時点ではその要件はない。

---

## ADR-009: `?raw` で取り込んだ Markdown はサーバー側でのみ変換し RSC ペイロードに含めない

### Status
Accepted（実装時に決定）

### Context

ルート (`terms.tsx` / `privacy.tsx` / `about.tsx`) の `?raw` インポートは server-fn handler 内でのみ参照され、`renderServerComponent(<PublicLayout><LegalDocument markdown={...} /></PublicLayout>)` を返す。`LegalDocument` 自体は async server component として `loadServerDeps` 経由で `markdownConverter.toHtml` と `htmlSanitizer.sanitize` を呼び出すため、クライアントには既にサニタイズ済みの HTML 文字列だけが届く。

### Decision

Markdown → HTML 変換は **サーバーサイドで完結** させる。`?raw` 文字列も変換済み HTML もクライアントバンドルには持ち込まない。

### Consequences

- 良い点:
  - クライアントバンドルに Markdown 変換ライブラリや雛形テキスト全文を含めずに済む。
  - SSR で生成された HTML がそのまま RSC ペイロードとして送出され、CDN キャッシュとも親和性が高い。
- トレードオフ:
  - クライアントから markdown を編集 / 再変換するパスは存在しない。本 Issue では不要。

---

## ADR-010: `/sitemap.xml` は server.cloudflare.ts の fetch handler で先取りする

### Status
Accepted（実装時に決定）

### Context

当初の計画（ADR-002）では `app/routes/sitemap[.]xml.tsx` を file route として実装し、loader 内で `throw new Response(xml, { ... })` する想定だった。

しかし実装後の検証で、TanStack Start の loader → server function パイプラインは戻り値を RSC RPC 層でシリアライズする設計のため、生の XML を `Response` として直接返せないことが判明:

- `createServerFn` の handler 内で `throw new Response(...)` すると "Server function failed: unknown error" として捕捉され、HTML エラーページが返される
- loader の戻り値も JSON シリアライズされ、`Content-Type: application/xml` を保てない
- `throw redirect(...)` は TanStack Router が特殊に処理するが、他の `Response` オブジェクトはサポートされない

### Decision

`app/routes/sitemap[.]xml.tsx` を削除し、`app/server.cloudflare.ts` の `fetch` ハンドラ内で `/sitemap.xml` を先取りして `buildSitemapResponse(container)` を呼ぶ。XML 生成ロジックは `app/core/presentation/sitemapHandler.ts` に分離する。

```ts
return storage.run(container, async () => {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/sitemap.xml") {
    return buildSitemapResponse(container);
  }
  return defaultEntry.fetch(request);
});
```

### Consequences

- 良い点:
  - 生の XML を `Content-Type: application/xml; charset=utf-8` でそのまま返せる。
  - TanStack Start の RSC ペイロード / クライアントバンドルに sitemap ロジックが混入しない。
  - presentation 層（`sitemapHandler.ts`）が usecase を呼ぶ構造は維持され、application 層は変更なし。
- トレードオフ:
  - File route 経由ではないため、TanStack Router のルートメタデータ（head タグ等）は適用されない。sitemap.xml に head は不要なので問題なし。
  - 将来 TanStack Start が raw Response を loader からサポートした場合は、再度 file route に戻す選択肢を検討できる。
