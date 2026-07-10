# ブラウザ検証レポート — Issue #818: ノート編集画面（P12）モバイル最適化

**実行日:** 2026-07-10
**テストソース:** `.issue/818/testing.md`
**サーバー:** http://localhost:3001（`pnpm dev` / vite dev cloudflare、3000 使用中のため 3001 に自動割当）
**認証:** `pnpm seed:dev-admin`（dev-admin@example.com / admin）→ `__Host-session` cookie を CDP 注入
**ブラウザ:** agent-browser 0.31.0（Chrome for Testing）

## サマリー

| 群 | ケース数 | PASS | FAIL |
|---|---|---|---|
| モバイル（390×844） | 7 | 7 | 0 |
| デスクトップ回帰＋波及（1280 / 390） | 6 | 6 | 0 |
| **合計** | **13** | **13** | **0** |

**起票した Issue: なし**（全 PASS）。

## モバイル検証（幅390px）

| TC | テスト | 結果 | 根拠（観測値） |
|----|--------|------|----------------|
| TC-1 | 下部固定 保存CTAバー（AC-1/2） | PASS | CTAコンテナ `position:fixed / bottom:0 / inset-x:0 / z-index:40`。スクロール(scrollY 1590→2200)しても barBottom=844(=innerH) で不動。FORM に `pb-[calc(96px+safe-area)]`、末尾底(668)とバー上端(775)に余白107px、隠れなし |
| TC-2 | メタ折りたたみ（AC-3） | PASS | summary が `aria-controls="editor-meta-body"`、`aria-expanded` を false↔true トグル。折畳時 body `display:none`、展開で block、DirectoryPicker+TagsInput 出現、再タップで畳める |
| TC-3 | コントロールサイズ/タップ床（AC-4） | PASS | タグ ×（aria-label「◯ を削除」）クリックで削除。検索input h=44px（h-10ベース）、ツリー行 role=option h=44px、新規行 50px。キャレット(h32/w16)は展開のみ・行本体クリックで選択、取り違いなし |
| TC-4 | 折り返し/横スクロール（AC-5/6） | PASS | WYSIWYG に長URL＋長連続英字入力→`scrollWidth=390=innerWidth`、scrollX=0。HTML textarea `white-space:pre-wrap`、内部横溢れなし、doc 横スクロールなし |
| TC-5 | 本文 min-h（AC-7） | PASS | 本文ラッパ computed `min-height=438.88px`（innerH844×0.52）。固定480pxではなくビューポート相対 |
| Edge-1 | 折りたたみ中の state 保持 | PASS | 折畳→再展開後も選択ディレクトリ・タグを保持（DOM保持のCSS開閉を確認） |
| Edge-2 | 保存状態 | PASS | 空時 disabled→入力で enabled。クリックで「保存中...」+disabled→`/notes/{id}` へリダイレクト、保存先で本文・ディレクトリ表示、エラーなし |

## デスクトップ回帰＋波及検証

| TC | テスト | 結果 | 根拠（観測値） |
|----|--------|------|----------------|
| TC-D1 | 1280px 保存/キャンセル位置 | PASS | ボタンコンテナ `position:static`（`ml-auto` 右寄せ）。祖先チェーン全て static、fixed 不適用 |
| TC-D2 | 1280px メタ常時展開 | PASS | summary（`sm:hidden`）`display:none`、body `display:block`、DirectoryPicker/TagsInput 可視インライン |
| TC-D3 | 1280px 本文 min-h | PASS | 本文ラッパ computed `min-height:480px`（`sm:min-h-[480px]`） |
| TC-D4 | 1280px APP_MAIN padding | PASS | `<main>` computed padding L/R = 24px（`px-6`） |
| TC-D5 | 390px APP_MAIN 波及（一覧） | PASS | トップ `/` で `<main>` padding=16px、`scrollWidth=390=innerWidth`、オーバーフロー要素0 |
| TC-D6 | 390px 他 `_app` 画面回帰 | PASS | `/tags`・`/trash`・ノート詳細いずれも padding 16px・横スクロールなし・破綻なし |

## 所見・偽陽性メモ

- **偽陽性なし**（実装バグ扱いの誤検出なし）。React onClick は概ね正常発火。
- agent-browser 環境の注意（実装バグではない）:
  - モード切替時の「未保存の変更があります」JS confirm が正しく機能（`dialog accept` で解消）。実装の未保存ガードが動いている証左。
  - セッション cookie が about:blank リセットで消えることがあり、ナビ前に再注入して対処。
- **軽微な観測（改善余地・FAIL ではない）**: タグチップ ×（16×16px）・DirectoryPicker キャレット（16–32px）は 44px タップ床未満。ただし plan の設計判断どおり（タグ×は密度優先で床を課さない、キャレットは縦方向のみ拡大し行選択を奪わない）で、44px 要件はツリー行/検索入力に対するもの（達成済み）。機能上の取り違いもなし。

## 結論

Issue #818 のモバイル最適化（下部固定CTA・メタ折りたたみ・44pxタップ床・横スクロール抑止・52vh本文・状態保持・保存フロー）は全受け入れ基準 AC-1〜AC-8 を満たし、デスクトップ回帰・`APP_MAIN` 波及の副作用も無し。**全13ケース PASS。**
