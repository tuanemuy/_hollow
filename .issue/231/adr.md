# ADR — Issue #231: アクションボタン群にアイコンを導入する

## ADR-001: アイコンライブラリに lucide-react を採用する

### Status
Proposed

### Context
プロジェクトに汎用アイコンライブラリは未導入で、`SearchIcon`（`PublicLayout.tsx`）のような個別 SVG のハンドコードや、`mask-image:url("data:image/svg+xml;utf8,…")` 方式（`layout/styles.ts` の `SEARCH_BOX_ICON`）が散在している。後者は #217 の「検索アイコンが豆腐になる」現象の真因と見られる。Issue 本文では候補として lucide-react / @radix-ui/react-icons / Heroicons が挙がっており、推奨は lucide-react。

### Decision
`lucide-react` を採用する。理由:

1. **spec/design との整合** — `spec/design/index.md` §7 が「線画系・1.5px ストローク・SF Symbols 風（Phosphor / Lucide で代用可）」と Lucide を明示的に許可しており、`spec/design/pages/*.html` の SVG プロトタイプ（24 viewBox / stroke 1.5px）も Lucide スタイルと同形。
2. **tree-shake** — 個別 ESM export で、Vite (rollup) の tree-shake が確実に効く（1〜3KB/個）。
3. **React 19 / RSC 互換** — 純粋関数コンポーネントでフックを使わないため、サーバコンポーネントから直接呼べる。`"use client"` 不要。
4. **カバレッジ** — 1500+ アイコンがあり、想定範囲のアクション（編集・削除・コピー・エクスポート等）はすべて揃う。

@radix-ui/react-icons は Radix 未採用のため相性メリットがない。Heroicons は線が太めで spec/design のトーンと不一致。

### Consequences
- 良い点: spec とコードの整合が取れる。#217 が `Header.tsx` の `mask-image` 撤去で同時解消。RSC からも直接利用可能。
- トレードオフ: lucide-react 1 依存の追加。barrel import を避ける運用規約を守る必要がある。

---

## ADR-002: `Icon` ラッパーは薄い層に留める

### Status
Proposed

### Context
lucide-react のコンポーネントは既に React コンポーネントとして完成しており、size・stroke・color はすべて props で渡せる。ラッパーを厚く作ると単に lucide の API を再実装することになり、メンテナンスコストが増す一方で、薄すぎると規約強制ができない。

### Decision
`app/components/common/Icon.tsx` を以下の最小インターフェースで作る:

```ts
type IconSize = 16 | 20 | 24;
type IconProps = {
  icon: LucideIcon;
  size?: IconSize;       // default 16
  label?: string;        // 指定時 role="img" + aria-label / 未指定 aria-hidden
  className?: string;
};
```

役割は ①size を §7 の三段階に**型レベルで**制約、②label 有無で aria 属性を自動切替、③stroke 1.5px をデフォルト固定、の 3 点のみ。クリック系の props は受けない（クリック領域は親 `<button>` の責務）。

### Consequences
- 良い点: §7（線画 1.5px・サイズ三段階・currentColor）と §8（aria-hidden/aria-label）の規約を一元強制できる。型レベルで `size: 18` のような誤用を防げる。
- トレードオフ: 生 lucide を import すれば規約を回避できる（機械的禁止は ADR-003 を参照）。

---

## ADR-003: `aria-label` 必須化は機械的 Lint で担保しない（三層防御）

### Status
Proposed

### Context
Issue の完了条件③は「アイコンのみのボタンは `aria-label` 必須を Lint or レビューガイドで担保」。Biome 2.x は `useValidAriaProps` / `noSvgWithoutTitle` を持つが、「ボタンが aria-label を持たないか中身に visible text を持つ」を直接チェックするルール（jsx-a11y の `accessible-name` 相当）は無い。ESLint + eslint-plugin-jsx-a11y を追加導入する選択肢もあるが、Biome 統一の現状から依存と設定の二重化を招く。

### Decision
**機械的 Lint 強制は導入しない。** 代わりに以下の三層で担保する:

1. **型レベル（第一防衛線、対象限定）** — `Icon` ラッパーの `label` prop の有無で aria 属性を自動切替（label 無しは強制的に `aria-hidden`）。**この層が担保するのは「装飾アイコンの `aria-hidden` 漏れ防止」のみ**であり、「アイコンのみボタンの `<button>` 側 `aria-label` 必須」までは型では強制できない（`<button>` の中身チェックは別問題）。
2. **テストレベル（第二防衛線）** — `Icon` ラッパーの単体テストで「label 有無での aria 属性切替」を検証。回帰検知。
3. **ガイドラインレベル（第三防衛線）** — `spec/design/index.md` §7 に「`Icon` を `<button>` の唯一の子にする場合、`<button>` 側に `aria-label` 必須・`Icon` 側は装飾扱い（`label` 未指定）」と明文化。レビュー観点として運用。`Icon` ラッパー JSDoc にも accessible name 二重指定の警告を再掲。

完了条件は "Lint **or** レビューガイドで担保" の OR なので、ガイドライン担保は条件を満たす。

