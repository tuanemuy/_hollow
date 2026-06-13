# ブラウザ検証レポート — Issue #652: 共有 Popover の垂直ビューポート処理

**実行日時**: 2026-06-13
**テストソース**: `.issue/652/testing.md`
**サーバー**: http://localhost:3000（pnpm dev / vite dev workerd）
**ブラウザ**: agent-browser 0.27.1

## 結論

**全 6 テストケース PASS（FAIL なし）**。共有 `usePopover` への垂直クランプ追加が意図どおり動作し、#619 TC-002 で報告された「短いビューポートで下方向メニュー末尾項目がマウス選択できない」問題が解消した。既存挙動（通常高さ・キーボード・auth 側 FilterBar・狭幅ボトムシート）に回帰なし。

## 検証ハイライト

### バグ本体の解消（TC-1, AC-1）
innerHeight=633px の公開ページで Sort メニューを開くと、垂直クランプがパネルを `translateY(-47.5px)` 上に押し戻し、末尾項目「タイトル順」が画面内（bottom=620 ≤ 625）に収まった。中心点で `elementFromPoint` が項目自身を返す（修正前は null）。実際にクリックして `?sort=title` への遷移を確認。

### 回帰なし（TC-2 / TC-3, AC-2 / AC-5）
- 通常高さ(1000px)では `panelTransform: none`（クランプは余計な変位を加えない）。マウス・キーボード（↓×3→Enter）・URL 直接遷移すべて従来どおり成功。
- auth 側 FilterBar の VisibilityPopover（menu）は選択で `?visibility=public`、DatePopover（dialog）は正常に開閉。いずれも trigger が上部のため transform=none で回帰なし。

### 狭幅シート非干渉（Edge-1, AC-4）
幅480px（< 640px breakpoint）では垂直クランプがスキップされ、パネルは `position: fixed` で画面下端固定のボトムシートとして描画。translateY が乗らずレイアウト破綻なし。

### ユニット（TC-4 / Edge-2, AC-3）
`pnpm test:unit` で 3722 件 PASS。`computeShiftY`（フィット/下端/上端/縦長パネル上端優先）・DOM スタブ・狭幅スキップ・更新済み `applies a horizontal clamp` を含む Popover.test.tsx 22 件 PASS。縦長パネルの上端優先挙動はユニットで固定（実機の DatePopover はパネルが VP 内に収まり該当せず）。

## 既知の制限・補足

- auth 側で垂直クランプが「作動」する様子（trigger が画面下部寄り）は、FilterBar ツールバーが画面上部固定のため実機では再現しにくい。ただし共有 `usePopover`（`clampToViewport` opt-in）の同一コードパスを公開ページ TC-1 で作動確認済みで、auth 側も同じ挙動になる。
- スクリーンショットは成果物として保存していない（証跡は本レポートと results/ の実測値・snapshot テキスト）。

## 成果物

- サマリー: `.issue/652/manual-test/results/summary.md`
- サーバー情報: `.issue/652/manual-test/server-info.md`
- シードデータ: `.issue/652/manual-test/seed-data.md`
