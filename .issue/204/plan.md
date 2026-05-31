# 実装計画 — Issue #204: メタタグ・SEO 関連の設定不足

**Issue:** #204
**作成日:** 2026-05-31
**複雑度:** 中〜大規模

---

## 目的

`buildHead()` の仕組みは整っているが利用側が追従していない。ルート単位の `head` 設定（タイトル / path / noindex）と静的アセットを揃え、公開ノートのメタを実データから生成し、構造化データ・`article:*`・`og:locale` 設定駆動を加えて、検索エンジン・SNS 共有・ブラウザタブ識別の体験を整える。

## 調査結果（重要・前提）

### TanStack Router の `head` から loader データに触れる経路（最重要確認事項）

バージョン: `@tanstack/react-router@1.169.2` / `@tanstack/react-start@1.167.65`。

`node_modules/.pnpm/@tanstack+router-core@1.169.2/.../route.d.ts` の `UpdatableRouteOptions.head` シグネチャを直接確認した:

```ts
head?: (ctx: AssetFnContextOptions<...>) => Awaitable<{
  links?; scripts?; meta?; styles?;
}>;
// AssetFnContextOptions = { matches; match; params; loaderData?: ResolveLoaderData<TLoaderFn>; ssr? }
```

判明した事実:
- `head` は `match` / `loaderData` / `params` / `context` を受け取れる。
- `head` は **async 可**（戻り値が `Awaitable<...>`）。
- `head` は `scripts` も返せる → **JSON-LD は `scripts: [{ type: "application/ld+json", children: "<json>" }]` で注入できる**（`<body>` ではなく `<head>` の `HeadContent` に出る）。

**ただし本プロジェクトの公開ルートの loader は構造化データを返していない。** `loader` は `renderServerComponent(<PublicNoteDetail .../>)` の戻り値（不透明な React 要素）を返すため、`match.loaderData` からノートのタイトル / 本文 / 公開日時を取り出すことは**できない**。

→ 結論: **head 専用の軽量メタデータ取得 server fn を別途用意し、`head` を async にしてそれを呼ぶ**。Issue が想定した「loader 二段化」を採る。RSC 本体レンダリング（`renderPublicNote`）はそのまま、メタ用に軽量 server fn を追加する。`getPublicNote` usecase は既に `{ note, owner, tagNames, publishedAt }` を返すので、これを使う server fn を新設すればドメイン/ユースケース層の変更は最小（excerpt / primary image 抽出だけ追加）。

### 関連ファイル

