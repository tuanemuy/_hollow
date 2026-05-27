# PR Review #001 — docs(spec/design): add P13 upload modal HTML mock

**PR:** #249
**Date:** 2026-05-27
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 7
- Verdict: **APPROVED**

---

### General Review

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- **[N-001]** Issue #246 の受け入れ条件はすべてカバー済み。
  - dropzone（破線枠・「ファイルをドラッグ&ドロップ またはクリックして選択」「複数選択にも対応」）
  - 説明テキスト「ファイルから新規ノートを作成します。HTML / Markdown / Office / PDF / 画像 / 音声に対応しています。」（実装 `app/components/ingestion/UploadDialog.tsx:23-26` と verbatim 一致）
  - 「取り込みキューを見る」フッターリンク（`pill-btn` で実装と同形）
  - × クローズボタン（`aria-label="閉じる"`、32×32 円形）
  - 既存ホーム画面（P10）を背景に重ねる構成（`filter: blur(2px); opacity: 0.55; pointer-events: none`）
  - backdrop（半透明 + blur 6px）と Dialog primitive と同じ寸法／余白／色トークン
  - レスポンシブ対応（`@media (max-width: 640px)` で padding と dropzone を縮小、ロゴ非表示・pill-btn 圧縮）、mobile tap target 44px も保持
- **[N-002]** `:root` トークンは `P14-publish-settings.html` と完全に同一値。`tokens.md` の `--shadow-focus` 等とも整合。
- **[N-003]** アクセシビリティは `role="dialog"`, `aria-modal="true"`, `aria-labelledby="modalTitle"`、close button の `aria-label="閉じる"`、装飾 SVG の `aria-hidden="true"` まで正しく付与されている。
- **[N-004]** モーダル幅 480px（plan.md の設計判断通り。P14 の 560px と差別化）。`.modal-close` の `border-radius: var(--radius-full)` は P14 の `50%` と等価。
- **[N-005]** `spec/design/index.md` セクション9 の更新は PR スコープと一致。リンクパス `./pages/P13-upload-modal.html` も相対参照として正しい。
- **[N-006]** 既存ページモック（P10, P11, P12, P14 等）への変更は一切なし。スコープが厳密に守られている。
- **[N-007]** 軽微な観察として、`spec/design/index.md:138` に「`max-width` メディアクエリは使わない」とあるが、新規ファイルで `max-width` メディアクエリを 3 箇所使用している。ただし既存の `P14-publish-settings.html` も同じパターンを採用しており、本 PR で新たに導入された逸脱ではなく、index.md 側の表記が実態と乖離している既存課題。本 PR では指摘外（必要なら別 Issue で index.md 側を実態に合わせるのが筋）。

---

## Design Decisions

特になし
