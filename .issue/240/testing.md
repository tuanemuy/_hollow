# 動作確認計画 — Issue #240: spec(publish): FrontMatter経由のpublish編集仕様と実装の整合性検証

**Issue:** #240
**作成日:** 2026-05-27

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。本Issueはドキュメント（`spec/`）更新が中心で、実装コードへの変更はない。

### 検証環境の起動

```bash
pnpm dev   # http://localhost:3000 (Cloudflare Workers ローカル + vite dev)
```

### デプロイ方法

実装変更がないため不要（spec ドキュメント更新のみ）。ステージング・本番への反映手順は本Issueの範囲外。

---

## 確認項目

### 1. spec 更新の整合性（grep 検証）

- **目的:** FrontMatter 経由の publish 編集仕様への言及が `spec/` から消えていること
- **手順:**
  1. リポジトリルートで `grep -rn '公開ステータス書換\|保存前注意\|FrontMatter.*publish\|publish.*FrontMatter\|publish.*書き戻\|書き戻.*publish' spec/` を実行
  2. ヒットがゼロであること、または意図的に残した記述（TC-F1-03 / TC-D4-05 の新文言で「publish」と「FrontMatter」が同時に出る箇所）のみであることを確認
- **期待結果:** 「`publish` キー編集 → 公開ステータス書き戻し / 注意ダイアログ表示」を示唆する記述が消えている
- **確認ポイント:** ステップ 7 のチェックリスト

### 2. 既存テストの回帰防御

- **目的:** Issue #230 で追加された「`SUGGESTED_KEYS` に `publish` を含めない」アサートが引き続き PASS すること
- **手順:**
  1. `pnpm test:unit` を実行
  2. `app/components/note/editor/__tests__/FrontMatterEditor.test.tsx` の `SUGGESTED_KEYS datalist does not include 'tags' / 'aliases' / 'publish'` テストが PASS することを確認
- **期待結果:** 全テスト PASS。コード変更はないため既存挙動は変わらない
- **確認ポイント:** Issue #230 ADR-001 のサジェスト除外仕様が機械的に保護されている

### 3. 静的検証

- **目的:** typecheck / lint / format が通る
- **手順:**
  1. `pnpm typecheck`
  2. `pnpm lint:fix`
  3. `pnpm format`
- **期待結果:** いずれもエラーなし（ドキュメント変更のみなので影響は無いはず）

### 4. 新 TC-F1-03（公開ステータスの独立性）の実機検証

- **目的:** 公開設定モーダル経由の公開操作で FrontMatter に `publish` キーが書き戻されないことを確認
- **前提:** ローカル開発サーバーを起動し、ログイン済み・ノートが 1 件以上存在する状態
- **手順:**
  1. テスト用ノートを開き、`P14 公開設定モーダル` でラジオを「公開」に切り替えて保存
  2. `P11 ノート詳細画面` の FrontMatter パネルを開く
  3. FrontMatter パネルに `publish` キーが自動追加されていないことを確認
  4. ノートに `publish` 系のキーが既にあれば（手書きの場合）、その値は P14 の状態と一致せずに維持されていることを確認
- **期待結果:** FrontMatter には `publish` キーが現れない。公開状態は P14 のラジオでのみ管理される
- **確認ポイント:** `saveNote` と `changePublicationVisibility` が独立しているため、片方が他方を更新しないこと

### 5. 新 TC-D4-05（FrontMatter 経由編集の無効性）の実機検証

- **目的:** FrontMatter で `publish: public` を手書きしても公開状態が変わらないことを確認
- **前提:** 非公開ノートが 1 件存在する状態
- **手順:**
  1. 非公開ノートを `P12 エディタ画面` で開く
  2. メタデータパネル（構造編集モード）で `publish` キーを追加し、値を `public` に設定
  3. 保存
  4. 保存時に「公開ステータスが即時変更されます。続行しますか？」のような注意ダイアログが**表示されない**ことを確認
  5. `P11 ノート詳細画面` のメタ情報パネルで公開状態が「非公開」のままであることを確認
  6. `P14 公開設定モーダル` でラジオが「非公開」のままであることを確認
  7. FrontMatter パネルに `publish: public`（文字列）が任意キーとして 1 行表示されていることを確認
- **期待結果:** FrontMatter 編集は PublicationState に影響しない。注意ダイアログも出ない。`publish: public` は任意キーとして残置される
- **確認ポイント:** Note 集約と PublicationState 集約の独立性が実装レベルでも保たれていること

## エッジケース・異常系

### 1. 既存ノートで `frontMatter.publish` が手書きされているケース

- **目的:** 既存ノートが破壊されないこと
- **手順:**
  1. 既存ノートで FrontMatter に `publish` キーを含むものを開く（無ければスキップ）
  2. P11 詳細画面で表示されること、P12 エディタで編集可能なことを確認
- **期待結果:** 既存ノートの `frontMatter.publish` 値はそのまま表示・編集できる。公開状態には影響しない

## 既存機能への影響確認

- **FrontMatter エディタ全般:** 任意キーの追加・編集・削除・rename が引き続き動作すること
- **P14 公開設定モーダル:** 公開・限定公開・非公開の切替が引き続き動作すること
- **`SUGGESTED_KEYS` datalist:** `publish` / `tags` / `aliases` がサジェストに出ないこと（Issue #230 のテストで担保）

## 確認チェックリスト

- [ ] `grep` で publish↔FrontMatter 同期に関する言及が spec から消えている
- [ ] `pnpm test:unit` の `FrontMatterEditor.test.tsx` 既存テストが PASS
- [ ] `pnpm typecheck` PASS
- [ ] `pnpm lint:fix` PASS
- [ ] `pnpm format` PASS
- [ ] TC-F1-03 新手順: P14 で公開化しても FrontMatter に `publish` が追加されない
- [ ] TC-D4-05 新手順: FrontMatter で `publish: public` を保存しても公開状態が変わらない
- [ ] 既存ノートで `frontMatter.publish` を持つものが破壊されない
- [ ] FrontMatter エディタの汎用機能（追加・編集・削除・rename）は影響を受けない
