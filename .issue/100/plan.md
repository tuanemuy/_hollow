# 実装計画 — Issue #100: feat(infra): wire R2 ObjectStorage / TempFileStorage and remove production Stubs

**Issue:** #100
**作成日:** 2026-05-22
**複雑度:** 中〜大規模

---

## 目的

Issue #96 ADR-003 / ADR-005 で意図的に後回しにした「R2 binding 配線 + production Stub 削除」を完了させ、`app/core/adapters/cloudflare/` から `StubObjectStorage` / `StubTempFileStorage` クラスを撤去する。 既に Issue #110 などの後続作業で wrangler.toml / DI 配線は完了しており、本Issueの実質的なコード変更は Stub クラスの削除と DI 内 inline NoopAdapter への置換、テスト書き換え、staging 動作確認に集中する。

## スコープ

### 含まれるもの

- `app/core/adapters/cloudflare/r2ObjectStorage.ts` から `StubObjectStorage` クラスを削除
- `app/core/adapters/cloudflare/r2TempFileStorage.ts` から `StubTempFileStorage` クラスを削除
- `app/core/application/di/serverCloudflare.ts` の Stub fallback を「DIファイル内に閉じた inline unavailable-adapter」に置換
- `serverCloudflare.test.ts` の downgrade 検証テストを「instanceof チェック」から「port 契約検証（rejects.toThrow）」に刷新
- `handlers.integration.test.ts` の `StubTempFileStorage.prototype` への spy を削除（`R2TempFileStorage.prototype.get` spy だけ維持）
- `.dev.vars.example` / `docs/runtime_cloudflare.md` 内の `StubObjectStorage` / `StubTempFileStorage` 言及を新しい挙動名（unavailable adapter）に揃える
- `.issue/96/adr.md` ADR-005 に「Superseded by #100 ADR-001」を追記
- staging 環境への deploy と manual test 経路（media upload / ingestion / export）の動作確認

### 含まれないもの

- 新規 R2 bucket の provision（既に `infra/src/r2.ts` で provision 済み）
- `wrangler.toml` への新規 binding 追加（既に top-level + `[env.consumer]` で配備済み）
- `ServerEnv` 型への新規フィールド追加（既に optional で配備済み）
- `R2ObjectStorage` / `R2TempFileStorage` 本体のロジック変更
- presign 実装の変更（SigV4 計算は既存実装を継続使用）
- `pruner` / `relay` / `dlq` worker への R2 binding 追加（worker 側は R2 を使わない）
- `app/core/application/__tests__/fakes/` の test fake（`InMemoryObjectStorage` / `FakeTempFileStorage`）の変更
- R2 API token / SOPS secrets の初回投入（投入済み前提。未投入なら別Issueで扱う）

## 実装ステップ

### 1. ADR の起票

