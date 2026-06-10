# ブラウザ検証レポート — Issue #620

**実行日:** 2026-06-10
**テストソース:** `.issue/620/testing.md`
**サーバー:** http://localhost:3000/（`pnpm dev` / vite dev・Cloudflare 構成）
**認証:** `pnpm seed:dev-admin`（dev-admin@example.com, 19ノート）→ `__Host-session` cookie を CDP 注入
**ブラウザ:** agent-browser 0.27.1

## サマリー

| TC | テスト名 | 種別 | 結果 |
|----|---------|------|------|
| TC-1 | P10 表示モードスイッチが segmented control で表示 | 正常系 | PASS |
| TC-2 | 表示モード切替が機能（挙動不変） | 正常系 | PASS |
| TC-3 | アクティブ表現の a11y 一致 | 正常系 | PASS |
| TC-4 | ツールバーボタン・保存ビュー文言 | 正常系 | PASS |
| TC-5 | デザインモックの整合（desktop / mobile） | 正常系 | PASS |

**合計:** 5件（PASS: 5 / FAIL: 0）

## 詳細

### TC-1: segmented control 表示 — PASS
ホーム（`/`、認証済み）のツールバー左に「リスト / タイル / カレンダー」が 1 つの segmented
コンテナで表示され、各ボタンに lucide アイコン + ラベル、リストが白カード + shadow でアクティブ。
P30 個人公開ページと寸法・トーン・アイコンが一致。旧 pill（accent 塗り・アイコンなし）は消滅。
- 証拠: `screenshots/tc1-home-list-segmented.png`

### TC-2: 切替挙動 — PASS
- タイルクリック → URL `?display=tile`、アクティブが タイル へ移動。
- カレンダークリック → URL `?display=calendar`、アクティブが カレンダー へ移動。
- ページ全体の再フェッチによるちらつきなし（URL-only swap / `replace: true` 維持）。

### TC-3: a11y 一致 — PASS
eval による属性検証（カレンダーアクティブ時）:
```
リスト:    aria-selected=false, data-active=null,  svg aria-hidden=true
タイル:    aria-selected=false, data-active=null,  svg aria-hidden=true
カレンダー: aria-selected=true,  data-active=true,  svg aria-hidden=true
```
- `role="tablist" aria-label="表示形式"` / 各 `role="tab"` 維持。
- `data-active` はアクティブのみ付与、非アクティブは属性消滅（`data-active={active || undefined}` 通り）。
- アイコン SVG は全て `aria-hidden="true"`（accessible name はラベルテキストが担う）。

### TC-4: ツールバーボタン・保存ビュー文言 — PASS
- 「選択」「ビューとして保存」は pill-btn（surface 塗り）のまま機能（ADR-003 通り実装無変更）。
- 新規作成 / アップロードのアイコンのみ CTA（#382 契約）維持。
- 保存ビュー select は dev-admin の保存ビュー 0 件のため非表示（`savedViews.length > 0` の想定通り）。

### TC-5: デザインモック整合 — PASS
- desktop `P10-home.html`: `.segmented` あり / `.display-tabs` なし。segTabs=[リスト,タイル,カレンダー]。
  - 証拠: `screenshots/tc5-desktop-mock.png`
- mobile `mobile/P10-home.html`: `.segmented` あり / `.tool-btn` 0 件 / ツールバー pill-btn 2 件 /
  保存ビュー option「保存ビューを選択」で統一。
  - 証拠: `screenshots/tc5-mobile-mock.png`

## 起票したIssue
なし（全 PASS）。

## 成果物
- レポート: `.issue/620/.manual-test/report.md`
- スクリーンショット: `.issue/620/.manual-test/screenshots/`
