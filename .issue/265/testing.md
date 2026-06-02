# 動作確認計画 — Issue #265: extend no-op version-bump skipping to other update aggregates

**Issue:** #265
**作成日:** 2026-06-02

---

## 確認環境

本 Issue の変更はドメイン層（`User.changeUsername` 判定順序、`Directory.moveTo` 同一親 no-op、`Note.updateContent` 全一致 no-op＋イベント抑制）＋テストのみで、エンドユーザー向け UI の見た目・操作フローに変化はない。観測可能な挙動変更は次のエッジケースのみ:

- username 変更でクールダウン中に**現在と同じ username** を再送信 → エラーにならず no-op（従来はクールダウンエラー）。
- ノートを**内容無変更**で再保存（autosave 連投等）→ version 進行せず `contentUpdated` 非発行（従来は毎回 version+1＋再インデックス）。
- ディレクトリを**現在の親**へ移動 → version 進行なし。

主たる確認は自動テストで行う。

### 検証環境の起動

ブラウザでの追加確認を行う場合のみ（ドメイン変更のため必須ではない）:

```bash
pnpm build      # pnpm start は dist/worker を配信するため、ソース変更後は build が必要
pnpm start      # wrangler dev でローカルサーバー起動
```

> 注: 認証必須ルートの agent-browser 検証はセッション直挿しが必要（dev D1 は `.wrangler/state/v3/d1/<id>.sqlite`）。本 Issue は UI 挙動の変化が実質ないため、ブラウザ検証はスキップ可（下記参照）。

### デプロイ方法

なし（検証環境・自動テストで確認できる。ステージング/本番への反映は不要）。

## 確認項目

### 1. ドメインユニットテスト（値セッターの no-op 分岐）

- **目的:** 値セッターの no-op 分岐を確認する。User の `changeDisplayName`/`changeBio`/`changeAvatar` 同一値・null↔null、`changeUsername` クールダウン中同一値、`Directory.moveTo` 同一親、`Note.updateContent` 全6フィールド一致が、同一参照を返し version を据え置く（Note はイベントも空）こと。
- **手順:**
  ```bash
  pnpm test:unit
  ```
- **期待結果:** `app/core/domain/identity/__tests__/entity.test.ts`、`app/core/domain/directory/__tests__/entity.test.ts`、`app/core/domain/note/__tests__/entity.test.ts` を含む全ユニットテストが pass。新規追加した no-op ケースが緑。
- **確認ポイント:** 既存の「別 username はクールダウン中 throw」「既に admin/member なら throw（promote/demote）」「`Note.updateContent` で1フィールド変更すると `contentUpdated` 発行＋version+1」が回帰していないこと。

### 2. アプリケーション統合テスト（連投時の version 据置）

- **目的:** ユースケース経由で同一 payload を連投しても OCC version が無駄に進まないことを確認する。
- **手順:**
  ```bash
  pnpm test:integration
  ```
- **期待結果:** `app/core/application/identity/__tests__/identity.integration.test.ts` を含む全統合テストが pass。`UpdateProfile` の同一値再送・`ChangeUsername` のクールダウン中同一値再送で version 据置が緑。
- **確認ポイント:** 実 DB（D1/SQLite）に対する save がスキップされ、version が +1 で止まること。

### 3. 型・lint・format

- **目的:** 変更が型安全・コーディング規約に適合していることを確認する。
- **手順:**
  ```bash
  pnpm typecheck
  ./node_modules/.bin/biome check --write app/core/domain/identity app/core/application/identity
  ./node_modules/.bin/biome format app/core/domain/identity app/core/application/identity
  ```
  > biome はローカルバイナリ経由で実行（rtk が `pnpm lint`/biome コマンドを書き換える既知問題のため）。
- **期待結果:** エラー・警告なし。

## エッジケース・異常系

### 1. クールダウン中の同一 username 再投入（挙動変更点）

- **目的:** 順序入れ替えにより、クールダウン中でも「現在と同じ username」を投げたときに throw せず no-op になることを確認する。
- **手順:** 統合テスト `ChangeUsername` に追加したケースで担保。
- **期待結果:** `UsernameChangeTooSoon` が throw されず、version・`lastUsernameChangedAt` が据え置かれる。

### 2. クールダウン中の別 username 投入（回帰防止）

- **目的:** 実際に値が変わる変更はクールダウン中に従来どおり throw されることを確認する。
- **手順:** 既存統合テスト「rejects rename within the 30-day cooldown」で担保。
- **期待結果:** `username_change_too_soon` が throw される（変更なし）。

## 既存機能への影響確認

- プロフィール更新（displayName/bio/avatar）・username 変更・admin promote/demote の各フローが従来どおり動作すること（自動テストで担保）。
- promote/demote は本 Issue でコード変更なし。throw 挙動は維持。

## 確認チェックリスト

- [ ] `pnpm test:unit` 全 pass（User/Directory/Note の新規 no-op ケース含む）
- [ ] `pnpm test:integration` 全 pass（連投 version 据置含む）
- [ ] `pnpm typecheck` エラーなし
- [ ] biome check / format クリーン
- [ ] 既存の throw テスト（別 username クールダウン / promote-demote）が回帰していない
- [ ] `Note.updateContent` の content-changed 分岐（1フィールド変更で `contentUpdated` 発行＋version+1）が回帰していない

## ブラウザ検証の要否

**スキップ可。** 理由: 新規 UI なし、UI 操作フローの変化なし。唯一の挙動変更（クールダウン中の同一 username 再投入が no-op）は通常 UI 操作で再現しにくいエッジケースで、統合テストで担保済み。admin promote/demote は server-function 経由 mutation のため agent-browser では cross-origin 403 で検証不可（本 Issue では promote/demote のコード変更もなし）。
