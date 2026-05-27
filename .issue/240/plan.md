# 実装計画 — Issue #240: spec(publish): FrontMatter経由のpublish編集仕様と実装の整合性検証

**Issue:** #240
**作成日:** 2026-05-27
**複雑度:** 中〜大規模（ドキュメント主体、6ファイル6箇所を一貫して書き換え）

---

## 目的

Issue #230 で「あれば表示」モデルに刷新した FrontMatter エディタについて、`publish` キー編集 → 公開ステータス書き戻しという**実装側には存在しない仕様**が `spec/` に残存している状態を解消する。実装に手を入れず、spec を実装の事実に揃える（廃止方向）ことで Issue #230 ADR-001 の延長線として整合性を取り戻す。

## スコープ

### 含まれるもの

- `spec/manual-tests/publish.md` TC-F1-03 の書き換え（書き戻し検証 → 独立性検証）
- `spec/manual-tests/organize.md` TC-D4-05 の書き換え（注意ダイアログ検証 → 無効性検証）+ 先頭の「Issue #230 のスコープ外」注記の削除
- `spec/scenario/publish.md` F1 正常系 4 項目目「FrontMatter に書き戻され…」の削除
- `spec/scenario/organize.md` D4 異常系の publish 警告記述の削除
- `spec/pages/index.md` P11 / P12 の「公開ステータス書換時の保存前注意表示」記述の削除
- `spec/adr/003-metadata-formats.md` の `publish など` 例示と、PublicationState の独立性を明文化する追記
- `.issue/240/` 配下の plan.md / adr.md / testing.md

### 含まれないもの

- 実装コードの変更（実装側に `publish` 経由 PublicationState 更新の経路が存在しないことを調査で確認済み）
- (B) 案: 実装側に FrontMatter→publish の同期フローを追加する案。集約境界（Note / PublicationState の独立）を壊すため不採用 — ADR-001 参照
- FrontMatter エディタの UI 変更（ユーザが `publish` を任意キーとして手書きする自由は維持）
- 他の任意キー（`aliases` 等）に関する仕様整理（Issue #240 の範囲外）

## 調査結果

### 実装側の事実

- `app/components/note/editor/FrontMatterEditor.tsx`: `SUGGESTED_KEYS = ["date", "description", "title", "slug"]` で `publish` を意図的に除外（Issue #230 ADR-001）
- `app/components/note/editor/editorState.ts`: `publish` / `visibility` 文字列マッチ ゼロ
- `app/core/application/note/saveNote.ts`: FrontMatter を値オブジェクト化して保存するのみ。`PublicationState` には触らない
- `app/core/application/publication/changePublicationVisibility.ts`: `PublicationState` を更新するが `frontMatter` には書き戻さない
- `app/components/note/detail/NoteActions.tsx:118`: `/notes/$noteId/publish` (P14) が正規の公開操作 UI
- `app/components/note/editor/__tests__/FrontMatterEditor.test.tsx:290-308`: `SUGGESTED_KEYS` に `publish` を含めないアサート（既に存在）

→ 結論: **FrontMatter 経由の publish 編集は実装側に存在しない。動かない。**

### あるべきアーキテクチャ

- `spec/domains/note.md`: `FrontMatter` は `Record<string, FrontMatterValue>` の自由スキーマ（既知キーは `date` のみ）
- `spec/usecases/publication.md`: 公開状態は `PublicationState` 集約 + `ChangePublicationVisibility` ユースケースの責務
- Note 集約と PublicationState 集約は独立。FrontMatter から PublicationState を変更する経路はドメイン境界上あってはならない
- Issue #230 ADR-001 「`publish` は実装側で読まれていないためサジェストから外す」が既に廃止方向を示唆

## 実装ステップ

### 1. `spec/manual-tests/publish.md` TC-F1-03 を書き換え

- **対象ファイル:** `spec/manual-tests/publish.md:48-56`
- **変更内容:**
  - タイトル: `TC-F1-03: 公開ステータスが FrontMatter に書き戻される` → `TC-F1-03: 公開ステータスは FrontMatter とは独立に管理される`
  - 種別: 正常系（維持）
  - 目的: `FrontMatter の publish キーが整合すること` → `公開ステータスは P14 公開設定モーダル経由でのみ変更でき、FrontMatter にも書き戻されない（公開状態と FrontMatter は独立した責務であることを確認）`
  - 手順表を以下のテスト 2 行に置き換え:
    1. `Public-Note` を公開に切替えた後、`P11 ノート詳細画面` の FrontMatter パネルを開く → FrontMatter パネルに `publish` キーは自動追加されない
    2. オーナーが FrontMatter で `publish: public` を手書きで追加して保存 → 任意キーとして保存されるが、`P11` の公開状態表示・`P14` のラジオ値は変化しない
