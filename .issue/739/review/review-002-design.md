# PR #740 レビュー Round 2 — デザイン / フロントエンド観点（Issue #739）

レビュー対象: PR #740（base = `issue/701/recording-transcription` / head = `issue/739/speech-design-mocks`）
レビュー方針: 出荷済み実装（`SpeechSettingsForm` / `AudioRecorder` / `app/components/common/styles.ts`）を正として、HTML モックの忠実度・既存モックとの一貫性・受け入れ基準（AC-1〜AC-14）の網羅をゼロベースで再検証。Round 1 で指摘した W-001/W-002/W-003 の修正が「実装に忠実」になっているかを特に確認。
視覚確認: agent-browser 0.27.3 で P48 desktop（接続テスト結果バナー含む）・P13-upload の録音 UI（recording stop / stopped 3アクション）をスクリーンショット実視確認した。後始末済み（`agent-browser close --all`）。

## デザイン / フロントエンド

### Blockers

なし。

### Warnings

- **[W-101]** `spec/design/review/008.md`（AC-14 の成果物）が PR に含まれていない
  - 場所: `spec/design/review/`（001〜007 のみ存在、008 が欠落）。本レビューファイル（`.issue/739/review/`）とは別物。
  - 理由: plan ステップ 7 / AC-14 は「既存 `review/007.md` の様式に倣い、P48（desktop/mobile）・P13 録音 UI の視覚確認結果と判定を `spec/design/review/008.md` に残す」と明記している。Round 1 でも ⏳（未確認）だったが、Round 2 時点でも作成されていない。AC-14 は未充足。
  - 提案: `spec/design/review/008.md` を 007 の様式で作成し、本 PR に含める。視覚確認結果（停止=塗り赤・取り消す=灰・接続テスト=塗り単一行）と判定を記録する。これは唯一の未充足 AC。

### Notes

- **[N-101]** W-001 解消（録音「録音を停止」= filled danger）を確認。`.recorder-card .pill-btn.danger` を scoped で `background: var(--color-error-surface); color: var(--color-error)` に上書き（`P13-upload.html:992-994`、`P13-upload-modal.html` / mobile 両版に同等）。`.recorder-card`（0,2,0）が base `.pill-btn.danger`（0,1,0、`P13-upload.html:285` の透明 ghost のまま=job-actions 用で不変）に確実に勝つ。停止ボタンは `.recorder-card` 配下（`P13-upload.html:1165`）にあり scoped が効く。agent-browser で停止ボタンが塗り赤 chip としてレンダリングされることを実視確認。なお `P13a-upload-modal.html`（desktop/mobile）は録音ボタンに `.pill`（`.pill-btn` でない別系）を使い、`.pill.danger` が元から filled（`P13a:347`）・`.pill.ghost-danger` が元から中立（`P13a:451-452`）なので scoped 上書き不要で正。W-001/W-002 を全 6 ファイル（P13/P13-modal/P13a × desktop/mobile）で確認。

- **[N-102]** W-002 解消（録音「取り消す」= ghost-danger 中立 rest）を確認。`.recorder-card .pill-btn.ghost-danger` を rest `color: var(--color-ink-secondary)`（透明背景）、`:hover` で `error-surface + error` に上書き（`P13-upload.html:998-1005`）。実装 `pillBtnGhostDanger`（`styles.ts:86-87`）と 1:1。agent-browser の stopped 状態スクショで「取り消す」が灰文字（赤でない）、「録音を停止」が塗り赤、「この録音を取り込む」が塗り primary と、実装の「filled stop / neutral ghost discard」階層差が明確に出ていることを実視確認。