- `app/core/presentation/head.ts` — `buildHead(config, overrides)`。`HeadOverrides`（title/description/path/ogImage/ogType）。`DEFAULT_LOCALE = "ja_JP"` ハードコード、`og:locale` がここ固定。`HeadConfig = { meta, links }`。
- `app/routes/__root.tsx` — デフォルト `head` 適用。`SITE_ASSET_LINKS`（favicon.ico / favicon.svg / apple-touch-icon.png / site.webmanifest を参照）。`<html lang="ja">` 固定。
- `app/config.ts` — `content: Omit<AppConfig,"appUrl">`（siteName/defaultTitle/defaultDescription/themeColor/twitterHandle）。**AppConfig 静的フィールドの SSOT**。`locale` を足すならここ。
- `app/core/application/di/types.ts` — `AppConfig` 型定義（L58）。`locale` を足すならここ。
- `app/core/application/di/serverCloudflare.ts` — `content` を spread して `config` を組む（L569〜575）。
- `app/routes/u/$username/$noteSlug.tsx` — 公開ノート(slug)。現状 `title: ${noteSlug} — @${username}`（誤り）、`ogType:"article"`。loader は RSC 要素を返す。
- `app/routes/notes/public/$noteId.tsx` — 公開ノート(id)。現状 `title: 公開ノート — ${siteName}`（固定）。
- `app/routes/u/$username/index.tsx` — ユーザー公開トップ。head 設定済み（`@${username} — siteName`）。JSON-LD(ProfilePage) 追加対象。
- `app/components/public/PublicNoteDetail.tsx` — `getPublicNote` を呼ぶ RSC。`{ note, owner, tagNames, publishedAt }`、`note.title` / `note.contentHtml` / `note.updatedAt` を使用。
- `app/core/application/publication/getPublicNote.ts` — 公開ノート読み取り usecase。出力 `GetPublicNoteOutput = { note: NoteDTO; owner: UserDTO; tagNames; publishedAt }`。
- `app/core/application/publication/getPublicProfile.ts` — `{ user: UserDTO; publicNoteCount }`。
- `app/core/domain/note/ports/htmlSanitizer.ts` — `toPlainText(html)` で安全なプレーンテキスト化。`container.htmlSanitizer` で request container から利用可。**meta description / excerpt はこれを使う**（HTML stripping を自前実装しない）。`listUserPublicNotes.ts` L80 で `htmlSanitizer.toPlainText(contentHtml).slice(0,200)` の前例あり。
- `public/` — **既に存在**（`robots.txt` のみ。Issue 記載の「public/ が無い」は古い）。Vite のデフォルト public 配信に乗っており Cloudflare `[assets] directory = "./dist/client"`（wrangler.toml）に同梱される。アセット追加先はここ。
- `wrangler.toml` / `vite.config.cloudflare.ts` — `[assets]` binding と public 配信経路を確認済み。設定変更は不要。
- `app/core/presentation/authGuard.ts` — `requireAuthenticatedRoute`（`beforeLoad` ガード）。`settings`/`exports`/`views` の layout `route.tsx` で利用済み。

### ルート棚卸し（Issue 記載と現状の差分）

Issue 執筆時から構成が変わっている。現状 `app/routes` のルートファイルは 53（テスト除く）。head 未設定で**意味のある HTML を返す**ルートをグループ化:

- **layout route（`route.tsx`）**: `_app`, `admin`, `settings`, `exports`, `views`, `_app/notes/$noteId/history`, `u` — ここに head を置くと**子孫にメタが継承**される（TanStack Router は親子の meta を key でマージし子優先）。noindex は layout 単位で一括付与できる。
- **認証必須グループ**（noindex 対象）:
  - `_app/*`: `_app/index`(head済), `_app/notes/new`, `_app/notes/$noteId/{index,edit}`, `_app/notes/$noteId/history/{index,$revisionId}`, `_app/{tags,trash,upload}/index`
  - `admin/*`: `admin/{index,design,jobs,llm,metrics,prompts,registration,users}`
  - `settings/*`: `settings/{profile,security,prompts,account-delete}`
  - `exports/*`: `exports/{index,$jobId}`
  - `views/index`
  - `notes/$noteId/{export,publish}`（layout 外・各自 guard）
  - `export/index`
  - `media/$mediaId`（302 リダイレクト専用 → HTML head 不要。noindex のみ妥当）
- **公開グループ**（index 対象）: `u/$username/index`(head済), `u/$username/$noteSlug`, `notes/public/$noteId`, `about`/`privacy`/`terms`/`search`(head済), `share/$token`(head済・noindex 妥当)。
- **認証フロー**（noindex 妥当）: `login`/`signup`/`setup`/`verify-email`/`password-reset/*`/`email-change/confirm`（多くは head 済）。

### あるべきアーキテクチャ（CLAUDE.md より）

- 依存方向は内向き（presentation → application → domain）。head 組み立ては presentation 層（`head.ts`）に集約する。
- 入力検証は2点のみ（transport 境界 = route の `validateSearch` / server fn の `inputValidator`、value-object 構築）。head 用 server fn も `validateInput` を通す。
- ノート本文からの抜粋は **ドメインのサニタイズ port（`htmlSanitizer.toPlainText`）** を経由する。プレゼンテーションで生 HTML をパースしない。
- スタイリングは utility-first。ただし本 Issue は head/meta 中心で CSS 変更はほぼ無し。
- 設定値（locale 等）は `AppConfig` 経由でプレゼンテーションに渡す。head.ts に新規ハードコードを増やさない。

