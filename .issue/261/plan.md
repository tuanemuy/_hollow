# 実装計画 — Issue #261: instance_settings: skip version bump when payload is identical to current state

**Issue:** #261
**作成日:** 2026-05-28
**複雑度:** 小規模

---

## 目的

`InstanceSettings.updatePrompt` / `updateDesignTokens` を、引数が現在値と内容一致 (deep-equal) なときは同一参照を返す no-op に変える。これにより `resetPrompt` / `resetAllPrompts` と対称な「集約が no-op を表現する」設計に揃え、UI のリトライ・二重押下で OCC version が無駄に進むのを防ぐ。

Issue 本文の **案 A: ドメイン側で内容比較** を採用する。

## スコープ

### 含まれるもの

- `app/core/domain/adminSettings/entity.ts`
  - `InstanceSettings.updatePrompt` を、`settings.prompts[purpose]` が新しい template と内容一致のとき `settings` をそのまま返すように修正
  - `InstanceSettings.updateDesignTokens` を、`settings.designTokens` が引数 tokens と内容一致のとき `settings` をそのまま返すように修正
- `app/core/application/adminSettings/updatePromptTemplate.ts`
  - `resetPromptTemplate.ts` と同様に `next === current` チェックで save をスキップ
- `app/core/application/adminSettings/updateDesignTokens.ts`
  - 同じく `next === current` チェックで save をスキップ
- `app/core/domain/adminSettings/__tests__/entity.test.ts`
  - `updatePrompt` の no-op ケース（同一 purpose に同一内容で再投入 → 同一参照・version 据置）
  - `updatePrompt` の「内容が変われば bump する」ケース（text 違い / expectedVariables 違いそれぞれ）
  - `updateDesignTokens` の no-op ケース（同一 tokens を再投入 → 同一参照・version 据置）
  - `updateDesignTokens` の「キー追加・削除・値変更で bump する」ケース

### 含まれないもの

- `User.update*` 系 / 他集約への横展開（Issue の「影響範囲」セクションに「展開は要検討」と明記されており、本 Issue は instanceSettings のみで完結させる）
- `resetDesignTokens` の no-op 化（Issue で言及されていない。`DesignTokens.empty()` との比較は対称性のために将来検討余地はあるがスコープ外）
- 同パターンの再利用ヘルパー（domain にユーティリティを増やすほどの規模ではない。今回は2箇所のインラインで足りる）
- DB スキーマ・リポジトリ層の変更

---

## 調査結果

### 関連ファイル

- `app/core/domain/adminSettings/entity.ts` — `InstanceSettings.updatePrompt` (180-196) / `updateDesignTokens` (240-249) が常に新しい aggregate を返す。`resetPrompt` (204-220) / `resetAllPrompts` (227-238) は既に no-op パターン採用済み。
- `app/core/domain/adminSettings/valueObject.ts` — `PromptTemplate` は `text: string` + `expectedVariables: readonly string[]`（`create` で `[...new Set(...)]` 重複除去、出現順保持）。`DesignTokens` は `tokens: Readonly<Record<string, string>>`（`create` で `Object.freeze`）。
- `app/core/application/adminSettings/updatePromptTemplate.ts` — 非空ブランチで `InstanceSettings.updatePrompt` を呼ぶ。reset ブランチには既に `next === current return` あり。
- `app/core/application/adminSettings/updateDesignTokens.ts` — 単純に `updateDesignTokens` → `save` を呼ぶだけ。
- `app/core/application/adminSettings/__tests__/adminSettings.integration.test.ts` — 既存テストは「内容が変われば bump する」前提で書かれており、no-op シナリオは存在しない（reset 系のみ no-op テストあり）。

### あるべきアーキテクチャ

- CLAUDE.md「ドメインは純粋関数」「illegal states unrepresentable」原則と一致 — 「内容変化なし version 進行」を集約レベルで不可能にする方が、ユースケース側で都度 early-return するより整合的。
- 既存の `resetPrompt` / `resetAllPrompts` が同じ no-op パターンを採用済みで、`updatePrompt` / `updateDesignTokens` をそれに合わせるのは原則の一貫性確保にあたる。

### 依存関係

- 影響範囲は本 Issue で挙がっている2ファイル + 各ユースケース + テスト。リポジトリ層・プレゼン層・他ユースケースには波及しない。
- 既存テストは「version が +1 される」を確認しているが、その入力は必ず内容変化を伴うため挙動は変わらない。新規 no-op テストは追加分のみ。

---

## 実装ステップ

### 1. `InstanceSettings.updatePrompt` の no-op 化

- **対象ファイル:** `app/core/domain/adminSettings/entity.ts`
- **変更内容:** 既存の non-empty チェック (`template.text.length === 0` で throw) は維持。その下に「current の同 purpose と内容一致なら settings を返す」分岐を追加。
  ```ts
  const existing = settings.prompts[purpose];
  if (existing !== undefined && promptTemplatesEqual(existing, template)) {
    return settings;
  }
  ```
  ファイル内ローカルヘルパーとして `promptTemplatesEqual(a, b)` を実装:
  ```ts
  function promptTemplatesEqual(a: PromptTemplate, b: PromptTemplate): boolean {
    if (a === b) return true;
    if (a.text !== b.text) return false;
    if (a.expectedVariables.length !== b.expectedVariables.length) return false;
    for (let i = 0; i < a.expectedVariables.length; i++) {
      if (a.expectedVariables[i] !== b.expectedVariables[i]) return false;
    }
    return true;
  }
  ```
  `expectedVariables` は `PromptTemplate.create` で重複除去＋順序保持されるため、配列の要素ごと比較で十分（順序ありの厳密一致でよい）。
