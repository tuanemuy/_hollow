# テスト実行サマリー — Issue #621

**実行日時**: 2026-06-10
**テストソース**: .issue/621/testing.md
**サーバー**: http://localhost:3000
**検証方法**: agent-browser で各公開ページを開き、`set viewport` で幅を変えながら、対象コンテナの `getBoundingClientRect().width` / `left` / `right` を `eval` で実測

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | P30 ユーザー公開トップのコンテナ幅が一定 | 正常系 | PASS | `<main>`=PUBLIC_MAIN |
| TC-002 | P31 ノート詳細のコンテナ幅が一定 | 正常系 | PASS | `<div>`=NOTE_DETAIL_WRAP |
| TC-003 | P32 公開検索のコンテナ幅が一定 | 正常系 | PASS | `<main>`=PUBLIC_MAIN, 検索7件ヒット |

**合計**: 3 件（PASS: 3 / FAIL: 0）

## 計測値

判定基準: コンテナ幅 = `min(ビューポート幅, max-width)`、中身（最長ノート行/タイトル/本文）に依存せず一定、`max-width` 超過時は左右マージン均等で中央寄せ。

### TC-001 P30 `/u/dev-admin`（max-width 1280px）

| viewport | mainW | left | right | 判定 |
|---|---|---|---|---|
| 500 | 500 | 0 | 0 | ✅ ビューポート幅に一致 |
| 600 | 600 | 0 | 0 | ✅ |
| 700 | 700 | 0 | 0 | ✅ |
| 900 | 900 | 0 | 0 | ✅ |

→ 600px 付近でも幅が中身に依存せず一定。ガタつき解消を確認。

### TC-002 P31 `/u/dev-admin/note-width-long-title-sample`（max-width 920px、タイトル124文字の長尺ノート）

| viewport | wrapW | left | right | 判定 |
|---|---|---|---|---|
| 500 | 500 | 0 | 0 | ✅ ビューポート幅に一致 |
| 600 | 600 | 0 | 0 | ✅ |
| 900 | 900 | 0 | 0 | ✅ |
| 1100 | 920 | 90 | 90 | ✅ 920px でキャップ＋中央寄せ |

→ 極端に長いタイトル・本文でもラッパー幅は一定。

### TC-003 P32 `/search?q=テスト`（max-width 1280px、ヒット7件）

| viewport | mainW | left | right | 判定 |
|---|---|---|---|---|
| 500 | 500 | 0 | 0 | ✅ ビューポート幅に一致 |
| 600 | 600 | 0 | 0 | ✅ |
| 700 | 700 | 0 | 0 | ✅ |
| 1400 | 1280 | 60 | 60 | ✅ 1280px でキャップ＋中央寄せ |

→ 検索結果の幅も中身に依存せず一定。全コンテナで `w-full` 適用を `hasWFull: true` で確認。

## 既存機能への影響

- 変更対象は `PUBLIC_MAIN` / `NOTE_DETAIL_WRAP` の2定数のみ。P33（SHARE_PAGE）/ P34（ERR_PAGE）/ legal（LegalDocument）はこれらを使わず `flex-1` を持つ別系統のため、影響なし（コード上の依存関係で確認）。
