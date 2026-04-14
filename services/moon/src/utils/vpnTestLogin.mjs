const normalizeString = (value) => (typeof value === "string" ? value.trim() : "");

export const VPN_TEST_LOGIN_TIMEOUT_MS = 120_000;

const VPN_TEST_LOGIN_TIMEOUT_MESSAGE =
    "VPN login test timed out while waiting on Sage/Raven. Raven can take up to 90 seconds to finish the probe.";

export const classifyVpnTestLoginError = (message = "") => {
    const normalized = normalizeString(message);
    if (!normalized) {
        return "unknown";
    }

    const lower = normalized.toLowerCase();
    const timedOut =
        lower.includes("timed out while waiting on sage/raven")
        || lower.includes("timed out while waiting for sage/raven")
        || (
            (lower.includes("timed out") || lower.includes("timeout") || lower.includes("aborted"))
            && lower.includes("/api/settings/downloads/vpn/test-login")
        );
    if (timedOut) {
        return "timeout";
    }

    if (
        lower.includes("moon could not reach sage")
        || lower.includes("check noona-sage health")
        || lower.includes("share noona-network")
        || lower.includes("set noona-moon sage_base_url")
    ) {
        return "sage-unreachable";
    }

    return "vpn-failure";
};

export const formatVpnTestLoginErrorMessage = (message = "") => {
    const normalized = normalizeString(message);
    if (!normalized) {
        return "Unable to test VPN login.";
    }

    if (classifyVpnTestLoginError(normalized) === "timeout") {
        return VPN_TEST_LOGIN_TIMEOUT_MESSAGE;
    }

    return normalized;
};

export const requestVpnTestLoginFromSage = async ({
                                                      body = {},
                                                      sageJsonImpl,
                                                      withNoonaAuthHeadersImpl,
                                                  }) => {
    if (typeof sageJsonImpl !== "function") {
        throw new Error("A Sage JSON client is required for VPN login tests.");
    }

    const headers = typeof withNoonaAuthHeadersImpl === "function"
        ? await withNoonaAuthHeadersImpl({"Content-Type": "application/json"})
        : {"Content-Type": "application/json"};

    return await sageJsonImpl("/api/settings/downloads/vpn/test-login", {
        method: "POST",
        headers,
        body: JSON.stringify(body ?? {}),
    }, {
        timeoutMs: VPN_TEST_LOGIN_TIMEOUT_MS,
    });
};
