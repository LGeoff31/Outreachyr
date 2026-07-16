class MailboxConnectionError(RuntimeError):
    def __init__(
        self,
        code: str,
        retryable: bool = False,
        message: str | None = None,
    ):
        super().__init__(message or code)
        self.code = code
        self.retryable = retryable
        self.message = message or code.replace("_", " ").capitalize()
        self.return_to: str | None = None

    def public_error(self) -> dict[str, object]:
        return {
            "code": self.code,
            "message": self.message,
            "retryable": self.retryable,
        }


class MailboxReauthRequired(MailboxConnectionError):
    def __init__(self):
        super().__init__("mailbox_reauth_required")


class MailboxPermissionDenied(MailboxConnectionError):
    def __init__(self):
        super().__init__("mailbox_permission_denied")


class MailboxRateLimited(MailboxConnectionError):
    def __init__(self, retry_after_seconds: int = 60):
        super().__init__("mailbox_rate_limited", True)
        self.retry_after_seconds = retry_after_seconds


class MailboxTemporaryFailure(MailboxConnectionError):
    def __init__(self):
        super().__init__("mailbox_temporary_failure", True)


class MailboxDeliveryUnknown(MailboxConnectionError):
    def __init__(self):
        super().__init__("mailbox_delivery_unknown")


class MailConnectionRequired(MailboxConnectionError):
    def __init__(self):
        super().__init__("mail_connection_required")


class MailConnectionNotFound(MailboxConnectionError):
    def __init__(self):
        super().__init__("mail_connection_not_found")


class MailConnectionSendNotSupported(MailboxConnectionError):
    def __init__(self):
        super().__init__("mail_connection_send_not_supported")


class MailProviderNotFound(MailboxConnectionError):
    def __init__(self):
        super().__init__("mail_provider_not_found")


class MailProviderAuthorizationNotSupported(MailboxConnectionError):
    def __init__(self):
        super().__init__("mail_provider_authorization_not_supported")


class MailCredentialVersionConflict(MailboxConnectionError):
    def __init__(self):
        super().__init__("mail_credential_version_conflict", True)


class MailOAuthStateInvalid(MailboxConnectionError):
    def __init__(self):
        super().__init__("mail_oauth_state_invalid")


class MailConnectionAccountMismatch(MailboxConnectionError):
    def __init__(self):
        super().__init__(
            "mail_connection_account_mismatch",
            message="The authorized mailbox does not match the account being reconnected.",
        )


class MailConnectionProviderMismatch(MailboxConnectionError):
    def __init__(self):
        super().__init__("mail_connection_provider_mismatch")


class MailInvalidReturnTo(MailboxConnectionError):
    def __init__(self):
        super().__init__("mail_invalid_return_to")


class MailboxAuthorizationFailed(MailboxConnectionError):
    def __init__(self):
        super().__init__("mailbox_authorization_failed")
