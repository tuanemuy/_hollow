# PR Review #001 — feat(issue/205): add public pages (terms/privacy/about) and robots/sitemap

**PR:** #275
**Date:** 2026-05-28
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 12
- Notes: 多数
- Verdict: **BLOCKED**

---

## Domain + Adapter

#### Blockers
なし

#### Warnings
なし

#### Notes
- 全項目で plan/ADR と整合、`NoteRepository.findByIds` と同等品質、契約逸脱なし。

---

## Application + Test

#### Blockers
なし

#### Warnings

- **[W-A-001]** Usecase シグネチャ `Omit<ServiceArgs<undefined>, "input">` がアドホック。テスト 6 箇所で `as never` を強制している。
  - 場所: `app/core/application/publication/listSitemapEntries.ts:36`
  - 提案: `{ container: RequestContainer }` を直書きするか、`ServiceArgs<void>` を追加するか、`{ container, input: undefined }` で素直に呼ぶ。

- **[W-A-002]** `app/core/application/publication/index.ts` への `listSitemapEntries` re-export 漏れ。
  - 場所: `app/core/application/publication/index.ts`
  - 提案: 他 12 usecase と揃えて re-export を追加。

- **[W-A-003]** `note.slug as string` キャストは branded `NoteSlug` のままテンプレートに埋め込めるため不要。
  - 場所: `app/core/application/publication/listSitemapEntries.ts:76`

#### Notes
- テストカバレッジに `noteRepository.findByIds` の `note === undefined` ガード、`owner === undefined` ガード、非連続オーナー順序の検証が無い。

---

## Presentation + Infrastructure

#### Blockers
なし

#### Warnings

- **[W-P-001]** `HEAD /sitemap.xml` が TanStack に流れて HTML 404 を返す可能性。クローラの実装によっては sitemap 無効と判定するリスク。
  - 場所: `app/server.cloudflare.ts:74`
  - 提案: `request.method === "GET" || request.method === "HEAD"` を許容して `buildSitemapResponse` に流す。

- **[W-P-002]** sitemap 生成経路に try/catch が一切無く、D1 transient エラーや UoW エラーで空 500（Content-Type 不定）になる。
  - 場所: `app/server.cloudflare.ts:74-76` / `app/core/presentation/sitemapHandler.ts:53-72`
  - 提案: try/catch で包み、logger.error + 500 application/xml で空 urlset を返す。

- **[W-P-003]** `loadServerDeps(async () => ({}))` は「container だけ欲しい」呼び出しに既存ユーティリティを無理に当てており、既存パターン（`getContainer()`）と乖離している。
  - 場所: `app/components/public/LegalDocument.tsx:17` / `app/routes/about.tsx:24`
  - 提案: `containerStore.getContainer()` を直接使う。

- **[W-P-004]** `app/vite-env.d.ts` の `*.md?raw` 宣言は `vite/client.d.ts` が既にグローバル宣言済みで冗長。
  - 場所: `app/vite-env.d.ts:3-6`
  - 提案: 削除して `/// <reference types="vite/client" />` のみで十分か検証。

- **[W-P-005]** `joinUrl` が `app/core/presentation/head.ts:33-38` と完全重複（head.ts 側は `isAbsoluteUrl` 分岐の superset）。
  - 場所: `app/core/presentation/sitemapHandler.ts:14-17`
  - 提案: `head.ts` から export 再利用、または `app/core/presentation/url.ts` 共通モジュール化。

#### Notes
- ADR-007/010 と実装が一致。biome-ignore コメントも既存 `NoteDetail.tsx` と整合。

---

## Frontend Links + Content + Assets

#### Blockers

- **[B-F-001]** `about.md` の `## 特定商取引法に基づく表記 {#commerce}` / `## お問い合わせ {#contact}` の kramdown 風見出し ID 構文を、自作 `MarkdownItConverter` が解釈せず、`{#commerce}` を見出しテキストの一部として残す（id 属性は付かない）。結果として `LandingPage` の `<Link to="/about" hash="commerce">` / `hash="contact">` は遷移先のアンカーが無く動かない。plan.md は about の節アンカーを本 Issue スコープに明示しているため要件未達。
  - 場所: `app/content/legal/about.md` / `app/core/adapters/markdown/markdownConverter.ts:24` / `app/components/landing/LandingPage.tsx`
  - 提案: 最小修正として `LandingPage` の hash 指定を外し `to="/about"` 単体にする。MarkdownItConverter の拡張は別 Issue。adr.md に経緯を明記。

#### Warnings

- **[W-F-001]** spec の P 番号配置が非連続で読者が見落とす可能性。
  - 場所: `spec/pages/index.md:328-348`
  - 提案: 公開領域セクションの冒頭または凡例に補足註記を入れる。

- **[W-F-002]** `public/robots.txt` に末尾改行が無い。
  - 場所: `public/robots.txt`
  - 提案: 末尾改行を追加。

- **[W-F-003]** B-F-001 と紐づく LandingPage の hash 指定（修正に合流）。

- **[W-F-004]** about.md の `ソーシャル: {{twitterHandle}}` が未設定時に「ソーシャル: 」になる。
  - 提案: 未設定時の挙動を about.md のコメントで明示するか、route 側で行ごと省く拡張。

#### Notes
- リンク差し替え対象は全項目網羅、blockquote 警告も 3 ファイル一致、Disallow 全項目漏れなし。

---

## Design Decisions

このラウンドで見つかった設計判断:

- **B-F-001 の方針**: kramdown 見出し ID 構文の対応スコープを本 Issue で扱うか別 Issue 化するか。MarkdownItConverter 改修は影響範囲が広いため別 Issue 化し、本 Issue では LandingPage の hash 指定を外す最小修正に留める。adr.md に ADR-011 として記録。
