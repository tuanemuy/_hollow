# PR #740 レビュー — デザイン / フロントエンド観点（Issue #739）

レビュー対象: PR #740（base = `issue/701/recording-transcription`）
レビュー方針: 出荷済み実装（`SpeechSettingsForm` / `AudioRecorder`）を正として、HTML モックの忠実度・既存モックとの一貫性・受け入れ基準（AC-1〜AC-14）の網羅を検証。
視覚確認: agent-browser でデスクトップ P48 / モバイル P48 / P13-upload-modal の録音 UI をスクリーンショット確認した（後述の制約あり）。

## デザイン / フロントエンド

### Blockers

なし。

実装に存在する状態・要素・文言・ロック表現・role 使い分けはすべてモックに反映されており、トークン運用・admin シェル骨格・ナビ整合に致命的な欠落は見つからなかった。

### Warnings

- **[W-001]** 録音 UI「録音を停止」ボタンが実装の *filled* danger ではなく *ghost*（透明 + 赤文字）でレンダリングされる
  - 場所: `spec/design/pages/P13-upload.html:285-289`、`spec/design/pages/P13-upload-modal.html:665-666`、`spec/design/pages/P13a-upload-modal.html`（同等定義）、各 mobile 版も同様。ボタン本体は `P13-upload-modal.html:896`（`class="pill-btn danger"`）。
  - 理由: 実装の `pillBtnDanger`（`app/components/common/styles.ts:62-63`）は **rest 状態で塗りつぶし**（`bg-error-surface` + `text-error`）の chip。「録音を停止」はこの filled danger を使う（`AudioRecorder.tsx:475`）。一方モックの `.pill-btn.danger` は `background: transparent; color: error`（hover でのみ error-surface）と定義されており、agent-browser のスクリーンショットでも停止ボタンは枠なしの赤文字ゴーストとして表示された。filled と ghost で見た目が明確に異なり、「実装が正」の忠実度要件に反する。
  - 提案: `.pill-btn.danger` を `background: var(--color-error-surface); color: var(--color-error);`（rest で塗りつぶし）に修正し、hover はそのまま error-surface 維持で可。これで実装の filled danger と一致する。

- **[W-002]** 録音 UI「取り消す」ボタン（ghost-danger）が rest 状態で赤文字になっており、実装の二次ink表現と異なる
  - 場所: `spec/design/pages/P13-upload.html:991-995`、`P13-upload-modal.html:667-668`、`P13a-upload-modal.html`（同等）、mobile 版も同様。
  - 理由: 実装の `pillBtnGhostDanger`（`styles.ts:86-87`）は **rest で `text-ink-secondary`（透明背景）**、hover/active でのみ `error-surface` + `error` 文字に変わる「低強調の破壊的アクション」。モックの `.pill-btn.ghost-danger` は rest で `color: var(--color-error)` と赤文字になっており、実装よりも強い視覚的強調になっている。W-001 の停止ボタンと見分けがつかなくなり、実装が意図的に作っている「filled stop / 中立 ghost discard」の階層差が失われている。
  - 提案: `.pill-btn.ghost-danger` の rest を `color: var(--color-ink-secondary)`（背景は transparent のまま）にし、`:hover` で `background: error-surface; color: error;` とする。これで実装の ghost-danger と一致し、W-001 修正後の停止ボタンとも階層差が出る。

- **[W-003]** 接続テスト結果バナーが実装の単一行プレーン表示ではなく `.alert`（アイコン + 見出し + 本文の2行）で表現されている
  - 場所: `spec/design/pages/P48-admin-speech.html:426-445`、`mobile/P48-admin-speech.html:413-432`。
  - 理由: 実装（`SpeechSettingsForm.tsx:342-355`）の接続テスト結果は `BANNER_BASE`（`bg-success-surface`/`bg-error-surface` の塗りバナー）内に **単一行テキスト** `接続成功 · 応答 ${latencyMs}ms` / `接続失敗 · ${error}` を出すだけで、アイコンも見出し/本文の分割も持たない。モックは案D `.alert`（白地 + 枠 + アイコン + `alert-title`「接続成功」+ `alert-body`「応答 682ms」）で表現しており、構造・配色（白地枠 vs 塗りつぶし）・行構成が実装と一致しない。「実装が正」の忠実度要件では乖離。
  - 提案: 厳密な忠実度を取るなら、実装どおり `bg-success-surface`/`bg-error-surface` の塗りバナーに「接続成功 · 応答 682ms」「接続失敗 · …」の単一行で揃える。もしくは「モックは案D `.alert` へ意図的に磨いた（AC-13 の磨き対象として実装も後追いする）」と plan / review-008 に明記して乖離を意図と記録する。現状はどちらの注記もないため、判断を可視化すること。なお実装側はこのバナーに `role="status"` を使っており、モックも `role="status"` で一致している点は OK。

