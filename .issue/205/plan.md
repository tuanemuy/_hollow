# 実装計画 — Issue #205: 公開ページの不足（利用規約・プライバシー・インスタンス情報・robots/sitemap）

**Issue:** #205
**作成日:** 2026-05-28
**複雑度:** 中〜大規模

---

## 目的

公開フッター・サインアップ同意導線が指し示すべき実ページ（利用規約 / プライバシーポリシー / インスタンス情報）を spec → 実装の順で揃え、`robots.txt` / `sitemap.xml` を提供する。設計レベルから抜け落ちている穴を spec と実装の両面で塞ぐ。

## スコープ

### 含まれるもの

- `spec/pages/index.md` への P08（利用規約）/ P09（プライバシーポリシー）/ P09b（インスタンス情報 About）追加
- P30 / P32 の「RSS / sitemap 配信は MVP では実装しない」記述を sitemap 提供方針へ更新
- 3 ページのルート実装（`/terms` / `/privacy` / `/about`）— `PublicLayout` + Markdown→HTML 経路
- `app/content/legal/{terms,privacy,about}.md` の placeholder 雛形配置
- `PublicLayout` / `LandingPage` / `SignUpForm` / `AdminSignUpForm` のリンク先差し替え
- `public/robots.txt` の静的配置
- `app/routes/sitemap[.]xml.tsx` の動的レスポンス実装
- application 層 usecase `listSitemapEntries` の追加と unit テスト

### 含まれないもの

- 利用規約 / プライバシーポリシーの法務レビュー済み本文（雛形ベース、運用 Issue に分離）
- 多言語対応（`ja_JP` 前提を維持）
- メタタグ全般の整備（並走 Issue #204 のスコープ）
- 特定商取引法 / お問い合わせの独立ページ化（about の節アンカーで暫定、別 Issue 起票候補）
- sitemap の分割（`sitemap-index.xml`）— 公開ノート 1000 件超になったタイミングでフォロー Issue 化

## 実装ステップ

### 1. spec/pages/index.md の更新

- **対象ファイル:** `spec/pages/index.md`
- **変更内容:**
  - 「公開領域」セクション（P34 直前）に以下 3 ページを追記:
    - **P08 利用規約画面 (public)** — 目的・機能（Markdown を `.note-detail-content` スタイルで静的レンダリング）・関連シナリオ A1
    - **P09 プライバシーポリシー画面 (public)** — 同上
    - **P09b インスタンス情報画面 (About) (public)** — `AppConfig` の `siteName / appUrl / twitterHandle`、`package.json` の `version` 等を Markdown テンプレ置換で差し込む
  - P30 (`spec/pages/index.md:295`) と P32 (`:316`) の「RSS / sitemap 配信は MVP では実装しない」を「sitemap.xml 配信あり（全公開ノート列挙、件数上限 1000）。RSS は MVP スコープ外」に変更
- **理由:** Issue が「設計レベルから抜け落ちている」と明示。spec-driven な本リポジトリでは spec 更新が先。

### 2. 法的文書 Markdown 雛形の配置

- **対象ファイル（新規）:**
  - `app/content/legal/terms.md`
  - `app/content/legal/privacy.md`
  - `app/content/legal/about.md`
- **変更内容:**
  - 3 ファイル全部の冒頭に **「本文は雛形です。本番運用前に法務確認のうえ差し替えてください。」** を Markdown blockquote で配置
  - placeholder 雛形を配置（章立てのみ）
  - `about.md` にテンプレートプレースホルダ（`{{siteName}}` `{{appUrl}}` `{{twitterHandle}}`）を含める
  - `about.md` の構成: 「運営者」「連絡先」「特定商取引法（暫定アンカー `#commerce`）」「お問い合わせ（暫定アンカー `#contact`）」のセクション骨格
- **理由:** Cloudflare Workers ランタイムは FS を持たない。`?raw` インポートでバンドル時に文字列化する経路を採用。同意取得導線の実質性確保のため、ページ上で警告が見えるようにする（README だけでは不十分）。