- **理由:** `resetPrompt` と対称な no-op を集約に持たせるため。Issue 推奨の案 A。

### 2. `InstanceSettings.updateDesignTokens` の no-op 化

- **対象ファイル:** `app/core/domain/adminSettings/entity.ts`
- **変更内容:** 「current.designTokens と引数 tokens が内容一致なら settings を返す」分岐を追加。
  ```ts
  if (designTokensEqual(settings.designTokens, tokens)) {
    return settings;
  }
  ```
  ローカルヘルパー `designTokensEqual(a, b)`:
  ```ts
  function designTokensEqual(a: DesignTokens, b: DesignTokens): boolean {
    if (a === b) return true;
    const aEntries = Object.entries(a.tokens);
    const bKeys = Object.keys(b.tokens);
    if (aEntries.length !== bKeys.length) return false;
    for (const [k, v] of aEntries) {
      if (b.tokens[k] !== v) return false;
    }
    return true;
  }
  ```
- **理由:** 同上。`Record<string, string>` の浅い比較で十分（値が string プリミティブのため）。

### 3. ユースケース側 `next === current` ガード追加

- **対象ファイル:** `app/core/application/adminSettings/updatePromptTemplate.ts`
- **変更内容:** 非空ブランチでも `InstanceSettings.updatePrompt(...)` の戻り値が `current` と同一なら save をスキップ。既存の reset ブランチが既に同じ形 (`if (next === current) return;`) なので、それを統一する。
  ```ts
  } else {
    const template = PromptTemplate.create({ ... });
    next = InstanceSettings.updatePrompt(current, purpose, template, now);
    if (next === current) return;
  }
  await instanceSettingsRepository.save(next, expectedVersion);
  ```
- **対象ファイル:** `app/core/application/adminSettings/updateDesignTokens.ts`
- **変更内容:** 同じく `next === current` ガードを追加して save をスキップ。
- **理由:** ドメイン側で同一参照を返しても、ユースケースが `save` を呼べば DB 側の OCC は進む可能性がある（adapter 実装が「version 不変なら no-op」に対応していても、不要な round-trip は避けたい）。`resetPromptTemplate` / `resetAllPromptTemplates` と同じパターンに統一する。

### 4. domain ユニットテスト追加

- **対象ファイル:** `app/core/domain/adminSettings/__tests__/entity.test.ts`
- **変更内容:** 既存の `"InstanceSettings transitions advance version and updatedAt"` describe 内に以下のテストを追加（同セクション内の reset 系 no-op テストの直後に配置）:
  - `updatePrompt with an identical template is a no-op (same instance)`: 同 purpose に同じ text + expectedVariables を再投入 → `same === overridden`、`version` 据置
  - `updatePrompt bumps version when text differs`: text を変える → 新インスタンス・version +1
  - `updatePrompt bumps version when expectedVariables differ`: text 同一・expectedVariables だけ変える → 新インスタンス・version +1
  - `updateDesignTokens with identical tokens is a no-op (same instance)`: 同じ tokens を再投入 → 同一参照・version 据置
  - `updateDesignTokens bumps version when a token value changes`: 既存キーの値を変える → version +1
  - `updateDesignTokens bumps version when a token key is added/removed`: キー追加 → version +1（削除は別ケース）
- **理由:** no-op 化の挙動を契約として固定する。既存テストは「変化があれば bump」のみで no-op を保証していない。

### 5. application 統合テスト追加（optional だが推奨）

- **対象ファイル:** `app/core/application/adminSettings/__tests__/adminSettings.integration.test.ts`
- **変更内容:** `updatePromptTemplate` / `updateDesignTokens` の describe にそれぞれ「同一内容で2回呼んでも version が +1 で止まる」ケースを追加。1回目で version が +1、2回目（同 payload）で version 据置を確認。
- **理由:** domain ユニットテストで集約の no-op 性を確認済みだが、ユースケース経由でも save スキップが効くことを統合層で確認しておくと、将来「ガードを外しても気付ける」防衛線になる。

### 6. 型チェック / lint / フォーマット / テスト

- `pnpm typecheck`
- `pnpm lint:fix`
- `pnpm format`
- `pnpm test:unit` および `pnpm test:integration`（integration は CLAUDE.md に従う）

---

## 設計判断

詳細は `.issue/261/adr.md` を参照。

- **案 A（ドメイン側で内容比較）採用**: 既存の `resetPrompt` / `resetAllPrompts` と対称、illegal states unrepresentable 原則と整合。
- **ヘルパーはファイル内ローカル関数**: 2 VO 専用の比較で、汎用 deep-equal を導入する必要はない。
- **ユースケース側にも `next === current` ガードを残す**: domain で同一参照が返ってきた時点で repository への save 呼び出しを抑止する。reset 系の既存パターンと統一。

## リスクと注意点

- **`PromptTemplate.expectedVariables` の比較は順序ありで OK**: `PromptTemplate.create` が `[...new Set(input)]` で重複除去するため、同じ意味の入力からは常に同じ順の配列が生成される。順序不定の Set 比較は不要。
- **`DesignTokens.tokens` は `Object.freeze` 済みで `Record<string, string>` 平坦**: 浅い比較で深い比較と等価。
- **既存テストへの影響**: 既存の「bumps version」アサーションは入力が必ず内容変化を伴うため、no-op 化後も挙動は変わらない（手元で確認済み）。
- **OCC との関係**: ユースケースで save をスキップしても `expectedVersion` は次回 read で取り直されるため、別タブとの衝突は本変更で増えない（むしろ「内容変化なし bump」が消える分減る）。

## テスト方針

- domain ユニットテスト: 上記ステップ4の6ケース
- application 統合テスト: 同一 payload 連投で version 据置（ステップ5）
- 既存テストはすべてパスすること