### Notes

- **[N-001]** env ロック表現（lock-badge + disabled + `ADMIN_SPEECH_PROVIDER/MODEL/API_KEY` ロックヒント）、全固定バナー（`data-all-env-locked`）、provider 変更警告（`alert-warning` + `data-provider-changed` + 必須バッジ）、API キー現在状態の3分岐（env / DB マスク / 未設定）が、編集可能な既定形を1つ実体化し残りをコメント併記する形で網羅されている。コメントに表示条件（`envOverrides.*` / `providerChanged` / `apiKeyRequired`）と排他関係まで書かれており、実装の条件分岐と1:1 対応が取れていて非常に良い。

- **[N-002]** 録音 UI の `.alert` role 使い分けが実装に忠実。上限間近=`role="status"`（`AudioRecorder.tsx:461`）、自動停止=`role="alert"`（:502）、permission-denied=`role="alert"`（:547）が各モックで正しく踏襲され、コメントにも「上限間近=role="status"、自動停止/権限拒否=role="alert"」と明記されている（雑に統一していない）。sr-only `aria-live="polite"` ライブ領域（`recorderStatusText` 相当の「録音中」）も再現済み。

- **[N-003]** 録音カードのトークン運用が正確。`.recorder-card` は `border-hairline` / `surface-elevated` / `radius-xl`(16px=rounded-xl) / `space-4`(p-4) で、実装の `rounded-xl border border-hairline bg-surface-elevated p-4` と一致。`.recorder-*` の各定義もすべて正式トークン（`--color-*` / `--space-*` / `--text-*` / `--font-mono`）のみで、ローカル変数や独自パターンの発明は見当たらない。`@keyframes pulse` は全 P13 モック（desktop/mobile）に定義済みで `recorder-dot` のアニメーションが破綻しない。

- **[N-004]** admin-nav 整合が全 admin モックで取れている。desktop P40〜P47 + `P45-admin-users-skeleton.html`、mobile P40/P42〜P47 のすべてで `文字起こし設定`（→ `P48-admin-speech.html`）が **LLM 設定の直後**に追加され、P48 自身では `class="active"`。並び順も全ページで統一。
  - 参考: mobile 版の一部リンク（mobile P46/P47 が `P41-admin-llm.html`、他は `-mobile.html` サフィックス）の不整合は **本 PR 以前から存在する** mobile ナビの既存問題で、P48 追加とは無関係。P48 のリンク（`P48-admin-speech.html`、mobile からも同 basename）は既存 P41 mobile の P48 リンク方式と一致しており、本 PR が新たな不整合を持ち込んではいない。

- **[N-005]** `spec/design/index.md` の更新は正確。§51 が「admin（P40〜P48）」+「文字起こし設定（P48）は LLM 設定（P41）と並列」+「baseURL 欄を持たない（[ADR-013](../adr/013-speech-provider.md)）」を含み、相対パス `../adr/013-speech-provider.md` は実在ファイルに解決する（ADR-013 にも baseURL を持たない判断あり）。§230 に録音 UI 導線（`AudioRecorder` の状態機械・DropZone 直後・30分/24MB自動停止・「実装は1状態ずつ排他」注記）が追記され、§256 の `.alert` 参照モック一覧に `P48` が追加済み。

- **[N-006]** baseURL の混入なし。P48 desktop/mobile ともに provider/apiKey/model の3セクション構成のみで、P41 から複製する際に base-url 欄・コメントが確実に削除されている（AC-2 の核心を満たす）。provider select は OpenAI 1択だが `<select><option>` 構造を維持し、コメントで「将来 #738 に備えて維持」と意図が記録されている。

