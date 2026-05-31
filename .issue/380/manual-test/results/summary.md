# テスト実行サマリー — Issue #380

**実行日**: 2026-05-31
**テストソース**: .issue/380/testing.md
**サーバー**: http://localhost:3100（pnpm dev、ライブソース）
**シード**: #356 manual-test のデータをローカル D1 で再利用（note-A: Bar/Child1Renamed 2段ネスト + note-B からバックリンク、note-C: ルート直下）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | パンくず中間セグメントの directoryId リンク化（要件1） | 正常系 | PASS | `Bar`(link, `?directoryId=01938f02…`) / `Child1Renamed`(link, `?directoryId=019e6e06…`) の両方がリンク。ディレクトリ名表示。Bar クリックでホーム絞り込み遷移 |
| TC-002 | バックリンクカードの抜粋表示（要件2） | 正常系 | PASS | note-B カードにタイトル + 抜粋「このノートは 検証ノートA を参照しています。」をプレーンテキストで補助表示 |
| TC-003 | ルート直下ノートのパンくずフォールバック（EC） | 異常系 | PASS | note-C は「すべてのノート › タイトル」のみ・ディレクトリセグメントなし |

**合計**: 3 件（PASS: 3 / FAIL: 0）

## 結論

Issue #380 の2要件（パンくず中間セグメントのリンク化 / バックリンク抜粋表示）はいずれも実機で仕様どおり動作。ルート直下ノートの空セグメントフォールバック（ADR-002 踏襲）も確認。FAIL なし、起票した Issue なし。

スクリーンショット: `.issue/380/manual-test/screenshots/`（tc-001-breadcrumb.png, tc-001-after-click.png, tc-002-backlink-snippet.png, tc-003-root-breadcrumb.png）
