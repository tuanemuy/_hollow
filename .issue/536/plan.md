# 実装計画 — Issue #536: 全画面のモバイル向けモックを作成する

**Issue:** #536
**作成日:** 2026-06-08
**複雑度:** 中〜大規模（デザイン専用 / 49画面）

---

## 目的

`spec/design/pages/` の全画面（PR #518 追加分含む 49画面）について、**モバイル（390px 基準）で最適化されたモック**を用意する。`index.md §2.1`（base〜md は単カラム + サイドバー drawer）の方針に沿って、デスクトップの縮小版ではなく「モバイルとして成立する」レイアウト・導線にする。

## スコープ

### 含まれるもの

- `spec/design/pages/{画面名}-mobile.html` を 49本 新規作成（390px 基準、320〜430px で overflow=0）。
- 必要に応じて `spec/design/index.md` の §3 レスポンシブ戦略にモバイルモックの併置方針を 1〜2文 SSOT 化。
- agent-browser によるモバイル幅（390px + 境界 320/430px）の overflow 検証。

### 含まれないもの

- `app/` の実装追従（別Issueへ引き渡し。Issue本文で明示）。
- 既存 desktop モック `spec/design/pages/*.html` の改変（一切触れない）。
- `common-toast`（Issue の対象49リストに含まれない。`index.md §9` に「モバイルは下端中央」と既述があり方針は一貫。本Issueでは mobile 版を作らない）。
- 新規デザイントークンの定義（`tokens.md` の fluid スケールで小画面は自動縮小するため不要 / `#461 ADR-001`）。

## 方針（確定済み）

mock化の手段は「**別途 `{画面名}-mobile.html` を新規作成**」方式でユーザー承認済み。既存 desktop ファイルには触れず、各ページに対応するモバイル専用ファイルを 390px 実体として作る。詳細トレードオフは `adr.md` 参照。

## 既存モックのモバイル現状

- アプリ系（P10/P11/P12/P21〜P24）は既に drawer 化の素地あり（`@media (max-width:1023px)` でサイドバー `translateX(-100%)`、`menuBtn`+`backdrop` JS 開閉、`max-width:640px` でヘッダー pill アイコン化）。
- admin（P40等）は nav strip 横スクロール化 + テーブル→カード変換（`thead` 非表示 + `td::before{content:attr(data-label)}`）が既に存在。
- 公開（P30等）・認証（P01等）はもともとモバイルファースト単カラム。
- **シェル系**には review-001 由来の global mobile fix（`max-width:639px` の 44px 床、`overflow-wrap:anywhere`）あり。ただし **dialog/showcase 系9本**（P10-bulk-export-dialog, P10-bulk-visibility-dialog, P10-move-note-dialog, P10-note-picker-dialog, P10-save-view-dialog, P13a-upload-modal, P20-view-form-dialog, common-confirm-dialog ＋ 対象外 common-toast）は床ブロックを持たない。これらは mobile で 44px 床を**新設する前提**で扱う（「素地があるからコピーで済む」と油断しない）。
- **結論**: 現状は「desktop 最適化 + 横スクロール回避どまり」。drawer / table→card の素地はあるが、ボトムシート・下部固定 CTA・読み物最適化・密度の再評価といった「モバイルとして設計し直した専用モック」は存在しない。

## シェル体系とモバイル変換方針

- **アプリシェル（P10/P11/P12 + P13〜P18/P20）**: 左サイドバーを drawer（オーバーレイ+バックドロップ+Esc/フォーカストラップ想定）化。ヘッダーは logo 縮約 + 検索省スペース化 + 主要CTAアイコン化 or 下部固定CTA。bulk-bar は下端固定の横スクロール許容バー。FilterBar チップ列は横スクロール許可（`§3 base`）。P12 エディタはツールバー横スクロール、メタは下部 sheet/折りたたみ。
- **設定シェル（P21〜P24）**: 左サイドバーを「設定ナビ drawer」化（`§2.4` のとおりアプリ骨格流用・中身だけ差替）。セクションカード縦積み、フォーム1カラム、action-row 縦積み/下部固定。
- **公開シェル（P30〜P34）**: 単一カラム + 公開ヘッダー（検索・signup 導線を省スペース化）。本文幅・行間を尊重した読み物最適化。
- **adminシェル（P40〜P47）**: nav strip 横スクロール維持。高密度テーブルはカード/縦積みへ（`§2.5` をモバイルで再評価、`td::before` ラベル方式）。メトリクスグリッド1カラム。タッチ床44を尊重（desktop の `pillBtnSm` 密度は緩める。文脈差の反映でありデグレではない）。
- **ダイアログ/モーダル**: モバイルではボトムシート寄せ（下端から立ち上がり、上端角丸 `--radius-lg`、`width:100%`、`max-height` 制限+内部スクロール、下部フルワイド primary CTA）。showcase/state-grid 系は state を縦1カラムで並べたまま各ダイアログをボトムシート表現に。**Esc/フォーカストラップの区別**: showcase は desktop 同様 静的カタログ（開閉 JS なし）なので `aria-modal` 静的付与のみとし、実 Esc/trap は実モーダル（drawer・P13/P13a upload-modal 等）側で担保する。showcase に無用な JS を足さない／実モーダルで欠落させない。
- **ポップオーバー（P10-filterbar-popovers）**: フルワイドシート/ボトムシート化。
- **共通**: タップ44px、フォーム1カラム、320〜430px で overflow=0、ステータスピルのSRテキスト併記（`§8`）、icon-only は `<button aria-label>`（`§7.1`）。

