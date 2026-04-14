import test from "node:test";
import assert from "node:assert/strict";

import {
    classifyVpnTestLoginError,
    formatVpnTestLoginErrorMessage,
    requestVpnTestLoginFromSage,
    VPN_TEST_LOGIN_TIMEOUT_MS,
} from "../src/utils/vpnTestLogin.mjs";

test("requestVpnTestLoginFromSage uses the dedicated long timeout for Raven's synchronous login probe", async () => {
    let receivedPath = null;
    let receivedInit = null;
    let receivedOptions = null;

    const result = await requestVpnTestLoginFromSage({
        body: {
            triggeredBy: "moon-settings",
            region: "us_california",
            piaUsername: "pia-user",
            piaPassword: "pia-secret",
        },
        sageJsonImpl: async (path, init, options) => {
            receivedPath = path;
            receivedInit = init;
            receivedOptions = options;
            return {status: 200, payload: {ok: true}};
        },
        withNoonaAuthHeadersImpl: async (headers) => ({
            ...headers,
            Authorization: "Bearer moon-token",
        }),
    });

    assert.equal(receivedPath, "/api/settings/downloads/vpn/test-login");
    assert.equal(receivedInit.method, "POST");
    assert.equal(receivedInit.headers.Authorization, "Bearer moon-token");
    assert.deepEqual(JSON.parse(receivedInit.body), {
        triggeredBy: "moon-settings",
        region: "us_california",
        piaUsername: "pia-user",
        piaPassword: "pia-secret",
    });
    assert.deepEqual(receivedOptions, {timeoutMs: VPN_TEST_LOGIN_TIMEOUT_MS});
    assert.deepEqual(result, {status: 200, payload: {ok: true}});
});

test("formatVpnTestLoginErrorMessage turns aborted backend probes into timeout guidance", () => {
    const rawMessage = "All backends failed for /api/settings/downloads/vpn/test-login: "
        + "http://noona-sage:3004 (This operation was aborted) | "
        + "http://127.0.0.1:3004 (fetch failed). Moon could not reach Sage.";

    assert.equal(classifyVpnTestLoginError(rawMessage), "timeout");
    assert.equal(
        formatVpnTestLoginErrorMessage(rawMessage),
        "VPN login test timed out while waiting on Sage/Raven. Raven can take up to 90 seconds to finish the probe.",
    );
});

test("formatVpnTestLoginErrorMessage preserves Sage reachability guidance for real transport failures", () => {
    const rawMessage = "All backends failed for /api/settings/downloads/vpn/test-login: "
        + "http://noona-sage:3004 (fetch failed) | http://127.0.0.1:3004 (ECONNREFUSED). "
        + "Moon could not reach Sage. For Warden-managed installs, check noona-sage health and confirm noona-moon "
        + "and noona-sage share noona-network.";

    assert.equal(classifyVpnTestLoginError(rawMessage), "sage-unreachable");
    assert.equal(formatVpnTestLoginErrorMessage(rawMessage), rawMessage);
});
