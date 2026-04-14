/**
 * Bootstraps the Raven Spring application.
 * Related files:
 * - src/main/java/com/paxkun/raven/service/DownloadService.java
 * - src/test/java/com/paxkun/raven/RavenApplicationTests.java
 * Times this file has been edited: 4
 */
package com.paxkun.raven;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 🦅 Raven Application Entry Point
 *
 * The main Spring Boot application class for Raven Downloader and Library Manager.
 */
@SpringBootApplication
public class RavenApplication {
    /**
     * Handles main.
     *
     * @param args The application arguments.
     */

    public static void main(String[] args) {
        SpringApplication.run(RavenApplication.class, args);
    }
}