### 既存実装の状態

- `buildHead` の基本骨格は理想形に一致 → 尊重し、`HeadOverrides` に `noIndex` / `publishedTime` / `modifiedTime` / `authorName` / `tags` を**追加拡張**する。
- `og:locale` ハードコードは乖離 → `AppConfig.locale` 駆動に修正。
- 公開ノート head の title 誤り・固定文言は乖離 → 実データ駆動に修正。
- 多数ルートの head 未設定は乖離 → グループ単位で追加。
- 静的アセット欠落は乖離 → `public/` に placeholder を追加。

### 依存関係

- `head.ts` の `HeadConfig` に `scripts` を足す場合、`__root.tsx` の `head` 戻り値合成（`{ meta, links }`）と矛盾しないこと。JSON-LD は公開ルート側で `scripts` を返す形にし、`buildHead` は `meta`/`links` のみ返す責務を維持（JSON-LD 生成は別ヘルパー関数に分離）。
- `AppConfig.locale` 追加は `app/config.ts` / `types.ts` / `serverCloudflare.test.ts`（AppConfig surface のテスト L728 周辺）に波及する可能性。

## スコープ

### 含まれるもの

- head 未設定の「意味あるルート」へ title / path 追加（グループ単位）
- 公開ノート2ルートの title / description / ogImage を実データ生成
- 認証 / 管理ルートへの noindex（layout route 単位で付与）
- 不足静的アセット（favicon.ico / favicon.svg / apple-touch-icon.png / site.webmanifest / og-image.png）を `public/` に placeholder で追加
- `og:locale` の AppConfig 駆動化（`AppConfig.locale` 追加）
- `buildHead` への `article:*`（published_time / modified_time / author / tag）拡張（公開ノートのみ）
- 公開ノート（Article）・ユーザー公開トップ（ProfilePage）への JSON-LD 埋め込み

### 含まれないもの

- sitemap.xml / robots.txt の生成（#205）。注: `public/robots.txt` は既存だが本 Issue では触らない。
- メタ画像の動的自動生成（将来 Issue）
- アセットのデザイン洗練（placeholder で良い）
- `<html lang>` の locale 駆動化（og:locale のみがスコープ。lang はスコープ外として現状維持）

## 実装ステップ

### 1. `buildHead` の拡張（presentation 層）

- **対象ファイル:** `app/core/presentation/head.ts`
- **変更内容:**
  - `HeadOverrides` に追加: `noIndex?: boolean`, `publishedTime?: string`, `modifiedTime?: string`, `authorName?: string`, `tags?: readonly string[]`。
  - `og:locale` を `config.locale ?? DEFAULT_LOCALE` から出力（`DEFAULT_LOCALE` はフォールバック定数として残す）。
  - `noIndex === true` のとき `{ name: "robots", content: "noindex, nofollow" }` を meta に追加。
  - `ogType === "article"` かつ各値が渡された場合のみ `article:published_time` / `article:modified_time` / `article:author` / `article:tag`（tag は複数）を `property` meta で追加。
  - JSON-LD 用ヘルパー `buildJsonLdScript(data: object): { type: "application/ld+json"; children: string }` を追加。`JSON.stringify` 後に `<` を `<` へ置換（`</script>` XSS 対策）。`HeadConfig` には含めず、ルート側が `head` の `scripts` に載せる。
- **理由:** メタ拡張・locale 駆動化・JSON-LD エスケープを presentation 層に集約。`buildHead` の `meta`/`links` 責務は維持し、JSON-LD は別関数に分離して結合度を下げる。

