# ADR — Issue #538: アップロード導線を「投げっぱなし＋キューで編集・保存」に再設計する

## ADR-001: キュー側編集は行から開く Dialog（インライン展開ではなく）

### Status
Proposed

### Context
`previewing` ジョブの編集 UI をキュー導線で提供する方法は、(a) `IngestionJobRow` 内にフォームをインライン展開する、(b) 行から `Dialog` を開いて `IngestionPreviewForm` を載せる、(c) 専用ルート（`/upload/$jobId/edit`）を切る、の 3 案。

`IngestionPreviewForm` は props 駆動（`job / tree / コールバック群`）で親非依存に作られている一方、レイアウトは Dialog の padding を前提にした negative margin（`-mx-6` / sticky action bar）を持つ。インライン展開はカード幅・スクロールコンテキストが異なりフォームの改修が必要。専用ルートは URL 復元性は得られるが、ページシェル・loader・search 検証の追加に対して得るものが小さい（編集は短命の操作で、リロード復元の要求は Issue にない）。

### Decision
(b) を採用。新規 `IngestionJobEditDialog` を `Dialog` ＋ `IngestionPreviewForm` の薄いラッパーとして作り、行ローカル state で開閉する。ディレクトリツリーの lazy load と initial focus は旧 `UploadDialog` の editing ビューのパターンを移植する。

### Consequences
- 良い点: `IngestionPreviewForm` を無改修（JSDoc 調整のみ）で再利用できる。フォーカストラップ・ESC・backdrop 等の Dialog の確立した挙動に乗れる。
- トレードオフ: URL に編集状態が乗らないため、リロードすると編集ダイアログは閉じる（未保存編集は消える）。旧モーダル編集も同じ性質であり、後退ではない。
- トレードオフ: 行ローカル state ゆえ、`IngestionQueue` の 4s/16s ポーリングが対象ジョブをリスト結果から外す（他タブでの commit / discard 等）と、行ごとアンマウントされダイアログが強制クローズし未保存編集が消える。発生は実質クロスタブ操作時のみで許容する。ダイアログ open 中のポーリング一時停止等の回避はスコープ外（ポーリング戦略変更）のため行わない。

---

## ADR-002: キュー誘導は「結果ビュー＋ヘッダーバッジ（イベント通知駆動の client コンポーネント）」、トースト基盤・常時ポーリングは導入しない

### Status
Proposed

### Context
Issue は「成功トースト/リンク、ヘッダーのキュー件数バッジ等」を例示する。リポジトリにトースト基盤は存在しない。また、ヘッダーは server component で、`_app` の AppShell ローダーは `staleTime: Infinity`（leaf ナビゲーションで再実行されない）ため、バッジをサーバーレンダリングすると件数が更新されない。バッジ更新の選択肢は (a) サーバーレンダリング＋invalidate 依存（更新されないため不可）、(b) client ポーリング（`IngestionQueue` と同様）、(c) client でマウント時・visible 復帰時・ingestion ミューテーション直後のイベント通知で再取得。

### Decision
成功確認はモーダル内の `queued` 結果ビュー（メッセージ＋`/upload` リンク）で行い、トースト基盤は新設しない。バッジは (c) を採用: モジュールスコープの極小 pub-sub（`queueBadgeBus`）を `UploadDialog` / `UploadForm`（`/upload` ページの独立アップロード経路）/ `IngestionJobRow` / `IngestionJobEditDialog` のミューテーション成功パスから発火し、バッジが `getIngestionQueueCountFn`（新規 GET server-fn）を再取得する。全画面常駐の追加ポーリングは行わない。

### Consequences
- 良い点: 新インフラ（トースト・グローバルストア・常時ポーリング）なしで AC を満たす。ユーザー操作起点の変化は即時反映される。
- トレードオフ: バックグラウンドの pending → previewing 遷移はタブ放置中バッジに反映されず、visible 復帰または次の操作まで遅延する。許容（`/upload` 滞在中はキュー自身の 4s/16s ポーリングが正確な状態を見せる）。

---

## ADR-003: バッジ件数のために `countByOwner` ポート＋ `countActiveIngestionJobs` usecase を追加する

### Status
Proposed

### Context
件数は既存 `getIngestionJobs`（limit 50 のリスト取得）を呼んでクライアントで数えても得られる。しかしバッジはヘッダー常駐で取得頻度が高く、全カラムのデシリアライズ＋wire 変換は無駄が大きい。また「未処理」の status 集合（pending / processing / previewing）という業務的な意味づけを presentation に置くのはレイヤー責務に反する。

### Decision
`IngestionJobRepository` に read-only の `countByOwner(ownerId, { statuses })` を追加し（`NoteRepository.countByOwner` と同型の確立パターン）、status 集合を定数として持つ `countActiveIngestionJobs` usecase を新設する。d1 実装は `count(*)` 1 クエリ。

バッジの status 集合は `pending / processing / previewing` とし、`failed` は含めない。Issue 本文はキューを「進行中・失敗・プレビュー保留のジョブ一覧」と説明しており `failed` もユーザーの対応待ち（再試行・破棄）ではあるが、バッジが意味するのは「進行中の作業」であり、`failed` を含めると対処されない失敗ジョブがバッジを恒久的に点灯させ続けるノイズになる。この除外理由は usecase 定数の JSDoc にも一文残す（将来「failed もバッジに含めるべきでは？」と再検討する際に経緯が追えるように）。

