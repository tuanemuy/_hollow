# ブラウザ検証レポート — Issue #363

**実行日:** 2026-05-31
**テストソース:** `.issue/363/testing.md`
**サーバー:** http://localhost:5180/（`pnpm dev --port 5180`）
**結果:** 主要項目 実機 PASS（5件）/ 非確定・別経路は integration 担保（スキップ）

---

## サマリー

| 項目 | 種別 | 結果 | 証跡 |
|---|---|---|---|
| 項目5: ingestion 側 `/` 区切りヒント表示 | UI | **PASS** | preview-form-nested-hint.png |
| 項目2: `技術/AI` でネスト作成 | 機能 | **PASS** | commit-success.png（DB: 技術→AI、note が AI 配下） |
| 項目3: 既存親への部分合流 | 機能 | **PASS** | `技術/機械学習` で技術は重複せず機械学習のみ新規 |
| エッジ1: 深さ上限超過(11階層) | 異常系 | **PASS** | depth-overflow-error.png（インライン TooDeep、0件作成） |
| 既存機能: NoteEditor 単一名（回帰） | 回帰 | **PASS** | noteeditor-single-name.png（ネストヒントなし） |
| 項目1: LLM が `親/子` をネスト提案 | LLM依存 | スキップ | 実 LLM 出力依存で非確定（下記） |
| 項目4: クイックコミット経由のネスト | 別UI経路 | スキップ | 同一 commit usecase、integration 担保 |
| エッジ2/3: 正準化・深すぎ LLM 提案 | ドメイン | スキップ | ドメイン/usecase ロジック、integration 担保 |

**合計（実機）**: 5 件 PASS / 0 FAIL。起票 Issue: なし。

## 環境前提の再評価（#355 からの変化）

関連 Issue #355 のブラウザ検証はローカル環境制約（LLM stub が throw → preview 到達不能）でスキップだったが、本検証時点では制約が解消しており、**取り込みパイプラインがローカル `pnpm dev` で完走し、本機能を end-to-end で検証できた**。コード/実機で確認した内訳:

- **LLM**: `.dev.vars` に `ADMIN_LLM_API_KEY` 実キーあり ＋ `wrangler.toml [vars]` に `ADMIN_LLM_PROVIDER=anthropic` 等。`buildLlmProvider`（`serverCloudflare.ts:517-530`）が両 truthy で real provider を配線し、`StubLLMProvider`（`llm_not_implemented_in_mvp` throw）に落ちない。実機で preview が生成された。
- **R2 / 取り込み処理**: miniflare のローカル R2 が機能し、アップロード → preview 生成が成功（`uploadFileFn` POST=200、polling=200、「プレビュー編集に進みました」表示）。`[env.consumer]` キューワーカー自体は `pnpm dev` では起動しないが、検証に必要な経路は完走した。
- **CSRF / cross-origin**: ログイン・`uploadFileFn`・`commitIngestionPreviewFn` の各 POST がすべて 200 で成功し弾かれなかった（本 dev 構成では Origin が実 origin に解決される）。なお commit ボタンの発火は agent-browser の `click @ref` がモーダル内で不安定だったため `button.click()` を JS eval で発火させて成功させた（手順上の知見）。
- **認証**: 既存テストユーザー `tester354@example.com`（email_verified=1、`.issue/354/manual-test/seed-data.md`）でログイン。

## 実機で確認できた本機能の中核

- プレビューフォームの新規ディレクトリ入力に `allowNestedPath` 由来のヒントが表示（ラベル「または新規ディレクトリパス」、説明「『/』区切りで階層（最大10階層）を指定できます（例: 技術/AI）。」、placeholder「例: 技術/AI（/ 区切りで階層を指定）保存時に自動作成」）。
- `技術/AI` をコミットすると root→技術→AI が作成され、ノートが末端 `AI` 配下に入る。**中間 `技術` も実体として作成**される（DB 確認）。
- 既存 `技術` がある状態で `技術/機械学習` をコミットすると、`技術` は重複作成されず（count=1）`機械学習` のみが `技術` 配下に新規作成される（**部分合流の再利用**）。
- 11 階層のパスを手入力してコミットすると、フォーム内にインラインで「ディレクトリの階層が深すぎます（最大10階層まで）」が表示され、ディレクトリは 0 件作成・クラッシュなし（commit 経路の `TooDeep` 業務エラー）。
- NoteEditor 通常編集（`/notes/new`）の DirectoryPicker は従来どおり単一名（ラベル「または新規ディレクトリ名」、ネストヒント文言は DOM 上に存在せず）。`allowNestedPath` 既定 false の回帰なし。

## スキップ項目とその根拠（integration 担保）

- **項目1（LLM が `親/子` をネスト提案）**: 実 LLM の出力内容に依存し確定的に再現できないため未検証。プロンプト制約解除（`prompts.ts` の2分岐）は実装済みで、機能本体（ネストパスの作成）はフォーム手入力経路で実証済み。
- **項目4（クイックコミット「ノートとして保存」経由）**: `IngestionJobRow`（`IngestionJobRow.tsx:192-203`）は preview の suggested 値で `commitIngestionPreviewFn` を叩く別 UI 経路。LLM がネストを提案したジョブを要するため項目1と同様に非確定だが、叩く usecase は同一であり integration テスト（`ingestion.integration.test.ts` の `IngestionJobRow` 経路ケースを含む）が担保。
- **エッジ2/3（正準化・深すぎ LLM 提案で完走）**: ドメイン VO の best-effort null 化・usecase の正準化ロジックで、ユニット/integration テスト担保範囲。

これらの commit mutation 本体は `pnpm test:integration`（515 PASS、うちネストパス作成・部分合流・冪等・TooDeep・クイックコミット経路の新規5件）で担保済み。

## スクリーンショット

すべて `.issue/363/manual-test/screenshots/`:
- `landing.png` — ランディング
- `after-signup.png` — ログイン後
- `preview-form-nested-hint.png` — プレビューフォームのネストパスヒント（項目5）
- `commit-success.png` — `技術/AI` コミット成功（項目2）
- `depth-overflow-error.png` — 深さ超過インラインエラー（エッジ1）
- `noteeditor-single-name.png` — NoteEditor 単一名（回帰）

## 環境への影響

- 検証で作成したディレクトリ（`技術`/`AI`/`機械学習` 等）・ノート（`verify363-ml` 等）はローカル miniflare の D1/R2 上のテストデータ。本番・staging には影響しない。
