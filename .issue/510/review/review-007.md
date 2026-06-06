# PR Review #007 — トースト導入 + auth ページ `.form-error` → `.alert` 統一（案D）

**PR:** #518
**Date:** 2026-06-07
**Round:** 7回目（未コミット作業ツリー差分の監査）
**対象:** `common-toast.html` / `P01-signup.html` / `P01b-admin-setup.html` / `P03-login.html`（4 ファイル、未コミット差分のみ）

---

## Summary

- Blockers: 0
- Warnings: 0
- Nits: 3
- Verdict: **APPROVED**

PR518 最終コメント「トーストを導入し、`.callout` / `.alert` / `.notice` / `.banner` と使い分けたい」への対応として、(1) `common-toast.html` のトーストから左セマンティックバー（`border-left`）を撤去しアイコン色のみで意味を出す Apple Calm 化、(2) auth 3 ページ（P01 / P01b / P03）の旧 `.form-error`（塗りつぶし背景 callout）を共通 `.alert`（案D：白地 + セマンティック枠 + アイコン + 見出し + 本文）へ移行、を確認した。移行後の `.alert` 基底・サブ要素は P04 / P15 / P44 の正準定義と一致し、トークン違反・塗りつぶし背景・構造破綻・横スクロール誘発は無い。指摘はすべて軽微（SSOT 文言の追従、P01 の死にルール 1 件、per-page margin 方向のばらつき）にとどまる。

---

## 指摘充足マトリクス（最終コメント intent）

| # | intent | 判定 | 一言 |
|---|--------|------|------|
| 1 | トースト（一時的・グローバル）を導入 | ✅ | `common-toast.html` が `.alert` と同じ `--alert-accent` 1 変数で切替、白地 + `--shadow-md` + `--radius-lg`。今回 `border-left` を撤去しアイコン色のみで意味付け（Apple Calm 強化）。 |
| 2 | `.alert`（インラインアラート・恒常）への集約 | ✅ | auth 3 ページの `.form-error` を案D `.alert` に移行。基底 + `.alert-icon/content/title/body` が正準（P04/P15/P44）と一致。 |
| 3 | `.callout` / `.notice` を `.alert` へ集約 | ✅ | `spec/design/pages/` 全体に `.callout` / `.notice` クラス定義は残存しない（grep 0 件。P03/P40 の "callout" は CSS コメント／prose の説明語のみ）。 |
| 4 | `.banner` の使い分け | ✅（別カテゴリとして残置が妥当） | `.banner` 定義は `P40-admin-dashboard.html` のみ残存（admin 運用ダッシュボードの status banner 系。インラインアラートとは別カテゴリの構造体で、案D 集約対象外）。最終コメントの「使い分け」意図と整合。 |
| 5 | auth ページが最後の `.form-error` ホールドアウトの解消 | ✅（残存は別パターン） | auth 3 ページの callout 型 `.form-error` は全廃。残る `.form-error`（P10 系ダイアログ・P20-view-form-dialog）は**単一行の `<p class="form-error">` フィールド/サマリーエラー**であり、本件が集約した「アイコン + 見出し + 本文の callout ボックス」とは別物。今回スコープ外で妥当。 |

---

## 検出事項

### Blockers

なし

### Warnings

なし

### Nits

- **[N-001]** トースト SSOT（index.md §241）が「左に細いセマンティックバー**か**アイコン色」のままで、now-canonical なアイコンのみ実装と緩く乖離
  - 場所: `spec/design/index.md:241`（「白地のまま左に細いセマンティックバーかアイコン色で意味を出す」）vs `spec/design/pages/common-toast.html:202-203,218,372-373`（`border-left` 撤去、`align-items:center`、コメント「左のセマンティックバーも使わず、アイコン色だけで意味を出す」）
  - 問題: index.md は EITHER（バー or アイコン色）を許容するため、モックの「アイコン色のみ」は**許容範囲内であり違反ではない**。ただしモックが「バーも使わない」と明示・断定した結果、SSOT とモックの規範の強さがズレた（SSOT は両許容、モックは一択に確定）。同様に `.toast-icon svg { width:18px; height:18px }`（225 行）と `.toast:has(.toast-sub) .toast-icon { height: calc(var(--text-sm) * var(--leading-snug)) }`（233-236 行）でアイコンを 1 行目縦中央へ合わせる挙動も SSOT に未記載。
  - 根拠: `spec/design/index.md` §フィードバック・エラー表示原則 §240-241（トースト構造／セマンティック）。
  - 推奨: index.md §241 を「**白地のままアイコン色で意味を出す（左セマンティックバーは用いない）**」へ寄せ、now-canonical なモックと一致させる（SSOT を tighten）。バーを将来の選択肢として残したいなら現状維持も可だが、その場合はモックのコメントの断定（「バーも使わない」）を「本モックではアイコン色のみ」と相対化したほうが整合する。どちらかに寄せる小タスク。視覚破綻・意味誤りは無いため出荷ブロッカーではない。

