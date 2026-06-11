# 実装計画 — Issue #631: design: デザインモックの可視ロゴが Vesica ロックアップに未追従

**Issue:** #631
**作成日:** 2026-06-11
**複雑度:** 中〜大規模

---

## 目的

`spec/design/pages/` 配下のモックHTML（自己完結・実装が正）を実装に追従させる。

1. **ロゴ sweep**: プレーンテキスト `class="logo">Hollow` を、実装 `BrandLockup`（`app/components/common/BrandLogo.tsx`）と視覚一致するインライン Vesica ロックアップ SVG に差し替える。
2. **ヘッダー sweep**（#628 追従・Issueコメントで集約指示）: 旧 header-right（新規作成primary＋アップロード＋アバター）→ 新形（アップロードaccent先頭＋新規作成text、アバター撤去）、ユーザーメニューのサイドバー最下部移設、モバイル `.cta-bar` 廃止、ヘッダー操作行 36px。

## スコープ

### 含まれるもの

- `spec/design/pages/` 全体のロゴ差し替え（desktop / mobile / drafts 含む 71ファイル・75箇所）
- アプリページ（desktop 18 + mobile 13）のヘッダー sweep（#628 確定形への追従）
- mobile/P15-export, mobile/P20-views の `.cta-bar` 廃止

### 含まれないもの

- アプリコード（`app/`）の変更 — 一切なし
- admin モックの header-right（実装 `app/routes/admin/route.tsx` はアバター維持のため触らない）
- public / auth / landing の header-right — P30〜P34 の header-right は公開ページ用（login/signup リンク）であり #628 のアプリグローバルヘッダーとは別物。ロゴのみ差し替える
- drafts/ のヘッダー（#628 の検討資料。ロゴのみ差し替え）

## 調査結果

### あるべき姿（実装＝正）

- **ロゴ**: `app/components/common/BrandLogo.tsx` の `BrandLockup` — Vesica マーク（`circle cx=9/15 cy=12 r=6.5`、stroke-width 1.5、`currentColor`、`translate(-14.57,-27.72) scale(5.83)`）＋ Avenir Next アウトライン化 wordmark path（`translate(150.77,0) scale(0.11)`）、`viewBox="-5 -1 480 86"`、height=16（全使用箇所デフォルト）。
- **ヘッダー**: アップロード(accent・先頭)＋新規作成(desktopテキストのみ/mobileアイコン)、アバターなし、操作行36px。ユーザー行はサイドバー最下部（上方向に開くメニュー）。確定形参照: `P10-home.html` / `mobile/P10-home.html` / `mobile/P13-upload.html`、`.issue/628/adr.md` ADR-001〜004。

### モック現状の分類

`class="logo">Hollow` 残存: **71ファイル・75箇所**（起票時の67から skeleton 等の追加で増加。desktop 41 + mobile 28 + drafts 2。P07-landing は header＋footer の2箇所ずつ）。マークアップは実測4バリエーション: `<div class="logo">`(47) / `<a href="#" class="logo">`(16) / `<a href="/" class="logo">`(10) / `<span class="logo">`(2)。実装着手時に grep で再カウントし、最新ヒット全件を対象とする。

ヘッダー sweep 対象グループ:

| グループ | 内容 | ファイル数 |
|---|---|---|
| A. desktop アプリページ | header-right 差し替え＋avatar撤去＋sidebar-user追加＋36px CSS（P10-home-skeleton, P11(-skeleton), P12, P13(-modal), P14, P15, P16, P17, P18(-skeleton), P20, P21(-skeleton), P22, P23, P24） | 18 |
| B. mobile アプリページ | 同上＋44px床の36px例外コメント（ADR-004）（mobile/P11〜P24） | 13 |
| B'. cta-bar 廃止 | mobile/P15-export, mobile/P20-views（Bに包含、ADR-001） | 2 |
| C. admin | header-right 維持、ロゴのみ | 17 |
| D. public / auth / landing | ロゴのみ | — |
| E. drafts/ | ロゴのみ | 2 |

## 実装ステップ

### 1. 確定スニペットの抽出と固定

