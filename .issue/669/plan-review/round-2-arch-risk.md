# Plan Review — Issue #669 / Round 2（アーキテクチャ・実現可能性・リスク視点）

レビュー対象: `.issue/669/plan.md` / `.issue/669/adr.md`（1周目反映後）
確認した実装: `routerInvalidate.ts`, `NoteEditor.tsx`（L273 の `routerInvalidate` / lazy `useReducer`）, `editor/styles.ts`（`editorToolbar` / `titleInput` / `editorActions`）, `routes/_app/notes/$noteId/edit.tsx` / `new.tsx`（いずれも `staleTime: 0`）, `UploadDialog.tsx:452,887`, `WysiwygEditor.tsx:577` / `InlineEditor.tsx:834`（`min-h-[320px]`）, `app/styles/tokens.css` / `index.css`（`--header-height` / `--radius-pill` / `--shadow-xs` 定義・bridge 済み）

## 1周目指摘の反映確認

- **P-001（両レビュー共通）— 反映済み・正確**: AC-9 が「routerInvalidate 経由の invalidate 下での state・フォーカス保持 ＋ seed-once は props 再同期退行の防止 pin（生 invalidate の RSC 再マウントへの防御では**ない**）」に弱められ、スコープ節 L37・設計2・ステップ2・リスク節・adr.md ADR-003 末尾の効果主張がすべて一貫している。エディター内 rename/delete（rule 2 生 invalidate）による編集内容喪失は「既知の残課題」として ADR-003 に明記され、手動検証 (f) で現状記録する手順も追加された。1周目提案 (b)+(c) に相当する解消で、矛盾は残っていない
- **arch S-001（要素順序）— 反映済み**: モック順序 `title → dir → tags → toolbar → editor` への並べ替えが設計3・ステップ4・5 に明記された
- **arch S-002（余白戦略）— 反映済み**: gap 加算方式を廃し「form の `gap-4` を外して各行 `mb-*` 直接指定」にステップ4/5/6が統一された。破綻ケース（dir 行 12px < gap 16px）の理由も記載され、gap 撤去に伴うエラーメッセージ等の余白漏れリスクもリスク節に追加されている
- **arch S-003（sticky wrapper のレイアウトシフト）— 反映済み**: ステップ3に wrapper 側への `mb-4`/高さ配置と sticky 発動時シフト確認、手動検証 (a) への追加が入った
- **arch S-004（見送り）— 妥当**: 実 match 生成のコストに対する保証の小ささという見送り理由は妥当。routeId は定数化 + 述語テスト + 1ファイル集約で追従可能

## 2周目所見

#### 問題点（要修正）

**問題点ゼロ。**

#### 改善提案

なし（無理な粗探しはしない。`top-[calc(var(--header-height)+var(--space-2))]` の arbitrary value は空白なし表記が計画に書かれており Tailwind 構文上も問題ない。`--header-height: 64px` は tokens.css に存在し、`@theme inline` bridge 不要のグローバル CSS 変数として calc 内で参照可能）

#### 良い点

- 1周目の核心（seed-once の防御範囲の過大主張）が、文言の弱体化だけでなく「どの経路に効き、どの経路に効かないか」の因果説明込みで全箇所（AC / スコープ / 設計 / ステップ / リスク / ADR）に一貫反映されている。レビュー履歴節に修正・取込・見送りが理由付きで記録されており追跡可能性が高い
- 残課題（rule 2 経路）を「対策追加でスコープを肥大させる」のではなく「手動検証 (f) で現状を記録して後続判断」とした線引きは、本 Issue の主目的（デザイン整合 + 本命経路の遮断）に対して適切なトレードオフ
- 余白戦略の margin 統一は、モック側が gap でなく要素ごとの margin で組まれている事実（P12-editor.html）と構造的に同型になり、今後のモック差分照合も容易になる
- 計画中の実装事実（L273 の invalidate、`ml-auto` 実装済み、両ルートの `staleTime: 0`、UploadDialog の2箇所、`min-h-[320px]` の位置、トークン bridge 状況）はすべて現行コードと一致しており、実現可能性に懸念なし

## 結論

1周目指摘はすべて正しく反映されており、新規の問題点はゼロ。計画は実装着手可能。