- **[N-002]** `P01-signup.html` の `.alert-body a` が死にルール（本文内にアンカー無し）
  - 場所: `spec/design/pages/P01-signup.html:309`（`.alert-body a { color: var(--color-accent); ... }`）。P01 の `.alert-body` 実体は 539 行「すでに登録されています」・641 行「システムエラーが発生しました」のみで `<a>` を含まない。
  - 問題: `.alert-body a` は P01b（455 行「…通常のサインアップは <a>こちら</a> から…」で実使用）からのコピー時に持ち込まれた未使用ルール。canonical の P04/P15/P44 はこのルールを持たない（リンク本文が無いため）。P01 では適用対象が存在せず無害だが、正準定義からの局所的逸脱（余剰 1 ルール）。
  - 根拠: canonical `.alert` 定義（`P04:291-312` / `P15:502-524` / `P44:174-195`）には `.alert-body a` 無し。`.alert-body a` を持つのは P01・P01b の 2 ファイルのみ。
  - 推奨: P01 から `.alert-body a` を削除（本文にリンクが入る可能性があるなら残置でも無害）。P01b は実使用ありで正当な局所拡張のため維持で可。

- **[N-003]** auth 3 ページの基底 `.alert` margin 方向がページ間でばらつく
  - 場所: `P01-signup.html:298`（`margin-bottom: var(--space-6)`）/ `P01b-admin-setup.html:276`（`margin-bottom: var(--space-6)`）/ `P03-login.html`（基底 `.alert` に margin 無し、316-326 行）。canonical の `P04:302` は `margin-top: var(--space-6)`、`P15:513` は `margin-top: var(--space-2)`。
  - 問題: 基底 `.alert` の外余白は元々ページごとに異なる（canonical 自体 P04 と P15 で値が違う）ため per-page 調整は許容範囲。ただし P01/P01b は `margin-bottom`、P04 は `margin-top` と「方向」もばらつき、フォーム内設置時は全ページ共通の `.form .alert { margin-bottom: 0 }`（P01:311 / P01b:361 / P03:339）で打ち消す前提になっている。P03 は基底に margin が無いため `.form .alert { margin-bottom: 0 }` は打ち消し対象が無く実質 no-op（無害な保険）。
  - 根拠: `tokens.md` §3（`--space-6` = 24px。直値ではなくトークン参照で規約遵守）。
  - 推奨: 現状維持で可。気になるなら基底 margin の方向を canonical（`margin-top`）に揃えるか、フォーム外でも `.alert` を使う箇所が無いページ（P03）では `.form .alert` override 自体を省ける旨をコメントに残すと将来の改変耐性が上がる。トークンは正しく使用しており違反ではない。

---

## 確認した健全性（問題なし）

