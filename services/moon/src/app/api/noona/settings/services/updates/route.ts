import {NextResponse} from "next/server";
import {jsonError, sageJson} from "../../../_backend";
import {withNoonaAuthHeaders} from "../../../_auth";
import {retryBackendRead} from "../../../backendReadRetry.mjs";
import {formatServiceUpdateCheckErrorMessage, requestServiceUpdateCheckFromSage,} from "@/utils/serviceUpdates.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const {status, payload} = await retryBackendRead(async () =>
            sageJson("/api/settings/services/updates", {
                headers: await withNoonaAuthHeaders(),
            }),
        );
        return NextResponse.json(payload, {status});
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonError(message);
    }
}

export async function POST(request: Request) {
    let body: unknown = null;

    try {
        body = await request.json();
    } catch {
        return jsonError("Request body must be valid JSON.", 400);
    }

    const requestBody = body && typeof body === "object" ? body : {};

    try {
        const {status, payload} = await requestServiceUpdateCheckFromSage({
            body: requestBody,
            sageJsonImpl: sageJson,
            withNoonaAuthHeadersImpl: withNoonaAuthHeaders,
        });
        return NextResponse.json(payload, {status});
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonError(formatServiceUpdateCheckErrorMessage(message));
    }
}
