# 残存課題 — Issue #540: 領域1（P10/P11/P12/P20）モック実装追従

**Issue:** #540
**作成日:** 2026-06-07

本 Issue のスコープ内で実装しきれず、別 Issue へ引き渡す項目を記録する。スコープ判断の根拠は `.issue/540/adr.md` 参照。

## 別 Issue へ引き渡す項目

### 1. バックリンクカードのディレクトリパス・メタ行（C-2）

- **内容:** P11 モックの `.backlink-card` は title + snippet に加えて `backlink-meta`（ディレクトリパス、uppercase）の 3 段構成。現状実装は title + snippet の 2 段。
- **理由:** `BacklinkDTO`（`app/core/application/dto/note.ts`）は `noteId` / `title` / `slug` / `snippet` の 4 フィールドのみで、ディレクトリパス情報を保持していない。表示元データが無いため CSS だけでは追従できない。
- **影響範囲:** loader / DTO / バックリンク取得クエリの拡張（ドメイン〜アダプタ〜アプリケーション層）。バックエンド変更を伴いスコープ肥大のため本 Issue では見送り。
- **フォローアップ:** `BacklinkDTO` にディレクトリパス（または `directorySegments`）を追加する別 Issue で対応。

### 2. ノート本文の内部リンク（wikilink）/ hashtag ピル表示（C-3）

- **内容:** index.md §6 / P11 モックは `[[wikilink]]` を「surface ピル + アクセント色ドット」、`#hashtag` を「accent 素テキスト」で表示する設計。
- **理由:** 現状 `[[wikilink]]` / `#hashtag` は本文 HTML 内のプレーンテキストで保持され、レンダリング時に `<a class="wikilink">` / `<span class="hashtag">` へマークアップ化されていない（裏取り済み: `markdownConverter.ts` は verbatim 保持、`markdownRenderer.ts` も textual 素通し、`NoteService.extractMetadataFromHtml` は抽出のみ）。CSS だけ追加しても適用先要素が存在せず死にコードになる。
- **影響範囲:** 本文レンダリングパイプライン（ドメイン/アダプタ層）でのマークアップ化が前提。#287（inline メディア）/ #77-80（WYSIWYG 拡張）と隣接。
- **フォローアップ:** 本文レンダリング時の内部リンク/hashtag マークアップ化を行う別 Issue で、ピル CSS（`.note-detail-content` 配下）とセットで対応。

## 意図的にモックと差分を残した項目（別 Issue ではなく設計判断）

以下は別 Issue 化ではなく、確立済み設計判断によりモックと意図的に差分を残したもの（詳細は adr.md）:

- **サイドバー「最近更新」「お気に入り」**（ADR-001）: backend 非対応の新機能のため追従せず。必要なら機能込みの別 Issue。
- **P11 メタの「公開状態」行**（ADR-002）: index.md §2.1 非列挙 + #459 でトップツールバーに集約済みのため、メタへの追加（二重化）はしない。
- **サイドバー「管理」セクションの「アップロード」「エクスポートジョブ」導線**（ADR-005）: 機能上必要な実在ルート導線のため、モック簡略表記に合わせて削らず現状維持。
- **P20 broken バナーの `.alert` 案D 化**（ADR-004 / E-3）: index.md §9「`.alert` 基盤刷新は別 Issue」に従い見送り。横断テーマの別 Issue で対応。
