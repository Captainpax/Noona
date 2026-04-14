/**
 * Coordinates Raven settings behavior.
 * Related files:
 * - src/main/java/com/paxkun/raven/service/LoggerService.java
 * - src/main/java/com/paxkun/raven/service/VaultService.java
 * - src/main/java/com/paxkun/raven/service/DownloadService.java
 * - src/main/java/com/paxkun/raven/service/VPNServices.java
 * Times this file has been edited: 10
 */
package com.paxkun.raven.service.settings;

import com.paxkun.raven.service.LoggerService;
import com.paxkun.raven.service.VaultService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * Reads and caches settings stored in Vault.
 */
@Service
@RequiredArgsConstructor
public class SettingsService {

    private static final String SETTINGS_COLLECTION = "noona_settings";
    private static final String NAMING_KEY = "downloads.naming";
    private static final String LIMITS_KEY = "downloads.limits";
    private static final String LEGACY_WORKERS_KEY = "downloads.workers";
    private static final String VPN_KEY = "downloads.vpn";
    private static final long CACHE_TTL_MS = 5000L;
    private static final long WARNING_COOLDOWN_MS = 30000L;
    private final VaultService vaultService;
    private final LoggerService logger;
    private volatile DownloadNamingSettings cachedNaming;
    private volatile DownloadLimitsSettings cachedLimitsSettings;
    private volatile DownloadVpnSettings cachedVpnSettings;
    private volatile long cachedAtMs;
    private volatile long cachedLimitsSettingsAtMs;
    private volatile long cachedVpnSettingsAtMs;
    private volatile long lastNamingWarningAtMs;
    private volatile long lastLimitsWarningAtMs;
    private volatile long lastVpnWarningAtMs;

    /**
     * Returns download naming settings.
     *
     * @return The resulting DownloadNamingSettings.
     */

    public synchronized DownloadNamingSettings getDownloadNamingSettings() {
        long now = System.currentTimeMillis();
        DownloadNamingSettings current = cachedNaming;
        if (current != null && now - cachedAtMs < CACHE_TTL_MS) {
            return current;
        }

        DownloadNamingSettings loaded = loadNamingSettings();
        cachedNaming = loaded;
        cachedAtMs = now;
        return loaded;
    }

    /**
     * Returns download limits settings.
     *
     * @return The resulting DownloadLimitsSettings.
     */

    public synchronized DownloadLimitsSettings getDownloadLimitsSettings() {
        long now = System.currentTimeMillis();
        DownloadLimitsSettings current = cachedLimitsSettings;
        if (current != null && now - cachedLimitsSettingsAtMs < CACHE_TTL_MS) {
            return current;
        }

        DownloadLimitsSettings loaded = loadLimitsSettings();
        cachedLimitsSettings = loaded;
        cachedLimitsSettingsAtMs = now;
        return loaded;
    }

    /**
     * Returns download vpn settings.
     *
     * @return The resulting DownloadVpnSettings.
     */

    public synchronized DownloadVpnSettings getDownloadVpnSettings() {
        long now = System.currentTimeMillis();
        DownloadVpnSettings current = cachedVpnSettings;
        if (current != null && now - cachedVpnSettingsAtMs < CACHE_TTL_MS) {
            return current;
        }

        DownloadVpnSettings loaded = loadVpnSettings();
        cachedVpnSettings = loaded;
        cachedVpnSettingsAtMs = now;
        return loaded;
    }

    /**
     * Returns a fresh Raven download VPN settings snapshot and refreshes the cache immediately.
     *
     * @return The resulting DownloadVpnSettings.
     */
    public synchronized DownloadVpnSettings getDownloadVpnSettingsFresh() {
        long now = System.currentTimeMillis();
        DownloadVpnSettings loaded = loadVpnSettings();
        cachedVpnSettings = loaded;
        cachedVpnSettingsAtMs = now;
        return loaded;
    }

    /**
     * Clears the cached Raven download VPN settings snapshot so the next read reloads Vault state.
     */
    public synchronized void invalidateDownloadVpnSettingsCache() {
        cachedVpnSettings = null;
        cachedVpnSettingsAtMs = 0L;
    }

    private DownloadNamingSettings loadNamingSettings() {
        try {
            Map<String, Object> doc = vaultService.findOne(SETTINGS_COLLECTION, Map.of("key", NAMING_KEY));
            DownloadNamingSettings parsed = doc != null ? vaultService.parseJson(doc, DownloadNamingSettings.class) : null;
            return mergeWithDefaults(parsed);
        } catch (Exception e) {
            if (shouldLogNamingWarning()) {
                logger.warn("SETTINGS", "⚠️ Failed to load naming settings, using defaults: " + e.getMessage());
            }
            return mergeWithDefaults(null);
        }
    }

    private DownloadLimitsSettings loadLimitsSettings() {
        try {
            Map<String, Object> doc = vaultService.findOne(SETTINGS_COLLECTION, Map.of("key", LIMITS_KEY));
            DownloadLimitsSettings parsed = doc != null ? vaultService.parseJson(doc, DownloadLimitsSettings.class) : null;
            return mergeLimitsSettingsWithDefaults(parsed, resolveLegacyOverallSpeedLimitKbps());
        } catch (Exception e) {
            if (shouldLogLimitsWarning()) {
                logger.warn("SETTINGS", "⚠️ Failed to load download limits settings, using defaults: " + e.getMessage());
            }
            return mergeLimitsSettingsWithDefaults(null, resolveLegacyOverallSpeedLimitKbps());
        }
    }

