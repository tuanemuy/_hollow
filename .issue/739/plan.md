# 実装計画 — Issue #739: spec/design 文字起こし機能のデザインモックを追加し実装と整合させる

**Issue:** #739
**作成日:** 2026-06-14
**複雑度:** 中〜大規模

---

## 目的

Issue #701（PR #736）で実装済みの `/admin/speech`（文字起こし設定）と取り込み画面の録音 UI（`AudioRecorder`）について、欠落している `spec/design/pages/` のビジュアルモックを後追いで揃え、全ページ 1:1 モック運用の完全性を回復する。モックは実装に忠実に作る（実装が正）。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `spec/design/pages/P48-admin-speech.html` が新規作成され、ブラウザで単一ファイルとして表示でき、`:root` トークンが `tokens.md` 最終形と一致する | Issue「やること 1」/ index.md §9 | 1 |
| AC-2 | P48 に provider select（OpenAI、option は select 構造で維持）・既定モデル input（例示 `gpt-4o-transcribe`）・新しい API キー input・接続テストボタンがあり、**baseURL 欄を持たない** | Issue「やること 1」/ ADR-013 | 1 |
| AC-3 | P48 に env 固定の状態表現（「環境変数で固定中」ロックバッジ + disabled + ロック理由のヒント、`ADMIN_SPEECH_PROVIDER/MODEL/API_KEY` 言及）と、全固定時の「すべて環境変数で固定中」バナーがある | `SpeechSettingsForm` L99-197,206-244,296-338 | 1 |
| AC-4 | P48 に API キーの現在状態表示（「環境変数から読み込み中」/「DB に保管されたキーを使用中 (マスク)」/「未設定」）と、provider 変更時の「API キー再入力が必要」警告（必須バッジ含む）、接続テスト結果バナー（成功 `応答 NNNms` / 失敗）がある | `SpeechSettingsForm` L246-355 | 1 |
| AC-5 | P48 のヘッダー・admin-nav・ページ見出し・フォームセクション構造が P41 と同型で、admin-nav に「文字起こし設定」項目（active）が含まれる | index.md §2.4 admin シェル | 1 |
| AC-6 | 既存の admin モック（P40〜P47）の admin-nav すべてに P48 への「文字起こし設定」リンクが追加される（ナビ整合） | index.md §2.4（同一シェル骨格） | 2 |
| AC-7 | `spec/design/pages/P13-upload.html` の DropZone に並ぶ位置に録音 UI（`AudioRecorder`）が、idle / requesting-permission / recording / stopped / permission-denied の各状態を表現して反映される | Issue「やること 2」/ `AudioRecorder` 状態機械 | 3 |
| AC-8 | P13 録音 UI の各状態に実装通りの要素がある: idle（「録音を開始」+「最大 30 分・24 MB」案内）、recording（赤ドット + 経過時間 + MB + 上限間近 warning + 「録音を停止」）、stopped（audio プレビュー + 取り込む / 録り直す / 取り消す + 自動停止 alert）、permission-denied（権限拒否 alert + ファイルアップロード誘導） | `AudioRecorder` L336-559 | 3 |
| AC-9 | `spec/design/pages/P13-upload-modal.html` のモーダル内 DropZone 直後に録音 UI が反映される（実装上 `AudioRecorder` は `UploadDialog`・`UploadForm` 双方に存在するため、モーダル・フォールバックページの両方に置く） | UploadDialog L433 / UploadForm L257 | 3 |
| AC-10 | `spec/design/index.md` の admin 記述（§2.4）が P40〜P47 → P40〜P48 に更新され、P48 を P41（LLM）と並列の文字起こし設定として位置づける記述が入る | Issue「やること 3」 | 4 |
| AC-11 | `spec/design/index.md` のフィードバック節 §233 付近の `.alert` 参照モック一覧（L255）に `P48` が追記され、§9 のモーダル記述（L229）または P13 節に録音 UI 導線の記述が入る | Issue「やること 3」 | 4 |
| AC-12 | モバイル基準（index.md §3 モバイル専用モック）に合わせ、P48 のモバイル版 `spec/design/pages/mobile/P48-admin-speech.html` を併置する（P41 にモバイル版が存在し 1:1 運用のため） | index.md §3 L82 / mobile/P41 存在 | 5 |
| AC-13 | 作成過程で実装側に軽微な磨き残し（余白・配置・状態表示の一貫性）が見つかった場合、軽微なものは実装も整える。大きな乖離は別 Issue に切り出す | Issue「やること 4」 | 6 |
| AC-14 | `spec/design/review/` の既存様式に倣い、視覚確認結果を新規レビュー記録（`008.md`）に残す | Issue「レビュー」 | 7 |