## 受け入れ基準チェック（AC-1〜AC-14）

| AC | 判定 | 備考 |
|----|------|------|
| AC-1 | ✅ | `P48-admin-speech.html` 新規。単一ファイルで表示可、`:root` トークンは tokens 最終形（P41 と同一セット）。agent-browser で表示確認済み。 |
| AC-2 | ✅ | provider select（OpenAI、select 構造維持）・既定モデル input（`gpt-4o-transcribe`）・新 API キー input・接続テストボタンあり。**baseURL 欄なし**を確認。 |
| AC-3 | ✅ | env 固定（lock-badge + disabled + `ADMIN_SPEECH_*` ロックヒント）・全固定バナー（コメント併記）すべて再現。モデル節は固定状態を実体表示。 |
| AC-4 | ✅ | API キー現在状態3分岐・provider 変更警告（必須バッジ含む）・接続テスト結果 success/error をコメント併記で網羅。ただし結果バナーの**表現が実装と乖離**（W-003）。 |
| AC-5 | ✅ | ヘッダー・admin-nav・page-title・form-section 構造が P41 同型。admin-nav に「文字起こし設定」active。視覚確認済み。 |
| AC-6 | ✅ | desktop P40〜P47 + skeleton、mobile 該当ページすべてに P48 リンクを LLM 直後に追加。 |
| AC-7 | ✅ | P13-upload.html の DropZone 直後（1107→1115）に録音 UI。idle/requesting-permission/recording/stopped/permission-denied を反映。 |
| AC-8 | ✅ | 各状態の要素・文言が実装どおり（赤ドット pulse・経過時間 mono・MB・上限間近 warning・audio プレビュー・3アクション・自動停止 alert・権限拒否誘導）。ボタンの**配色のみ**実装と差（W-001/W-002）。 |
| AC-9 | ✅ | P13-upload-modal.html / P13a-upload-modal.html のモーダル内 DropZone 直後に録音 UI。mobile 版にも全て反映。 |
| AC-10 | ✅ | index.md §51 を P40〜P48 に更新、P48 を P41 と並列と明記。 |
| AC-11 | ✅ | §256 `.alert` 一覧に P48 追記、§230 に録音 UI 導線記述。 |
| AC-12 | ✅ | `mobile/P48-admin-speech.html` 併置。トークンは desktop 逐語コピー、admin-nav に P48 active。横スクロール検証は agent-browser 制約で機械測定できず（下記）、CSS 上は単カラム固定 + `overflow-wrap`/`min-width:0` で破綻リスクなし、スクリーンショットでも破綻なし。 |
| AC-13 | ⚠️ | 「軽微な磨き残しは実装も整える」基準。W-001〜W-003 はモック側が実装と乖離している箇所で、AC-13 の逆向き（モックを実装に合わせる）が必要。実装変更は不要だが、モック修正 or 乖離の意図記録が望ましい。 |
| AC-14 | ⏳ | `spec/design/review/008.md` の作成は本 PR diff 上で未確認（本レビューファイルとは別。plan ステップ7 の成果物）。PR に含まれているか要確認。 |

懸念のある AC: **AC-4 / AC-8 / AC-13**（いずれも W-001〜W-003 のボタン配色・接続テストバナー表現の実装乖離に起因）、**AC-12**（横スクロールの機械測定が環境制約で未実施。視覚・CSS では問題なし）、**AC-14**（review/008.md の有無を別途確認）。

## 視覚確認の制約メモ

agent-browser 0.27.3 は利用できたが、`emulate viewport` / `device` でのビューポート縮小が効かず（`window.innerWidth` が 1280 に固定されたまま）、モバイル幅 320〜430px での `scrollWidth === clientWidth` の機械的検証はできなかった。代替として: (1) モバイル P48 を 1280px で開いてレイアウト破綻・要素欠落がないことをスクリーンショット確認、(2) mobile CSS（`.main` 単カラム固定・`overflow-wrap:anywhere`・`min-width:0`・`.row` の `flex-wrap`）を精読し横溢れリスクがないことを確認した。スクリーンショット上、デスクトップ P48・モバイル P48・P13 録音 UI いずれもはみ出し・欠落なし。`agent-browser close --all` で後始末済み。
