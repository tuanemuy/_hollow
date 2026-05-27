# ADR — Issue #240: spec(publish): FrontMatter経由のpublish編集仕様と実装の整合性検証

## ADR-001: (A) 廃止方向採用 — FrontMatter 経由の publish 編集仕様を spec から削除

### Status

Accepted (2026-05-27)

### Context

Issue #230 で FrontMatter エディタを「あれば表示」モデルに刷新した際、`publish` キーを編集すると公開ステータスが書き戻されるという spec 上の仕様（`spec/manual-tests/publish.md` TC-F1-03, `spec/manual-tests/organize.md` TC-D4-05, `spec/scenario/publish.md` F1 など）が実装と整合しているかを検証できなかった。

実コード調査の結果、次のことが判明した:

- `app/components/note/editor/FrontMatterEditor.tsx` / `editorState.ts` のどこにも `publish` 文字列への参照は無い
- `app/core/application/note/saveNote.ts` は FrontMatter を保存するだけで `PublicationState` には触らない
- `app/core/application/publication/changePublicationVisibility.ts` は逆方向の書き戻し（FrontMatter への注入）も行わない
- Issue #230 ADR-001 で「`publish` は実装側で読まれていないためサジェストから外す」と既に決定済み

つまり実装側に同期経路は存在せず、spec のみが「動くはず」と謳っている状態。選択肢は以下の 2 つ:

- **(A) 仕様廃止**: FrontMatter 経由の publish 編集仕様を spec から削除し、公開操作は P14 公開設定モーダル経由のみに統一
- **(B) 実装追加**: 実装側に FrontMatter → PublicationState の同期フローを追加して仕様に追従

### Decision

**(A) 廃止方向を採用する。**

理由:

1. **ドメイン境界の保全**: `spec/usecases/publication.md` で公開状態は `PublicationState` 集約の責務。Note 集約から PublicationState 集約を変更する経路はドメイン境界を壊す
2. **既存 ADR との整合**: Issue #230 ADR-001 が既に「`publish` は実装で読まれていない」と廃止方向を示唆している
3. **実装規模と複雑性**: (B) を実現するには `saveNote` 内で publish 値を抽出して `ChangePublicationVisibility` ユースケースを呼ぶ二段階処理が必要。`assertCanPublish`（他人メディア参照チェック）等の公開時バリデーションを FrontMatter 経由でも実行する必要があり、UoW 境界・エラーハンドリング含めて実装規模が大きい
4. **UI の重複**: 公開操作には専用 UI（P14 公開設定モーダル）が既に存在し、こちらが正規の経路。FrontMatter 経由の編集は副次的経路に過ぎず、二重化する利得が薄い
5. **既存ノート互換性**: `publish` を任意キーとしてユーザが手書きする自由は維持される（ADR-001/ADR-002 の「あれば表示」モデル）。既存ノートで `frontMatter.publish` を持つものは破壊されない

### Consequences

**良い点:**

- 実装変更ゼロ。ドキュメント更新のみで完結
- Note 集約と PublicationState 集約の独立性が spec レベルでも明示される
- Issue #230 ADR-001 の延長線として一貫性が取れる
- 既存の回帰防御テスト（`FrontMatterEditor.test.tsx:290-308` の「`SUGGESTED_KEYS` に `publish` を含まない」アサート）がそのまま機械的な保護として残る

**トレードオフ:**

- ユーザが「FrontMatter で publish を書けば公開できる」と期待する可能性は残るが、サジェスト除外（Issue #230）と仕様明文化（本 Issue）の組み合わせで誤解は最小化される
- 既存ノートで `frontMatter.publish` が手書きされている場合、表示はされるが実効性はない。これは想定された挙動として明文化する

---

## ADR-002: TC-D4-05 を削除せずネガティブテストへ転用

### Status

Accepted (2026-05-27)

### Context

(A) 廃止方向を採用すると、`spec/manual-tests/organize.md` TC-D4-05（FrontMatter で `publish` を書き換えたときに注意ダイアログが出る検証）は不要になる。選択肢:

- **削除**: TC 番号が欠番化する
- **転用**: 同じ TC 番号で「FrontMatter 経由の編集は公開状態に影響しないこと」を確認するネガティブテストに変換

### Decision

**転用する。**

理由:

- マニュアルテストの番号体系（TC-D4-01 〜 TC-D4-05）を維持し、関連 TC との参照関係を壊さない
- 「動かないこと」を確認するネガティブテストは、実装回帰（誰かが (B) 方向のコードを書いてしまう事故）を検出できる
- TC-F1-03 とペアになり、両方向（書き戻されない / 編集が伝播しない）から仕様の独立性を担保できる

### Consequences

**良い点:**

- TC 番号体系の保全
- 機械的回帰防御（誤って FrontMatter→PublicationState 同期が入った場合、ネガティブテストが落ちる）

**トレードオフ:**

- 「Issue #230 のスコープ外」注記を削除して別の意図のテストに書き換えるため、git 履歴を辿らないと変遷が見えづらい。ADR-001/002 と plan.md がこの経緯を保持する
