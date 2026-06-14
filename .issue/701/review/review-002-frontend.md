# PR #736 レビュー — Frontend 観点 Round 2（Issue #701）

対象: AC-1（`/admin/speech` 画面）, AC-4（録音 UI）, AC-3 アップロード導線・スタイリング規約準拠。
Round 1 指摘（W-001 speech schema テスト / W-002 aria-live 毎秒 / W-003 nearLimit role）の解消確認を含む。
比較基準: `LLMSettingsForm`（admin 対称性）, `UploadForm`/`UploadDialog`/`DropZone`（ingestion 一貫性）, CLAUDE.md スタイリング方針。

総評: Round 1 の Warning 3 件（W-001/W-002/W-003）はいずれも適切に解消済み。**aria-live 修正は a11y 的に正しい。** 新規 Blocker は無し。新規 Warning は 1 件（AudioRecorder 純関数の単体テスト未追加 = W-001 の後半提案が未消化）に留まる。スタイリング・env-lock・security narrowing・リソース解放はすべて LLM 対称で堅牢。

---

## Round 1 指摘の解消確認

- **[W-001 解消（schema 部分）] PASS** — `app/components/admin/__tests__/schema.test.ts:195-361` に speech 版の対称テストが追加された。`SPEECH_PROVIDERS_TRANSPORT` の中身固定、`updateSpeechConfigSchema` の provider enum 受理/拒否・model trim・境界（200/201）・`apiKeyPlain` 境界（4096/4097）・null 受理、`testSpeechConnectionSchema` の draft security narrowing（`apiKeySource:'db'` 拒否・`apiKeyCiphertext` 非 null 拒否・unknown provider 拒否）まで LLM テストと同密度でカバー。security 境界の回帰固定が達成された。
- **[W-002 解消] PASS（a11y 的に正しい）** — `recorderStatusText`（`AudioRecorder.tsx:371-391`）の `recording` ケースが秒数を含まない安定文言 `"録音中"` に変更された（WHY コメント付き、行378-380）。経過秒は視覚表示（`RecordingView` 行427-429 の `formatDuration`）に分離。polite 領域（行324）は 0.5 秒ごとに再レンダーされるが、テキスト内容が不変なため SR は再アナウンスしない（live region は内容変化時のみ読み上げる）。「録音中 1 秒、録音中 2 秒…」の連続アナウンス問題は解消。`UploadDialog` の遷移時のみ文言が変わる status パターンと整合。
- **[W-003 解消] PASS（a11y 的に正しい）** — `nearLimit` の上限接近予告が `role="alert"`（assertive）から `role="status"`（polite）に格下げ（`AudioRecorder.tsx:440`、WHY コメント付き 行435-439）。録音継続中ずっとマウントされる予告がユーザー操作を割り込まなくなった。`autoStopped` の事後通知（`StoppedView` 行481）はユーザーが操作を要するため `role="alert"` 維持で適切（コメントで使い分けの根拠も明記）。降格は穏当で正しい。

---

## Frontend

### Blockers

- **なし。**

  RSC/server-fn 登録（`admin/route.tsx:16` に `import "@/components/admin/SpeechSettingsForm/action"`、nav union 行97・`ADMIN_NAV` 行110、`routeTree.gen.ts` も生成済み、manifest 未登録リスクなし）、`/admin/speech` ルート（`speech.tsx` の RSC レンダー + admin guard）、`uploadFileFn` 合流（録音 Blob → File → 既存 multipart、ADR-007）、transport schema の security narrowing（`testSpeechConnectionSchema` が `apiKeySource: literal("env")`/`apiKeyCiphertext: null` を強制）、リソース解放（stream stop / `revokeObjectURL` / unmount cleanup）はいずれも正しく、機能を壊す欠陥は検出されなかった。Round 1 の aria-live 修正で a11y 回帰も生じていない。

### Warnings

