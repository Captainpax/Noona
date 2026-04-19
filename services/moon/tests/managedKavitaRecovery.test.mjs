import assert from "node:assert/strict";
import test from "node:test";

import {
    MANAGED_KAVITA_API_KEY_REQUIRED_MESSAGE,
    MANAGED_KAVITA_RECOVERY_STAGE_API_KEY_REQUIRED,
    MANAGED_KAVITA_RECOVERY_STAGE_READY,
    mergeManagedKavitaRecoveryState,
    normalizeManagedKavitaRecoveryPayload,
    resolveManagedKavitaRecoveryStateFromInstall,
    shouldPollManagedKavitaRecoveryStatus,
} from "../src/components/noona/managedKavitaRecovery.mjs";

test("normalizeManagedKavitaRecoveryPayload defaults to api-key-required for manual hand-off responses", () => {
    assert.deepEqual(
        normalizeManagedKavitaRecoveryPayload({
            adminExists: false,
            error: "Kavita is installed. Open Kavita, create the first admin account, then create an admin-capable API key and paste it into Moon.",
            services: ["noona-portal", "noona-raven"],
            hostServiceUrl: "https://kavita.example.com",
        }),
        {
            stage: MANAGED_KAVITA_RECOVERY_STAGE_API_KEY_REQUIRED,
            error: "Kavita is installed. Open Kavita, create the first admin account, then create an admin-capable API key and paste it into Moon.",
            services: ["noona-portal", "noona-raven"],
            adminExists: false,
            baseUrl: "",
            hostServiceUrl: "https://kavita.example.com",
            manualFallbackRequired: true,
        },
    );
});

test("normalizeManagedKavitaRecoveryPayload keeps ready responses intact", () => {
    assert.deepEqual(
        normalizeManagedKavitaRecoveryPayload({
            stage: MANAGED_KAVITA_RECOVERY_STAGE_READY,
            apiKey: "secret-key",
            services: ["noona-portal"],
        }),
        {
            stage: MANAGED_KAVITA_RECOVERY_STAGE_READY,
            error: MANAGED_KAVITA_API_KEY_REQUIRED_MESSAGE,
            services: ["noona-portal"],
            adminExists: null,
            baseUrl: "",
            hostServiceUrl: "",
            manualFallbackRequired: true,
        },
    );
});

test("resolveManagedKavitaRecoveryStateFromInstall infers api-key-required after Kavita is installed", () => {
    assert.deepEqual(
        resolveManagedKavitaRecoveryStateFromInstall({
            items: [
                {name: "noona-kavita", status: "installed"},
                {name: "noona-portal", status: "pending"},
                {name: "noona-komf", status: "pending"},
            ],
        }),
        {
            stage: MANAGED_KAVITA_RECOVERY_STAGE_API_KEY_REQUIRED,
            error: MANAGED_KAVITA_API_KEY_REQUIRED_MESSAGE,
            services: ["noona-portal", "noona-komf"],
            adminExists: null,
            baseUrl: "",
            hostServiceUrl: "",
            manualFallbackRequired: true,
        },
    );
});

test("mergeManagedKavitaRecoveryState prefers the latest incoming manual hand-off state", () => {
    assert.deepEqual(
        mergeManagedKavitaRecoveryState(
            {
                stage: MANAGED_KAVITA_RECOVERY_STAGE_API_KEY_REQUIRED,
                error: "Old message",
                services: ["noona-portal"],
                adminExists: false,
                baseUrl: "",
                hostServiceUrl: "",
                manualFallbackRequired: true,
            },
            {
                stage: MANAGED_KAVITA_RECOVERY_STAGE_API_KEY_REQUIRED,
                error: "New message",
                services: ["noona-portal", "noona-raven"],
                adminExists: true,
                baseUrl: "http://noona-kavita:5000",
                hostServiceUrl: "https://kavita.example.com",
                manualFallbackRequired: true,
            },
        ),
        {
            stage: MANAGED_KAVITA_RECOVERY_STAGE_API_KEY_REQUIRED,
            error: "New message",
            services: ["noona-portal", "noona-raven"],
            adminExists: true,
            baseUrl: "http://noona-kavita:5000",
            hostServiceUrl: "https://kavita.example.com",
            manualFallbackRequired: true,
        },
    );
});

test("shouldPollManagedKavitaRecoveryStatus only polls while managed Kavita is installed and targets are still pending", () => {
    assert.equal(
        shouldPollManagedKavitaRecoveryStatus({
            kavitaMode: "managed",
            managedTargetServices: ["noona-portal", "noona-raven", "noona-komf"],
            items: [
                {name: "noona-kavita", status: "installed"},
                {name: "noona-portal", status: "installed"},
                {name: "noona-raven", status: "pending"},
            ],
        }),
        true,
    );

    assert.equal(
        shouldPollManagedKavitaRecoveryStatus({
            kavitaMode: "managed",
            managedTargetServices: ["noona-portal", "noona-raven", "noona-komf"],
            items: [
                {name: "noona-kavita", status: "pending"},
                {name: "noona-raven", status: "pending"},
            ],
        }),
        false,
    );
});
