/**
 * Identity-specific projection helpers. The canonical `UserDTO` mapper
 * lives in `app/core/application/dto/identity.ts`; this module re-exports
 * it under the `view`-module convention used by every other domain
 * (`todo/view.ts` etc.) so callers can `import { toUserDTO } from "./view"`
 * consistently.
 */
export {
  type SessionDTO,
  toSessionDTO,
  toUserDTO,
  type UserDTO,
} from "../dto/identity";
