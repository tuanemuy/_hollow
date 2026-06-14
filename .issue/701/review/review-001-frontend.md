# PR #736 レビュー — Frontend 観点（Issue #701）

対象: AC-1（`/admin/speech` 画面）, AC-4（録音 UI）, ならびに AC-3 のアップロード導線・スタイリング規約準拠。
比較基準: `LLMSettingsForm`（admin 対称性）, `UploadForm`/`UploadDialog`/`DropZone`（ingestion 一貫性）, CLAUDE.md スタイリング方針。

総評: 全体として非常に質が高い。`/admin/speech` は `/admin/llm` と RSC 構造・server function 登録・env-lock UI・aria パターン・スタイル定数まで忠実に対称化されており、side-effect import の manifest 登録漏れもない。`AudioRecorder` は状態機械・リソース解放・ブラウザ差吸収・上限制御・権限拒否フォールバックを丁寧に実装している。**Blocker は無し。** ただしテスト欠落（Frontend 側回帰ゼロ）と aria-live の冗長アナウンスを中心に Warning が複数ある。

---

## Frontend

### Blockers

- **なし。**

  RSC/server-fn 登録（`admin/route.tsx:16` に `import "@/components/admin/SpeechSettingsForm/action"` を追加済み・manifest 未登録リスクなし）、`uploadFileFn` 合流（録音 Blob → File → 既存 multipart 経路、ADR-007 どおりバックエンド変更なし）、zod transport schema の security narrowing（`testSpeechConnectionSchema` が `apiKeySource: literal("env")` / `apiKeyCiphertext: null` を強制し ciphertext probe を封じる）、リソース解放（stream stop / `revokeObjectURL` / unmount cleanup）はいずれも正しく、機能を壊す欠陥は検出されなかった。

### Warnings

- **[W-001] 録音 UI と speech schema のフロントエンド回帰テストが皆無**
  場所: テスト不在（`app/components/admin/__tests__/schema.test.ts` は LLM のみ / `app/components/ingestion/__tests__/` に AudioRecorder テストなし）
  理由: LLM 側は `schema.test.ts` が `testLLMConnectionSchema` の **`apiKeySource:'db'` 拒否・`apiKeyCiphertext` 非 null 拒否**（W-F-001 / 行155-181）という *セキュリティ境界* を回帰テストで固定している。本 PR の `testSpeechConnectionSchema` は同じ security narrowing を持つのに対応テストが 0 件。`SPEECH_PROVIDERS_TRANSPORT` の中身固定・`updateSpeechConfigSchema` の provider enum 拒否・`apiKeyPlain` の min/max もテストされていない。AudioRecorder は状態機械・上限ロジック・MIME 選択・cleanup と検証点が多いのに（差分のバックエンドは厚くテストされているのに対し）フロント側は実質ノーガード。
  提案: 最低限 `schema.test.ts` に speech 版の対称テスト（draft の `db`/ciphertext 拒否、provider enum 拒否、`apiKeyPlain` 境界）を LLM テストと同じ密度で追加する。AudioRecorder は `pickSupportedMime` の優先順位・`formatDuration`・`recorderStatusText` といった純関数だけでも単体テスト化すれば回帰価値が高い（これらは `export` していないので、必要なら最小限を export するか別モジュールへ抽出）。

- **[W-002] `recording` 状態の aria-live が毎秒アナウンスされる**
  場所: `app/components/ingestion/AudioRecorder.tsx:324-326`（`role="status" aria-live="polite"` 領域）＋ `recorderStatusText` の `case "recording": return \`録音中 ${formatDuration(...)}\`;`（行377-378）
  理由: 経過秒が 0.5 秒間隔の `setInterval` で `state.seconds` を更新する（行240-253）たびに status テキスト（`録音中 00:01` → `録音中 00:02` …）が変化し、polite 領域が**毎秒アナウンスを積む**。スクリーンリーダー利用者には「録音中 1 秒、録音中 2 秒…」が延々読み上げられ、騒がしい上にキューが詰まる。`UploadDialog` の `viewStatusText`（状態遷移時のみ文言が変わる）とは非対称。
  提案: aria-live のテキストは秒数を含めない安定文言（例: `録音中`）にし、経過時間は視覚表示（行424 の `formatDuration`）に限定する。停止/権限拒否/取り込み中など「遷移」だけをアナウンスする LLM/Dialog の status パターンに合わせる。

- **[W-003] `RecordingView` / `StoppedView` の上限警告が `role="alert"` で再レンダーごとに割り込みアナウンスされうる**
  場所: `app/components/ingestion/AudioRecorder.tsx:432`（`nearLimit` 警告 `role="alert"`）, `:473`（autoStopped 警告 `role="alert"`）
  理由: `nearLimit` 警告は条件成立後、録音中の毎秒再レンダー中ずっとマウントされたまま。`role="alert"` は assertive で、内容変化のたびにユーザー操作を割り込んで読み上げる。同コンポーネント内に既に polite な status 領域（行324）があるため、警告が assertive で割り込む必要性は薄い。さらにこの polite 領域とアナウンスが競合する（W-002 と重なって二重に騒がしい）。
  理由（補足）: 一度マウントされた `role="alert"` の中身は基本変わらないので致命的ではないが、`nearLimit` がしきい値前後で揺れると再アナウンスされうる。
  提案: 上限接近の予告警告は `role="status"`（polite）に格下げするのが穏当。`autoStopped` の事後通知（停止済み）はユーザーが操作を続ける必要があるので `role="alert"` 維持で可。