### Consequences
- 良い点: 依存追加なし、Biome 統一を維持。装飾アイコン側の漏れは型で構造的に防止、`<button>` 側はガイドラインで担保。
- トレードオフ: 「アイコンのみボタン」を新規追加するときに `aria-label` を忘れるとレビューで検出するしかない。今回スコープでは「アイコンのみボタン」はほぼ存在せず（すべて icon+text）、実害は小さい。将来「アイコンのみボタン」が増えたら Lint 導入を再検討する。

---

## ADR-004: 実装で発生した小さな設計判断

### Status
Accepted (実装時に決定)

### Context
実装中に plan.md / ADR-001〜003 では明示されていなかった微小な判断が複数発生したため、後続の参照のためここに集約する。

### Decision

1. **空状態アイキャッチの `block` 付与** — Plan Step 13 は `className="mx-auto mb-3 text-ink-tertiary"` を指定していたが、`lucide-react` の SVG はデフォルトで `display: inline` のため `mx-auto` が効かない。実装では `block mx-auto mb-3 text-ink-tertiary` とし、`display` を block に切り替えてから水平中央寄せする。`size` prop による寸法決定の真実性は保たれる（`w-*` / `h-*` は触らない）。

2. **`ConfirmDialog` のタイトル領域構造変更** — Plan Step 12 は「タイトル `<h2 id={titleId}>` の左に `<Icon icon={AlertTriangle} size={20} />` を `aria-hidden` で配置」を要求。`dialogTitle` 定数 (`"text-lg font-medium mb-4"`) は `mb-4` を含み、`flex items-center gap-2` ラッパー内で `h2` に `mb-4` を残すと余白が二重になる。最小侵襲のため `dialogTitle` の利用をやめ、`<div className="flex items-center gap-2 mb-4">` のラッパー側に `mb-4` を寄せ、`h2` には `"text-lg font-medium"` を直接書く。視覚仕様は同じ (`text-lg font-medium` + 下マージン 16px)。`dialogActions` は引き続き定数経由。

3. **管理画面セクションヘッダのアイコン選定** — Plan Step 14 の例示（未完了ジョブ / 最近の失敗 / 最近の完了 / DLQ）は実装時の見出しと不一致（実際は「取り込みジョブ」「エクスポートジョブ」「検索インデックスの再構築」「クリーンアップ」）。それぞれの意味に合わせて `Upload` / `Download` / `Search` / `Sparkles` を採用した。`Sparkles` を「クリーンアップ」に選んだのは、`Eraser` がデザイン的に重く、`Broom` が lucide v1.16 に未収録のため。

4. **`PublicSearch.tsx` の検索アイコン位置クラス補正** — 元コードは `SearchIcon size={18}` で `SEARCH_ICON` クラスを使っていたが、その親は `SEARCH_FORM` (relative) であり、本来想定されるクラスは `SEARCH_FORM_ICON` (`left-[18px]`) と推察される（`SEARCH_FORM_INPUT` の `pl-12` = 48px と整合）。本 Issue で `SearchIcon` を削除する際、ヒーロー検索フォームでは `SEARCH_FORM_ICON` クラスに正しく切り替え、`size={20}`（lucide ラッパーで `size=18` は型レベルで許容されないため、近い 20 を選択）に統一した。これは Issue #231 のスコープ外の軽微な視覚改善だが、`SearchIcon` を削除する以上避けられない判断だった。

5. **`USER_SEARCH_ICON` 定数は触らない** — Plan Step 5 は `USER_SEARCH_ICON` を実装時調整対象として挙げたが、grep で確認した結果コード上どこからも参照されていない (`grep -rn USER_SEARCH_ICON app/` で定義箇所のみヒット)。本 Issue で削除/改変するとスコープを越えるため未変更。`UserPublicTop.tsx` の検索ボックスは従来から `SEARCH_ICON` クラスを使っており、今回の `left-[11px]` への詰めで Header と一貫性が取れた。

6. **空状態のアイキャッチを `IngestionQueue.tsx` に追加** — Plan Step 13 は対象ファイルとして `app/components/ingestion/UploadPage.tsx` を挙げたが、実際の空状態 (`EMPTY_STATE` を使う `<div>`) は `UploadPage` がレンダリングする `IngestionQueue.tsx` 側にある。`UploadPage.tsx` には `EMPTY_STATE` 利用箇所が存在しない。Plan の意図（アップロードキューの空状態にアイコンを置く）に沿い、`IngestionQueue.tsx` を修正対象とした。

7. **`UploadButton.tsx` 本体は変更せず、呼び出し側でアイコンを children に渡す** — Plan Step 6 は対象ファイルとして `UploadButton.tsx` を挙げたが、`UploadButton` は children をそのまま `Link` に流す薄いラッパーで、`Header.tsx` / `NoteListToolbar.tsx` / `Sidebar.tsx` から異なる children で呼ばれている。`UploadButton` 本体にアイコンを追加すると `Sidebar.tsx` の利用（本 Issue のスコープ外＝サイドバー全体のアイコン化は別 Issue 候補）にも影響する。最小侵襲のため、`Header.tsx` / `NoteListToolbar.tsx` の呼び出し側 children に `<Icon icon={Upload} />` を追加し、`UploadButton.tsx` 本体は無変更とした。

### Consequences
- 良い点: 実装時の細かな判断が記録され、将来 spec/code を読む人が再現できる。
- トレードオフ: なし。すべて plan.md の意図を維持する範囲の局所判断。

---
