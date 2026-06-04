/**
 * Common DTO module aggregating the projection types and `to{Entity}DTO`
 * helpers consumed by every usecase. See `spec/usecases/index.md` for the
 * canonical definitions; the types here implement that contract.
 *
 * Id convention:
 *   DTO ids are plain `string` — the DTO layer carries no brand. Domain
 *   ids use a `unique symbol` brand, and value validation happens inbound
 *   of the usecase boundary via `XId.create()`. Because a domain brand is
 *   structurally a subtype of `string`, `to{Entity}DTO` projections assign
 *   `entity.id` straight into the `string` DTO field with no cast. The
 *   trade-off is intentional: the DTO layer gives up id-mix-up prevention
 *   (a `NoteId` and a `UserId` are both just `string` here) in exchange for
 *   removing the three-stage brand-plumbing that had zero runtime effect.
 */

export * from "./adminSettings";
export * from "./common";
export * from "./directory";
export * from "./export";
export * from "./identity";
export * from "./ingestion";
export * from "./media";
export * from "./note";
export * from "./publication";
export * from "./search";
export * from "./tag";
export * from "./view";