### 2. `AppConfig.locale` の追加（型・設定 SSOT）

- **対象ファイル:** `app/core/application/di/types.ts`, `app/config.ts`
- **変更内容:** `AppConfig` に `locale: string`（OGP 形式 `ja_JP`）を追加。`app/config.ts` の `content` に `locale: "ja_JP"` を追加。
- **理由:** `og:locale` ハードコード解消。設定 SSOT は `app/config.ts`。`serverCloudflare.ts` は `content` を spread しているので自動で乗る。`serverCloudflare.test.ts` の AppConfig surface 検証に locale が増えるため必要なら期待値を更新。

### 3. 静的アセットの配置

- **対象ファイル:** `public/favicon.svg`, `public/favicon.ico`, `public/apple-touch-icon.png`, `public/site.webmanifest`, `public/og-image.png`
- **変更内容:**
  - `favicon.svg`: 自作のシンプルな図形（単色矩形 + 頭文字）を手書き SVG で生成。**サードパーティ素材は使わない**。
  - `favicon.ico` / `apple-touch-icon.png`(180x180) / `og-image.png`(1200x630): 自作 SVG をラスタライズ、または単色 PNG を生成スクリプトで作る。生成経路（コマンド or スクリプト）を testing.md に明記。
  - `site.webmanifest`: `name`/`short_name`/`theme_color`/`background_color`/`display`/`icons` を含む最小構成。`theme_color` は `config.themeColor` と整合。
- **理由:** `__root.tsx` が参照する全アセットの 404 を解消。`public/` は Vite→`dist/client`→Cloudflare assets に乗るため配置のみで配信される（設定変更不要）。著作物性に配慮し placeholder は自作。

### 4. 認証 / 管理ルートへの noindex 付与（layout 単位）

- **対象ファイル:** `app/routes/_app/route.tsx`, `app/routes/admin/route.tsx`, `app/routes/settings/route.tsx`, `app/routes/exports/route.tsx`, `app/routes/views/route.tsx`
- **変更内容:** 各 layout route に `head: ({ match }) => { const config = match.context?.config; if (!config) return {}; return buildHead(config, { noIndex: true, ... }); }` を追加。layout なので子孫に robots meta が継承される。`_app/route.tsx` は `/`（公開ランディング兼用）を含むため、ここに noindex を置くと公開トップにも乗る点に注意 → **方針は ADR-001 参照**（layout 一括 vs 子ルート個別）。
- **理由:** noindex を1箇所で広くカバー。検索インデックスからの除外。

### 5. head 未設定ルートへの title / path 追加（グループ単位）

- **対象ファイル（グループごとに同型の `head` を追加）:**
  - settings 系: `settings/{profile,security,prompts,account-delete}.tsx`
  - admin 系: `admin/{index,design,jobs,llm,metrics,prompts,registration,users}.tsx`
  - notes 系（認証）: `_app/notes/new.tsx`, `_app/notes/$noteId/{index,edit}.tsx`, `_app/notes/$noteId/history/{index,$revisionId}.tsx`, `notes/$noteId/{export,publish}.tsx`
  - その他認証: `_app/{tags,trash,upload}/index.tsx`, `views/index.tsx`, `exports/{index,$jobId}.tsx`, `export/index.tsx`
- **変更内容:** 各ルートに `head: ({ match, params }) => buildHead(config, { title: "<画面名> — <siteName>", path: "<静的 path>" })`。`config` は `match.context?.config`（既存パターン踏襲、null ガード必須）。動的 path（`$noteId` 等）は `params` から組む。**動的タイトル**（ノート実タイトル）は認証ページでは SEO 不要かつ loader が RSC 要素のため、固定の画面名タイトル（例「ノートを編集 — siteName」）で十分とする。
  - `media/$mediaId.tsx` は 302 専用なので head 追加は不要（noindex も robots.txt 側で既にカバー、HTML を返さない）。
