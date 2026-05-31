# ADR — Issue #204: メタタグ・SEO 関連の設定不足

## ADR-001: noindex の付与単位（layout route 一括 vs 子ルート個別）

### Status
Proposed

### Context
認証必須・管理ページに `noindex` を付けたい。TanStack Router は layout route（`route.tsx`）の `head` が返す meta を子孫にマージするため、layout 1箇所に置けば配下全ルートに一括適用できる。対象 layout: `_app`, `admin`, `settings`, `exports`, `views`。
ただし `_app/route.tsx` は `/`（未認証訪問者にランディングを出す唯一の認証ルート）を含む。ここに `noindex` を置くと**公開ランディングページにも noindex が乗る**。

### Decision
- `admin` / `settings` / `exports` / `views` は完全に認証専用なので **layout route に一括付与**する。
- `_app` は `/` を含むため layout 一括は避け、`_app` 配下の**個別の認証ページ**（`notes/new`, `notes/$noteId/*`, `tags/trash/upload/index` 等）に `noIndex: true` を指定する。`_app/index.tsx`（= `/`）は noindex を付けない（公開ランディングは index 可）。
- layout 外の `notes/$noteId/{export,publish}` も各ルートで個別付与。

### Consequences
- 良い点: 公開トップを誤って検索除外しない。管理系は1箇所で広くカバー。
- トレードオフ: `_app` 配下は個別指定が必要で漏れが起きうる → testing.md のチェックリストで全認証ルートの robots meta を確認する。

---

## ADR-002: 公開ノート og:image（本文先頭画像）の抽出層

### Status
Proposed

### Context
公開ノートの og:image に「本文中の最初の画像」を使いたい。本文は `note.contentHtml`（サニタイズ済み HTML）。CLAUDE.md の方針では presentation 層で生 HTML をパースしない（抽出はドメイン port 経由）。

選択肢:
1. presentation の head server fn で `contentHtml` を正規表現/DOM パースして最初の `<img src>` を拾う。
2. `getPublicNote` usecase / `NoteDTO` に `primaryImageUrl: string | null` を持たせ、抽出をドメイン側（`htmlSanitizer` 隣接の責務 or NoteService）で行う。

### Decision
当面は **デフォルト og-image にフォールバックし、本文先頭画像の抽出は最小実装にとどめる**。実装するなら選択肢2（usecase/DTO 拡張）を採り、抽出ロジックをドメイン/アプリ層に置く。presentation での生 HTML パースは避ける。
画像抽出が複雑化する場合は「デフォルト og-image を使う」で割り切る（Issue は「本文中の最初の画像を OG 画像として使う**等**」と例示にとどめており必須ではない）。description（`toPlainText`）と article:* / JSON-LD を優先実装する。

### Consequences
- 良い点: presentation がサニタイズ port を再利用し、HTML パースの XSS/壊れ HTML リスクを domain に閉じ込める。
- トレードオフ: 本文先頭画像を確実に出すには usecase/DTO 拡張が必要で工数増。MVP はデフォルト画像で妥協可能。

---

## ADR-003: 公開ノート head のメタ取得（loader 二段化）

### Status
Proposed

### Context
`head({ match })` は `match.loaderData` にアクセスできる（router-core 1.169.2 で型確認済み）が、本プロジェクトの公開ルートの `loader` は `renderServerComponent(...)` の戻り値（不透明な React 要素）を返すため、loaderData からノートのタイトル/本文/公開日時を取り出せない。

### Decision
head 専用の軽量メタデータ取得 server fn を新設し、`head` を async にしてそれを呼ぶ（RSC 本体レンダリング loader はそのまま）。server fn は既存 `getPublicNote` / `getPublicProfile` usecase を再利用し、title/description/publishedAt/author/tags（必要なら image）を返す。`validateInput` で transport 境界検証を通す。

### Consequences
- 良い点: RSC レンダリングとメタ取得を分離。usecase を再利用しドメイン変更を最小化。
- トレードオフ: 同一公開ノートデータを loader と head で二重取得しうる（plan.md リスク参照）。`react` の `cache()` による同一リクエスト内デデュープを検証して緩和する。

---

## ADR-004: 内部ルート head の共通ヘルパー化（internalRouteHead）

### Status
Accepted