- **ロゴ SVG**: `BrandLogo.tsx` の geometry から埋め込み用ロックアップ SVG を1つ確定する:
  `<svg xmlns="..." height="16" viewBox="-5 -1 480 86" role="img" aria-label="hollow"><g transform="translate(-14.57,-27.72) scale(5.83)" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="9" cy="12" r="6.5"/><circle cx="15" cy="12" r="6.5"/></g><path transform="translate(150.77,0.00) scale(0.11)" fill="currentColor" d="（WORDMARK_PATH の d を verbatim）"/></svg>`
- **ヘッダー台帳**: `P10-home.html` / `mobile/P10-home.html` から header-right HTML・関連CSS（`.header-right .pill-btn {height:36px}`、`.pill-btn.text .cta-icon` 表示制御、640px以下の icon-only 36px化）・`.sidebar-user`/`.user-row` の CSS＋HTML を抽出して作業メモ化する。

### 2. ロゴ sweep（71ファイル・75箇所）

- 各 `.logo` 要素の**中身のみ**を確定 SVG に置換。外側タグ（div/a/span）と `class="logo"` は維持 → `.logo { display:none }` 等の既存レスポンシブ挙動が無傷で残る。
- `.logo` CSS の font-size 等は原則触らない。ベースライン余白が出る場合のみ `display:flex; align-items:center;` を追加（確定形1ファイルで目視確認してから展開）。
- 実測4バリエーション（div / a href="#" / a href="/" / span）を明示した python スクリプトで一括置換し、実行直前に grep で再カウントした最新の箇所数（現時点 75）と置換後カウントを突合する。
- **#628 でヘッダー反映済みの3ファイル（P10-home.html / mobile/P10-home.html / mobile/P13-upload.html）もロゴは未置換のため対象に含める。**

### 3. ヘッダー sweep — グループA（desktop 18ファイル）

- header-right を確定形 HTML に総入れ替え（アップロード `pill-btn primary` 先頭、新規作成 `pill-btn text`＋`cta-icon`。確定形 P10-home.html の実クラスは `pill-btn primary` — 台帳ではこの表記に統一）。header の `<div class="avatar">` を削除。
- CSS 追加: `.header-right .pill-btn { height: 36px; }`、`.header-right .pill-btn.text .cta-icon { display: none; }`、640px メディアクエリの icon-only 36px化（P10-home.html と同形・コメントごと）。
- サイドバーを持つページに `.sidebar-user` CSS＋HTML を追加。skeleton ページはスケルトン表現に合わせて簡略化可。

### 4. ヘッダー sweep — グループB（mobile 13ファイル）

- mobile/P10-home.html を正として差し替え。44px タップ床の例外コメント（ADR-004）と `.header-right .pill-btn` 36px 上書きを移植。
- mobile/P15-export.html・mobile/P20-views.html は `.cta-bar` の CSS と HTML を削除（CTA はページ内ボタンに残ることを確認してから。mobile/P13-upload.html の #628 処理が前例）。

### 5. グループC〜E

ロゴ置換のみ（ステップ2に包含）。admin の header-right（アバター）は実装どおり維持。

### 6. 検証

- `grep -rn 'class="logo">Hollow' spec/design/pages/` → 0件（受け入れ条件）。取りこぼし検出として `grep -rn '>Hollow<' spec/design/pages/` も併用（補助 grep。ヒットは目視判定し、本文テキストの "Hollow" を機械的に書き換えない）
- `grep -rln 'cta-bar' spec/design/pages/mobile/` → 0件
- 旧アバターのヘッダー残存なし（admin の AD アバターは別マークアップで残る）
- 代表ページ（P11 desktop/mobile、P15-export mobile、P30、P03、P07 footer 等）をブラウザで実装画面と目視比較。

### 7. サブエージェント並列分担

各担当に Step 1 のスニペット台帳を渡す:

- Worker 1: ロゴのみ群（auth + public + landing + admin + drafts + #628反映済み3ファイル ≈ 40ファイル、機械的置換）。Worker 1〜3 のファイルリスト合計が grep 実測の全71ファイルと一致することを分担表で突合する
- Worker 2: desktop アプリページ A群 18ファイル（ロゴ＋ヘッダー）
- Worker 3: mobile アプリページ B群 13ファイル（ロゴ＋ヘッダー＋cta-bar 2件）
- 完了後メインが Step 6 の grep＋目視検証を一括実施。

