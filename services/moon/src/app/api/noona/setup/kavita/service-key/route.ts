import {NextRequest, NextResponse} from "next/server";
import {jsonError, sageJson} from "../../../_backend";

export const dynamic = "force-dynamic";
const MANAGED_KAVITA_SERVICE_KEY_TIMEOUT_MS = 300_000;

export async function GET(request: NextRequest) {
    try {
        const search = request.nextUrl.search || "";
        const path = search
            ? `/api/setup/services/noona-kavita/service-key${search}`
            : "/api/setup/services/noona-kavita/service-key";
        const {status, payload} = await sageJson(path, {
            method: "GET",
        }, {
            timeoutMs: MANAGED_KAVITA_SERVICE_KEY_TIMEOUT_MS,
        });
        return NextResponse.json(payload, {status});
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonError(message);
    }
}

export async function POST(request: NextRequest) {
    let body: unknown = null;
    try {
        body = await request.json();
    } catch {
        return jsonError("Request body must be valid JSON.", 400);
    }

    try {
        const {status, payload} = await sageJson("/api/setup/services/noona-kavita/service-key", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(body ?? {}),
        }, {
            timeoutMs: MANAGED_KAVITA_SERVICE_KEY_TIMEOUT_MS,
        });
        return NextResponse.json(payload, {status});
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonError(message);
    }
}