opts の語彙は既存 `IngestionJobListOpts`（`status?` 単数包含＋ `excludeStatuses` 複数除外）と異なる複数包含 `statuses` を採る。count の用途は「対象 status 集合の IN フィルタ 1 クエリ」であり複数包含が素直なため。同一ポート内で意味論が異なる理由はポート JSDoc に明記する（`NoteRepository` の sibling-family 整合コメント文化に倣う）。

### Consequences
- 良い点: 転送量最小・意味づけが application 層に閉じる。将来 `/upload` ページ側で件数表示が必要になっても再利用できる。
- トレードオフ: ポート・adapter・フェイク・テストの追加コスト。count とリストの瞬間的不整合はあり得るが、バッジは概数表示でありポーリング/通知で収束する。

---

## ADR-004: `.issue/319/adr.md` ほかモーダル前提 ADR の supersede

### Status
Proposed

### Context
`.issue/319/adr.md`（waiting ポーリングの terminal failure を origin 別に `queueGuidance` ビューへ出し分ける）、`.issue/253`（再生成後にモーダルの waiting へ再突入してポーリングで editing に戻す）は、いずれも「モーダル内に waiting / editing ステートが存在する」前提の判断。本 Issue はモーダルから waiting / editing を撤去するため、これらの ADR が解決していた問題（ポーリング fatal 時の編集コンテキスト喪失、再生成後の待機 UX）自体が消滅する。

### Decision
旧 ADR ファイルは歴史的記録としてそのまま残し（書き換えない）、本 ADR で supersede を宣言する。新モデルでは: terminal failure の概念ごと削除（モーダルはポーリングしない）、再生成はキューのポーリング＋行の進捗表示が状態を追跡する。spec/pages/index.md P13 の「モーダル完結」記述は本 Issue で更新する。

### Consequences
- 良い点: 方針転換の経緯が追跡可能になり、旧 ADR を参照するコード（UploadDialog 内コメント）が削除される根拠が明文化される。
- トレードオフ: なし（記録のみ）。

---

## ADR-005: 実装時の細部判断（バッジの配置・EditDialog の backdrop・usecase テスト形態）

### Status
Accepted（実装時追記）

### Context
計画には現れない 3 点の細部判断が実装中に必要になった。

1. ヘッダーバッジの配置: `aria-label` は子孫テキストよりアクセシブルネームとして優先されるため、件数チップを `aria-hidden` の視覚要素にしつつ件数入りラベルを CTA 自体の `aria-label` に持たせる必要がある。Header は server component のままにするには、件数 state を CTA を描画するコンポーネントが持つ必要がある。
2. `IngestionJobEditDialog` の backdrop クリック: 計画は「form の transition pending 中は backdrop で閉じない」としたが、`IngestionPreviewForm` は pending 状態を親に公開していない。
3. `countActiveIngestionJobs` のテスト: 計画は「ユニットテスト＋ in-memory フェイクへの `countByOwner` 追加」としたが、本リポジトリの application 層テストは in-memory フェイクを持たず、`setupTestContainer`（Miniflare 上の実 D1）による integration テストが確立パターン。

### Decision
1. `UploadButton`（既に client component で、利用箇所は Header の 1 箇所のみ）に `useIngestionQueueCount` フックと `IngestionQueueBadge` チップを組み込み、`aria-label` を件数連動（`アップロード（未処理 N 件）`）にする。Header からは静的 `aria-label` を撤去。フック・チップ・ラベル導出は `IngestionQueueBadge.tsx` に同居させ、視覚とSRの整合を 1 ファイルに閉じる。
2. backdrop クリックは閉じる経路にしない（`closeOnBackdropClick` を有効化しない）。pending 信号なしで無条件有効化すると保存中の誤クローズを許すため、保守的に常時無効とする。Esc・×・キャンセルは引き続き使える。
3. `countActiveIngestionJobs.integration.test.ts` として実 D1 で検証する（フェイク追加はしない）。d1 アダプターの `countByOwner` も新規 `ingestionJobRepository.integration.test.ts` で検証。

### Consequences
- 良い点: Header は server のまま、a11y のネーム計算とチップが単一ソース。フォーム改修ゼロで編集ダイアログが成立。テストは既存インフラに乗る。
- トレードオフ: backdrop クリックで閉じられない分、閉じる操作は明示的な UI に限られる（誤操作防止を優先）。

## ADR-006: アップロード成功の提示を `routerInvalidate` から独立させる（Review 001 対応）

### Context
Review 001 [W-001] の指摘: 単一ファイル経路では upload と `routerInvalidate` が同じ `try` に入っており、invalidate 中の leaf loader 失敗が「アップロード失敗」として誤提示されていた（複数ファイル経路では逆に未処理 rejection になり `queued` ビューへ到達しない）。

### Decision
両経路とも、enqueue 成功が確定した時点で `notifyIngestionQueueChanged()` と `queued` ビュー遷移を先に行い、`routerInvalidate` は独立した `try/catch` に隔離して失敗を黙殺する。loader の再取得失敗は結果提示の真実性に影響しないため。

### Consequences
- ジョブが enqueue 済みである限り、ユーザーには常に正しい結果（queued）が提示される。
- invalidate が失敗した場合 `/upload` のリストが古いままになり得るが、バッジ通知（notify）は発火済みで、ページ遷移時の loader 再実行で回復する。