- **[W-001 残（後半）] AudioRecorder の純関数（`pickSupportedMime` / `formatDuration` / `recorderStatusText`）が依然として未テスト**
  場所: `app/components/ingestion/__tests__/` に AudioRecorder 関連テスト無し（schema 側のみ解消）
  理由: Round 1 W-001 の「最低限」要件だった schema テストは追加されたが、「提案」だった AudioRecorder の純関数単体テストは未消化。`pickSupportedMime` の MIME 優先順位（Safari `audio/mp4` フォールバック・codec suffix の有無）、`formatDuration` のゼロパディング、`recorderStatusText` の状態→文言写像（W-002 で安定化させた `recording → "録音中"` の固定そのもの）は回帰価値が高い純関数だが、いずれも `export` されておらずテスト不能。とくに `recorderStatusText` は今回 W-002 で「秒数を含めない」契約を入れたばかりで、将来うっかり秒数を戻す回帰を検出する手段が無い。
  提案: `pickSupportedMime` / `formatDuration` / `recorderStatusText` を最小限 `export` し、状態機械の文言固定（とくに `recording` が秒数非依存であること）を単体テストで固定する。バックエンドは厚くテストされているのにフロント録音ロジックは依然ノーガードという非対称は残っている。Blocker ではない（機能・手動 TC で idle/permission-denied は確認済み）が、W-002 で入れた a11y 契約を守るうえで価値が高い。

### Notes

- **[N-001] AudioRecorder は DropZone の「下」に配置されており、権限拒否フォールバック文言「上のファイルアップロードから…」が空間的に正しい**
  `UploadForm.tsx:256-258`（`mt-4` で DropZone の後ろ）/ `UploadDialog.tsx:433` でも DropZone の後段に配置。`PermissionDeniedView`（`AudioRecorder.tsx:533`）の「上のファイルアップロードから音声ファイルを取り込んでください」が DOM 順・視覚順と一致しており誘導が破綻しない。

- **[N-002] DropZone の `accept` 不在は既仕分け（Round 1 W-004 = 意図的設計）。蒸し返さない**
  `UploadForm.tsx:238-245` / `UploadDialog.tsx:424-430` の `<input type="file">` に `accept` は無いまま（`multiple` のみ）。音声受理はクライアントガード（`validateUploadFiles` → `IngestionService.detectKind`）方式で、手動 TC-rec-4 が WAV 受理を実機確認済み。Round 1 で「機能上の欠陥ではない・意図的設計」と仕分け済みのため再指摘しない。

- **[N-003] aria-live 二重領域の競合は無い**
  常時マウントの polite status 領域（行324、録音開始時に "録音中" を 1 回）と `nearLimit` の polite 警告（行440、しきい値到達時に 1 回）は発火タイミングが分離しており、同一レンダーで両者が同時に内容変化することはない。W-003 の polite 化で assertive 割り込みも消えたため、SR 体験は穏当。`SpeechSettingsForm` 側でも provider-change alert（`role="alert"`）と現在状態 status（`role="status"`）を相互排他レンダー（行270 `!providerChanged` ガード）にしており、競合回避が一貫している。

- **[N-004] スタイリング規約は完全準拠（Round 1 N-002 維持）**
  `SpeechSettingsForm` は utility-first・`data-*`（`data-env-locked={... || undefined}`, `data-all-env-locked`, `data-provider-changed`）・モジュールスコープ string 定数（`SECTION_CLASS` 他）を LLM フォームから 1:1 複製。`AudioRecorder` も `pillBtn*`・`ALERT*` 共有定数と Tailwind utility のみ。新規 CSS / `@apply` の導入なし。`motion-safe:animate-pulse`（行425）・`motion-reduce:transition-none` の reduce-motion 配慮あり。CLAUDE.md スタイリング ADR 群に違反なし。

- **[N-005] env-lock UI / draft 接続テストの security 設計が LLM と対称で正しい（Round 1 N-004 維持）**
  draft テストは `apiKeySource: "env"` をクライアント固定送信（`index.tsx:148-153`）し transport schema が `literal("env")`/`null` で再検証（今回 schema.test で固定済み）。env-locked フィールドは `disabled` で FormData から除外され usecase silent-skip は防御ネット。`apiKeyServerError` の field-level マッピング（`admin_settings_speech_provider_changed_requires_api_key`）・`aria-invalid`・`aria-describedby`・lock hint の id 紐付けも LLM と同等。

- **[N-006] `model` 長さ上限の transport(200)/VO(120) 不一致は既存 LLM 踏襲（Round 1 N-001 維持）**
  `schema.ts:77`（`.max(200)`）vs VO（`SPEECH_MODEL_MAX_LENGTH = 120`）。`updateLLMConfigSchema` と完全対称で、121〜200 は VO が `InvalidSpeechModelTooLong` で弾く二重防御が効くため実害なし。対称性優先の妥当な選択。
