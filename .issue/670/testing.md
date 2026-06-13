# 動作確認計画 — Issue #670: loader データを初期値にするフォームが invalidate 起因の再マウントで編集内容を失う

**Issue:** #670
**作成日:** 2026-06-13

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。

### 検証環境の起動

invalidate 起因の再マウント挙動は実サーバーの RSC loader 再実行で確認する必要があるため、ビルドして wrangler dev で起動する（`docs/test.md` Manual / browser verification 準拠）:

```bash
pnpm build && pnpm start
```

> `pnpm dev`（vite dev）でも可。ただし**個人プロンプト `/_app/settings/prompts` は `staleTime` が `DEV ? 0 : Infinity`** で DEV と本番で挙動が変わるため、Step 0 の staleTime 差の観測は `pnpm start`（本番相当 = Infinity）と `pnpm dev`（= 0）の**両方**で行い、区別して記録する。

スキーマ未適用なら先に:

```bash
pnpm db:migrate
```

### シードデータ

- 認証必須ルート（`/_app/settings/prompts`・`/_app/views`）の検証は管理者ユーザー + セッションを投入する:

  ```bash
  pnpm seed:dev-admin
  ```

- 各画面で「既存値が loader から表示される」状態を作るため、SQL で直接投入する（`pnpm db:execute:local --file <sql>`）。確認には以下が必要:
  - **個人プロンプト**: `/_app/settings/prompts` に既存の override（`text` に既存値）が1件以上表示される状態
  - **管理者プロンプト**: `/admin/prompts` に既存の prompt（`text` / `variables` に既存値）が表示される状態
  - **保存ビュー**: `/_app/views` に既存の保存ビューが1件以上（inline rename・編集ダイアログの seed 元）
  - **アップロード（invalidate トリガー）**: UploadDialog で実際にアップロードを完了でき `routerInvalidate(router)` を発火できるファイル1点

### デプロイ方法

なし（検証環境のみで確認できる）。

## Step 0: 再マウント実証（ハードゲート — 最初に実施）

防御機構の実装前に、本番相当 invalidate で各フォームが**実際に再マウントするか**を実測で確定する。**判定の一次根拠は本番ブラウザ観測**、ユニット再現は補助。

### 0-0. 前提ゲート

- [ ] 作業ブランチが #676（issue/669）を含む origin/main から切られていること（`.issue/669/` がワークツリーに存在することで確認）

### 0-1. mount カウンタの仕込み（一時計測）

- 対象コンポーネント（`PromptRow` / `PromptCard` / SavedViewsRow inline rename / `ViewFormDialog`）に `useEffect(() => { mountCount.current++ }, [])` 相当の一時計測（console.log か画面表示）を入れ、invalidate 前後で mount 回数が増えるかを観測する。計測コードは Step 0 完了後に必ず除去する。

### 0-2. 本番相当 invalidate の発火と観測（一次根拠）

各画面で、フォーム編集中に**別タブまたは同一画面の UploadDialog でアップロードを完了**させ `routerInvalidate(router)` を発火させる。UploadDialog は `_app` 常駐なので別ルートに居ても発火する。

| 画面 | 編集対象 | staleTime | 観測項目 |
|---|---|---|---|
| `/_app/settings/prompts` | 分析の指示（text） | 本番=Infinity / DEV=0 | mount 回数増加の有無・入力値・フォーカス保持。**両 staleTime で別々に記録** |
| `/admin/prompts` | text / variables | 0 | mount 回数増加の有無・入力値・フォーカス保持 |
| `/_app/views`（inline rename） | rename 入力 | 0 | mount 回数増加・入力値・フォーカス・編集モード保持 |
| `/_app/views`（編集ダイアログ） | ダイアログ内 state | 0 | mount 回数増加・入力値・フォーカス・open 保持 |
| `/_app/views`（新規ダイアログ） | 新規入力 | 0 | mount 回数増加・入力値・open 保持（loader seed なしだが再マウント有無のみ確認） |

### 0-3. 判定と記録

