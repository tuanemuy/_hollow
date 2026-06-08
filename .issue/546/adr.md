# 実装時の追加設計判断 — Issue #546

plan.md の ADR-001〜005 を基本方針とする。実装中に下した非自明な判断のみ以下に追記する。

## client 島を単一 `ErrorNavActions({kind, showReload})` でなく `ReloadButton` / `BackLink` の2エクスポートに分割

### コンテキスト

plan.md ステップ2/ADR-003 は「back/reload を扱う小さな client 子 `ErrorNavActions`
（props は `kind` / `showReload`）」を想定していた。一方 P34 モックの DOM 構造では、
500 の「再読み込み」ボタンは `err-actions` コンテナ内のプライマリ要素（その後ろに
セカンダリ `<a>`「ホームへ戻る」が続く）として置かれ、「一つ前に戻る」バックリンクは
`err-actions` の外側・直下に兄弟要素として置かれる。両者は DOM 上の親が異なる。

### 決定内容

`ErrorNavActions.tsx`（`"use client"`）から、`ReloadButton`（reload プライマリ）と
`BackLink`（全バリアント共通のバックリンク）の2つを名前付きエクスポートする。
`ErrorPage`（サーバー）側で、`ReloadButton` を 500 の `err-actions` 内に、`BackLink` を
`err-actions` の外側直下に配置する。

### 理由

単一コンポーネントで両要素を内包すると、reload と back-link が同じ親の下に並ぶことになり、
モックの DOM 構造（reload は err-actions 内のプライマリ、back-link は外側の兄弟）と
レイアウト・余白（`err-actions` の `mb-6` / `flex` 中央寄せ）が崩れる。
責務最小の client 島を2つに分けることで、各要素を本来あるべき DOM 位置に
サーバー側から配置でき、SSR 維持（onClick を持つ要素だけ client）という ADR-003 の
意図も保てる。props も `kind` を渡さず、各島が自分の関心（reload / back）だけを持つ
ため凝集度が高い。