## スコープ

### 含まれないもの
- バックエンド（ドメイン / ユースケース / アダプター / DB）変更 — 実装は #701 で完了済み。本 Issue は spec/design 側の後追い。
- 追加プロバイダ対応（#738）— P48 の provider select は OpenAI 1 択のまま select 構造を維持するに留める（将来 #738 で選択肢が増える）。
- 実装側の大きな UI 変更 — AC-13 は「軽微な磨き残し」限定。構造的乖離は別 Issue 化する。
- グローバルトースト基盤・`.alert` 実装追従など index.md が別 Issue とする項目。

## 調査結果

- 関連ファイル:
  - `app/components/admin/SpeechSettingsForm/index.tsx` — P48 が忠実に再現すべき出荷済みフォーム。provider select / API キー + 接続テスト / モデルの 3 セクション構成、env 固定（provider/model/apiKey 個別 + 全固定）、provider 変更警告、接続テスト結果バナー。**baseURL は持たない**。クラス定数（`SECTION_CLASS` 等）が CSS のヒントになる。
  - `app/components/ingestion/AudioRecorder.tsx` — P13 録音 UI が再現すべき状態機械。`rounded-xl border border-hairline bg-surface-elevated p-4` のカード内に Mic 見出し + 各状態ビュー。上限 30 分 / 24 MB、上限間近 warning、自動停止 alert、permission-denied フォールバック。
  - `app/components/ingestion/UploadDialog.tsx` L433 / `UploadForm.tsx` L257 — `AudioRecorder` は DropZone の後（モーダルとフォールバックページ双方）に置かれる。よって P13-upload-modal.html と P13-upload.html の両方に録音 UI を反映する。
  - `app/routes/admin/speech.tsx` — `/admin/speech` ルート。head タイトルは「文字起こし設定」。
  - ベースモック: `spec/design/pages/P41-admin-llm.html`（admin シェル + フォームセクション + lock-badge + alert + note-card のスタイルが揃っている。P48 はこれを土台に baseURL コメントを削り、env ロック・provider 変更警告・接続テスト結果を充実させる）。
  - `spec/design/pages/P13-upload.html` / `P13-upload-modal.html` / `P13a-upload-modal.html` — DropZone の定義済み。`.alert` / `.pill-btn`（primary/danger/ghost/text）/ `file-icon.audio` 等のスタイルが既にある。
  - `spec/design/pages/mobile/P41-admin-llm.html` ほか mobile 版が存在 → P48 もモバイル版併置が運用上必要。
- あるべきアーキテクチャ:
  - `spec/design/index.md` が SSOT。§9「すべての HTML 試作は単一ファイル」「`:root` は tokens.md 最終形をコピー」「ローカル変数禁止・正式トークン名」「共通要素は画面ごとに同じマークアップを貼る（コンポーネント化しない）」。
  - §2.4 admin は専用管理シェル（ヘッダー検索/通知 + admin-nav）。P48 は P41 と並列。
  - §3 モバイル専用モックは `pages/mobile/{name}.html` に同一 basename で 1:1 併置、トークンはデスクトップ版を逐語コピー。
  - `.alert` は案D（白地 + セマンティック枠 + アイコン + 見出し + 本文）。録音 UI の warning / 自動停止 / permission-denied は `.alert .alert-warning`、接続テスト結果は success/error。
- 既存実装の状態: 実装（#701）は出荷済みで正。spec/design 側のモックのみ欠落。`spec/pages/index.md` には既に P48 記載あり（L458）、`spec/adr/013-speech-provider.md` に baseURL を持たない判断あり。デザインモック側だけ未追従。
- 依存関係: admin-nav は全 admin モックで同じマークアップを貼る運用のため、P48 追加に伴い P40〜P47 の admin-nav も更新が必要（AC-6）。これを怠ると「同じシェル骨格」原則が崩れる。

## 設計

### ドメインモデルへの影響
なし。バックエンドは #701 で完結。本 Issue は HTML モックとドキュメントのみ。

### ユースケース / アプリケーションロジック
なし。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション
- 新規 HTML モック: `P48-admin-speech.html`（デスクトップ）+ `mobile/P48-admin-speech.html`（モバイル）。
- 既存 HTML モック更新: P13-upload.html / P13-upload-modal.html に録音 UI ブロック追加（mobile 版も整合）。P40〜P47 の admin-nav に P48 リンク追加。
- ドキュメント更新: `spec/design/index.md`（§2.4 admin 範囲 / 参照モック一覧 / P13 録音導線記述）。
- AC-13 の軽微な実装調整が出た場合のみ該当 component を編集（基本は発生しない想定）。