- **再マウント＆喪失あり** → 該当箇所のみ防御機構（ADR-001 (a)/(b)/(c)）を実装。喪失粒度（どのコンポーネントから新インスタンス化するか）を記録。
- **再マウントなし／喪失なし** → 「影響なし」を実測根拠（mount 回数が増えない・入力/フォーカス保持）付きで adr.md に記録し対象から外す。**「影響なし」判定も本番ブラウザ経路で最低1回確認**する（ユニット再現だけで早期クローズしない）。
- **全箇所で再現せず** → 本 Issue は影響なしとしてクローズ提案。
- 結果は `.issue/670/adr.md` ADR-002 と manual-test 成果物に記録する。

## 確認項目（Step 0 で「影響あり」と実証された箇所のみ）

### 1. 個人プロンプト編集中の invalidate 耐性（AC-2）

- **目的:** `/_app/settings/prompts` の text を編集中に UploadDialog 完了 invalidate が起きても入力内容とフォーカスが失われない。
- **手順:** prompts 画面で text を編集 → 別タブ/同画面で UploadDialog アップロード完了 → invalidate 発火。
- **期待結果:** 入力中の text とフォーカス位置が保持される。
- **確認ポイント:** 本番 `staleTime: Infinity` では loader 再実行されず元から影響ないケースがある。Step 0 の判定に従う。

### 2. 管理者プロンプト編集中の invalidate 耐性（AC-3）

- **目的:** `/admin/prompts` の text / variables 編集中に invalidate が起きても入力内容とフォーカスが失われない。
- **手順:** admin/prompts で text・variables を編集 → UploadDialog 完了 invalidate。
- **期待結果:** text / variables の入力とフォーカスが保持される。

### 3. 保存ビュー編集中の invalidate 耐性（AC-4）

- **目的:** `/_app/views` の inline rename 中・編集ダイアログ編集中に invalidate が起きても入力・フォーカス・編集モード（rename 中 / ダイアログ open）が失われない。
- **手順:** inline rename を開始して入力 → UploadDialog 完了 invalidate。次に編集ダイアログを開いて入力 → invalidate。
- **期待結果:** rename 入力・ダイアログ内 state・フォーカス・編集 UI の可視状態が保持される。
- **確認ポイント:** 新規ダイアログ（NewViewButton）は Step 0 結果に応じて対象/対象外。固定 key 共有による「勝手にダイアログ復活」退行が起きないこと。

### 4. 保存 → invalidate → 最新値の再表示（AC-5）

- **目的:** 各フォームで自分の保存後、invalidate を経て最新値が再表示される既存挙動が維持される。
- **手順:** 各画面で値を編集 → 保存 → 画面に留まったまま最新値が反映されることを確認。
- **期待結果:** 保存後は loader 最新値が表示される（editing=false で seed 追従。reset 漏れで古い draft が残らない）。

## 既存機能への影響確認

- **IngestionPreviewForm（スコープ外）:** アップロードプレビューの挙動が従来どおり（変更しない）。
- **UploadDialog の invalidate:** 他ページ最新化のための invalidate が従来どおり発火する（触らない）。
- **既存テスト:** `ViewFormDialog.test.tsx` / `IngestionPreviewForm.test.tsx` 等が緑のまま。

## 確認チェックリスト

- [ ] Step 0: 各フォームの mount 回数・入力/フォーカス/編集モード保持を本番ブラウザ経路で実測記録（個人 prompts は staleTime 両方）
- [ ] Step 0: 「影響なし」判定も本番ブラウザ経路で最低1回確認
- [ ] 影響ありとした各箇所で編集中 invalidate に入力・フォーカス・編集モードが耐える
- [ ] 各フォームの保存 → invalidate → 最新値再表示が維持される
- [ ] 新規ダイアログで固定 key 起因の「勝手に復活」退行がない
- [ ] IngestionPreviewForm・UploadDialog・既存テストに退行なし
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` が通る
- [ ] Step 0 の一時計測コードを除去済み
