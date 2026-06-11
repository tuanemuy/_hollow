# ブラウザ検証レポート — Issue #618 + #627

**実行日**: 2026-06-11 / **サーバー**: http://localhost:3001（pnpm dev --port 3001）
**結果**: 10/10 PASS（詳細は results/、証跡は screenshots/）

- #627: PC 右列「M月D日」・モバイル メタ行「YYYY年M月D日 更新」、FTS/LIKE 両経路で日付表示を確認
- #618 項目2: 内側 input の boxShadow が透明（実測）、ラッパーのリング1本のみ（クリック / :focus-visible / listbox 表示中）
- #618 項目3: クリック直後の checked=true（楽観反映）、chips・バッジ・連続操作の整合も確認
- #618 項目1: 「関連度順」は span・hover 無反応、モックもラベル化済み
- 影響確認: P30 の日付表記・グローバルフォーカスリングに変化なし

失敗・起票 Issue: なし（`<mark>` リテラル表示は既知 #601）