- **理由:** ブラウザタブのタイトル識別。SEO 価値の低い内部ページは固定画面名で十分。

### 6. 公開ノートの動的メタ（実データ駆動 + head 用 server fn）

- **対象ファイル:** `app/routes/u/$username/$noteSlug.tsx`, `app/routes/notes/public/$noteId.tsx`, 新規 head メタ取得ロジック
- **変更内容:**
  - head 専用の軽量 server fn を各ルートに追加（または共通化）: `getPublicNote` usecase を呼び、`{ title, description, ogImage, publishedAt, modifiedTime, authorName, tagNames }` を返す。description は `container.htmlSanitizer.toPlainText(note.contentHtml).slice(0, ~160)`。ogImage は本文最初の画像 URL（無ければ未指定＝デフォルト）。authorName は `owner.displayName`。
    - 本文画像 URL 抽出は presentation で生 HTML をパースしない方針に合わせ、usecase / DTO 側に `primaryImageUrl` を持たせるか、抽出を `htmlSanitizer` 系の責務に寄せる（→ ADR-002）。
  - 各ルートの `head` を **async** にし、この server fn を呼んで `buildHead(config, { title, description, ogImage, ogType:"article", path, publishedTime, modifiedTime, authorName, tags })` を構築。
  - 併せて Article JSON-LD を `buildJsonLdScript` で生成し `scripts` に載せる（ステップ7）。
  - `slug`/`id` 由来の暫定 title を実タイトルに置換。NotFound 時は server fn が `notFound()` 相当を投げないよう握りつぶし `{}` を返す（head はエラー時に握る — Issue のサニタイズ/安全要件）。
- **理由:** SNS 共有・検索結果でノート実タイトル / 抜粋 / 画像を表示。本文サニタイズはドメイン port 経由で安全に。

### 7. JSON-LD 埋め込み（Article / ProfilePage）

- **対象ファイル:** `app/routes/u/$username/$noteSlug.tsx`, `app/routes/notes/public/$noteId.tsx`, `app/routes/u/$username/index.tsx`
- **変更内容:**
  - 公開ノート: `@type: "Article"`（headline / description / datePublished / dateModified / author{Person, name} / image / mainEntityOfPage）を head 用 server fn のデータから組み、`scripts: [buildJsonLdScript(article)]`。
  - ユーザー公開トップ: `@type: "ProfilePage"`（mainEntity{Person, name, alternateName=username, description=bio} / url）。`getPublicProfile` を呼ぶ head 用 server fn を追加。
  - エスケープはステップ1の `buildJsonLdScript`（`<`→`<`）で担保。
- **理由:** 検索エンジンのリッチリザルト対応。エスケープで本文 `</script>` 混入の XSS を防止。

### 8. 動作確認（testing.md 参照）

- 各ルートのページソースで meta / title / robots / JSON-LD が期待通り出力。
- `/favicon.ico` 等が 200。
- 公開ノートの OGP/Twitter Card が実タイトル / 抜粋 / 画像になる。
- 認証 / 管理ページに `<meta name="robots" content="noindex...">`。

## 設計判断（詳細は adr.md）

- **ADR-001:** noindex を layout route で一括付与するか、各子ルートで個別指定するか。`_app` は `/`（公開ランディング兼用）を含むため layout 一括が公開トップに波及するリスク。
- **ADR-002:** 公開ノートの og:image（本文最初の画像）をどの層で抽出するか（usecase/DTO 拡張 vs presentation でのパース回避）。
- **ADR-003:** 公開ノート head のメタ取得を専用 server fn にする（loader 二段化）構成。`match.loaderData` が RSC 要素のため不可避。

## リスクと注意点