## 実装ステップ

### 1. P48 デスクトップモック作成

- **対象ファイル:** `spec/design/pages/P48-admin-speech.html`（新規）
- **変更内容:** `P41-admin-llm.html` を土台に複製し以下を実装に忠実化:
  - `<title>` / head タイトル / page-title を「文字起こし設定」に。page-subtitle は実装にないため最小限（または P41 同等の即時反映案内）に。
  - admin-nav に「文字起こし設定」（P48, active）を追加。LLM 設定は active 解除。
  - 「文字起こしプロバイダ」セクション: provider select（option = OpenAI のみ）、現在の保存値ヒント、env 固定時の lock-badge + disabled + `ADMIN_SPEECH_PROVIDER` ロックヒント、provider 変更時の `.alert .alert-warning`「プロバイダの変更」警告。
  - 「API キー」セクション: `ADMIN_SPEECH_API_KEY` 説明、現在状態バナー（env / DB マスク / 未設定の 3 パターンをコメントで併記し既定 1 つを表示）、新しい API キー input（password・mono）+ 接続テストボタン、必須バッジ / env 固定バッジ、接続テスト結果 alert（success「接続成功 · 応答 NNNms」/ error「接続失敗 · …」）。
  - 「モデル」セクション: 既定モデル input（例: `gpt-4o-transcribe`）、env 固定対応。
  - **baseURL セクション・コメントは入れない**（P41 の base-url コメントを削除）。
  - form-footer: 「保存しました」+「変更を保存」。全固定時の disabled 表現をコメントで補足。
  - `:root` は tokens.md 最終形をコピー（P41 と同一）。
- **理由:** AC-1〜AC-5。実装の `SpeechSettingsForm` を絵で 1:1 に表す。

### 2. 既存 admin モックの admin-nav に P48 を追加

- **対象ファイル:** `spec/design/pages/P40-admin-dashboard.html`・`P41-admin-llm.html`・`P42-admin-prompts.html`・`P43-admin-tokens.html`・`P44-admin-registration.html`・`P45-admin-users.html`・`P46-admin-jobs.html`・`P47-admin-metrics.html`（および対応する `mobile/` 版があれば同様）
- **変更内容:** 各 `admin-nav-inner` に `<a href="P48-admin-speech.html">文字起こし設定</a>` を LLM 設定の直後に追加（並列配置）。
- **理由:** AC-6。同一シェル骨格を全 admin モックで維持する index.md §2.4 原則。

### 3. P13 録音 UI 導線の反映

- **対象ファイル:** `spec/design/pages/P13-upload.html`・`spec/design/pages/P13-upload-modal.html`（+ `mobile/` 版で破綻しないか確認・整合）
- **変更内容:** DropZone（とフォールバックページでは format-chips の前後）に隣接する位置に録音 UI カードを追加。`AudioRecorder` のカード枠（`rounded-xl border border-hairline bg-surface-elevated p-4` 相当）に Mic 見出し「マイクで録音して取り込む」+ 各状態を**並べて**表現（モックは状態を同時に見せる慣行に倣い、コメントで状態名を明示）:
  - idle: 案内文「録音した音声は文字起こしして新規ノートにします。最大 30 分・24 MB まで。」+ primary「録音を開始」。
  - recording: 赤ドット（pulse）+ `12:34` mono + `12.3 MB`、上限間近 `.alert .alert-warning`「まもなく上限に達します」、danger「録音を停止」。
  - stopped: 自動停止 `.alert .alert-warning`「上限に達したため録音を停止しました」、`<audio controls>`、primary「この録音を取り込む」+「録り直す」+ ghost-danger「取り消す」。
  - permission-denied: `.alert .alert-warning`「マイクを使用できませんでした」+ ファイルアップロード誘導文。
  - requesting-permission: 「マイクの使用を許可してください…」の補助テキスト。
  - sr-only の `aria-live` status / 各 alert の role（warning=status または alert は実装の使い分けに合わせる: 上限間近=status、自動停止/権限拒否=alert）を踏襲。
- **理由:** AC-7〜AC-9。実装の状態機械を絵で網羅する。

### 4. index.md の更新

