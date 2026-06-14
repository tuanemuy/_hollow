# レビュー Round 3（最終確認）— Test 観点（PR #736 / Issue #701）

レビュアー: Test 専門
対象: `gh pr diff 736`、`.issue/701/plan.md`、`.issue/701/review/review-002-test.md`（前回 APPROVED）
焦点: Round 2 で新規追加された `app/components/ingestion/__tests__/AudioRecorder.test.ts`（純関数 16 件）が過剰モックでなく実ロジックを突いているか、`pickSupportedMime` の注入が本番動作を忠実に反映しているか、PR 全体に未解消のカバレッジ穴が残っていないか。既解消（Round 1/2 の Blocker・Warning）の蒸し返しはしない。

## 総評

新規 `AudioRecorder.test.ts` の 16 件は **すべて実 export を呼ぶ純関数テスト**で、過剰モックは無い。唯一の注入（`IsTypeSupported`）は本番が依存する `MediaRecorder.isTypeSupported` という単一のプラットフォーム seam そのもので、注入された predicate は本番が呼ぶブラウザ API と等価に振る舞う。candidate のウォーク順・`{mimeType, extension}` マッピング・`formatDuration` の境界・`recorderStatusText` の a11y 不変条件（"録音中" を tick 跨ぎで一定）はいずれも本番コードを実通している。実行結果は 16/16 PASS（`vitest run`）。Round 2 で APPROVED だったバックエンド経路にも退行は無く、新規の穴は検出されなかった。

### 新規テストの実ロジック直結の確認

- **`pickSupportedMime`（6 件）** — 注入 `IsTypeSupported` は本番 `pickSupportedMime()`（`AudioRecorder.tsx:206` で無引数呼び出し → `defaultIsTypeSupported` = `MediaRecorder.isTypeSupported` のラッパ）の正確な代替。テストが pin する分岐は本番の実挙動と一致: 全 true → `audio/webm;codecs=opus`、opus 接尾辞非対応 → 素の `audio/webm`、Safari（webm 無）→ `audio/mp4`/`m4a`、ogg フォールスルー、全 false → `null`（エンジン既定フォールバック）。返る `extension` は `ingest` の `recording-${stamp}.${extension}`（`:304`）に流れる File 名の拡張子そのもので、`mimeType` は Blob/File の `type` 元データ — つまり AC-5（録音由来 Blob の MIME/拡張子欠落回帰）の純粋部分を実コードで担保している。load-bearing な assertion。
- **順序固定（`walks candidates strictly in declared preference order`）** — `MIME_CANDIDATES` を i から末尾まで supported にして毎回 `MIME_CANDIDATES[i]` が選ばれることを全要素で検証。配列の reshuffle ミューテーションを確実に検出する。リストの整合性をテストが直接ピン留めしており honest。
- **`formatDuration`（4 件）** — 0/5/59/60/61・30 分上限（1800s）・二桁分の境界。padStart の zero-pad と minute/second ロールオーバーを実通し。`String(m).padStart` を素通りさせる退行（例: 文字列連結に潰す）を捕捉可能。
- **`recorderStatusText`（6 件相当）** — Round 1 W-002 の a11y 契約（polite live region が tick ごとに再アナウンスしないよう "録音中" を seconds/bytes 非依存で一定）を `Set(texts).size === 1` で明示担保。`.each` で idle/requesting/uploading/permission-denied を網羅し、`stopped` は autoStop の true/false 両方で同一文言を assert。RecorderState の全 kind を 1 件以上突いており、文言の取り違え・分岐欠落を検出する。

## 結論判定

Round 2 の APPROVED を維持。新規 16 件は実装直結・ミューテーション耐性があり過剰モック無し。`pickSupportedMime` の注入は本番動作を忠実に反映している。PR 全体で未解消の自動テスト穴は検出されなかった。**Test 観点で APPROVED（最終）**。

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** `AudioRecorder.tsx` のコンポーネント内クロージャに閉じたままの導出ロジックが 2 箇所ある: `onstop` の Blob `type` 算出 `pickedRef.current?.mimeType.split(";")[0]`（`:240`、codec 接尾辞の剥がし）と、`ingest` の File 名スタンプ `recording-${stamp}.${extension}`（`:305-309`）。前者の `.split(";")[0]`（`audio/webm;codecs=opus` → `audio/webm`）は純関数テストの射程外で唯一未カバーの導出だが、いずれも React クロージャ内の 1 行で、純関数として抽出されていない。これは「client component の内部挙動は手動/ブラウザに割当」という Round 2 N-004 のプロジェクト方針と整合し、AC-5（録音 Blob の `mimeType`/`filename` 欠落回帰）の手動 TC で end-to-end に担保される。本 Issue 固有の欠落ではなく、新規 Blocker/Warning には当たらない。`extension` 側は本 Round で `pickSupportedMime` テストにより pin 済み。

- **[N-002]** 録音状態機械の遷移（idle→requesting→recording→stopped/permission-denied、byte/time 上限での auto-stop、権限拒否フォールバック）・`MediaRecorder` 実走・`uploadFileFn` 合流（AC-3/AC-4/AC-5）は依然 `ADMIN_SPEECH_API_KEY` 未設定で手動/ブラウザ割当のまま。Round 1 N-006 / Round 2 N-004 と同じ方針継続で、plan のテスト方針（既存 upload→ingest→commit フロー合流・手動 TC）と整合。純関数（MIME 選択・時間整形・a11y 文言）を切り出して単体化し、残りを手動に寄せた切り分けは妥当。

- **[N-003]** 純関数 16 件はいずれも `classifyPipelineError` 等の隣接ロジックを stub せず、`MIME_CANDIDATES` 実配列・実 `formatDuration`・実 `recorderStatusText` を通している。fake は `IsTypeSupported` の boolean predicate と `{ size: 1 } as Blob` の 2 つだけで、後者は `recorderStatusText` が blob を読まないため振る舞いに影響しない（型を満たすためのスタブにすぎない）。偽カバレッジは無い。