### 3. Vite の `?raw` 型定義追加

- **対象ファイル:** `app/vite-env.d.ts`（または既存の同等ファイル）
- **変更内容:** `declare module "*.md?raw" { const src: string; export default src; }` を追加（既存になければ）
- **理由:** TypeScript で `?raw` 文字列インポートを型安全に扱う

### 4. Markdown レンダリング共通コンポーネント

- **対象ファイル（新規）:** `app/components/public/LegalDocument.tsx`
- **変更内容:**
  - サーバーコンポーネントとして `{ markdown: string }` を受け取り、`loadServerDeps` で `container.markdownConverter.toHtml(md)` → `container.htmlSanitizer.sanitize(html)` を実行
  - `<article className="note-detail-content max-w-prose mx-auto py-8 px-4"><div dangerouslySetInnerHTML={{ __html }} /></article>` を返す
  - `biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via HtmlSanitizer port` を付ける
- **理由:** 3 ルートで重複するレンダリングロジックを集約。`.note-detail-content` は CLAUDE.md / ADR-002 で認められた既存スタイル例外を再利用し、新規 `@layer components` を追加しない。

### 5. 3 ルートの実装

- **対象ファイル（新規）:**
  - `app/routes/terms.tsx`
  - `app/routes/privacy.tsx`
  - `app/routes/about.tsx`
- **変更内容:**
  - `import termsMd from "@/content/legal/terms.md?raw"` のように `?raw` で取り込む
  - `createFileRoute("/terms")({ head: ({ match }) => buildHead(match.context!.config, { title: ..., path: "/terms" }), component: TermsPage })`
  - `TermsPage`/`PrivacyPage` は `<PublicLayout><LegalDocument markdown={...} /></PublicLayout>` を返す
  - `about.tsx` はサーバー側で `AppConfig` 値を `{{siteName}}` `{{appUrl}}` `{{twitterHandle}}` に置換してから `LegalDocument` に渡す
  - 3 ルートとも先頭に「本文は雛形であり、本番運用前に法務確認のうえ差し替えてください」の注記を Markdown 内に組み込む（ページ表示で必ず見える）
- **理由:** `signup.tsx` / `login.tsx` と同じ最小ファイル構成。法務未確定の警告は同意取得導線の実質性確保のため 3 ページ全てに必要（S-004 反映）。`appVersion` は本 Issue の MVP スコープから除外する（ADR-004 参照）。

### 6. リンク差し替え

- **対象ファイル:**
  - `app/components/public/PublicLayout.tsx`（フッター 3 リンク）
  - `app/components/landing/LandingPage.tsx`（フッターの利用規約・プライバシー・このインスタンスについて／運営者情報／お問い合わせ。特定商取引法は `/about#commerce` の暫定アンカーへ）
  - `app/components/auth/SignUpForm/index.tsx`（同意チェックボックス内 2 リンク）
  - `app/components/auth/AdminSignUpForm/index.tsx`（同意チェックボックス内 2 リンク）
- **変更内容:**
  - 「利用規約」→ `<Link to="/terms">`
  - 「プライバシー(ポリシー)」→ `<Link to="/privacy">`
  - 「このインスタンスについて」「運営者情報」「お問い合わせ」→ `<Link to="/about">`（必要に応じて `#commerce` `#contact` アンカー付与）
  - 不要になった `HOME_SEARCH` 等の import を削除
- **理由:** Issue の主要要件。同意取得プロセスを実質的に成立させる。

### 7. robots.txt の静的配置（フォールバック付き）

- **対象ファイル（新規）:** `public/robots.txt`
- **変更内容:** Issue 本文の Disallow 一覧をそのまま配置。`Sitemap:` 行は `Sitemap: /sitemap.xml`（相対）
  ```
  User-agent: *
  Disallow: /settings/
  Disallow: /admin/
  Disallow: /notes/
  Disallow: /trash/
  Disallow: /tags/
  Disallow: /exports/
  Disallow: /views/
  Disallow: /upload/
  Disallow: /export/
  Disallow: /media/
  Disallow: /share/
  Disallow: /verify-email
  Disallow: /email-change/
  Disallow: /password-reset/
  Disallow: /setup
  Allow: /

  Sitemap: /sitemap.xml
  ```
