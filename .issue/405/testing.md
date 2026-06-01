# 動作確認計画 — Issue #405: 保存ビュー管理UIの拡充

## 自動テスト

```bash
pnpm typecheck
pnpm lint
pnpm test:unit          # domain + application/view（createViewTestContainer 使用の実DBテスト含む）
pnpm test:integration   # adapter（broken_conditions_json round-trip 等）
```

新規/更新するテスト:
- `app/core/domain/view/__tests__/valueObject.test.ts` — `BrokenConditionMarker.lastSeenName`
- `app/core/domain/view/__tests__/entity.test.ts` — `markBroken` の name マージ非対称ケース
- `app/core/application/view/__tests__/duplicateSavedView.test.ts`（新規）
- `app/core/application/view/__tests__/repairSavedView.test.ts`（新規）
- `app/core/application/view/__tests__/updateSavedView.test.ts` — query 編集経路
- `app/core/application/view/__tests__/handlers.test.ts` — 削除イベント→`lastSeenName` スナップ
- `app/core/adapters/d1/repositories/__tests__/savedViewRepository.integration.test.ts` — `lastSeenName` round-trip / 旧行フォールバック

## 検証環境の起動

開発サーバーはローカル D1 に対して動く。マイグレーションは既存スキーマのまま（機能5は JSON カラム拡張のみでマイグレーション不要）。

```bash
pnpm db:apply:local   # 既存マイグレーション適用（未適用なら）
pnpm dev              # vite dev サーバー起動（空きポートは manual-test が検出）
```

> 注: `pnpm start`（wrangler dev）は事前ビルド済み dist を配信するため、ソース変更の確認には `pnpm dev` を使う。

## ブラウザ検証ケース（`/views`）

事前条件: ログイン済みユーザーに保存ビューが複数存在し、うち1つは壊れた条件（削除済みディレクトリ/タグ参照）を含むこと。シードは manual-test が準備する。

1. **新規ビュー作成**: `/views` の「新しいビュー」ボタン → `ViewFormDialog` が開く → 条件（ディレクトリ/タグ/キーワード/visibility/期間/表示モード/ソート）を入力 → 保存 → 一覧に新ビューが追加される。
2. **ビュー編集**: 既存ビュー行の「編集」 → Dialog に現在の条件が初期表示される（タグは名前で表示） → 条件を変更 → 保存 → 一覧に反映される。
3. **ビュー複製**: 既存ビュー行の「複製」 → 「{元名} のコピー」が追加される（条件は引き継ぎ、既定フラグは付かない）。同名複製を繰り返すと「のコピー 2」「のコピー 3」と採番される。
4. **壊れた条件の修復**: 壊れた条件を持つビューの broken-banner 内「修復」ボタン → 壊れた参照が条件から除去され、警告バナーが消える。
5. **具体名表示**: 壊れた条件を持つビューのバナーが「削除済みディレクトリ `{名前}` を参照しています」のように具体名を表示する（修復前）。
6. **適用（回帰）**: 編集/複製したビューの「適用」 → ホーム一覧がその条件で開く（#394 の既存挙動が壊れていないこと）。

## スキップ判断

Web UI あり・画面操作項目あり・agent-browser 利用可能なら実行する。ボタン経由の server-function mutation は agent-browser から cross-origin で弾かれる（403）ため、その mutation 自体は integration テストで担保し、ブラウザ検証は Dialog 表示・初期値・バナー文言など描画確認に重点を置く。
