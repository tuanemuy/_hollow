# 調査・設計検討 — Issue #210

**対象:** lazy upgrade（legacy PBKDF2 → scrypt）の直列実行・DoS・遅延化設計
**前提:** ADR 012 により `hash-wasm` は廃止済み。現行のハッシュは scrypt (`@noble/hashes`)。本書は Issue #210 のゴール③④⑤を scrypt 前提で再評価する。

## 0. 現状コードの要点

調査対象の中核は `app/core/adapters/d1/repositories/credentialStore.ts` と `app/core/application/identity/logIn.ts`。

### verify 経路（`D1CredentialStore.verifyPassword`）

```
verifyHash(raw, stored)        // scrypt or legacy PBKDF2 を判定して verify
  └─ 成功時 → maybeRehashLegacy(userId, raw, stored)
       └─ stored が scrypt なら即 return（rehash なし）
       └─ stored が legacy なら hashScrypt(raw) して pending.add(update)
```

- legacy verify は `crypto.subtle.deriveBits(PBKDF2)`（iter は行に記録された値、移行前ユーザは 100,000 / 600,000）。
- rehash の `hashScrypt` は `N=2^16, r=8, p=1, dkLen=64`（ADR 012）。`scryptAsync` で 10ms ごとに event loop を yield。
- **rehash は legacy 行に対してのみ発火する**。scrypt 行は `isScryptEncoded` 早期 return でスキップ。つまり rehash は「移行前アカウントの初回ログイン 1 回限り」のイベントであり、定常状態のコストではない。

### logIn の制御フロー（`logIn.ts`）

```
UoW#1: verifyPassword(email, pw)   ← ここで verify + (legacy なら) rehash が直列で完走しコミット
  ↓ userId === null → invalid_credentials
UoW#2: userRepository.findById → status
  ↓ status === 'pending'   → unverified
  ↓ status === 'suspended' / 'deleted' → account_unavailable
sessionService.issue
```

重要：**rehash は status チェックより前の UoW#1 で完走・コミットされる**。pending / suspended ユーザが正しいパスワードでログインを試みると、最終的に拒否されるにもかかわらず scrypt rehash が走る。

## 1. ③ 直列実行（verify → hash）の並列化可否

### Issue 当初の発想

「`hashArgon2id` の await を user lookup と並列化（`Promise.all`）できないか」。

### scrypt 前提での再評価：並列化は有効な打ち手にならない

1. **verify と hash は論理的に直列依存**。rehash はパスワードが正しいときだけ行う（誤ったパスワードを rehash しても意味がなく、むしろ無駄な計算）。よって `verify → hash` の順序は崩せない。`Promise.all([verify, hash])` は「verify 失敗時にも hash を走らせる」ことになり、DoS を悪化させる。
2. **唯一の並列候補（user/status lookup）は、現状すでに rehash の後**。logIn は UoW#1（verify+rehash）完了後に UoW#2（status lookup）を走らせる。lookup を rehash と並列化したいなら UoW をまたいで投機実行する必要があり、UoW の「1 コールバック＝1 トランザクション境界」契約に反する。
3. そもそも③の動機（直列 CPU 消費 50–150ms × 2）の主因は Argon2id の重さだった。scrypt rehash は legacy 行の初回ログイン 1 回限りで、以降は scrypt 行になり rehash は発火しない。**定常負荷ではない**。

**結論（③）:** 並列化は不要かつ有害。直列コストの本質的な削減は「不要な rehash を発火させない」こと、すなわち⑤に帰着する。

## 2. ④ rate limit が `unverified` 拒否前に効く前提

### 調査結果：認証系の rate limit は存在しない

`app/` 全体を `rateLimit` / `throttle` / `lockout` / `attempt` で探索したが、ヒットは LLM プロバイダ（gemini/anthropic/openai）と検索インデックスのジョブ制御のみ。**ログイン／認証経路には rate limit も lockout も実装されていない**。`logIn.ts`・`login.tsx`・`authGuard.ts` のいずれにもレート制御はない。

→ Issue ④の前提「application 層の rate limit が `unverified` 拒否前に効く」は**誤り**。そのような rate limit は存在しない。

### DoS 増幅の現実的な深刻度：低

lazy upgrade rehash は **verify 成功（＝正しいパスワード）が前提**。攻撃シナリオを分解すると：

