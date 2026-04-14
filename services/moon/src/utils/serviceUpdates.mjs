const normalizeString = (value) => (typeof value === "string" ? value.trim() : "");

export const SERVICE_UPDATE_CHECK_TIMEOUT_MS = 120_000;
export const SERVICE_IMAGE_UPDATE_TIMEOUT_MS = 600_000;

const SERVICE_UPDATE_CHECK_TIMEOUT_MESSAGE =
    "Update check timed out while waiting on Sage/Warden. Checking registry digests can take up to 2 minutes.";
const SERVICE_IMAGE_UPDATE_TIMEOUT_MESSAGE =
    "Service image update timed out while waiting on Sage/Warden. Docker pulls and restarts can take several minutes.";

const classifyUpdaterError = (message = "", kind = "unknown") => {
    const normalized = normalizeString(message);
    if (!normalized) {
        return "unknown";
    }

    const lower = normalized.toLowerCase();
    const isTimeout =
        lower.includes("timed out")
        || lower.includes("timeout")
        || lower.includes("aborted");
    const matchesCheckRoute = lower.includes("/api/settings/services/updates/check");
    const matchesImageRoute =
        lower.includes("/api/settings/services/")
        && lower.includes("/update-image");

    if (
        isTimeout
        && (
            (kind === "check" && matchesCheckRoute)
            || (kind === "image" && matchesImageRoute)
        )
    ) {
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

    return "updater-failure";
};

export const classifyServiceUpdateCheckError = (message = "") =>
    classifyUpdaterError(message, "check");

export const classifyServiceImageUpdateError = (message = "") =>
    classifyUpdaterError(message, "image");

export const formatServiceUpdateCheckErrorMessage = (message = "") => {
    const normalized = normalizeString(message);
    if (!normalized) {
        return "Unable to check service updates.";
    }

    if (classifyServiceUpdateCheckError(normalized) === "timeout") {
        return SERVICE_UPDATE_CHECK_TIMEOUT_MESSAGE;
    }

    return normalized;
};

export const formatServiceImageUpdateErrorMessage = (message = "") => {
    const normalized = normalizeString(message);
    if (!normalized) {
        return "Unable to update service image.";
    }

    if (classifyServiceImageUpdateError(normalized) === "timeout") {
        return SERVICE_IMAGE_UPDATE_TIMEOUT_MESSAGE;
    }

    return normalized;
};

export const requestServiceUpdateCheckFromSage = async ({
                                                            body = {},
                                                            sageJsonImpl,
                                                            withNoonaAuthHeadersImpl,
                                                        }) => {
    if (typeof sageJsonImpl !== "function") {
        throw new Error("A Sage JSON client is required for service update checks.");
    }

    const headers = typeof withNoonaAuthHeadersImpl === "function"
        ? await withNoonaAuthHeadersImpl({"Content-Type": "application/json"})
        : {"Content-Type": "application/json"};

    return await sageJsonImpl("/api/settings/services/updates/check", {
        method: "POST",
        headers,
        body: JSON.stringify(body ?? {}),
    }, {
        timeoutMs: SERVICE_UPDATE_CHECK_TIMEOUT_MS,
    });
};

export const requestServiceImageUpdateFromSage = async ({
                                                            serviceName,
                                                            body = {},
                                                            sageJsonImpl,
                                                            withNoonaAuthHeadersImpl,
                                                        }) => {
    const normalizedServiceName = normalizeString(serviceName);
    if (!normalizedServiceName) {
        throw new Error("A service name is required for image updates.");
    }
    if (typeof sageJsonImpl !== "function") {
        throw new Error("A Sage JSON client is required for service image updates.");
    }

    const headers = typeof withNoonaAuthHeadersImpl === "function"
        ? await withNoonaAuthHeadersImpl({"Content-Type": "application/json"})
        : {"Content-Type": "application/json"};

    return await sageJsonImpl(`/api/settings/services/${encodeURIComponent(normalizedServiceName)}/update-image`, {
        method: "POST",
        headers,
        body: JSON.stringify(body ?? {}),
    }, {
        timeoutMs: SERVICE_IMAGE_UPDATE_TIMEOUT_MS,
    });
};