## 実装ステップ

### 1. 共通生成ルールの確立

- **命名**: 各 desktop `{name}.html` に対し `{name}-mobile.html` を新規作成（49本）。desktop には触れない。
- **viewport**: `<meta name="viewport" content="width=device-width, initial-scale=1">`（desktop と同一）。基準幅390px、検証域320〜430px。
- **トークン継承**: 対応 desktop ファイルの `<style>` 冒頭（`* { box-sizing }` + `:root { ... }` + `html,body` リセット + `:focus-visible`）を逐語コピー。ローカル短縮名禁止、正式名のみ（`§9`）。新トークン追加なし。
- **構造**: 共通要素（ヘッダー/drawer/開閉スクリプト）は画面ごとに同マークアップを貼る（`§9`、コンポーネント化しない）。drawer/シート開閉 JS は desktop の `menuBtn`/`backdrop` パターン流用。
- **ブレークポイント**: mobile ファイルは 390px をベース実体とする。**上方ブレークポイント（`min-width:1024px` 等）の2カラム復帰は mobile ファイルから削除**し 390px に固定（drawer 挙動だけ残す）。`max-width` は global fix・特定レンジ用に使用可。
- **生成サブエージェントへ渡す共通ルール**: ①対応 desktop のトークン/リセット/focus を逐語コピー ②44px タップ床 ③フォーム1カラム ④320/390/430px で `overflow-x` ゼロ ⑤シェル別ボトムシート/drawer/下部固定CTAパターン ⑥SRテキスト併記 ⑦icon-only a11y 契約。

### 2. シェル単位バッチで mobile.html を生成（49画面・漏れ厳禁）

- **バッチA — 認証/入口/例外（9）**: P01-signup, P01b-admin-setup, P02-email-verify, P03-login, P04-password-reset-request, P05-password-reset, P06-email-change-confirm, P07-landing, P34-error。元からモバイルファースト。余白・CTAフルワイド化・ヘッダー縮約中心。
- **バッチB — アプリ中核ノート（3）**: P10-home, P11-note-detail, P12-editor。drawer + 下部固定CTA + bulk-bar/エディタツールバー横スクロール。
- **バッチC — ダイアログ/ポップオーバー（10）**: P10-bulk-export-dialog, P10-bulk-visibility-dialog, P10-directory-create-dialog, P10-directory-move-dialog, P10-directory-rename-dialog, P10-filterbar-popovers, P10-move-note-dialog, P10-note-picker-dialog, P10-save-view-dialog, common-confirm-dialog。ボトムシート寄せ。showcase 系は state 縦1カラム。
- **バッチD — 取込/書出（5）**: P13-upload, P13-upload-modal, P13a-upload-modal, P15-export, P16-export-jobs。アップロードモーダルはボトムシート、キュー/ジョブはカード縦積み。
- **バッチE — 整理/公開設定（6）**: P14-publish-settings, P17-trash, P18-tags, P18-merge-tag-dialog, P20-views, P20-view-form-dialog。DATA_ROW 縦積み、dialog はボトムシート。
- **バッチF — 設定（4）**: P21-settings-profile, P22-settings-security, P23-settings-prompts, P24-settings-account-delete。設定ナビ drawer + セクションカード縦積み + フォーム1カラム。
- **バッチG — 公開/共有（4）**: P30-user-public-top, P31-public-note, P32-public-search, P33-share-link。読み物単一カラム最適化。
- **バッチH — admin（8）**: P40-admin-dashboard, P41-admin-llm, P42-admin-prompts, P43-admin-tokens, P44-admin-registration, P45-admin-users, P46-admin-jobs, P47-admin-metrics。nav strip 横スクロール + テーブル→カード + メトリクス1カラム + タッチ床44。

### 3. index.md への方針追記（小）