## 設計判断

詳細は adr.md を参照。

- wordmark は `<text>` ではなくアウトライン path を埋め込む（ADR-001）
- viewBox は実装の `-5 -1 480 86` を採用（ADR-002）
- admin モックの header-right は触らない（ADR-003）
- drafts/ はロゴのみ差し替え（ADR-004）
- フッターロゴも水平ロックアップで統一（縦積みは実装に存在しない）（ADR-005）

## リスクと注意点

- `.logo` マークアップは実測4パターン（div / a"#" / a"/" / span）。スクリプト置換は全パターンを明示し、置換後カウントを突合する。drafts/P10-header-options.html はロゴ3箇所ある点に注意。
- ヘッダー sweep は機械置換不可（header-right のクラス体系自体が頁ごとに異なる: P18 は `btn` 系、P21 は `icon-btn` 併用等）。確定形への「総入れ替え」で差を吸収する。
- sidebar-user は P10-home / mobile/P10-home / mobile/P13-upload に既存。再追加しない。
- 現ブランチ #633 がヘッダー36px周辺を触っている。#633 マージ後（または origin/main 最新）から `issue/631/...` を切る。
- cta-bar 削除時、ページ内に同等の導線が残ることを確認してから削除する。
- 「67ファイル」は起票後 71 に増加。完了条件は grep ベースで最新の全ヒットを対象とする。

## テスト方針

- 受け入れ grep 3本で機械判定。
- `spec/design/pages/` を静的配信し、代表8ページを agent-browser でスクリーンショット → 実装画面（`pnpm dev`）と目視比較。
- 360px 幅で `.logo { display:none }`・36px操作行・cta-bar 非表示を確認。
- アプリコード変更なしのため自動テスト追加は不要。`pnpm format:check` は念のため通す。

## レビュー履歴

### 1周目

**修正した点**:
- P-001（要件カバレッジ視点）: Worker 分担に #628 反映済み3ファイル（P10-home / mobile/P10-home / mobile/P13-upload）のロゴ置換が漏れていた → Worker 1 に明示追加し、分担表でファイル数合計を grep 実測と突合する旨を追記。
- P-001（アーキ・リスク視点）: ロゴマークアップの「6バリエーション」分類が実測と不一致（header-left入れ子・inline-style 付きは存在せず div と重複計上）→ 実測4バリエーション（div 47 / a# 16 / a/ 10 / span 2）に修正。

**取り込んだ改善提案**:
- S-001（カバレッジ）: P30〜P34 の header-right が #628 対象外である根拠をスコープ外節に明記。
- S-002（カバレッジ）: 実行時 grep 再カウントを Step 2 本文にも明記。
- S-001（アーキ）: フッターロゴの扱いを ADR-005 として記録（縦積みは実装に存在せず水平で統一）。
- S-002（アーキ）: `pill-btn primary` 表記に統一。
- S-003（アーキ）: 取りこぼし検出 grep `>Hollow<` を検証に追加。

**見送った提案とその理由**: なし。

### 2周目

**修正した点**:
- P-001（アーキ視点）: リスク節に旧記述「6パターン」が残存し自己矛盾 → 実測4パターンに修正。

**取り込んだ改善提案**:
- S-001（カバレッジ）: 補助 grep `>Hollow<` は目視判定用であり本文テキストを機械置換しない旨を明記。
- S-001（アーキ）: リスク節の例示を実態（クラス体系が頁ごとに異なる）に修正。
- S-002（アーキ）: drafts/P10-header-options.html はロゴ3箇所ある旨を追記。

カバレッジ視点は「問題点ゼロ」。残る修正は記述整合のみで計画骨格に変更なし。

### 3周目

両視点とも問題点ゼロで終了。アーキ視点の補足（P10-home.html 行1074 のページ内CTA `pill-btn primary` を台帳に誤抽出しない — header-right ブロック行881付近のみ切り出す）を実装時の注意として記録。
