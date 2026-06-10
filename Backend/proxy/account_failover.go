package proxy

import (
	"kiro-go/config"
	"kiro-go/logger"
	"strings"
	"time"
)

func isQuotaErrorMessage(msg string) bool {
	msg = strings.ToLower(msg)
	return strings.Contains(msg, "429") ||
		strings.Contains(msg, "quota") ||
		strings.Contains(msg, "exhaust") ||
		strings.Contains(msg, "usage limit") ||
		strings.Contains(msg, "subscription limit") ||
		strings.Contains(msg, "limit_exceeded")
}

func isOverageErrorMessage(msg string) bool {
	msg = strings.ToLower(msg)
	return strings.Contains(msg, "402") && strings.Contains(msg, "overage")
}

func isSuspensionErrorMessage(msg string) bool {
	msg = strings.ToLower(msg)
	return strings.Contains(msg, "temporarily_suspended") ||
		strings.Contains(msg, "temporarily is suspended") ||
		strings.Contains(msg, "temporarily suspended") ||
		strings.Contains(msg, "account suspended")
}

func isProfileUnavailableErrorMessage(msg string) bool {
	return strings.Contains(strings.ToLower(msg), "no available kiro profile")
}

func isAuthErrorMessage(msg string) bool {
	msg = strings.ToLower(msg)
	return strings.Contains(msg, "http 401") ||
		strings.Contains(msg, "http 403") ||
		strings.Contains(msg, "status 401") ||
		strings.Contains(msg, "status 403") ||
		strings.Contains(msg, "unauthorized") ||
		strings.Contains(msg, "forbidden") ||
		strings.Contains(msg, "authentication failed") ||
		strings.Contains(msg, "bad credentials") ||
		strings.Contains(msg, "token invalid") ||
		strings.Contains(msg, "invalid_token") ||
		strings.Contains(msg, "invalid token") ||
		strings.Contains(msg, "token expired") ||
		strings.Contains(msg, "access token expired") ||
		strings.Contains(msg, "refresh token expired") ||
		strings.Contains(msg, "invalid_grant") ||
		strings.Contains(msg, "invalid grant")
}

func isAuthBanReason(reason string) bool {
	reason = strings.ToLower(strings.TrimSpace(reason))
	return strings.Contains(reason, "authentication failed") ||
		strings.Contains(reason, "token invalid") ||
		strings.Contains(reason, "token expired") ||
		strings.Contains(reason, "invalid or expired")
}

func (h *Handler) disableAccount(account *config.Account, banStatus, banReason string) {
	if account == nil {
		return
	}
	updatedAccount := *account
	if !updatedAccount.Enabled && updatedAccount.BanStatus == banStatus && updatedAccount.BanReason == banReason {
		return
	}
	updatedAccount.Enabled = false
	updatedAccount.BanStatus = banStatus
	updatedAccount.BanReason = banReason
	updatedAccount.BanTime = time.Now().Unix()
	if err := config.UpdateAccount(account.ID, updatedAccount); err != nil {
		logger.Warnf("[AccountFailover] Failed to disable %s: %v", account.Email, err)
		return
	}
	logger.Warnf("[AccountFailover] Disabled %s: %s", account.Email, banReason)
	h.pool.Reload()
}

func (h *Handler) clearAccountAuthBanOnSuccess(account *config.Account) {
	if account == nil {
		return
	}
	if account.BanStatus == "" || account.BanStatus == "ACTIVE" {
		return
	}
	if !isAuthBanReason(account.BanReason) {
		return
	}
	updatedAccount := *account
	updatedAccount.Enabled = true
	updatedAccount.BanStatus = "ACTIVE"
	updatedAccount.BanReason = ""
	updatedAccount.BanTime = 0
	if err := config.UpdateAccount(account.ID, updatedAccount); err != nil {
		logger.Warnf("[AccountFailover] Failed to clear auth ban for %s after success: %v", account.Email, err)
		return
	}
	account.Enabled = true
	account.BanStatus = "ACTIVE"
	account.BanReason = ""
	account.BanTime = 0
	logger.Infof("[AccountFailover] Cleared stale auth ban for %s after successful chat validation", account.Email)
	h.pool.Reload()
}

func (h *Handler) disableAccountOverage(account *config.Account) {
	if account == nil {
		return
	}
	snap, fetchErr := FetchOverageStatus(account)
	if fetchErr != nil {
		logger.Warnf("[AccountFailover] Failed to refresh overage status for %s: %v", account.Email, fetchErr)
		return
	}
	if persistErr := PersistOverageSnapshot(account.ID, snap); persistErr != nil {
		logger.Warnf("[AccountFailover] Failed to persist overage snapshot for %s: %v", account.Email, persistErr)
		return
	}
	logger.Warnf("[AccountFailover] Refreshed overage status for %s after upstream overage error: %s", account.Email, snap.Status)
	h.pool.Reload()
}

func (h *Handler) handleAccountFailure(account *config.Account, err error) {
	if account == nil || err == nil {
		return
	}
	msg := err.Error()
	switch {
	case isOverageErrorMessage(msg):
		h.disableAccountOverage(account)
		h.pool.RecordError(account.ID, false)
	case isQuotaErrorMessage(msg):
		if isKiroRateLimitError(err) {
			h.pool.RecordRateLimit(account.ID, kiroAccountCooldown(err))
		} else {
			h.pool.RecordError(account.ID, true)
		}
	case isSuspensionErrorMessage(msg):
		h.disableAccount(account, "BANNED", "AWS temporarily suspended - unusual user activity detected")
	case isProfileUnavailableErrorMessage(msg):
		h.disableAccount(account, "SUSPENDED", "No available Kiro profile")
	case isAuthErrorMessage(msg):
		h.disableAccount(account, "BANNED", "Authentication failed - token invalid or expired")
	default:
		h.pool.RecordError(account.ID, false)
	}
}
