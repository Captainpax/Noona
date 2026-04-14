type ManagedServiceCatalogEntry = {
    name?: string | null;
    hostServiceUrl?: string | null;
    installed?: boolean | null;
};

type ManagedServiceCatalogResponse = {
    services?: ManagedServiceCatalogEntry[] | null;
};

export type KavitaInfoResponse = {
    baseUrl?: string | null;
    externalBaseUrl?: string | null;
    internalBaseUrl?: string | null;
};

const normalizeString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const normalizeBaseUrl = (value: unknown): string => normalizeString(value).replace(/\/+$/, "");

const normalizeAbsoluteHttpUrl = (value: unknown): string => {
    const normalized = normalizeString(value);
    if (!normalized) {
        return "";
    }

    try {
        const parsed = new URL(normalized);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return "";
        }

        return parsed.toString();
    } catch {
        return "";
    }
};

const resolveKavitaInfoBaseUrl = (payload: KavitaInfoResponse | null | undefined): string =>
    normalizeAbsoluteHttpUrl(payload?.baseUrl)
    || normalizeAbsoluteHttpUrl(payload?.externalBaseUrl)
    || normalizeAbsoluteHttpUrl(payload?.internalBaseUrl);

const appendUrlPath = (baseUrl: string, path: string): string => {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    if (!normalizedBaseUrl) {
        return "";
    }
    return `${normalizedBaseUrl}${normalizedPath}`;
};

export async function fetchManagedServiceHostUrl(serviceName: string): Promise<string | null> {
    const normalizedServiceName = normalizeString(serviceName);
    if (!normalizedServiceName) {
        return null;
    }

    try {
        const response = await fetch("/api/noona/services", {cache: "no-store"});
        const payload = (await response.json().catch(() => null)) as ManagedServiceCatalogResponse | null;
        if (!response.ok) {
            return null;
        }

        const services = Array.isArray(payload?.services) ? payload.services : [];
        const entry = services.find((candidate) =>
            normalizeString(candidate?.name) === normalizedServiceName && candidate?.installed === true,
        );
        const hostServiceUrl = normalizeBaseUrl(entry?.hostServiceUrl);
        return hostServiceUrl || null;
    } catch {
        return null;
    }
}

export async function resolveKavitaBaseUrl(options: {
    fetchImpl?: typeof fetch;
    managedServiceFetcher?: typeof fetchManagedServiceHostUrl;
} = {}): Promise<string | null> {
    const {
        fetchImpl = fetch,
        managedServiceFetcher = fetchManagedServiceHostUrl,
    } = options;

    try {
        const response = await fetchImpl("/api/noona/portal/kavita/info", {cache: "no-store"});
        const payload = (await response.json().catch(() => null)) as KavitaInfoResponse | null;
        const baseUrl = response.ok ? resolveKavitaInfoBaseUrl(payload) : "";
        if (baseUrl) {
            return baseUrl;
        }
    } catch {
        // Fall back to the managed-service catalog lookup below.
    }

    try {
        const managedKavitaUrl = await managedServiceFetcher("noona-kavita");
        return normalizeAbsoluteHttpUrl(managedKavitaUrl) || null;
    } catch {
        return null;
    }
}

export function buildKavitaSeriesUrl(options: {
    baseUrl?: string | null;
    libraryId?: number | null;
    seriesId?: number | null;
    fallbackUrl?: string | null;
}): string | null {
    const libraryId = typeof options.libraryId === "number" && Number.isInteger(options.libraryId) ? options.libraryId : null;
    const seriesId = typeof options.seriesId === "number" && Number.isInteger(options.seriesId) ? options.seriesId : null;
    const baseUrl = normalizeBaseUrl(options.baseUrl);
    const fallbackUrl = normalizeString(options.fallbackUrl);

    if (baseUrl && libraryId != null && seriesId != null) {
        return appendUrlPath(baseUrl, `/library/${libraryId}/series/${seriesId}`);
    }

    if (!fallbackUrl) {
        return null;
    }

    if (!baseUrl) {
        return fallbackUrl;
    }

    try {
        const fallback = new URL(fallbackUrl);
        return appendUrlPath(baseUrl, `${fallback.pathname}${fallback.search}${fallback.hash}`);
    } catch {
        return fallbackUrl;
    }
}