- **理由:** 実装の事実を仕様化する。汎用 key-value としてユーザが `publish` 文字列を書く自由は残す（ADR-001/ADR-002）が、それが公開状態を変えるという仕様は撤回する

### 2. `spec/manual-tests/organize.md` TC-D4-05 を書き換え

- **対象ファイル:** `spec/manual-tests/organize.md:331-341`
- **変更内容:**
  - 先頭の `⚠️ FrontMatter 経由の publish 編集 UI は未実装の可能性あり — 実装状況に応じて別 Issue で検証する。本ケースは Issue #230 のスコープ外。` 注記を削除
  - タイトル: `TC-D4-05: 公開ステータス書換時の保存前注意` → `TC-D4-05: FrontMatter 経由の公開状態変更は無効`
  - 種別: 異常系（維持）
  - 目的: `FrontMatter から公開状態を変更したときの注意表示` → `FrontMatter の publish キー編集は公開状態に影響しないこと（公開操作は P14 公開設定モーダル経由のみ）を確認する`
  - 手順表を以下のテストに置き換え（前提: ノートは非公開状態）:
    1. 非公開ノートを開き、構造編集モードで `publish` キーを追加して値を `public` に設定し保存 → 保存は通常通り成功し、注意ダイアログは表示されない。任意キーとして `publish: public`（文字列）が FrontMatter パネルに 1 行として表示されるだけで公開状態は変わらない
    2. `P11 ノート詳細画面` のメタ情報パネル / `P14 公開設定モーダル` を確認 → 公開状態は引き続き「非公開」のまま。公開化するには `P14` で明示的にラジオを切り替える必要がある
- **理由:** ステップ 1 と対の検証。FrontMatter 編集が PublicationState に伝播しないことを動作で確認する（ネガティブテストへの転用）

### 3. `spec/scenario/publish.md` F1 正常系の書き戻し記述を削除

- **対象ファイル:** `spec/scenario/publish.md:12`
- **変更内容:** `4. 公開ステータスは FrontMatter にも書き戻され、整合する` の 1 行を削除（前後の段落は維持）
- **理由:** シナリオレベルで FrontMatter 書き戻し仕様を取り下げる。マニュアルテストと整合を取る

### 4. `spec/scenario/organize.md` D4 異常系の publish 警告記述を削除

- **対象ファイル:** `spec/scenario/organize.md:71`
- **変更内容:** `- 公開ステータス（publish）を FrontMatter で書き換えると公開状態が即時変化する点を保存前に注意表示` の 1 行を削除
- **理由:** シナリオの D4 異常系から FrontMatter→publish 同期の前提を消す

### 5. `spec/pages/index.md` P11 / P12 の「公開ステータス書換時の保存前注意表示」記述を削除

- **対象ファイル:** `spec/pages/index.md:127, 161`
- **変更内容:**
  - L127 (P11 FrontMatter パネル):
    - 書き換え前: `FrontMatter パネル（ノートに書かれているキーの一覧表示）。タグ操作は別パネル（ハッシュタグ／タグチップ）で行う。公開ステータス書換時の保存前注意表示`
    - 書き換え後: `FrontMatter パネル（ノートに書かれているキーの一覧表示）。タグ操作は別パネル（ハッシュタグ／タグチップ）で行う`
  - L161 (P12 メタデータパネル):
    - 書き換え前: `メタデータパネル（FrontMatter の任意 key-value 編集 / 生 JSON 編集モード切替 / schema 検証 / 公開ステータス書換時の保存前注意表示 / 内部リンク補完）。タグ操作は本文ハッシュタグまたはタグチップ入力で行う`
    - 書き換え後: `メタデータパネル（FrontMatter の任意 key-value 編集 / 生 JSON 編集モード切替 / schema 検証 / 内部リンク補完）。タグ操作は本文ハッシュタグまたはタグチップ入力で行う`
- **理由:** ページ仕様レベルでも FrontMatter→publish の注意ダイアログ機能を撤回する

### 6. `spec/adr/003-metadata-formats.md` の `publish など` 例示を整理