`§3 レスポンシブ戦略` に「モバイル専用モックは `{name}-mobile.html` として併置し 390px 基準で設計する」旨を 1〜2文 SSOT 化。受け入れ基準「必要なモバイル方針は `index.md` に SSOT 化」に対応。`tokens.md` は新トークン不要のため変更しない。

### 4. バッチごとの overflow 検証

各バッチ完了直後に agent-browser で代表画面 + 横長要素保有画面を 390px（+境界320/430px）で開き `document.documentElement.scrollWidth <= window.innerWidth` を確認。失敗はバッチ内で修正してから次へ。

## 設計判断

`adr.md` 参照。要点: トークンは各 mobile ファイルへ inline 複製 / ダイアログ系も独立ファイル / showcase は縦1カラム維持 + ボトムシート表現 / admin タッチ床44 / index.md 追記。

## リスクと注意点

- **PR #518 追加分の漏れ**: P13a-upload-modal, P18-merge-tag-dialog, P20-view-form-dialog, P47-admin-metrics が新規。各バッチに割当済み。49本チェックリストで機械照合する（全49件 desktop ソース存在確認済み・非対象は common-toast のみ）。
- **desktop/mobile 二重管理**: トークン更新が 49×2 本へ波及。`tokens.md` を SSOT に保ち mobile はトークンブロック逐語コピーを厳守。
- **overflow 検証の網羅性**: 横長要素を持つ画面（admin テーブル、P12 ツールバー、FilterBar チップ列、bulk-bar、コードブロック、長URL/共有リンク P33）を重点検証。`§3` の「テーブル/コード/横メディアの単体スクロールは許可、ページ全体は禁止」に従い、許可された内部スクロールと禁止されたページ overflow を区別する。
- **desktop の上方ブレークポイント流用の罠**: desktop は `lg` 以上で2カラム復帰を内包。mobile へコピーすると390px専用にならないため上方BPは削除する。
- **a11y 退行**: ボトムシート化でフォーカストラップ/Esc/`aria-modal` を欠かさない。ステータスピルのテキスト併記、icon-only の `aria-label` を維持。

## テスト方針

- agent-browser（manual-test 基盤）で各 mobile ファイルを `file://` で開き、390px（主）+ 320/430px（境界）で評価。
- overflow 判定: `document.documentElement.scrollWidth <= window.innerWidth`。`scrollWidth - innerWidth` を出力し 0（許容内部スクロール要素を除く）を合格。
- 受け入れ基準対応:
  - 「全対象ページにモバイルモック存在」→ 49本のファイル存在チェック（`ls` 照合）。
  - 「320〜430px で横スクロール非発生」→ overflow スクリプト 3幅 × 49本。
  - 「drawer・ダイアログのシート化」→ 代表画面で drawer 開閉・シート表示を目視 + スクショ。
  - 「トークン準拠 / index.md SSOT」→ mobile の `:root` を  **対応 desktop ファイルの `:root` と一致**で照合（SSOT 連鎖 tokens.md → desktop → mobile の最終リンクを基準にする。desktop は §11 に同期済み前提）、index.md 追記確認。
- **検証幅の根拠**: トークンは `clamp()` の fluid スケールで幅に対し単調変化するため、320/390/430px の3点合格をもって 320〜430px 範囲の合格とみなす。横長要素を持つ画面は実機代表幅 360/414px も追加点検する。
- **下端固定要素の競合**: bulk-bar（`sticky bottom; z-index:40`）と下部固定CTAを同一下端に置く画面では、`env(safe-area-inset-bottom)` の安全域を確保し、両者の排他/積層（z-index）を明示して CTA がバーに隠れないようにする。

## レビュー履歴

### 1周目（両視点とも問題点ゼロで終了）

両レビュアー（要件カバレッジ / アーキ・リスク）とも **問題点（要修正）ゼロ**。49本のバッチ割当を実ファイルと `comm` 照合し過不足ゼロを確認。受け入れ基準5項目すべてに対応箇所あり。以下の改善提案を反映:

**反映した改善提案**:
- 既存モックのモバイル現状の記述を修正 — global mobile fix を持たない dialog/showcase 系9本を明示し、44px 床を新設する前提に。
- トークン準拠の検証基準を「対応 desktop ファイルの `:root` と一致」へ精緻化（SSOT 連鎖の最終リンクを照合対象に）。
- showcase 系の Esc/フォーカストラップの扱いを明文化（静的カタログは `aria-modal` 静的付与のみ、実 trap は実モーダル側で担保）。
- 検証幅の根拠（fluid 単調変化で3点合格＝範囲合格、横長画面は 360/414px も点検）を追記。
- 下端固定要素の競合（bulk-bar × 下部固定CTA × safe-area）の注意を追記。

**見送った提案**: なし（全提案がスコープ内で妥当だったため反映）。
