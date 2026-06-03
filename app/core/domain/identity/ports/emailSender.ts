import type { EmailAddress } from "../valueObject";

/**
 * Transactional email plumbing for authentication flows. The domain
 * names the four templates it knows about; the adapter owns provider
 * details (SES / SendGrid / SMTP) and template rendering.
 *
 * Failure is signalled by a plain rejected `Error` — the port declares
 * no dedicated error type. The domain itself never invokes this port;
 * usecases call it *after* the UoW commits and swallow any rejection
 * (logging it) so that mail delivery failures do not roll back
 * persistent state. See Issue #197 ADR-002.
 */
export interface EmailSender {
  sendVerification(to: EmailAddress, link: URL, locale: string): Promise<void>;

  sendPasswordReset(to: EmailAddress, link: URL, locale: string): Promise<void>;

  /**
   * Sent to the **new** address as the confirmation link to complete
   * an email-change request.
   */
  sendEmailChangeNotice(
    to: EmailAddress,
    link: URL,
    locale: string,
  ): Promise<void>;

  /**
   * Sent to the **old** address as a notification that a change was
   * requested. Acts as a hijack-detection signal for the user; carries
   * no link.
   */
  sendEmailChangeWarning(
    oldEmail: EmailAddress,
    newEmail: EmailAddress,
    locale: string,
  ): Promise<void>;
}
