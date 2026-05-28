# PR Review #001 — feat(issue/232): add directory CRUD UI

**PR:** #291
**Date:** 2026-05-28
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 18
- Notes: 17
- Verdict: **BLOCKED**

---

## Frontend

#### Blockers
なし

#### Warnings
- **[FE-W-001]** `TREE_ITEM_ROW` の active 状態スタイルが子の `data-active`/`aria-current` セレクタに届かない（視覚リグレッション）
  - 場所: `app/components/directory/styles.ts:12` / `app/components/directory/DirectoryTree.tsx:312-322`
  - 理由: `TREE_ITEM_ROW`（外側 div）に `data-[active]:bg-surface aria-[current=page]:bg-surface` を載せているが、属性は子 `<Link>` にしか付かない。旧 `DirectoryNode` は Link 自身に `NAV_ITEM` を載せていたので機能していた。
  - 提案: `TREE_ITEM_LINK` 側に active style を移譲し、`TREE_ITEM_ROW` から該当 modifier を外す。

- **[FE-W-002]** inline rename で `onBlur={commit}` と Enter `commit()` が二重発火
  - 場所: `app/components/directory/DirectoryTree.tsx:441-460`
  - 理由: Enter → `commit()` で `disabled` 化 → blur 発生 → `onBlur` が再度 `commit()` を起動。重複 server fn 呼び出し。
  - 提案: `commit` 内で `committedRef = useRef(false)` を入れる、または `isPending` 時に skip。

- **[FE-W-003]** `expanded` state が削除済み id をリーク（軽微）
- **[FE-W-004]** `SIDEBAR_SECTION_TITLE_INLINE` が `SIDEBAR_SECTION_TITLE` から padding 抜いただけの重複定数（軽微）
- **[FE-W-005]** `DirectoryActionsMenu` の Esc `stopPropagation` の意図がコメント不足（軽微）
- **[FE-W-006]** focusable 取得の DOM 順依存（実害なし、コメント追加推奨）

#### Notes
- ADR-008 / ADR-009 の実装時判断は記録が誠実
- `MoveDirectoryDialog` の循環防止 / `tree[0].id` 明示送信は plan 通り
- Dialog の submit `stopPropagation` 追加（form-in-form 対策）は明確
- ConfirmDialog destructive / roving / business error の 3 つは follow-up に正しく分離
- `useTransition` / `useServerFn` / `router.invalidate` パターン統一
- Active state を `bg + font-medium` の二重指定で色のみ依存回避（FE-W-001 を直したらこちらも維持）

---

## Accessibility

#### Blockers
なし

#### Warnings
- **[A11Y-W-001]** メニュー項目クリックでダイアログ open → close 後に「︙」トリガーへ focus が戻らない
  - 場所: `DirectoryActionsMenu.tsx:68-71` / `Dialog.tsx:169-181`
  - 理由: `runAndClose` は `setOpen(false)` で menuitem を unmount → Dialog open。Dialog の `previousActiveRef` 捕捉時には menuitem が消えているため `<body>` フォールバック。
  - 提案: ダイアログ open 直前に `triggerRef.current?.focus()` を同期で呼ぶ、または `runAndClose` の順序を `fn(); setOpen(false);` に。

- **[A11Y-W-002]** inline rename Esc キャンセル後にフォーカスが treeitem に戻らない
  - 場所: `DirectoryTree.tsx:300-323, 448-460`
  - 提案: `InlineRenameInput` unmount 後に対応する `<a>` に focus を返す。

- **[A11Y-W-003]** rename error と input が `aria-describedby` で結びついていない
- **[A11Y-W-004]** menu open 時に最初の menuitem に自動フォーカスしない（最低限の menu pattern）
- **[A11Y-W-005]** 空状態 CTA が `root === undefined` で sink、disabled 表現がない（root は常に存在するが防御）
- **[A11Y-W-006]** 「+」「︙」icon ボタンに `title` 併記の余地（任意）
- **[A11Y-W-007]** Move select の階層が leading whitespace だけで表現され SR には伝わらない
  - 提案: `path` を leading whitespace ではなくセグメント連結で見せる、または whitespace+path 併用。

#### Notes
- Dialog の focus trap / 初期フォーカス / IME composition Esc 抑制 / SSR rAF 初期フォーカスは高水準
- `role="alert"` の error 表示は dynamic mount で SR 通知タイミング正しい
- `aria-haspopup="menu"` / `aria-expanded` / `aria-controls` は WAI-ARIA Menu Button pattern 必須属性を満たす
- disclosure ボタン `tabIndex=-1` で ArrowLeft/Right に集約
- Apple Calm のホバートーンに opacity-only ホバー + `focus:opacity-100` でキーボード操作の発見可能性確保
- ADR-006 スコープ判断は妥当、v1 サブセットで Issue 完了条件は満たす

---

## Architecture / Spec

#### Blockers
- **[ARCH-B-001]** DeleteDirectoryDialog 経由の form-in-form bubble が未対策
  - 場所: `app/components/directory/DeleteDirectoryDialog.tsx:35-47` / `app/components/common/ConfirmDialog.tsx:41-45`
  - 理由: DirectoryPicker の「削除」ボタンから `DeleteDirectoryDialog` が NoteEditor の `<form>` 内に portal でマウントされる。`ConfirmDialog` 内部の `<form onSubmit={submit}>` は `event.stopPropagation()` を呼んでいないため、ユーザーが「削除」を押すと React のシンセティックイベントが NoteEditor の outer form の `onSubmit` まで bubble する。これは PR 内で Rename/Create/Move 用に修正された form-in-form 問題と同じ構造で、TC-008 で実機再現した「ダイアログ閉と同時に detail ページ遷移」と同じ症状になる。TC-009 はキャンセルしか叩いていないため検証から漏れている。
  - 提案: 根本対処として `ConfirmDialog` 自体の submit ハンドラに `event.stopPropagation()` を追加。同パターンの他 form 内 ConfirmDialog ユース（IngestionPreviewForm 等）も同時に救える。

#### Warnings
- **[ARCH-W-001]** `DirectoryActionsMenu` の閉鎖トリガーが mousedown と Escape のみで、focus 喪失で閉じない
- **[ARCH-W-002]** cross-domain dependency: `app/components/directory/` → `app/components/note/directoryTree.ts`（plan の説明はあるが follow-up Issue 化推奨）
- **[ARCH-W-003]** `app/components/directory/schema.ts` の transport boundary で禁止文字バリデーションが未実装
  - 提案: `.regex(/^[^/\\<>:|?*\x00]+$/)` 追加。EC-002 の改善に寄与
- **[ARCH-W-004]** `parentId as unknown as string` キャストが presentation 内に散在
- **[ARCH-W-005]** DirectoryTree の React `key` に branded id を string キャスト（W-004 と同根）

#### Notes
- ADR と plan の整合性高い
- `tree[0] = root` invariant コメントが 3 箇所に統一トーンで配置（CLAUDE.md WHY-comment 方針通り）
- `MoveDirectoryDialog` の `null → root` フォールバック依存しない明示送信
- spec/scenario D1 に Issue #232 ADR-005 フォロー予定の注記
- ADR-008（`<div role="tree">`）の意思決定が読み取れる
- 既存 `MoveNoteDialog` パターン忠実踏襲、新規ユースケース追加なし

---

## Design Decisions

このラウンドで見つかった追加の設計判断:
- ConfirmDialog 自体に `event.stopPropagation()` を追加するか、各呼び出し側ラッパーで対処するか → ADR 候補

---
