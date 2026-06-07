# ブラウザ検証レポート — Issue #540: 領域1（P10/P11/P12/P20）モック実装追従

**実行日時**: 2026-06-07
**テストソース**: `.issue/540/testing.md`
**サーバー**: http://localhost:4321
**結果**: 全 8 ケース PASS（FAIL: 0、起票 Issue: なし）

## 概要

#510 で確定した領域1モック（P10/P11/P12/P20 + SHELL サイドバー）への実装追従を、専用テストユーザー mt540-user（包括的シードデータ）でブラウザ検証した。主要 5 ケース + エッジ 3 ケースすべて PASS。モックの設計意図どおりに実装が追従していることをスクリーンショットで確認。

## 検証結果（モック追従の確認点）

### A. SHELL サイドバー（TC-1 / EC-1 / EC-3）
- 「すべてのノート」に件数バッジ（7 / dev-admin は 2）= 実データ一致。
- 「保存したビュー」セクションに個人ビューを列挙（AI論文 / プロジェクト(壊れ) / 公開ノート / 最近の更新）。
- 0 件ユーザーでは保存したビューセクションを非表示にしつつ、管理セクションの「保存ビュー」リンクで /views へ到達可能（ADR-006）。
- 管理セクションは「アップロード」「エクスポートジョブ」を保持（ADR-005）。
- モバイル drawer 内でも件数バッジ・列挙が正常描画。
- スクショ: `screenshots/smoke-home.png`, `edge-zero-savedviews.png`, `edge-mobile-drawer.png`

### B. P10 一覧 FilterBar（TC-2）
- FilterBar に下線（border-bottom）がなく、余白でリストと区切られる。先頭タグチップの左端が見出し・ツールバーと揃う（二重線回避・index.md §2.2）。
- スクショ: `screenshots/smoke-home.png`

### C. P11 詳細（TC-3）
- 本文下メタが **プロパティ → バックリンク** 順。
- プロパティに「場所: Research / 論文メモ」行を追加（index.md §2.1 + モック準拠、ADR-002）。
- 公開状態はメタに二重表示されず、トップツールバーの公開設定ピル（「公開状態: 限定公開」）にのみ存在。
- バックリンクカード（Transformer Survey）がプロパティの後に表示。
- スクショ: `screenshots/tc3-detail-meta.png`

### D. P12 エディタ（TC-4）
- タイトルが borderless 大型 document スタイル入力（新規は placeholder「無題のノート」）。
- モードタブ + 自動保存ステータス + 保存/キャンセル（新規は作成）が 1 行の topbar に集約。
- タグはカンマ区切りテキスト入力を維持（chip 化せず、ADR-003）。autosave/モード切替の挙動は従来どおり（editorReducer 不変）。
- スクショ: `screenshots/tc4-editor-new.png`, `tc4-editor-edit.png`

### E. P20 保存ビュー（TC-5 / EC-2）
- ビューカードに絞り込み条件 chip を列挙: 表示モード / ソート（更新降順・タイトル昇順）/ タグ（#ai #paper）/ ディレクトリ（プロジェクト）/ 公開状態。
- 行アクションを「適用（主）+ ⋯ overflow メニュー」に再構成（ADR-004 / E-2、common/Menu 採用）。
- 壊れた条件ビューは broken chip +「壊れた条件があります」バナー + 修復ボタン。バナーは現状の warning-surface を維持（`.alert` 案D 化は別 Issue、ADR-004 / E-3）。
- スクショ: `screenshots/tc5-views.png`

## 軽微な観察（非ブロッカー）

- 削除済みタグが解決できず broken ビューのタグ chip に raw UUID が表示される（id フォールバック）。broken chip + バナー + 修復で既に警告済みのため致命ではない。本 Issue スコープ外の改善余地として記録のみ（Issue 起票せず）。

## 環境メモ

- `__Host-session` cookie は Secure 必須のため、各ナビゲーション直前に CDP（`agent-browser cookies set ... --secure`）で再注入して認証を維持した。http 遷移で `__Host-` cookie が落ちる挙動への対処。
- シードデータ: `.issue/540/manual-test/seed.mjs` / `seed.sql`（mt540-* のみ、冪等）。詳細は `seed-data.md`。
