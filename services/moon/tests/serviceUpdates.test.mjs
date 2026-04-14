import test from "node:test";
import assert from "node:assert/strict";

import {
    classifyServiceImageUpdateError,
    classifyServiceUpdateCheckError,
    formatServiceImageUpdateErrorMessage,
    formatServiceUpdateCheckErrorMessage,
    requestServiceImageUpdateFromSage,
    requestServiceUpdateCheckFromSage,
    SERVICE_IMAGE_UPDATE_TIMEOUT_MS,
    SERVICE_UPDATE_CHECK_TIMEOUT_MS,
} from "../src/utils/serviceUpdates.mjs";

test("requestServiceUpdateCheckFromSage uses the dedicated long timeout for update refreshes", async () => {
    let receivedPath = null;
    let receivedInit = null;
    let receivedOptions = null;

    const result = await requestServiceUpdateCheckFromSage({
        body: {services: ["noona-moon", "noona-raven"]},
        sageJsonImpl: async (path, init, options) => {
            receivedPath = path;
            receivedInit = init;
            receivedOptions = options;
            return {status: 200, payload: {updates: []}};
        },
        withNoonaAuthHeadersImpl: async (headers) => ({
            ...headers,
            Authorization: "Bearer moon-token",
        }),
    });

    assert.equal(receivedPath, "/api/settings/services/updates/check");
    assert.equal(receivedInit.method, "POST");
    assert.equal(receivedInit.headers.Authorization, "Bearer moon-token");
    assert.deepEqual(JSON.parse(receivedInit.body), {services: ["noona-moon", "noona-raven"]});
    assert.deepEqual(receivedOptions, {timeoutMs: SERVICE_UPDATE_CHECK_TIMEOUT_MS});
    assert.deepEqual(result, {status: 200, payload: {updates: []}});
});

test("requestServiceImageUpdateFromSage uses the dedicated long timeout for synchronous image pulls", async () => {
    let receivedPath = null;
    let receivedInit = null;
    let receivedOptions = null;

    const result = await requestServiceImageUpdateFromSage({
        serviceName: "noona-raven",
        body: {restart: true},
        sageJsonImpl: async (path, init, options) => {
            receivedPath = path;
            receivedInit = init;
            receivedOptions = options;
            return {status: 200, payload: {updated: true}};
        },
        withNoonaAuthHeadersImpl: async (headers) => ({
            ...headers,
            Authorization: "Bearer moon-token",
        }),
    });

    assert.equal(receivedPath, "/api/settings/services/noona-raven/update-image");
    assert.equal(receivedInit.method, "POST");
    assert.equal(receivedInit.headers.Authorization, "Bearer moon-token");
    assert.deepEqual(JSON.parse(receivedInit.body), {restart: true});
    assert.deepEqual(receivedOptions, {timeoutMs: SERVICE_IMAGE_UPDATE_TIMEOUT_MS});
    assert.deepEqual(result, {status: 200, payload: {updated: true}});
});

test("formatServiceUpdateCheckErrorMessage turns aborted updater refresh probes into timeout guidance", () => {
    const rawMessage = "All backends failed for /api/settings/services/updates/check: "
        + "http://noona-sage:3004 (This operation was aborted) | "
        + "http://127.0.0.1:3004 (fetch failed). Moon could not reach Sage.";

    assert.equal(classifyServiceUpdateCheckError(rawMessage), "timeout");
    assert.equal(
        formatServiceUpdateCheckErrorMessage(rawMessage),
        "Update check timed out while waiting on Sage/Warden. Checking registry digests can take up to 2 minutes.",
    );
});

test("formatServiceImageUpdateErrorMessage turns aborted service image updates into timeout guidance", () => {
    const rawMessage = "All backends failed for /api/settings/services/noona-raven/update-image: "
        + "http://noona-sage:3004 (This operation was aborted) | "
        + "http://127.0.0.1:3004 (fetch failed). Moon could not reach Sage.";

    assert.equal(classifyServiceImageUpdateError(rawMessage), "timeout");
    assert.equal(
        formatServiceImageUpdateErrorMessage(rawMessage),
        "Service image update timed out while waiting on Sage/Warden. Docker pulls and restarts can take several minutes.",
    );
});

test("service updater error formatters preserve Sage reachability guidance for real transport failures", () => {
    const rawCheckMessage = "All backends failed for /api/settings/services/updates/check: "
        + "http://noona-sage:3004 (fetch failed) | http://127.0.0.1:3004 (ECONNREFUSED). "
        + "Moon could not reach Sage. For Warden-managed installs, check noona-sage health and confirm noona-moon "
        + "and noona-sage share noona-network.";
    const rawImageMessage = "All backends failed for /api/settings/services/noona-raven/update-image: "
        + "http://noona-sage:3004 (fetch failed) | http://127.0.0.1:3004 (ECONNREFUSED). "
        + "Moon could not reach Sage. For Warden-managed installs, check noona-sage health and confirm noona-moon "
        + "and noona-sage share noona-network.";

    assert.equal(classifyServiceUpdateCheckError(rawCheckMessage), "sage-unreachable");
    assert.equal(classifyServiceImageUpdateError(rawImageMessage), "sage-unreachable");
    assert.equal(formatServiceUpdateCheckErrorMessage(rawCheckMessage), rawCheckMessage);
    assert.equal(formatServiceImageUpdateErrorMessage(rawImageMessage), rawImageMessage);
});
