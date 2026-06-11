# 残存課題 — Issue #631

## 1. mobile/P12-editor の検索導線

- **内容:** #628 確定形 header-right への総入れ替えで、mobile/P12-editor のヘッダーから検索 icon-btn が消えた（中央列はドキュメントタイトルのため画面内に検索導線が無い）。
- **理由:** 実装 `Header.tsx` の header-right にも検索は無く、確定形準拠を優先した（adr.md ADR-008）。
- **影響範囲:** モックのエディタ画面のみ。実装側のエディタヘッダー仕様と照合し、エディタに検索導線が必要なら別Issueで扱う。

## 2. P18 系 sidebar-user のアバターサイズ

- **内容:** mobile/P18-tags は既存 `.avatar` 36px を sidebar-user に流用（確定形は 32px）。軽微な視覚差。
- **影響範囲:** モック1ファイルの見た目のみ。
