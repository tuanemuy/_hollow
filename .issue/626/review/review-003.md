# Review 003 — #626 R2 リファイン（デザイン整合性 + 計画/a11y）

対象: 未コミット差分（`spec/design/pages/P10-home.html` / `mobile/P10-home.html` / `P10-home-skeleton.html` / `drafts/P10-toolbar-options.html` / `.issue/626/adr.md`）

レビュー観点: トークン準拠、quiet/editorial 整合、デスクトップ/モバイル/スケルトン整合、a11y 契約（ADR-001 のデバイス別 title 方針含む）、ADR-004〜007 の記録妥当性、スコープ。

## Blockers

なし。

## Warnings

### W1: view-switcher（見出しボタン）が長いビュー名で折り返せない

両モックともグローバルの `button, .btn, .pill-btn, .icon-btn { white-space: nowrap; }`（desktop L158 / mobile L158）が `.view-switcher` にも当たる。h1 側の `overflow-wrap: anywhere` は button 内の `nowrap` に勝てないため、長い保存ビュー名（見出し = ビュー名になったのは今回の変更）でメインカラムを横にあふれる。ADR-007 は「極端に長いビュー名…折り返しが発生する（flex-wrap で許容）」と件数行のみ言及しており、見出し自体の折り返しが未手当て。`.view-switcher { white-space: normal; }`（mobile は特に 320px で必須級）を足すか、ADR-004 に省略形（truncate）方針を明記すべき。

### W2: `.filter-clear-x` の transition がデスクトップとモバイルで不整合

- desktop: `transition: var(--transition-bg), color var(--duration-fast) var(--ease-standard);`
- mobile: `transition: var(--transition-bg);` のみ（hover で color も変えているのに color が遷移しない）

どちらも hover 挙動は同一（surface + ink）なので transition も揃えるべき。また desktop 側の `color ...` は既存トークン `--transition-color` がそのまま使える（`var(--transition-bg), var(--transition-color)`）。生値ではないが、トークンで表せる組み合わせを手書きしている。

### W3: drafts の `.title-menu` box-shadow が生値（= `--shadow-md` と同値）

`drafts/P10-toolbar-options.html` の R2 補助スタイルで `box-shadow: 0 8px 24px rgba(0,0,0,0.08)` と直書きしているが、これは `--shadow-md` の定義値と完全一致。drafts は参考枠とはいえ、この開状態フレームは ADR-004 が「開状態は drafts の参考フレームに提示」と正規参照しているため、実装者がここからコピーする可能性が高い。`var(--shadow-md)` にしておくべき。

## Notes

### N1: スケルトンの件数プレースホルダのクラスと inline width が二重指定

`P10-home-skeleton.html` L749 付近: `<div class="skeleton-line w18" style="width:110px">` — `w18`（width:18%）を inline の 110px が即上書きしており、クラスが死んでいる。`w18` を外すか専用クラスにするのが綺麗。動作上の問題はない。

### N2: mobile `.toolbar-actions` の注記が R2 を反映していない

mobile L570-572 のコメントは「狭幅のためラベルを畳みアイコンのみ (#626)」のままで、R2 でアイコンのみがデバイス共通の確定形（ADR-005）になったことに触れていない。デスクトップ側の注記は更新済みなので片落ち。誤りではないが、後から読むと「狭幅対応の妥協」に見える。

### N3: ADR-005 の「36px角…デバイス間で表現を統一」はサイズ統一ではない点

mobile のアイコンボタンは `.icon` クラスを持たず 44px 床（タッチ床）+ padding のままで、36px 角になるのはデスクトップのみ。「表現（アイコンのみ）の統一」であってサイズ統一ではない、という読みで整合は取れているが、ADR-005 Decision の文面は 36px 角がデスクトップ限定であることをもう一語明示するとより正確（mobile の 44px 床維持は ADR-001 と一貫しており設計自体は正しい）。

### N4: リポジトリ直下に `--full-page` という未追跡ファイルが残っている

スクリーンショットコマンドの引数誤りで生成されたとみられる artifact。コミット前に削除を推奨（本差分のスコープ外）。

## 確認済み（指摘なし）

- トークン準拠: 正モックの新規 CSS は `--radius-full` / `--radius-md` / `--transition-bg` / `--duration-fast` / `--ease-standard` / `--color-ink-*` / `--space-*` のみで生値混入なし（W2/W3 を除く）。`--radius-full`(9999px) と既存 `--radius-pill` の混在は値が同義で実害なし。
- ADR-004 a11y: `aria-haspopup="listbox"` + `aria-expanded="false"` + 現在ビュー名入り `aria-label` が desktop/mobile 双方に実装どおり。`title` はデスクトップのみ・モバイル省略で ADR-001 契約に一致。mobile view-switcher は `min-height: 44px` を明示（[role=button] 床に頼らない判断の注記もあり）。
- ADR-005 a11y: desktop の「選択」「ビューとして保存」は `aria-label` + `title` 併記、「選択」の `aria-pressed` 維持。mobile は `aria-label` のみ・`title` なし。契約どおり。
- ADR-006 a11y: × は両モックで `aria-label="フィルタをすべてクリア"`、desktop のみ `title`。mobile の見た目 32px + 「実装時に当たり判定を 44×44px 相当へ拡大」の注記が CSS コメントと ADR の両方に記録済み。`flex-shrink: 0` で横スクロール行でも潰れない。
- ADR-007: desktop/mobile/skeleton の3点とも「見出し1本 + 件数/アクション群1行」に揃っており、skeleton の select プレースホルダ廃止・btn-ph の 36px 角化・件数ライン化も本体に正しく追従。mobile は `gap: var(--space-2) var(--space-3)` で折返し時の行間も配慮。
- skeleton の a11y 構造（`role="status"` / `aria-busy` / `aria-hidden` の使い分け）は変更前の契約を維持。
- ADR-004〜007 の記録: Context にフィードバック原文の趣旨、Decision に a11y 契約、Consequences にトレードオフ（発見性低下、折返し）が明記され、drafts に R1 変更前/R2 確定形/開状態参考の比較フレームあり。記録品質は高い。
- スコープ: `app/` への変更なし。非表示モード用途の segmented（P15/P16/P18）への波及なし（注記でも対象外と明言）。`.issue/545/plan.md` の変更は本件と無関係の既存 dirty。

## Verdict

**APPROVE（条件付き）** — Blocker なし。W1（長いビュー名の折り返し）は実装前に必ず手当てすること。W2/W3 はコミット前の修正を推奨。

---

## 対応結果（2026-06-12）

W1（view-switcher 折り返し）/ W2（filter-clear-x transition 統一）/ W3（title-menu shadow トークン化）/ N1〜N4 すべて修正済み。320px 幅含め描画崩れなしを agent-browser で確認。Verdict: **APPROVED**