- **[N-103]** W-003 解消（接続テスト結果 = 実装どおり塗りバナー単一行）を確認。案D `.alert`（アイコン+見出し+本文）から `.test-result` に置換（`P48-admin-speech.html:439-441`、mobile `:426-428`）。`.test-result` CSS（`P48:292-302`）は `display:flex; align-items:flex-start; gap:space-3; padding:space-4 space-5; border-radius:radius-lg; font-size:text-sm; color:ink` + `.ok→success-surface` / `.err→error-surface` で、実装の `BANNER_BASE`（`SpeechSettingsForm.tsx:50` = `flex items-start gap-3 px-5 py-4 rounded-lg text-sm text-ink`）+ `bg-success-surface`/`bg-error-surface` と完全一致。テキストも単一行「接続成功 · 応答 682ms」/「接続失敗 · …」で、`role="status"` も実装どおり。agent-browser で塗り緑の単一行バナーを実視確認。波及確認: 同 P48 内の provider 変更警告（`alert-warning` + `data-provider-changed`、`P48:388-394`）・全固定バナー（`P48:362`）は案D `.alert` のまま不変で、接続テスト結果だけが置換されている（過剰置換なし）。

- **[N-104]** 上記修正の非波及を確認。job-actions 系の破棄/キャンセル（`P13-upload.html:831-832` の `.small-pill.danger`）は透明 ghost のまま不変。録音カード外・他セクションへの配色波及なし。

- **[N-105]** P48 忠実度を再点検し維持を確認。3 セクション（文字起こしプロバイダ / API キー / モデル）・**baseURL 欄なし**・provider select OpenAI 1択（select 構造維持、将来 #738 のコメントあり）・env 固定（lock-badge + disabled + `ADMIN_SPEECH_PROVIDER/MODEL/API_KEY` ロックヒント）・全固定バナー（`data-all-env-locked` 相当）・provider 変更警告（必須バッジ `必須`、排他コメント）・API キー現在状態 3 分岐（env / DB マスク `sk-…••••` / 未設定）。実装の条件分岐と 1:1 でコメント併記。agent-browser で provider/apiKey/model/接続テスト/モデル env ロックを実視確認。

- **[N-106]** P13 録音 UI 忠実度を再点検し維持を確認。idle（「録音を開始」+「最大 30 分・24 MB」）/ requesting-permission（補助テキスト）/ recording（赤ドット pulse + `12:34` mono + `12.3 MB` + 上限間近 warning role="status" + 「録音を停止」）/ stopped（自動停止 alert role="alert" + `<audio controls>` + 取り込む/録り直す/取り消す）/ permission-denied（警告 role="alert" + ファイルアップロード誘導）。`.alert` role 使い分け（上限間近=status、自動停止/権限拒否=alert）と sr-only `aria-live="polite"`「録音中」が実装に忠実。

- **[N-107]** index.md 更新を確認。§51 が「admin（P40〜P48）」+「文字起こし設定（P48）は LLM 設定（P41）と並列」+「**baseURL 欄を持たない**（[ADR-013](../adr/013-speech-provider.md)）」を含み相対パス実在。§230 に録音 UI 導線（DropZone 直後・状態機械・30分/24MB自動停止・「実装は 1 状態ずつ排他表示」注記）。§256 の `.alert` 参照モック一覧に `P48` 追加済み。AC-10/AC-11 充足。

- **[N-108]** admin-nav 整合を再確認。desktop P40〜P47（+ `P45-admin-users-skeleton.html`）・mobile 該当ページに `文字起こし設定`（→`P48-admin-speech.html`）が LLM 設定直後に追加、P48 自身は active。並び順統一。新たな不整合の持ち込みなし。

- **[N-109]**（軽微・デッドコード）P48 desktop/mobile に `.alert-success`（`P48:280`）/ `.alert-error`（`P48:282`）の CSS 定義が残るが、接続テスト結果を `.test-result` へ置換した結果、本文中で `alert-success`/`alert-error` クラスは未使用（grep でマークアップに出現なし）。実害はないが W-003 修正の名残。任意で削除すると掃除になる。トークン外の値・独自パターンではないため Blocker ではない。

## 受け入れ基準チェック（AC-1〜AC-14）

