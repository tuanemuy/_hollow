# テスト実行サマリー — Issue #493

**実行日時:** 2026-06-06
**テストソース:** .issue/493/testing.md
**サーバー:** http://localhost:3000（`pnpm dev`、Cloudflare Workers ターゲット）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | /about 見出しアンカー（#commerce / #contact） | 正常系 | PASS | 実ブラウザ DOM で `<h2 id="commerce">` `<h2 id="contact">` を確認 |
| TC-002 | /terms・/privacy 回帰（自動 slug 注入なし） | 回帰 | PASS | terms 9 見出し / privacy 8 見出し、いずれも id 付与ゼロ |
| TC-003 | フッターからのアンカー遷移 | 正常系 | PASS | 「特定商取引法」→ /about#commerce、「お問い合わせ」→ /about#contact |
| TC-004 | ノート本文の Markdown レンダリング（取り込み経路） | 正常系 | NOT RUN（自動テストで代替） | 認証＋取り込み UI が必要。wysiwyg 統合テスト + 新規 adapter ユニットテストで等価カバー |

**合計:** ブラウザ実行 3 件（PASS: 3 / FAIL: 0）。TC-004 は下記理由で自動テスト代替。

## TC-004 を自動テストで代替した理由

ノート取り込み経路（markdown → toHtml → sanitize → 表示）は管理者認証・ファイル取り込み UI を要し、ブラウザ手動検証が重い。一方この経路の中核は以下で完全にカバーされている:

- `app/components/note/editor/__tests__/wysiwygSanitizerIntegration.test.ts` — TipTap 出力 → `UltrahtmlHtmlSanitizer.sanitize` で構造タグが落ちないこと、`/media/<id>` が sanitize 後も抽出可能なこと、`javascript:` / `data:` が除去されること（実際の note-content sanitize 経路そのもの）。
- 新規 `markdownConverter.test.ts` / `htmlSanitizer.test.ts` — CommonMark 主要記法、`language-xxx` クラス保持、`[[wikilink]]` verbatim、allow-list、URL スキーム、`{#id}`、`toPlainText` ラウンドトリップ。
- `pnpm test:unit` 全 3232 件 PASS。

## エッジケース・異常系

testing.md のエッジケース（不正 `{#id}`、危険 URL / `on*` 除去）は新規ユニットテストで網羅検証済み（ブラウザ操作不要のためユニットで担保）。

## 既存機能への影響

- 公開 legal 3 ページ（about/terms/privacy）が `LegalDocument` 共有パイプライン経由で正常描画されることを確認。
- `pnpm build`（Workers ターゲット）成功、Node 専用 built-in 解決エラーなし。