    private DownloadVpnSettings loadVpnSettings() {
        try {
            Map<String, Object> doc = vaultService.findOne(SETTINGS_COLLECTION, Map.of("key", VPN_KEY));
            DownloadVpnSettings parsed = doc != null ? vaultService.parseJson(doc, DownloadVpnSettings.class) : null;
            return mergeVpnSettingsWithDefaults(parsed);
        } catch (Exception e) {
            if (shouldLogVpnWarning()) {
                logger.warn("SETTINGS", "⚠️ Failed to load VPN settings, using defaults: " + e.getMessage());
            }
            return mergeVpnSettingsWithDefaults(null);
        }
    }

    private boolean shouldLogNamingWarning() {
        long now = System.currentTimeMillis();
        if (now - lastNamingWarningAtMs < WARNING_COOLDOWN_MS) {
            return false;
        }

        lastNamingWarningAtMs = now;
        return true;
    }

    private boolean shouldLogLimitsWarning() {
        long now = System.currentTimeMillis();
        if (now - lastLimitsWarningAtMs < WARNING_COOLDOWN_MS) {
            return false;
        }

        lastLimitsWarningAtMs = now;
        return true;
    }

    private boolean shouldLogVpnWarning() {
        long now = System.currentTimeMillis();
        if (now - lastVpnWarningAtMs < WARNING_COOLDOWN_MS) {
            return false;
        }

        lastVpnWarningAtMs = now;
        return true;
    }

    private DownloadNamingSettings mergeWithDefaults(DownloadNamingSettings input) {
        DownloadNamingSettings out = input != null ? input : new DownloadNamingSettings();

        out.setKey(NAMING_KEY);

        if (out.getTitleTemplate() == null || out.getTitleTemplate().isBlank()) {
            out.setTitleTemplate("{title}");
        }

        if (out.getChapterTemplate() == null || out.getChapterTemplate().isBlank()) {
            out.setChapterTemplate("{title} c{chapter} (v{volume}) [Noona].cbz");
        }

        if (out.getPageTemplate() == null || out.getPageTemplate().isBlank()) {
            out.setPageTemplate("{page_padded}{ext}");
        }

        if (out.getPagePad() == null || out.getPagePad() < 1) {
            out.setPagePad(3);
        }

        if (out.getChapterPad() == null || out.getChapterPad() < 1) {
            out.setChapterPad(3);
        }

        if (out.getVolumePad() == null || out.getVolumePad() < 1) {
            out.setVolumePad(2);
        }

        return out;
    }

    private DownloadLimitsSettings mergeLimitsSettingsWithDefaults(
            DownloadLimitsSettings input,
            int legacyFallbackOverallSpeedLimitKbps
    ) {
        DownloadLimitsSettings out = input != null ? input : new DownloadLimitsSettings();
        out.setKey(LIMITS_KEY);

        Integer limit = out.getOverallSpeedLimitKbps();
        if (limit == null) {
            limit = legacyFallbackOverallSpeedLimitKbps;
        }
        out.setOverallSpeedLimitKbps(limit != null && limit > 0 ? limit : 0);
        return out;
    }

    private int resolveLegacyOverallSpeedLimitKbps() {
        try {
            Map<String, Object> legacyDoc = vaultService.findOne(SETTINGS_COLLECTION, Map.of("key", LEGACY_WORKERS_KEY));
            DownloadWorkerSettings legacy = legacyDoc != null ? vaultService.parseJson(legacyDoc, DownloadWorkerSettings.class) : null;
            if (legacy == null || legacy.getThreadRateLimitsKbps() == null) {
                return 0;
            }

            int total = 0;
            for (Integer rateLimit : legacy.getThreadRateLimitsKbps()) {
                if (rateLimit != null && rateLimit > 0) {
                    total += rateLimit;
                }
            }
            return Math.max(total, 0);
        } catch (Exception e) {
            if (shouldLogLimitsWarning()) {
                logger.warn("SETTINGS", "⚠️ Failed to read legacy download worker settings fallback: " + e.getMessage());
            }
            return 0;
        }
    }

    private DownloadVpnSettings mergeVpnSettingsWithDefaults(DownloadVpnSettings input) {
        DownloadVpnSettings out = input != null ? input : new DownloadVpnSettings();
        out.setKey(VPN_KEY);

        if (out.getProvider() == null || out.getProvider().isBlank()) {
            out.setProvider("pia");
        } else {
            out.setProvider(out.getProvider().trim().toLowerCase());
        }

        if (out.getEnabled() == null) {
            out.setEnabled(false);
        }

        if (out.getOnlyDownloadWhenVpnOn() == null) {
            out.setOnlyDownloadWhenVpnOn(false);
        }

        if (out.getRegion() == null || out.getRegion().isBlank()) {
            out.setRegion("us_california");
        } else {
            out.setRegion(out.getRegion().trim().toLowerCase());
        }

        if (out.getPiaUsername() == null) {
            out.setPiaUsername("");
        } else {
            out.setPiaUsername(out.getPiaUsername().trim());
        }

        if (out.getPiaPassword() == null) {
            out.setPiaPassword("");
        } else {
            out.setPiaPassword(out.getPiaPassword().trim());
        }

        return out;
    }
}
