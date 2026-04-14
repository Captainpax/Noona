/**
 * Represents the request payload for queue download.
 * Related files:
 * - src/main/java/com/paxkun/raven/controller/DownloadController.java
 * Times this file has been edited: 2
 */
package com.paxkun.raven.service.download;

/**
 * Represents the request payload for queue download.
 *
 * @param searchId    The Raven search session id.
 * @param optionIndex The selected search option index.
 * @param allowDownloadWithoutVpn Whether Raven should bypass the global VPN-only gate for this queued task.
 */

public record QueueDownloadRequest(String searchId, Integer optionIndex, Boolean allowDownloadWithoutVpn) {
}