- **対象ファイル:** `spec/design/index.md`
- **変更内容:**
  - §2.4 admin の「（P40〜P47）」を「（P40〜P48）」に更新し、P48 を P41 と並列の文字起こし設定として位置づける一文を追加。
  - §9 L229 のモーダル記述または P13 節に、録音 UI 導線（`AudioRecorder` の状態機械）がアップロードモーダル / フォールバックページの DropZone に並ぶ旨を追記。
  - フィードバック節 L255 の `.alert` 参照モック一覧に `P48` を追記（録音 UI の warning alert を持つ P13 は既に記載済み）。
- **理由:** AC-10, AC-11。SSOT を最新化し、参照モック一覧に欠落を残さない。

### 5. P48 モバイルモック作成

- **対象ファイル:** `spec/design/pages/mobile/P48-admin-speech.html`（新規）
- **変更内容:** `mobile/P41-admin-llm.html` を土台に、ステップ 1 と同じ実装差分（baseURL 削除・provider OpenAI 1 択・env ロック・接続テスト結果・録音は無関係）を反映。トークンはデスクトップ版の `:root` を逐語コピー。390px / 320〜430px で overflow=0、admin-nav に P48 active。
- **理由:** AC-12。1:1 のモバイル併置運用（index.md §3）。

### 6. 実装の磨き残し調整（発生時のみ）

- **対象ファイル:** `app/components/admin/SpeechSettingsForm/index.tsx` / `app/components/ingestion/AudioRecorder.tsx`（該当時のみ）
- **変更内容:** モック作成中に判明した軽微な余白・配置・状態表示の不一致のみ最小修正。修正したら `pnpm typecheck && pnpm lint:fix && pnpm format`。大きな乖離は別 Issue に切り出し plan に記録。
- **理由:** AC-13。

### 7. 視覚確認とレビュー記録

- **対象ファイル:** `spec/design/review/008.md`（新規）
- **変更内容:** 既存 `review/007.md` の様式に倣い、P48（デスクトップ/モバイル）・P13 録音 UI の視覚確認結果、出荷済み実装画面との突き合わせ結果、判定を記録。
- **理由:** AC-14。

## リスクと注意点

- admin-nav の更新漏れ（AC-6）: P48 を作っても既存 admin モックのナビに追加し忘れると「同じシェル骨格」原則が崩れ、ナビが画面間で食い違う。全 P40〜P47（mobile 含む）を機械的に確認する。
- 録音 UI の状態同時表示: 実装は 1 状態ずつ排他表示だが、モックは全状態を並べて見せる慣行。コメントで「実装では排他」「ここは全状態の見本」と明示し、誤読を防ぐ。
- `.alert` の role 使い分け: 上限間近=`role="status"`、自動停止/権限拒否=`role="alert"` という実装の差を踏襲する（雑に統一しない）。
- baseURL の混入: P41 の base-url コメントをコピー元から確実に削除する（AC-2 の核心。ADR-013 で baseURL を持たないと確定）。
- モバイル版の存在確認: P40〜P47 の mobile 版が一部しか無い可能性。存在するものだけ admin-nav を更新し、無いものは新規作成しない（スコープ外）。
- 接続テストのドラフト仕様: 実装は API キー平文を接続テストに送らず env キー前提（`apiKeySource: "env"`）。モックの文言・状態表現がこの制約と矛盾しないようにする（バナー文言は結果のみで足りるため低リスク）。

## テスト方針

HTML モックの後追い作成タスクのため、検証はブラウザ視覚確認と出荷済み実装画面との突き合わせが中心。実在コマンドのみ:

- モック視覚確認: ブラウザで `spec/design/pages/P48-admin-speech.html` / `mobile/P48-admin-speech.html` / `P13-upload.html` / `P13-upload-modal.html` を直接開く（単一ファイルで依存なし、index.md §9）。`open spec/design/pages/P48-admin-speech.html`（macOS）等で開ける。
- モバイル overflow 確認: ブラウザ devtools で幅 320〜430px にして横スクロールが出ないこと（`document.documentElement.scrollWidth === clientWidth`）を確認。
- 出荷済み実装画面との突き合わせ: `pnpm dev`（Cloudflare ランタイムの dev サーバ）で起動し、`/admin/speech`（要 admin。`pnpm seed:dev-admin` で管理者シードを投入可）と取り込み画面のアップロードモーダル内 `AudioRecorder` を開いて、モックと実装の見た目（セクション構成・lock-badge・接続テスト結果・録音各状態・余白）が一致することを確認。
- AC-13 で実装を変更した場合のみ: `pnpm typecheck && pnpm lint:fix && pnpm format` を実行（CLAUDE.md の変更後手順）。HTML モックのみの変更時はコード品質コマンドの対象外。
- 受け入れ基準表（AC-1〜AC-14）を 1 項目ずつ目視チェックリストとして用いる。