- **[W-004] AC-3 確認タスク（DropZone の `accept`）が「変更なし」で完了しているが、`<input type="file">` に `accept` 属性自体が存在しない**
  場所: `app/components/ingestion/UploadForm.tsx:238-245`, `app/components/ingestion/UploadDialog.tsx:424-430`
  理由: plan ステップ15 / coverage S-001 は「DropZone の `accept` が `audio/*` を受理する状態か確認」を要求。実体は `accept` 属性が一切付いていない（=OS ファイルピッカーが全形式を許容）ため、音声ファイルの選択は**ブロックされない**＝AC-3 のアップロード導線は機能的には満たされている。よって機能上の欠陥ではない（Blocker ではない）。ただし「`accept` が audio を受理することを確認した」という plan の言い回しと実装（`accept` 不在）が噛み合っておらず、レビュー観点では「確認の結論」が曖昧。
  提案: 意図的に `accept` を付けない（全形式受理）方針なら、その旨をコメント or PR 説明に明記して plan の確認タスクをクローズする。将来的に拡張子ヒントを与えたいなら `accept` を付けるとファイルピッカーの体験が向上するが、現状は任意。

### Notes

- **[N-001] `model` 長さ上限: transport schema（200）と domain VO（120）が不一致（既存 LLM から踏襲）**
  場所: `app/components/admin/schema.ts:77`（`model: z.string().trim().min(1).max(200)`）vs `app/core/domain/adminSettings/valueObject.ts:257`（`SPEECH_MODEL_MAX_LENGTH = 120`）
  本 PR で新規導入された乖離ではなく、`updateLLMConfigSchema`（同 `.max(200)`）/ `LLM_MODEL_MAX_LENGTH = 120` と完全対称。VO 側が 120 で弾く二重防御が効いており実害はない（121〜200 の入力は VO で `InvalidSpeechModelTooLong`）。対称性を優先した正しい選択。気になるなら transport を 120 に揃えると即時フィードバックになるが、LLM 側との一貫性を崩すため見送りで妥当。

- **[N-002] スタイリング規約は完全準拠**
  `SpeechSettingsForm` は utility-first・`data-*`（`data-env-locked={... || undefined}`, `data-all-env-locked`, `data-provider-changed`）・モジュールスコープ string 定数（`SECTION_CLASS` 他）を LLM フォームから 1:1 で複製しており、新規 CSS / `@apply` は導入していない。`AudioRecorder` も `pillBtn*`・`ALERT*` 共有定数と Tailwind utility のみ。CLAUDE.md のスタイリング ADR 群に違反なし。

- **[N-003] 録音 UI の状態機械・リソース解放・ブラウザ差は堅牢**
  状態は `idle/requesting-permission/recording/stopped/uploading/permission-denied` を discriminated union で表現し illegal state を排除。`getUserMedia` の catch で権限拒否/デバイス無し/非セキュアコンテキストを一括フォールバック（行176-182）、`MediaRecorder` 構築失敗時のエンジン既定リトライ（行188-197）、unmount cleanup での `recorder.stop()`/`stopStream()`/`revokePreview()`（行152-164）、ingest 失敗時の URL 再生成＆`stopped` 復帰（行303-309）まで網羅。MIME は `isTypeSupported` で webm/mp4(Safari)/ogg を優先順位付き選択し `detectKind` が受ける形式に収めている。25MB（24MB に余裕）バイト上限・30分時間上限の二重ガードと auto-stop も実装済み。AC-4 の要件（録音中表示・取り消し・再録音・権限拒否フォールバック）は満たされている。

- **[N-004] env-lock UI / draft 接続テストの security 設計が LLM と対称で正しい**
  draft テストは `apiKeySource: "env"` をクライアントから固定送信し（`index.tsx:148-153`）、transport schema が `literal("env")`/`null` で再検証（`schema.test` 相当の保証は W-001 で要追加）。env-locked フィールドは `disabled` で FormData から除外され、usecase silent-skip は防御ネットという二段構え。`apiKeyServerError` の field-level マッピング（`admin_settings_speech_provider_changed_requires_api_key`）・`aria-invalid`・`aria-describedby`・lock hint の id 紐付けも LLM と同等。

- **[N-005] 録音由来 File のメタデータ付与（AC-5 回帰の前提）は適切**
  `ingest` で `new File([blob], \`recording-${stamp}.${extension}\`, { type: blob.type || "audio/webm" })`（行288-290）と命名・MIME を明示付与しており、`uploadFileFn` 側 `file.type || "application/octet-stream"`（actions.ts:47）にも安全に渡る。AC-5 の「録音 Blob で `mimeType`/`filename` 欠落しない」前提はフロント側で担保されている（最終確認は手動 TC）。