- **head の二重 RPC:** 公開ノートで loader（RSC）と head（メタ server fn）が同一データを別々に取得 → 公開ノート読み取りが2回走る。`getPublicNote` は UoW 1トランザクション。SSR 時の追加コストを許容するか、`react` の `cache()` で同一リクエスト内デデュープを検討（`PublicNoteDetail` は既に `cache(serverData(...))` を使用。head 側の server fn が同じ `cache` キーに乗れば重複回避できる可能性 — 要検証）。
- **head async の SSR 影響:** `head` を async にすると初期 HTML 生成前にメタ取得が待たれる。TTFB に影響しうるが SEO/共有のため許容。
- **noindex の波及:** `_app/route.tsx` に noindex を置くと公開ランディング `/` にも付く。`/` を index させたい場合は子ルート個別指定が必要（ADR-001）。
- **JSON-LD エスケープ漏れ:** `JSON.stringify` 後の `<` 置換を必ず通す。テストで `</script>` を含むタイトル/本文ケースを検証。
- **AppConfig surface テスト:** `locale` 追加で `serverCloudflare.test.ts` の AppConfig 検証が落ちる可能性 → 期待値更新。
- **アセット著作物性:** placeholder は自作 SVG ベース。フォント埋め込みや既存ロゴ素材を流用しない。
- **media/$mediaId:** HTML を返さない 302 なので head 追加対象外。誤って head を足さないこと。

## テスト方針

- `head.ts` のユニットテスト追加: locale 駆動 / noIndex / article:* / `buildJsonLdScript` のエスケープ（`</script>`・`<` 混入）。
- ブラウザ（または `curl` + ページソース）で各グループ代表ルートの meta/title/robots/JSON-LD を確認。
- 静的アセットの 200 応答確認。
- Google Rich Results Test / Twitter Card Validator は本番 URL 必要のため、ローカルは JSON-LD の構文（JSON.parse 可能・`@type` 妥当）で代替検証。

## レビュー履歴

### 1周目: 要件カバレッジ / アーキ・リスクの2視点で自己検証 — 主要な技術前提を実コード/型定義で確認のうえ問題点ゼロで終了

**検証して確定した点（修正なし、計画の前提を裏付け）**:
- `head` が async 可・`match.loaderData`/`scripts` を受け取れることを `router-core@1.169.2` の `route.d.ts`（`UpdatableRouteOptions.head` / `AssetFnContextOptions`）で直接確認（→ ADR-003 / ステップ6,7 の前提が成立）。
- 公開ルートの `loader` が `renderServerComponent(...)`（不透明 React 要素）を返すため `loaderData` からメタ抽出不可 → head 用 server fn 二段化が不可避（ADR-003 確定）。
- `_app/index`（`/`）が既に `head` 設定済みで `LandingPage` を返す公開ランディング兼用ルートであることを確認 → noindex を `_app` layout に置かず子個別指定とする ADR-001 の判断が正当。
- `container.htmlSanitizer.toPlainText` が request container で利用可能、`listUserPublicNotes.ts` に `.toPlainText(contentHtml).slice(0,200)` の前例あり → description 生成はドメイン port 再利用で安全（ADR-002 / ステップ6 と整合）。
- `UserDTO` に `displayName`/`username`/`bio`/`createdAt` がある → ProfilePage JSON-LD 構築可（ステップ7）。
- meta は親子マッチで合成され子（より具体的）優先のため、noindex を layout に置けば子へ継承され、子の `buildHead` 出力とキー衝突しない（`robots` は noIndex 指定ルートのみ emit）。
- `public/` は既存（`robots.txt`）で Vite→`dist/client`→Cloudflare `[assets]` に乗る。設定変更不要、配置のみ（ステップ3）。`pnpm start` はプリビルド `dist/client` を配信するためアセット 200 確認には `pnpm build` 必須（MEMORY 既知事項、testing.md に反映済み）。
- `notes/$noteId/publish.tsx` は `beforeLoad` ガード無し（内側 RSC の `requireCurrentUser` 依存）だが、noindex 付与は依然妥当。