- **他人の pending アカウントへスパムログイン**：パスワードを知らないので verify が失敗し、rehash は発火しない。増幅なし。
- **自分の pending アカウントへ正しいパスワードで連打**：rehash は走るが、(a) legacy 行に限り、(b) 初回成功でその行が scrypt 化され以降発火しない。1 アカウントあたり実質 1 回。
- **パスワード既知の攻撃者**：rehash を誘発できるが、これも legacy 行 1 回限り。

つまり「未認証アカウントへのスパムで Argon2id 計算を無限増幅」という当初の懸念は、(1) verify 成功が前提、(2) legacy 行の 1 回限り、という二重の制約で大きく減衰する。**現実的な DoS 深刻度は低い**。

ただし rate limit 不在そのものは、lazy upgrade に限らずログイン経路全般（scrypt verify は毎回フルに走る）の総当たり耐性・コスト面で別途の論点。これは Issue #210 のスコープを超えるため、フォローアップ Issue 候補とする（4 章）。

## 3. ⑤ lazy upgrade を「verify 成功 + status OK 確定後」に遅延させる設計

### 動機

pending / suspended ユーザの正しいパスワードでのログイン試行で、最終的に拒否されるのに rehash（scrypt 1 回）が走る無駄を排除する。④の DoS 増幅も原理的に閉じる（status OK のユーザしか rehash しない）。

### 現状の障害

rehash はアダプタ内 `verifyPassword` に密結合しており、verify と同じ UoW で `pending.add` される。logIn の status チェックは別 UoW で後から走るため、現構造では「status OK 確定後に rehash」を表現できない。

### 設計案

すでに先例がある：**Issue #208 で `changePassword` 用に rehash しない verify 変種 `verifyCurrentForChange` が導入済み**。同じ分離パターンを logIn に適用できる。

**案 A（推奨）: verify を rehash-free にし、rehash を独立メソッドへ**

1. `verifyPassword` から `maybeRehashLegacy` を外し、戻り値を `{ userId, needsRehash } | null` に拡張（または別メソッド `verifyPasswordWithUpgradeHint`）。
2. `logIn` で status が active と確定した後、`needsRehash` なら `credentialStore.rehashLegacy(userId, rawPassword)` を UoW#3 で実行。
3. legacy 行かつ status OK のときだけ scrypt 1 回。pending/suspended/deleted では rehash しない。

トレードオフ：アダプタ契約が広がる（戻り値 or メソッド追加）。生パスワードを rehash まで保持する必要があるが、logIn のスコープ内で完結するため漏えい面は増えない。

**案 B: 現状維持（rehash を verify に残す）**

③④の再評価どおり、現実の無駄は「legacy 行 × pending/suspended ユーザ × 正しいパスワード」という稀なケースの 1 回限り。実装コスト（契約変更）に対して見合わない可能性がある。

### 推奨

**設計としては案 A が正しい**（無駄を構造的に排除し、DoS 増幅も閉じ、Issue #208 と一貫）。ただし実際の発火頻度が低いため、優先度は中。実装は別 PR（4 章のフォローアップ Issue）に委ねる。

## 4. フォローアップ（実装委譲先）

本 Issue は調査のみ。以下を実装 Issue 候補として記録する。

- **F-1（推奨・中）— Issue #456:** lazy upgrade を status OK 確定後に遅延（⑤案 A）。`verifyPassword` を rehash-free 化し、logIn で active 確定後に rehash。Issue #208 の `verifyCurrentForChange` 分離パターンを踏襲。
- **F-2（任意・低〜中）— Issue #457:** 認証経路の rate limit / lockout 検討。lazy upgrade 増幅とは独立に、scrypt verify が毎ログインでフルに走る点・総当たり耐性の観点。スコープが大きいので単独 Issue。

③の `Promise.all` 並列化は採用しない（直列依存・有害のため）。①②は前提消滅のため起票しない。

## 5. 結論サマリ

- ①② hash-wasm 関連：ADR 012 で前提消滅。対応不要。
- ③ 並列化：直列依存かつ DoS を悪化させるため不採用。本質は⑤に帰着。
- ④ rate limit：**認証 rate limit は存在しない**（前提が誤り）。ただし rehash の DoS 増幅は verify 成功前提＋legacy 1 回限りで深刻度・低。testing.md に明記。
- ⑤ 遅延設計：案 A（rehash-free verify + active 確定後 rehash）が正しい。優先度・中、実装は別 PR（F-1）。
