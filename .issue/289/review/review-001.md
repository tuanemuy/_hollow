# PR Review #001 — feat(issue/289): roving tabindex keyboard nav for DirectoryActionsMenu

**PR:** #334
**Date:** 2026-05-29
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2（W-001 修正済み / W-002 変更不要）
- Notes: 5
- Verdict: **APPROVED**

複雑度「小規模」のため General Review 1 本で実施。

---

## General Review

変更は実質 `app/components/directory/DirectoryActionsMenu.tsx` 1 ファイル（残りは `.issue/289` のドキュメント / manual-test 成果物）。plan.md / adr.md の設計判断（roving tabindex 採用・type-ahead スコープ外・stopPropagation での二重発火回避）と実装は整合。roving tabindex の中核ロジック（activeIndex とフォーカス同期、open 時リセット、ラップ計算）は正しい。

### Blockers
- なし

### Warnings

- **[W-001]** トリガー `onClick` が開閉どちらでも `setActiveIndex(0)` を呼んでおり、「open 時のみリセット」という意図が読み取りづらい（`DirectoryActionsMenu.tsx` トリガー onClick）。機能バグではなく可読性の指摘。
  - **対応:** 修正済み。`if (!open) setActiveIndex(0);` に変更し、開くときだけリセットするようにした上で WHY コメントを 1 行追加。

- **[W-002]** `.issue/289/manual-test/seed.sql` / `seed-ids.json` にテスト用ユーザーの平文パスワード + scrypt ハッシュ + 固定 UUID がコミットされている。
  - **対応:** 変更不要と判断。`.issue/1/manual-test/seed.sql`（平文 `TestPassword123!` + ハッシュ）・`.issue/127/manual-test/seed.sql`（scrypt）など、manual-test の seed をフィクスチャとしてコミットするのはリポジトリ既存の確立された慣習（committed manual-test files 526 件）。本番 DB と隔離された `e2e-test@example.com` 専用 upsert で実害は限定的。本 Issue のコア（コンポーネント実装）外であり、新規方針を持ち込まず既存慣習に合わせる。

### Notes

- **[N-001]** `onMenuKeyDown` は毎レンダ再生成され現在の `activeIndex` を読むため stale closure なし。`items` 配列の毎レンダ生成も項目 4 個・メモ化なしで不整合を生まず問題なし。付与コメントは全て WHY に限定され CLAUDE.md のコメント方針に準拠。
- **[N-002]** APG Menu パターン準拠が良好。Enter/Space はネイティブ button クリック、Tab はネイティブ移動 + roving + onFocusOut クローズ、Escape は意図的に document ハンドラへ bubble、矢印/Home/End のみ `preventDefault`+`stopPropagation`。stopPropagation が「処理したキーのみ」に限定されている設計は正しい。
- **[N-003]** `data-danger={item.danger || undefined}` は CLAUDE.md ADR-003 の data-* 規約に準拠。styles.ts 側の `data-[danger]:` presence variant と整合。
- **[N-004]** DirectoryTree treeitem ナビ（ArrowUp/Down 兄弟移動）との二重発火は `stopPropagation` で防止。onMouseDown preventDefault / onFocusOut / open 時フォーカスのいずれも回帰なし（manual-test TC-006 で確認）。
- **[N-005]** ADR-002（type-ahead スコープ外）の判断は妥当。フォーカス対象が button のため IME composition が発生せず `isComposing` ガード不要。

---

## Design Decisions

特になし（plan.md / adr.md で記録済みの判断から逸脱なし）。