- **検証:** 実装後 `pnpm build` を実行し、`dist/client/robots.txt` が出力されることを確認する。`vite.config.cloudflare.ts` に `publicDir` 設定が無く Vite デフォルト（`<root>/public`）に依存するため、ビルド成果物で確認するまで確証なし。
- **フォールバック:** `dist/client/robots.txt` が生成されなかった場合は、`app/routes/robots[.]txt.tsx` で動的化に切り替える（loader が `throw new Response(content, { headers: { "Content-Type": "text/plain; charset=utf-8" } })` を返す）。判断は実装時。
- **理由:** 既存の `[assets]` 経路（`dist/client/`）と一貫。動的差し込みが不要な静的内容のため、Worker 起動コストゼロの静的配信を第一選択とする。

### 8. sitemap.xml の動的ルート実装

- **対象ファイル（新規）:**
  - `app/core/domain/identity/ports/userRepository.ts` — **`findByIds(ids: readonly UserId[]): Promise<readonly User[]>` を追加**（read-only listing/projection ポート。`NoteRepository.findByIds` と同じパターン）。JSDoc に「listing pipelines (e.g. sitemap projection) without N+1 queries. Order is not guaranteed; the caller must re-index by id」を明記
  - `app/core/adapters/d1/repositories/userRepository.ts` — `findByIds` の D1 実装（`IN (?, ?, ...)` クエリ。空入力は短絡）
  - `app/core/application/publication/listSitemapEntries.ts` — usecase。`unitOfWorkProvider.run` で以下を実行:
    - `publicationStateRepository.findAllPublic({ limit: 1000 })` で公開ノート `{ ownerId, noteId }[]` を取得
    - `noteRepository.findByIds(noteIds)` で `title/slug/updatedAt` をバルク取得（既存ポート、line 107）。結果を `Map<NoteId, Note>` に再インデックス
    - `userRepository.findByIds(uniqueOwnerIds)` で `username` をバルク取得（新ポート）。結果を `Map<UserId, User>` に再インデックス
    - **動的部分のみ**を `{ loc: string, lastmod?: string }[]` で返す（公開ノート URL `${baseUrl}/u/<username>/<note-slug>` には `lastmod`、ユーザー公開トップ URL `${baseUrl}/u/<username>` には `lastmod` 無し）。**静的 URL は presentation 側で結合する**（presentation 知識を application に漏らさない）
  - `app/core/application/publication/__tests__/listSitemapEntries.test.ts` — unit テスト（公開/非公開/削除ユーザー/limit到達/ゼロ件）
  - `app/routes/sitemap[.]xml.tsx` — file route。loader で:
    1. 静的 URL（`/`, `/signup`, `/login`, `/search`, `/terms`, `/privacy`, `/about`）を `${appUrl}` と結合
    2. `listSitemapEntries` で動的 URL を取得
    3. 統合して XML 化し、`throw new Response(xml, { status: 200, headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=600" } })` を返す
- **URL 形式:** 既存ルート `app/routes/u/$username/$noteSlug.tsx` / `app/routes/u/$username/index.tsx` に合わせて、**`/u/` プレフィックス必須**。公開ノート: `${appUrl}/u/<username>/<note-slug>`、公開トップ: `${appUrl}/u/<username>`。`<lastmod>` は `updatedAt.toISOString()`（W3C Datetime）。
- **理由:** presentation→domain 直叩きを避け、application 層に薄い usecase を追加。静的 URL は presentation の責務として分離（S-003 反映）。`s-maxage=600` で Cloudflare キャッシュに乗せ、D1 負荷を抑える。`noteRepository.findByIds` は既存ポート（line 107）を活用。`userRepository.findByIds` は read-only listing 用途として新設（OCC token を返す `findById` をループするのは設計違反のため、`NoteRepository.findByIds` と同パターンで追加）。

