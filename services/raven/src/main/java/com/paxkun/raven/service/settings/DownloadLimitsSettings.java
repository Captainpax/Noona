/**
 * Represents Raven download limits settings.
 * Related files:
 * - src/main/java/com/paxkun/raven/service/settings/SettingsService.java
 * - src/main/java/com/paxkun/raven/service/DownloadService.java
 * Times this file has been edited: 1
 */
package com.paxkun.raven.service.settings;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Downloader-wide limits stored in Vault (Mongo).
 * Speed limits are expressed in KB/s, where 0 disables throttling.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DownloadLimitsSettings {
    private String key;
    private Integer overallSpeedLimitKbps;
}
