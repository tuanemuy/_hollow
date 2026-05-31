# ブラウザ検証レポート — Issue #199

**実行日時:** 2026-05-31
**テストソース:** .issue/199/testing.md
**サーバー:** http://localhost:5180/（Vite dev / ライブソース配信）
**検証方法:** agent-browser 0.27.0、ビューポート 1280px / 1024px

---

## サマリー

| TC | テスト名 | 種別 | 結果 |
|----|---------|------|------|
| TC-1 | HERO 見出し・本文（1280/1024px） | 表示 | PASS |
| TC-2 | SECTION 見出し・本文（1280/1024px） | 表示 | PASS |
| TC-3 | フッター tagline 2段落（1280/1024px） | 表示 | PASS |
| TC-4 | password-reset 説明文の自然折り返し | 表示 | PASS |
| TC-5 | verify-email ステータス本文の折り返し | 表示 | PASS（invalid で確認、expired/used はコード確認） |
| TC-6 | login / signup の見出し・本文 | 表示 | PASS |

**合計:** 6 件（PASS: 6 / FAIL: 0）

## 所見

- **HERO_TITLE**: 1280px で1行・1024px で text-balance により2行均等。間延び・1文字オーファンなし。`text-wrap: balance` 適用確認。
- **SECTION_TITLE**「書いたものを、ちゃんと残す」: 両幅で「す」1文字オーファンが解消され1行表示。
- **HERO_SUBTITLE / SECTION_LEAD / TEASER_BODY**: rem 幅＋text-pretty で適切な読み幅・自然な折り返し。
- **フッター tagline**: 2段落（mt-2 間隔）で表示。1024px で第2段落が2行になるが長音符での自然折り返しで不自然なオーファンではない。
- **認証ページ**: password-reset / verify-email（invalid）/ login / signup いずれも `<br />` 削除後にカード幅内で自然に折り返し。

## 制約・未検証

- **expired / used ステータス**: 有効な確認トークンの期限切れ・使用済み状態を実環境で再現できないため runtime 未確認。ソースコードで両ステータス本文に `<br />` が無いことを確認済み（コードレビューで担保）。
- **プロフィール bio（/u/$username, PROFILE_BIO）**: シードデータが必要なため runtime 未検証。変更は `max-w-[60ch]`→`max-w-[var(--content-max)]`(760px)＋`text-pretty` の低リスクな読み幅置換で、ビルドで該当ユーティリティ生成を確認済み。

## 起票した Issue

なし（FAIL なし）。

## スクリーンショット

- landing/: hero-1280.png, features-1280.png, footer-1280.png, hero-1024.png, features-1024.png, footer-1024.png
- auth/: password-reset.png, verify-email.png, verify-email-status.png, login.png, signup.png