### 9. テスト・lint・型チェック

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- `pnpm test:unit` で `listSitemapEntries` テストを実行

## 設計判断

詳細は `adr.md` を参照。要点:

- **ADR-001:** robots.txt は静的配置（`public/robots.txt`）。`Sitemap:` は相対 URL。
- **ADR-002:** sitemap.xml は動的ルート＋ `Cache-Control: s-maxage=600` + `limit: 1000`。
- **ADR-003:** 法的文書 Markdown は `app/content/legal/` 配置＋ `?raw` バンドル取り込み。
- **ADR-004:** about の AppConfig 差し込みは単純テンプレート置換（`{{key}}`）。Markdown 経路で sanitize される。
- **ADR-005:** spec 番号は P08 / P09 / P09b を採用（Issue 提案通り、既存 P01b / P11h と同じ命名規則）。
- **ADR-006:** `.note-detail-content` を再利用、新規 CSS は追加しない（CLAUDE.md / ADR-002 例外の範囲内）。

## リスクと注意点

- **法務リスク**: 雛形 placeholder のままでは利用規約として不十分。3 ファイル全部の冒頭に「本文未確定」を明記し、本文確定は運用 Issue に分離する。
- **robots.txt Disallow 漏れ**: 認証必須パスを将来追加した際の更新漏れ。本 Issue では README または `docs/` への対照表追加までで止め、自動生成はスコープ外。
- **sitemap.xml の負荷**: `Cache-Control` と `limit: 1000` で吸収。1000 超になったらフォロー Issue で sitemap-index 化。
- **公開ノート URL 形式**: `${appUrl}/u/<username>/<note-slug>` 形式（`/u/` プレフィックス必須）。spec/pages/index.md の P30 / P31 表記は `/u/` 抜けで実装と乖離しているが、本 Issue では spec の URL 表記まで踏み込まない（別 Issue 候補）。
- **`?raw` 型定義**: TypeScript が `*.md?raw` を解釈できるよう型宣言追加が必要。
- **`public/` ディレクトリ初出**: リポジトリに `public/` ディレクトリが存在しないため、Vite が dist/client へコピーする実績がない。ビルド成果物で確認するまで動作保証なし。フォールバックは ADR-001 に明記。
- **`userRepository.findByIds` を新設**: 既存ポートに read-only バルク取得が無いため、`NoteRepository.findByIds`（line 107）と同じパターンで `UserRepository` に追加する。`findById` をループするのは OCC token を意味なく生成する設計違反のため避ける。
- **`Sitemap:` 相対 URL の解釈**: Google / Bing は相対 URL 対応だが、一部のクローラが絶対 URL のみ受け付ける可能性。問題が顕在化したら動的化（ADR-001 フォールバック）に切り替える。

## テスト方針

`.issue/205/testing.md` に詳細手順を記載。要点:

1. フッター・同意導線のリンクから `/terms` / `/privacy` / `/about` に遷移すること
2. 3 ページの Markdown レンダリングが `.note-detail-content` スタイルで描画されること
3. `/about` の `{{...}}` プレースホルダが AppConfig 値で置換されること
4. `/robots.txt` が 200 で配信され、全 Disallow 行と `Sitemap:` 行を含むこと
5. `/sitemap.xml` が 200・`application/xml`・`Cache-Control` ヘッダー付きで配信され、静的＋公開ノート URL を含むこと
6. 非公開ノートが sitemap に含まれないこと
7. 既存サインアップ / ログイン / 公開閲覧フローに回帰がないこと
8. unit テスト・typecheck・lint が通ること

## レビュー履歴

### 1周目（2026-05-28）