- **対象ファイル:** `spec/adr/003-metadata-formats.md:15`
- **変更内容:**
  - `（title / aliases / created / updated / publish など）` を `（title / description / slug / aliases / date など。アプリ側で意味を持つのは date のみで、他は任意キー扱い）` に書き換え（`aliases` は L24 不採用理由「別名管理にも使いたい」との整合のため残す。`spec/domains/note.md:78` の例示順とも揃える）
  - 末尾に「公開状態は FrontMatter ではなく独立した PublicationState 集約で管理する（Issue #240 で明文化）」を追記
- **理由:** ADR-003 が `publish` を FrontMatter の典型例として挙げているため、後続の読み手を誤誘導する

### 7. 整合性確認

- `grep -rn '公開ステータス書換\|保存前注意\|FrontMatter.*publish\|publish.*FrontMatter\|publish.*書き戻\|書き戻.*publish' spec/` でゼロヒット（または意図した残置のみ）を確認
- 残っていれば該当箇所を見直し

### 8. 最終チェック

- `pnpm typecheck && pnpm lint:fix && pnpm format` を実行（実装変更なしだが CLAUDE.md ルールに従う）
- `pnpm test:unit` の `FrontMatterEditor.test.tsx` で「`SUGGESTED_KEYS` に `publish` を含まない」テストが既存パスとして残ることを確認（機械的な回帰防御）

## 設計判断

- **(A) 廃止方向採用、(B) 実装追加は不採用**
  - (B) は Note 集約と PublicationState 集約の独立を壊す。`assertCanPublish`（他人メディア参照チェック）等の公開時バリデーションを FrontMatter 編集経路にも複製する必要があり、設計上の影響が大きい
  - (A) は実装に手を入れず、Issue #230 ADR-001 の延長線として整合する
- **`publish` を任意キーとしてユーザが手書きする自由は維持**
  - ADR-001/ADR-002 の「あれば表示」モデルを維持。既存ノートで `frontMatter.publish` を持つものは残置される
  - 仕様としては「その文字列に PublicationState への意味はない」だけを明文化
- **TC-D4-05 はネガティブテストへ転用**
  - 削除ではなく同じ TC 番号で「無効であること」を確認するネガティブテストに転用。番号体系を保持しつつ回帰防御を残す

詳細は `.issue/240/adr.md` を参照。

## リスクと注意点

- **既存ノートで `frontMatter.publish` を持つもの**: ADR-002 の方針に従い残置。詳細画面では汎用キーの 1 行として表示されるだけで、公開状態には影響しない
- **ドキュメント間の表現揺れ**: 6 ファイル 6 箇所が連動する。1 つでも更新漏れがあると Issue が再発するので、ステップ 7 の grep 確認を必ず実行する
- **ADR-003 は承認済み ADR**: 例示部分のみの微修正で、ADR 本体の決定（3 形式採用）は変えない。追記時は「Issue #240 で明文化」と参照を入れる

## テスト方針

- 静的検証中心（コード変更なし）: `pnpm typecheck && pnpm lint:fix && pnpm format`
- 既存テスト `FrontMatterEditor.test.tsx:290-308` が引き続き PASS することを確認（`SUGGESTED_KEYS` に `publish` 不在）
- 実装×spec の突き合わせ:
  - `grep -rn 'publish' app/components/note/editor/` で coupling コードが皆無であることを再確認
  - `grep -rn 'publish' app/core/application/note/` で `saveNote` が PublicationState に触れないことを再確認
- 動作確認: 更新後の TC-F1-03 / TC-D4-05 の手順で実機検証可能（manual-test スキルで実行）

## レビュー履歴

### 1周目

**結果**: 両視点とも「問題点ゼロ」で終了。改善提案 4 件を取り込んで完了。

**取り込んだ改善提案**:

- **[S-001 / S-003 視点2]** ADR-003 の書き換え後例示に `aliases` を残し、`spec/domains/note.md` の例示順と揃える形に修正（ステップ 6）
- **[S-002 視点1]** ステップ 7 の grep パターンに `保存前注意` を追加し、残置検出の網羅性を上げる
- **[S-001 視点2]** ステップ 5 の `spec/pages/index.md` 書き換えを「before / after」両方明示する形式に変更し、Edit 実行時の精度を上げる
- **[S-002 / S-004 視点2]** TC-D4-05 ステップ 1 に「前提: 非公開状態」を明示し、期待結果に「`publish: public`（文字列）が FrontMatter パネルに 1 行として残置表示される」を追記

**見送った提案**: なし