### Context
ステップ5 の対象は admin / settings / exports / views / `_app` 配下など 20 以上のルートに及び、いずれも「`config` null ガード → `buildHead(config, { title, path, noIndex: true })`」という同型コードになる。既存ルートは null ガードをインラインで書く慣習だが、20+ 箇所のコピペは保守性を損ねる。

### Decision
presentation 層の `head.ts` に `internalRouteHead(config, title, path)` を追加。`config` 未解決時は `{}` を返し、解決時は `buildHead(config, { title: "<title> — <siteName>", path, noIndex: true })` を返す。認証/管理の単純な内部ページはこのヘルパーで統一する。
loader 二段化が必要な公開ルート（公開ノート2本・ユーザー公開トップ）と、layout route／`_app` 配下の noindex 付きルートはインライン `buildHead` のままとし、ヘルパーは「title + noindex のみの内部ページ」専用に絞る。

### Consequences
- 良い点: 20+ ルートの head が1行で書け、`— siteName` 連結と noindex の付け忘れを防げる。
- トレードオフ: head 設定パターンが「インライン」と「ヘルパー」の2系統に分かれる。ヘルパーは内部ページ専用と用途を限定して混乱を抑える。

---

## ADR-005: 静的 placeholder アセットの生成手順

### Status
Accepted

### Context
`__root.tsx` が参照する favicon.ico / favicon.svg / apple-touch-icon.png / site.webmanifest / og-image.png が未配置で 404。サードパーティ素材は使わず自作 placeholder を生成する。

### Decision
手書き SVG（単色矩形 + 頭文字「H」）を起点に ImageMagick でラスタライズした。生成コマンド（`public/` で実行）:

```
magick -background none favicon.svg -resize 180x180 apple-touch-icon.png
magick -background none favicon.svg -define icon:auto-resize=16,32,48 favicon.ico
magick og-image.svg og-image.png
```

- `public/favicon.svg`（手書き、64x64、ダーク矩形 + 白文字 H）
- `public/og-image.svg`（手書き、1200x630、ダーク背景 + ロゴ枠 + サイト名）→ `og-image.png`
- `site.webmanifest` は name/short_name/theme_color/background_color/display/start_url/icons の最小構成。`theme_color` は `config.themeColor`（#ffffff）と整合。

### Consequences
- 良い点: 全アセットの 404 を解消。SVG ソースを残したので再生成・差し替えが容易。
- トレードオフ: ImageMagick の text レンダリングで PNG がグレースケール化した（テキスト描画パスの都合）。placeholder としては許容範囲。デザイン洗練は別 Issue。再生成には ImageMagick（`magick`）が必要。

---

## ADR-006: canonical 重複の解消と複数タグの構造化データ表現（ブラウザ検証で発見）

### Status
Accepted

### Context
ブラウザ検証（curl による SSR ページソース確認）で2点判明した:
1. `__root.tsx` の root head が `buildHead(config)` の既定 canonical（`/`）を出力し、各ルートも自前 canonical を出すため `<link rel="canonical">` が2つレンダリングされていた。TanStack Router は meta を `property` キーで dedup するが links は dedup しない。Google は複数 canonical を宣言したページの canonical を全て無視するため、既存の canonical 機能が実質無効化していた。head 未設定だった33ルートに head を追加したことで、この重複が全ページに波及した。
2. `article:tag` を複数タグ分 meta に push しても、TanStack の meta dedup（`property` キー）で最後の1件しか残らない。plan の「article:tag（tag は複数）」要件が部分的に未達。

### Decision
1. `__root.tsx` で root head の links から canonical を除外する（`links.filter((l) => l.rel !== "canonical")`）。root layout は実 path を知り得ず、全ての意味あるルートが自前の `head` で canonical を出すため、root の `/` canonical は常に重複か誤り。
2. 公開ノートの Article JSON-LD に `keywords`（全タグ配列）を追加。meta dedup の影響を受けない構造化データ側で全タグを表現する。`article:tag` meta は OGP の補助として1件残す。

### Consequences
- 良い点: 各ページの canonical が1件に正規化され、canonical 機能が復活。タグの全件が JSON-LD（検索エンジンが読む主要チャネル）に出力される。
- トレードオフ: head 未設定で残るルート（現状 `media/$mediaId` 等の非HTMLのみ）は canonical を持たないが、誤った canonical より無い方が安全。`article:tag` は依然 framework 制約で1件のみ表示。