**修正した点（要件カバレッジ視点）**:
- 視点1 [P-001] sitemap.xml の静的ページ列挙から `/signup` / `/login` が脱落 → ステップ 8 のリストに追加（`/, /signup, /login, /search, /terms, /privacy, /about`）
- 視点1 [P-002] 公開ノート URL の表記揺れ（`<username>/<slug>` と `/u/<username>/...` が混在） → 全箇所を `${appUrl}/u/<username>/<note-slug>` に統一、ADR-002 に明記

**修正した点（アーキ・リスク視点）**:
- 視点2 [P-001] `userRepository.findByIds` が既存ポートに不在 → `findById` ループに変更し、`limit=1000` で頭打ちのため許容と ADR-002 に追記
- 視点2 [P-002] 公開ノート URL `/u/` プレフィックス漏れ → 視点1 P-002 と同じ修正で対応済み
- 視点2 [P-003] `appVersion` の Vite `define` 既存パターン不在 → `{{appVersion}}` を MVP スコープから除外し、ADR-004 に明記
- 視点2 [P-004] `public/robots.txt` が `dist/client/` に出力されるか未検証 → ステップ 7 に `pnpm build` 検証を追加、ADR-001 にフォールバック（動的化）を明記

**取り込んだ改善提案**:
- 視点2 [S-003] 静的 URL は presentation 層（route）で結合し、usecase は動的部分のみ返す → ステップ 8 と ADR-002 に反映
- 視点2 [S-004] 雛形 placeholder の「本文未確定」警告を 3 ファイル全部の冒頭に配置 → ステップ 2 と 5 に反映

**見送った提案とその理由**:
- 視点1 [S-001] LandingPage の「公開検索」「エクスポート」リンクの是正 → Issue 本文が明示してないスコープ外。フォロー Issue 候補だが本 Issue では扱わない
- 視点1 [S-002] about テンプレ置換のヘルパー関数化 → about 専用ロジックが 5 行程度で完結するため YAGNI、関数化はしない
- 視点1 [S-003] sitemap キャッシュキー / Vary ヘッダーの方針 → `s-maxage` のみで CDN は URL ベースキャッシュするため Vary 不要。`appUrl` は環境変数経由で取得済み（`config.appUrl`）、staging/prod で混入しない
- 視点2 [S-001] `LegalDocument` を `serverData` パターンに揃える → `loadServerDeps` 経由のサーバーコンポーネントで既存 `serverFn` パターンに揃える。実装時に既存 `PublicNoteDetail.tsx` のパターンを参照
- 視点2 [S-002] usecase の所属パッケージ → `publication/` 配下に置く（公開状態に紐づく usecase 群と一貫）。静的 URL は presentation で結合するため層責務は分離済み（S-003 採用で解消）
- 視点2 [S-005] `Disallow: /u/<username>/settings` 等の将来運用 → 現状そんなサブパスが存在しないため不要。README 対照表で運用カバー（既存方針）
- 視点2 [S-006] `<lastmod>` フォーマット → ADR-002 に `toISOString()` 採用を明記済み

### 2周目（2026-05-28）

**修正した点**:
- [P-001] `noteRepository.findByIds` は実在（line 107、read-only listing 用途）→ 1周目の事実誤認を訂正し、`findByIds` バルク取得に変更。ADR-002 にも反映
- [P-002] `userRepository.findById` は `Versioned<User>` を返す write-after-read 用途で、read-only listing には不適切 → `UserRepository` に `findByIds(ids): Promise<readonly User[]>` を新設（`NoteRepository.findByIds` と同パターン）。ステップ 8 に新ポート追加・D1 アダプタ実装を明記、ADR-002 にも反映

**取り込んだ改善提案**:
- [S-003] sitemap usecase の戻り値型 `lastmod: string | null` → `lastmod?: string`（optional）に変更し、ユーザー公開トップは省略する設計に修正

**見送った提案とその理由**:
- [S-001] `robots.txt` を最初から動的化 → ADR-001 の判断（静的優先、ビルド検証＋フォールバック）を維持。実装後の動作で再判断するため現時点では変更しない
- [S-002] `?raw` HMR 動作の testing.md 注記 → testing.md 作成時に取り込む（plan.md レベルでは保留）
