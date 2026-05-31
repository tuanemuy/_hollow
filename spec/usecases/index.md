# ユースケース インデックス

ドメイン別のユースケース定義は本ディレクトリ配下の各ファイルを参照。

## ドメイン別

- [Identity](./identity.md)
- [Directory](./directory.md)
- [Note](./note.md)
- [Tag](./tag.md)
- [Publication](./publication.md)
- [Ingestion](./ingestion.md)
- [Media](./media.md)
- [Export](./export.md)
- [Search](./search.md)
- [View](./view.md)
- [AdminSettings](./adminSettings.md)

## 共通 DTO 型

すべての usecase は以下の共通 DTO を input/output に利用する。型は `app/core/application/dto/` に集約する。

```ts
// 識別子は値オブジェクトのラッパー型
type UserId = string & { readonly __brand: 'UserId' };
type NoteId = string & { readonly __brand: 'NoteId' };
type DirectoryId = string & { readonly __brand: 'DirectoryId' };
type TagId = string & { readonly __brand: 'TagId' };
type MediaAssetId = string & { readonly __brand: 'MediaAssetId' };
type ShareLinkId = string & { readonly __brand: 'ShareLinkId' };

// SessionToken は brand しない不透明文字列 (アダプタ実装次第で平文 / JWT 等を許容するため)。
// 実体は `string` と等価で型レベルの強制力は持たないが、DTO や usecase 戻り値で「これは
// セッショントークンを指す string」という意図を読解しやすくするための marker として残す。
// 将来 brand する場合は SessionService の実装側でも brand 生成を行う必要があり、現状は
// 「アダプタ実装が外部システムから返す文字列をそのまま透過させる」運用優先で非 brand。
type SessionToken = string;
type ExportJobId = string & { readonly __brand: 'ExportJobId' };
type IngestionJobId = string & { readonly __brand: 'IngestionJobId' };
type SavedViewId = string & { readonly __brand: 'SavedViewId' };

type Instant = string;          // ISO 8601 UTC
type Visibility = 'private' | 'unlisted' | 'public';

type InternalLinkRefDTO =
  | { kind: 'id'; target: NoteId; displayText: string | null }
  | { kind: 'title'; target: string; displayText: string | null };

type FrontMatterDTO = Record<string, unknown>;

type DateRange = { from: Instant | null; to: Instant | null };

type NoteDTO = {
  id: NoteId;
  ownerId: UserId;
  directoryId: DirectoryId;
  slug: string;
  title: string;
  contentHtml: string;
  frontMatter: FrontMatterDTO;
  tagIds: TagId[];
  internalLinkRefs: InternalLinkRefDTO[];
  mediaRefs: MediaAssetId[];
  status: 'active' | 'trashed';
  trashedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
  editLock: { userId: UserId; expiresAt: Instant } | null;
};

type NoteListItemDTO = {
  id: NoteId;
  ownerId: UserId;
  directoryId: DirectoryId;
  slug: string;
  title: string;
  excerpt: string;        // 本文先頭から生成
  tagIds: TagId[];
  tagNames: string[];
  updatedAt: Instant;
  visibility: Visibility;
};

type BacklinkDTO = {
  noteId: NoteId;
  title: string;
  slug: string;
};

type DirectoryDTO = {
  id: DirectoryId;
  ownerId: UserId;
  parentId: DirectoryId | null;
  name: string;
  slug: string;
  depth: number;
  createdAt: Instant;
  updatedAt: Instant;
};

type DirectoryTreeNode = DirectoryDTO & { children: DirectoryTreeNode[] };

type TagDTO = {
  id: TagId;
  ownerId: UserId;
  name: string;
  noteCount: number;
};

type MediaAssetDTO = {
  id: MediaAssetId;
  ownerId: UserId;
  kind: 'image' | 'video' | 'avatar';
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  downloadUrl: string;
  createdAt: Instant;
};

type PublicationStateDTO = {
  noteId: NoteId;
  visibility: Visibility;
  publishedAt: Instant | null;
};

type ShareLinkDTO = {
  id: ShareLinkId;
  noteId: NoteId;
  hasPassword: boolean;
  status: 'active' | 'revoked';
  createdAt: Instant;
  revokedAt: Instant | null;
  lastAccessedAt: Instant | null;
  url: string;
};

type ViewQueryDTO = {
  directoryId: DirectoryId | null;
  tagIds: TagId[];
  dateRange: DateRange | null;
  keyword: string | null;
  referencingNoteId: NoteId | null;
};

type ViewQuerySnapshotDTO = ViewQueryDTO;

type ExportOptionsDTO = {
  includeFrontMatter: boolean;
  embedMedia: boolean;
  pdfPaperSize: 'A4' | 'Letter' | null;
};

type ExportJobDTO = {
  id: ExportJobId;
  ownerId: UserId;
  format: 'html' | 'markdown' | 'pdf';
  scope: 'single' | 'multiple' | 'view';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired';
  progress: { processed: number; total: number };
  failedNoteIds: NoteId[];
  errorReason: string | null;
  artifactSize: number | null;
  createdAt: Instant;
  completedAt: Instant | null;
  expiresAt: Instant | null;
};

type IngestionJobDTO = {
  id: IngestionJobId;
  ownerId: UserId;
  originalFileName: string;
  mimeType: string;
  byteSize: number;
  kind: string;
  status: 'pending' | 'processing' | 'previewing' | 'saved' | 'failed' | 'discarded';
  preview: IngestionPreviewDTO | null;
  errorCode: string | null;
  errorReason: string | null;
  regenerationCount: number;
  savedAsNoteId: NoteId | null;
  createdAt: Instant;
  updatedAt: Instant;
};

type IngestionPreviewDTO = {
  title: string;
  contentHtml: string;
  suggestedDirectoryId: DirectoryId | null;
  suggestedDirectoryName: string | null;
  frontMatter: FrontMatterDTO;
  suggestedTagNames: string[];
  internalLinkRefs: InternalLinkRefDTO[];
  mediaRefs: MediaAssetId[];
};

type SearchHitDTO = {
  noteId: NoteId;
  ownerId: UserId;
  username: string;
  title: string;
  snippet: string;
  tagNames: string[];
  score: number;
};

type SavedViewDTO = {
  id: SavedViewId;
  ownerId: UserId;
  name: string;
  kind: 'personal' | 'public';
  query: ViewQueryDTO;
  displayMode: 'list' | 'tile' | 'calendar';
  calendarDateKey: 'updated' | 'created' | 'frontMatterDate';
  sort: { by: 'updatedAt' | 'createdAt' | 'title'; direction: 'asc' | 'desc' };
  isDefault: boolean;
  brokenConditions: Array<{ kind: 'tag' | 'directory' | 'note'; id: string; lastSeenAt: Instant }>;
};

type AlertDTO = { code: string; message: string; severity: 'info' | 'warning' | 'critical' };

type UserDTO = {
  id: UserId;
  username: string;
  email: string;
  displayName: string;       // 必須。SignUp で未指定なら username で初期化される（ドメイン側で 1..50 検証）
  bio: string | null;
  avatarMediaId: MediaAssetId | null;
  role: 'member' | 'admin';
  status: 'pending' | 'active' | 'suspended' | 'deleted';
  createdAt: Instant;
};

type InstanceSettingsDTO = {
  llm: { provider: 'anthropic'; model: string; apiKeySource: 'env' | 'db'; apiKeyMasked: string | null };
  prompts: Record<string, { text: string; expectedVariables: string[] }>;
  designTokens: Record<string, string>;
  registration: { open: boolean; closedReason: string | null };
  limits: {
    maxUploadBytesPerDay: number;
    maxIngestionBytes: number;
    maxNoteBytes: number;
    maxExportArtifactBytes: number;
    maxShareLinksPerNote: number;
    editLockTtlSec: number;
    trashRetentionDays: number;
  };
};
```

## 共通エラー型

`app/lib/errors.ts` に集約。`CodedError` を継承し、`toSerialized()` で `kind`-tagged 構造化エラーを返す。

```ts
class AuthenticationError extends CodedError { kind = 'auth' as const; code: 'invalid_credentials' | 'unverified' | 'account_unavailable' }
class AuthorizationError extends CodedError { kind = 'forbidden' as const; }
class ValidationError extends CodedError { kind = 'validation' as const; details: Array<{ path: string[]; message: string }>; }
class BusinessRuleError extends CodedError { kind = 'business_rule' as const; code: string }
class ResourceNotFoundError extends CodedError { kind = 'not_found' as const; resource: string }
class RateLimitError extends CodedError { kind = 'rate_limited' as const; retryAfterSec: number }
class RepositoryConflictError extends CodedError { kind = 'conflict' as const; }
class ExternalServiceError extends CodedError { kind = 'external_unavailable' as const; service: string }
```

ドメイン層が発火するのは `BusinessRuleError` `ValidationError` `RepositoryConflictError` 系のみ。`AuthorizationError` / `AuthenticationError` は presentation/application 境界で扱う。