| AC | 判定 | 備考 |
|----|------|------|
| AC-1 | ✅ | `P48-admin-speech.html` 新規・単一ファイル表示可・`:root` トークン最終形。agent-browser 表示確認。 |
| AC-2 | ✅ | provider select（OpenAI・select 構造維持）/ 既定モデル `gpt-4o-transcribe` / 新 API キー input / 接続テストボタン。**baseURL なし**確認。 |
| AC-3 | ✅ | env 固定（lock-badge + disabled + `ADMIN_SPEECH_*` ヒント）・全固定バナー。 |
| AC-4 | ✅ | API キー 3 分岐・provider 変更警告（必須バッジ）・接続テスト結果。**W-003 修正で結果バナーが実装と一致**（塗り単一行）。 |
| AC-5 | ✅ | ヘッダー・admin-nav・page-title・form-section が P41 同型。admin-nav に文字起こし設定 active。視覚確認。 |
| AC-6 | ✅ | desktop P40〜P47 + skeleton、mobile 該当ページに P48 リンクを LLM 直後追加。 |
| AC-7 | ✅ | P13-upload.html DropZone 直後に録音 UI、5 状態反映。 |
| AC-8 | ✅ | 各状態の要素・文言が実装どおり。**W-001/W-002 修正でボタン配色も実装と一致**（停止=塗り赤・取り消す=灰）。 |
| AC-9 | ✅ | P13-upload-modal.html / P13a-upload-modal.html のモーダル内 DropZone 直後に録音 UI、mobile も反映。 |
| AC-10 | ✅ | index.md §51 を P40〜P48 に更新、P48 を P41 並列と明記。 |
| AC-11 | ✅ | §256 `.alert` 一覧に P48、§230 に録音 UI 導線記述。 |
| AC-12 | ✅ | `mobile/P48-admin-speech.html` 併置。CSS 上単カラム固定 + overflow-wrap で破綻リスクなし（agent-browser のビューポート縮小は 0.27.3 で不可のため幅 320〜430px の機械測定は未実施／CSS 精読で代替）。 |
| AC-13 | ✅ | 「軽微な磨き残しは整える」。Round 1 の W-001〜W-003 はモック側を実装に合わせる修正として完了。実装側変更は不要（実装が正）。 |
| AC-14 | ❌ | `spec/design/review/008.md` が未作成（W-101）。唯一の未充足 AC。 |

懸念のある AC: **AC-14 のみ**（review/008.md の欠落）。AC-1〜AC-13 はすべて充足。Round 1 の AC-4/AC-8（W-001〜W-003）は修正により解消し ✅ に転じた。AC-12 の横スクロール機械測定は環境制約で未実施だが CSS・視覚で破綻なし。

## Round 1 指摘の解消状況

| ID | 内容 | 状態 |
|----|------|------|
| W-001 | 「録音を停止」が ghost で表示（実装は filled danger） | **解消**（`.recorder-card` scoped で filled 化、agent-browser 実視確認） |
| W-002 | 「取り消す」が rest 赤文字（実装は ink-secondary） | **解消**（scoped で rest 中立・hover でのみ赤、実視確認） |
| W-003 | 接続テスト結果が案D `.alert`（実装は塗り単一行） | **解消**（`.test-result` 塗りバナー単一行に置換、`BANNER_BASE` と一致、実視確認） |

3 件すべて、実装（`styles.ts` / `AudioRecorder.tsx` / `SpeechSettingsForm`）に忠実な形で修正されていることを CSS 精読 + agent-browser 実視で確認した。過剰修正・他セクションへの波及もない。

## 視覚確認メモ

agent-browser 0.27.3 で以下を実視確認:
- P48 desktop: admin-nav「文字起こし設定」active、provider select OpenAI、API キー section（新 API キー + 接続テスト + 現在状態「環境変数から読み込み中」）、**接続テスト結果=塗り緑の単一行「接続成功 · 応答 682ms」**、モデル section（env ロックバッジ + disabled `gpt-4o-transcribe`）。
- P13-upload 録音 UI: recording 状態で**「録音を停止」が塗り赤 chip**、上限間近 warning（案D alert）。stopped 状態で**「この録音を取り込む」=塗り primary / 「録り直す」=中立 / 「取り消す」=灰文字 ghost**の 3 段階差。permission-denied 警告 + 誘導文。
- モバイル幅の機械測定はビューポート縮小不可（0.27.3 既知制約）のため未実施。mobile CSS 精読で横溢れリスクなしを確認。
- `agent-browser close --all` で後始末済み。
