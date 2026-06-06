# ブラウザ検証結果 — Issue #520

**実施日:** 2026-06-06
**対象:** `spec/design/pages/P47-admin-metrics.html`（単一ファイル HTML モック）
**ツール:** agent-browser（`file://` 直接表示）

## 成果物（スクリーンショット）

- `P47-desktop.png` — 1280px
- `P47-mobile.png` — 375px（`set viewport 375 812`）
- `P40-desktop.png` — 比較用（概況ダッシュボード）

## テストケース結果

| # | 確認項目 | 結果 |
|---|---------|------|
| 1 | 共通 admin シェル（header 検索・通知・avatar、admin-nav **8項目**で「利用状況」active、ユーザーとジョブ監視の間に配置） | PASS |
| 2 | メトリクスカード4枚（ユーザー数 / 合計ストレージ〔R2・DO 内訳〕/ 本日アップロード / LLM 呼び出し24h） | PASS |
| 3 | アラート section（error=赤 surface / warning=橙 surface、code を mono の strong で表示） | PASS |
| 4 | インスタンス上限テーブル（8行、値は mono 右寄せ tabular-nums） | PASS |
| 5 | 登録ポリシー（公開中 success バッジ + `/admin/registration` code ピル注記） | PASS |
| 6 | レスポンシブ 375px（nav 横スクロール、メトリクス1列積層、上限テーブルが項目/値のカード化、横はみ出しなし） | PASS |
| 7 | 既存兄弟モックとのシェル整合（P40 と header・nav・トークン・余白が一致） | PASS |

**サマリ:** 7件中 7件 PASS / 0件 FAIL。

## 既存 admin モックの nav 整合

- P40〜P46 の `admin-nav` に「利用状況」（→ P47）を「ユーザー」と「ジョブ監視」の間へ追加し、全 admin モックの nav が8項目に揃っていることを確認（active 状態は各自保持）。

## 備考

- レスポンシブの `.metrics` グリッド段組み・`.table` カード化ルールは出荷済み P40 から逐語コピーしており、P47 固有の追加は `.num`（値セルの右寄せ mono、モバイルでは左寄せに解除）と `data-label` のみ。375px 実機レンダリングでカード化・1列化を確認済み。
- 実装との差分（ヘッダー検索・通知の未実装、上限テーブルのモバイルカード化未対応）は P47 末尾の HTML コメントと `.issue/520/adr.md` ADR-003 / ADR-005 に記録。追従は #514。
- HTML モックのためアプリのビルド・サーバー・DB は不要（`pnpm typecheck/lint` 対象外）。