- **`.alert` 正準一致**: P01:287-309 / P01b:265-287 / P03:316-336 の基底 + サブ要素（`.alert-icon` `margin-top:1px`、`.alert-content` `gap:2px / min-width:0`、`.alert-title` `letter-spacing:-0.01em` + `--alert-accent` 着色、`.alert-body` `--color-ink-secondary` + `--leading-relaxed`、`.alert-body strong` `--color-ink`）は P04/P15/P44 の canonical と**プロパティ単位で一致**。`.alert-info/success/warning/error` の `--alert-accent` 切替も同一。divergence は N-002 の `.alert-body a`（P01 で死にルール／P01b で実使用）のみ。
- **HTML 構造一致**: 移行後の各 alert は `div.alert.alert-error[role=alert] > span.alert-icon[aria-hidden] > svg(20×20, stroke-width:2) + div.alert-content > p.alert-title + p.alert-body` で、canonical の P15:725 / P44:270 と同型。旧 `.form-error` の `<span><strong>…</strong> …</span>` 平坦構造から見出し/本文の意味的分離へ正しく昇格。
- **トースト構造健全性**: `border-left: 3px solid` 撤去、`padding` を非対称（`--space-3 ... --space-4`）から対称 `--space-3` へ、単一行は `.toast { align-items:center }`、複数行のみ `.toast:has(.toast-sub) { align-items:flex-start }` + アイコンを `calc(var(--text-sm) * var(--leading-snug))` で 1 行目縦中央へ。`.toast-body` の `padding-top:1px` も撤去され center 揃えと整合。論理的に well-formed。
- **トークン準拠**: 4 ファイルとも新規マジックナンバー px の混入なし。新規 `.alert` 規則はすべて既存トークン参照（`--space-3/4/6`、`--radius-lg`、`--shadow-xs`、`--text-sm`、`--color-*`、`color-mix(... --alert-accent 30% ...)`）。トースト側の `18px`（`.toast-icon svg`）は SVG の `width/height` 属性（20）に対するアイコンサイズの実測値で、従来から SVG 寸法は属性直値運用（canonical の alert SVG も 20×20 属性直値）であり新規トークン化対象外。新規トークン（`--toast-*` 等）の追加なし。
- **Apple Calm**: 白基調維持。`.form-error` の `background: var(--color-error-surface)`（塗りつぶし）を全廃し、`.alert` は `background: var(--color-bg)` + セマンティックヘアライン枠 + `--shadow-xs`。トーストは浮く要素として `--shadow-md` のみ（基底 218 行）。塗りつぶしセマンティック背景の新規導入なし。
- **a11y**: 移行後 alert は `role="alert"`（エラー）を維持、P01b の補足は `role="note"`（451 行）。装飾 SVG に `aria-hidden="true"`（`.alert-icon` span に付与）。トーストの `role=status/alert` + `aria-live` 使い分け・close ボタンのタッチ拡張は前ラウンド（review-006）から不変で回帰なし。
- **残骸なし**: 4 変更ファイルに `.form-error` クラス定義・`border-left`・`--color-error-surface` 参照の残骸ゼロ（grep 0 件）。CSS コメント内の「callout」言及（P03:311 等）は説明語であり実体クラスではない。
- **ブレース balance**: P01（62/62）/ P01b（70/70）/ P03（63/63）/ common-toast（43/43）すべて開閉一致。
- **横スクロール**: alert は `min-width:0`（`.alert-content`）+ flex で内容を折り返す。トーストは `max-width:380px` + `min-width:0`。新規の横溢れ要因なし。

---

## Design Decisions

- トーストの意味付けを「左セマンティックバー or アイコン色（両許容）」から「アイコン色のみ」へ実装上確定（モック）。SSOT（index.md §241）は依然 EITHER 許容のため**違反ではない**が、N-001 として「SSOT を now-canonical なモックへ tighten する」小タスクを推奨。
- auth 3 ページの callout 型 `.form-error` を案D `.alert` へ集約し、塗りつぶし背景を全廃。これにより案D `.alert` 採用ページが P04/P06/P13/P15/P44/P47 等に加え auth 系へ拡大、index.md §251 の参照モック列挙（P03/P01b/P04 を含む）と実体が一致。
- 単一行トーストの縦中央揃えと複数行（`.toast-sub`）の上揃え切替を `:has()` セレクタで分岐。`prefers-reduced-motion` 等の既存挙動には触れておらず回帰なし。
- P10 系ダイアログ・P20-view-form-dialog の単一行 `.form-error` は本件の集約対象外（callout ボックスではなくフィールド/サマリー単行エラー）。auth callout のホールドアウトは本ラウンドで解消済み。
