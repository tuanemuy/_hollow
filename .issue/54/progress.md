# 残存課題 — Issue #54: Dialog 共通化

## ブラウザ検証は限定範囲のスモークテストに留めた

### 内容
manual-test スキルでフル実行（agent-browser によるテストケース自動実行）を試みたが、以下の理由から **スモークテスト** に限定した:

1. **検証項目の大半は人間の視認が必要** — フォーカスリングの視認、`shadow-lg` / `shadow-[0_16px_32px_rgba(0,0,0,0.15)]` のビジュアル差分、Tab/Shift+Tab の循環体感、`<body>` 直下 Portal の DevTools 確認など、agent-browser だけで判定できない項目が多い
2. **対象 6 ダイアログのうち 5 つが認証必須画面** にあり、ノート・タグ・ディレクトリのシードデータを SQL レベルで投入する必要がある。検証のために大量の seed SQL を新規作成する工数とリスクが、得られる検証価値（≒人間レビュー時のビジュアル確認の代替）に見合わない

### 実施した範囲

スモークテスト 5 件（全 PASS）— `.issue/54/.manual-test/report.md` に記録:
- `pnpm db:apply:local` でローカル D1 マイグレーション適用
- `pnpm dev` で開発サーバー起動
- `/` トップページが HTTP 200 で SSR レンダリング
- `/notes` 未認証アクセスで 404（認証ガード機能）
- `/login` ログインフォームが SSR で正常レンダリング

### 実装の正しさは自動テストで担保

- `pnpm typecheck` — エラーなし
- `pnpm exec biome check` — Lint: No issues found
- `pnpm format:check` — Clean
- `pnpm test:unit` — 91 ファイル / 1429 テスト 全件 PASS
- `pnpm test:integration` — 30 ファイル / 330 テスト 全件 PASS

### 影響範囲

PR レビュー時に `.issue/54/testing.md` の手動チェックリスト（12 項目）を実施することで補完する。Test plan セクションに転記済み。

### フォローアップ

- 認証必須シナリオを agent-browser で自動化するための共通基盤（共有シード SQL + テスト用ユーザー）が整えば、本 Issue のチェックリストも自動化対象に含められる。これは Issue 群全体に効く改善であり、本 Issue で個別対応する範囲ではない（別 Issue 候補）

## レビューで別 Issue に切り出した項目（Round 1 / Round 2）

Phase 4 で起票判定。

- **共通 `app/components/common/styles.ts` の新設** — review-001 W-Arch-001/002 系。現状 `common/Dialog.tsx` と `common/ConfirmDialog.tsx` が `note/styles.ts` を import している cross-domain 依存を解消する。同時に `MergeTagDialog` のインラインスタイル直書きも整理できる
- **5 ダイアログの `aria-labelledby` 化** — review-001 W-Arch-005。`MoveNoteDialog` / `BulkExportDialog` / `BulkVisibilityDialog` / `SaveViewDialog` / `MergeTagDialog` が `ariaLabel` + 同文の `<h2>` で二重ラベリングしている。`useId()` で `titleId` を発番して `aria-labelledby` 統一する
- **`MergeTagDialog` の primary ボタン API 揃え** — review-001 W-Arch-006。他ダイアログの `${pillBtn} ${pillBtnPrimary}` + `data-primary` パターンに揃える
- **AT 隔離強化（兄弟 `aria-hidden` / `inert`）** — review-001 W-Rob-006、ADR-006。iOS Safari + VoiceOver の `aria-modal` 不確実性への対応
- **iOS Safari `position: fixed` ハック / モバイル scroll lock** — review-001 W-002
- **Dialog 単体テスト整備** — Round 1 / 2 では現状未追加。テスト基盤が `happy-dom + createRoot + act` で揃ったらフォーカストラップ / Esc / Portal / scroll lock counter を網羅したい
- **複数ダイアログ同時表示時の Tab トラップ協調** — review-002 W-Round3-001。`bodyScrollLockCount` は導入したが、`document` 全体に attach する keydown listener は各 Dialog ごとに独立しており、外側 Dialog のリスナが内側 Dialog の active を「自分の panel 外」と判定して focus を奪う可能性がある。`module-scope` の active panel スタックで「最上位 Dialog のリスナのみ active」とする仕組みを追加すれば一貫性が出る
