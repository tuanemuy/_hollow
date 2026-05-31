# PR Review #001 — P11 ノート詳細: メタ情報パネルのレイアウト再構成

**PR:** #378
**Date:** 2026-05-31
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 3
- Notes: 10
- Verdict: **APPROVED（条件付き / Warning 修正後）**

---

## Frontend / UX / アクセシビリティ

### Blockers
なし

### Warnings
- **[W-001]** 公開状態チップの `aria-label` が可視テキストを上書きしている（WCAG 2.5.3 Label in Name はギリ部分一致で満たすがグレー）
  - 場所: `app/components/note/detail/NoteActions.tsx:155-164`
  - 提案: `aria-label` を外し、装飾ドットは `aria-hidden`、`sr-only` で「公開状態: 」プレフィックスを足して可視テキストをそのままアクセシブルネームにする
- **[W-002]** パンくず終端（ノートタイトル）に `aria-current="page"` が無く、SR に現在地が伝わらない
  - 場所: `app/components/note/detail/NoteBreadcrumb.tsx:69`
  - 提案: 終端 span に `aria-current="page"` を付与
- **[W-003]** `MENU` 定数が `NoteActions` 関数本体内で宣言されモジュールスコープ集約の規約に反する
  - 場所: `app/components/note/detail/NoteActions.tsx:126`
  - 提案: 他の定数同様モジュールスコープへ移動

### Notes
- N-001〜005: data-* 値マッチ variant の正しい使用、パンくず key 一意性、情報設計の Issue 意図整合、client/server 境界の妥当性、trashed 時の整合などを良好と評価。

## アーキテクチャ / 型安全 / 規約準拠

### Blockers
なし

### Warnings
なし

### Notes
- N-001〜005: branded 型 `as unknown as string` 慣習の整合、visibility variant の JIT 可視性、葉リンク出し分けロジックの健全性、依存方向（presentation → application）遵守、コメント方針準拠を確認。

---

## Design Decisions

特になし（plan.md / adr.md で既出の判断を確認したのみ）。

---

## 対応

W-001 / W-002 / W-003 をすべて修正 → review-002 で再レビュー。
