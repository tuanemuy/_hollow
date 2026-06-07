# ADR — Issue #570: 領域3 P14 公開設定の未追従機能

## ADR-001: QR ライブラリは `qrcode`（node-qrcode）を採用

### Status
Proposed

### Context
共有リンクの QR コード表示（機能A）には QR 生成ライブラリが必要だが `package.json` に未導入。実行環境は Cloudflare Workers + client component。候補は `qrcode`（node-qrcode）/ `react-qr-code` / `qrcode.react` / サーバ生成。

### Decision
`qrcode`（node-qrcode）を採用する。

- 純 JS で client component の `useEffect` 内で `toString(url, {type:"svg"})` / `toDataURL` が動作し、Node 専用 API に依存しない（Cloudflare Workers サーバ側では import しないため無関係）。
- 週次 DL 多数・広く枯れており保守実績十分。`@types/qrcode` で型解決可能。
- SVG 出力でモック `.qr-code`（白背景 + 角丸 + padding）に素直に乗る。
- バンドル増分はモーダル配下（`PublishSettings`）の client チャンクに限定され初期ロードに影響しにくい。

次点は `qrcode.react`（React コンポーネント型で手軽）。サーバ生成は Workers ランタイム依存を増やすだけで不要（URL は既にクライアントにある）。

### Consequences
- 良い点: client で完結し Workers 非依存。型あり・保守実績十分。SVG でモック忠実。バンドル増分はモーダルチャンクに限定。
- トレードオフ: 生成が非同期（Promise）なので `useEffect` + `cancelled` ガードが必要。`dangerouslySetInnerHTML` で SVG 文字列を描画する（自前生成 SVG なので安全だがレビューで明示）。

### 補足: `dangerouslySetInnerHTML` と CLAUDE.md 例外規約の切り分け
CLAUDE.md / `.issue/70/adr.md` ADR-002 が要 ADR とする `dangerouslySetInnerHTML` の例外（`.note-detail-content`）は「`@layer components` でスタイルを当てられない外部由来 HTML descendant」の文脈。本件は**信頼できる自前生成 SVG 文字列の描画**であり、スタイル例外（`@apply`/`@layer components`）の追加ではなく、外部入力 HTML でもない。よって ADR-002 の対象外。`dangerouslySetInnerHTML` は `QR_CODE` の SVG 描画のみに限定し、キャプション等は通常 JSX で組む。`dangerouslySetInnerHTML` を避けたい場合は `toDataURL` + `<img alt="QR コード">` でも要件を満たすが、SVG inline の方が CSS 追従・crispEdges 制御で有利なため inline SVG を採る。

### 補足: QR コンテナの `role="img"`
SVG を `dangerouslySetInnerHTML` で流し込む `<div>` には `aria-label="QR コード"` を付すが、無 role の `<div>` では `aria-label` が ARIA 的に無効（Biome `lint/a11y/useAriaPropsSupportedByRole` がエラー）。QR は画像であり中の SVG パスは AT に読み上げ不要なので `role="img"` を付与してラベルを有効化する（plan の「`aria-label="QR コード"` を当てた `<div>`」を a11y 規約に整合させた実装上の補足）。

---

## ADR-002: B（未保存警告）は本Issueでは実装せず別Issue化する

### Status
Proposed

### Context
未保存警告（機能B、モック `:717-746` の `.safety-check` warning alert）を実装するには、edit ページの `NoteEditor` ローカルにある dirty 状態（`editorState.ts` の `dirtyKeys`）を、detail ページの `NoteActions` 配下モーダル `PublishSettings` まで伝搬する経路が必要。両者は独立した RSC ツリーで現状その経路が無い。#542 ADR-001 が既に「dirty 伝搬の新設は本Issue（モック追従）の範囲を超える=別Issue引き渡し」と判断している。

伝搬方式には未決の設計トレードオフがある:
- 案1: ページ横断の dirty 状態伝搬（Context / 共有 store）。正確だが大掛かり。
- 案2: `publishedAt` vs `note.updatedAt` の DTO 近似比較。中規模だが近似で誤検知リスク。

### Decision
本Issueは A + C に絞り、B はトラッカー #563 配下に別Issue起票する（Phase 4 で対応）。

- A は入力（`ShareLinkDTO.url`）が供給済みの自己完結機能。B は新規の伝搬機構が前提で、規模・レビュー観点が質的に異なる。
- B の方式選択（案1/案2）は独立した ADR を要する設計タスク。A/C と同一PRに混ぜるとレビュー観点が分散する。
- 警告UI自体は既存 `ALERT`/`ALERT_WARNING` プリミティブ + `AlertTriangle`（`UploadForm.tsx` 前例）で実装可能なので、別Issueでは dirty 供給経路の設計・実装に集中できる。

### Consequences
- 良い点: 自己完結機能（A/C）を確実に出荷しつつ、B の設計判断を独立して扱える。過剰実装（dirty 伝搬機構の拙速な新設）を回避。
- トレードオフ: 未保存警告はモックにあるが本Issueでは未実装のまま残る。別Issue側で dirty 伝搬設計が前提。