- **対象ファイル:** `.issue/100/adr.md`（新規）
- **変更内容:**
  - ADR-001 (#100): 「production runtime 内に閉じた inline unavailable-adapter で Stub クラスを置換する」
  - ADR-002 (#100): 「ADR-005 (#96) で維持していた production Stub を本Issueで撤去する判断と、ServerEnv の optional 性は維持する理由」
- **理由:** Issue 本文の Stub 削除要求は、ADR-005 (#96) の「production stub vs test fake を意図的に維持」決定を上書きする変更。supersede の合意を adr.md に明文化する。

### 2. `StubObjectStorage` クラスの削除

- **対象ファイル:** `app/core/adapters/cloudflare/r2ObjectStorage.ts`
- **変更内容:** `StubObjectStorage` クラス全体と export を削除
- **理由:** Issue 本文「やること (4)」。adapter ファイルから「想定されない実装」を排除し、API surface を縮減する。

### 3. `StubTempFileStorage` クラスの削除

- **対象ファイル:** `app/core/adapters/cloudflare/r2TempFileStorage.ts`
- **変更内容:** `StubTempFileStorage` クラス全体と export を削除
- **理由:** Issue 本文「やること (5)」。同上。

### 4. `serverCloudflare.ts` の DI 配線を inline unavailable-adapter に置換

- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`
- **変更内容:**
  - `StubObjectStorage` / `StubTempFileStorage` の import を削除
  - module 上部に private factory `createUnavailableObjectStorage(): ObjectStorage`、`createUnavailableTempFileStorage(): TempFileStorage` を追加。各メソッドは `async () => { throw new StorageUnavailableError(...) }` / `async () => { throw new TempFileStorageUnavailableError(...) }` クロージャ形を採用する（既存 Stub と同等の microtask 挙動）。理由は `.issue/100/adr.md` ADR-001 を参照。
  - `createRequestContainer` の `objectStorage` / `tempFileStorage` 分岐の fallback 側を新 factory 呼び出しに変更。条件式（`objectStorageBucket && r2PresignConfig` / `tempFilesBucket` の有無）は維持。
- **理由:** Stub クラス削除に伴う fallback 経路の置換。「DI 配線時には binding 欠落でも container 構築は成功し、operation 時に明示的なエラーで運用者が気付ける」挙動を維持。

### 5. `serverCloudflare.test.ts` の downgrade 検証テストを刷新

- **対象ファイル:** `app/core/application/di/__tests__/serverCloudflare.test.ts`
- **変更内容:**
  - `StubObjectStorage` / `StubTempFileStorage` の import を削除
  - downgrade ケース（binding 欠落 / R2_* env 部分欠落）の `expect(...).toBeInstanceOf(StubXxx)` 形を「port 契約検証」に置換
  - `ObjectStorage` port の全メソッドを明示的にカバー: `put` / `get` / `stat` / `delete` / `presignDownload` / `presignUpload` の各々で `rejects.toThrow(StorageUnavailableError)`（実際の port インターフェース上のメソッド全部が rejects.toThrow で検証されること）
  - `TempFileStorage` port も同様に全メソッドを `rejects.toThrow(TempFileStorageUnavailableError)` で検証
  - 「R2ObjectStorage / R2TempFileStorage が wire される」ポジティブテストは `toBeInstanceOf(R2ObjectStorage)` / `toBeInstanceOf(R2TempFileStorage)` を維持
- **理由:** Stub クラス export を消すため、テストの「型による downgrade 検証」を「port 契約の挙動検証」にスライドさせる。port 全表面で fallback 挙動が一貫していることを担保する。

### 6. `handlers.integration.test.ts` の Stub spy を削除

- **対象ファイル:** `app/worker/cloudflare/__tests__/handlers.integration.test.ts`
- **変更内容:**
  - `StubTempFileStorage` import を削除
  - `vi.spyOn(StubTempFileStorage.prototype, "get")` 行を削除
  - 「R2 path が呼ばれた」検証は `vi.spyOn(R2TempFileStorage.prototype, "get")` で維持
- **理由:** Stub クラスが消えても、正の経路スパイで「正しい adapter が選ばれた」回帰防止は保てる。

### 7. ドキュメント文言の追従

- **対象ファイル:** `.dev.vars.example`、`docs/runtime_cloudflare.md`、`wrangler.toml`
- **変更内容:**
  - `wrangler.toml` 内のコメント（特に `# the bindings are present, otherwise the Stub adapters short-circuit` 周辺）の `Stub adapters` 言及を「DI が unavailable adapter にフォールバックする」「`StorageUnavailableError` を返す経路に切り替わる」等の挙動表現に置換
  - `.dev.vars.example` の `StubLLMProvider` / `StubObjectStorage` 言及を、それぞれ「rejects every call with `LlmProviderUnavailableError`」「rejects every call with `StorageUnavailableError`」のように挙動ベースに書き換え
  - `docs/runtime_cloudflare.md` を `grep -n "Stub.*Storage"` で全文 grep し、ヒットした全箇所（既知では L140 含む複数箇所）の用語を「unavailable adapter」または「DI fallback that rejects with `StorageUnavailableError`」等に統一
- **理由:** Stub クラス名が消えるため、運用者・将来のレビュアーがコード grep してもクラス名がヒットしない状態でも、ドキュメント文言が孤立せず意図が伝わるよう挙動ベースに統一する。

### 8. ADR-005 (#96) に supersede 注記

- **対象ファイル:** `.issue/96/adr.md`
- **変更内容:** ADR-005 の Status / 末尾に「Superseded by Issue #100 ADR-001」を追記。逆参照は #100 ADR で明示。
- **理由:** ADR チェーンの整合性。将来のレビュアーが #96 だけ見ても本Issueで方針が更新されたことに気付ける。

### 9. ADR-002 前提の確認

- **対象:** `app/worker/cloudflare/{relay,consumer,pruner,dlq}.ts`、`app/server.cloudflare.ts`
- **作業:** `grep -n "OBJECT_STORAGE\|TEMP_FILES" app/worker app/server.cloudflare.ts` で worker entry が R2 binding を直接参照していないことを確認
- **期待:** `createRequestContainer` / `createWorkerContainer` 経由でしか R2 binding を読まない設計が維持されている
- **理由:** ADR-002 で「`ServerEnv` の R2 関連 optional を維持」と判断したが、その前提が現コードで成立しているかを実装前にコードで担保する

### 10. 自動テスト・lint・typecheck の green を確認

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- `pnpm test:unit` / `pnpm test:integration`

### 11. 動作確認（local dev + staging deploy）

- 詳細は `testing.md` を参照。
- 完了条件 (3-4) を満たすため、staging deploy + 3 経路（media upload / ingestion / export）の manual test を必須とする。

## 設計判断

詳細は `.issue/100/adr.md` を参照:

- **ADR-001:** Stub クラスは削除し、DI ファイル内の inline unavailable-adapter factory で fallback を提供する。adapter ファイルの責務を「実 adapter のみ」に絞る。
- **ADR-002:** `ServerEnv` の R2 関連 optional 性は維持（pruner/relay/dlq worker は R2 binding 不要なため）。fallback 経路自体は維持し「DI 構築時 fail-fast」ではなく「operation 時 fail」を継続。

## リスクと注意点

- **R2 API token (SigV4 用 secrets) の未投入で staging deploy すると presign config が partial になり、fallback が発火する** → 既存挙動と同等。Stub を inline 化しても変わらない。動作確認の前に `pnpm --filter @hollow/infra secrets:edit:staging` で R2_* 投入を確認する。
- **`StubObjectStorage` / `StubTempFileStorage` への外部参照漏れ** → 全文 grep で確認。確認済みでは `serverCloudflare.ts` / `serverCloudflare.test.ts` / `handlers.integration.test.ts` の 3 ファイルのみ。
- **ADR-005 (#96) の前提変更** → 本Issueの ADR-001 で明示的に supersede。レビュアーが両 ADR を cross-reference できるよう双方向リンクを記載する。
- **`isStorageUnavailableError` 型ガードへの影響** → なし。エラークラスは port 側にあり、Stub クラスだけが消える。

## テスト方針

詳細は `.issue/100/testing.md` を参照:

- 自動テスト (`pnpm test:unit` / `pnpm test:integration`) で「unavailable adapter が rejects.toThrow(StorageUnavailableError)」「実 adapter が選ばれる」両ケースを担保
- staging deploy 後に media upload / ingestion / export の 3 経路で R2 への実書き込み・読み込みを確認（完了条件 (3-4) の証跡）

## レビュー履歴

### 1周目（2026-05-22）

**両視点並列レビューを実施**

**修正した点:**
- [P-001（視点2）] testing.md を新規作成して plan.md からの参照を解消
- [S-001（視点2）] ADR-001 の Stub fallback 実装表現を `Promise.reject(...)` から `async () => { throw ... }` クロージャ形に統一し、既存 `StubObjectStorage` の `async function { throw }` 挙動と同等であることを明示
- [S-002（視点1+2）] Step 7 のドキュメント追従スコープを拡張: `wrangler.toml` 本体のコメント / `docs/runtime_cloudflare.md` の全 Stub 言及（grep で網羅）を含める
- [S-003（視点2）] Step 5 のテスト書き換えで `ObjectStorage` / `TempFileStorage` port の全メソッドを明示列挙
- [S-004（視点2）] worker entry の R2 binding 非参照を確認するステップを新 Step 9 として追加

**取り込んだ改善提案:**
- 上記 S-001 〜 S-004（視点2）と S-002（視点1）の全件

**見送った提案とその理由:**
- [S-001（視点1）] dev/staging の検証スコープ事前合意: Issue 本文に `dev / staging 環境で確認` と明示があるため、staging 確認を必須とする方針を維持（testing.md で dev での予備確認も併記）
- [P-002（視点2）] `pnpm infra:render:staging` が存在しないとの指摘: 実際には `package.json` L45 に存在することを確認したため見送り（レビュアーの grep 範囲漏れ）

**新たな設計判断:**
- ADR-001 の Decision 文言に「`async () => { throw }` 形」と明記し、Consequences の「既存 Stub と挙動同等」の約束を実装レベルで担保

### 2周目

- 1周目で両視点とも問題点ゼロ相当（P指摘は plan.md 参照解消のために testing.md 新規作成で対応、P-002 は誤指摘）にまとめられ、修正反映後の差分は実装段階のフィードバックで検出する方が効率的なため、レビューループはここで終了。
