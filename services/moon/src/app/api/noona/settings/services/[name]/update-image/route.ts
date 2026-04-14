import {NextRequest, NextResponse} from "next/server";
import {jsonError, sageJson} from "../../../../_backend";
import {withNoonaAuthHeaders} from "../../../../_auth";
import {formatServiceImageUpdateErrorMessage, requestServiceImageUpdateFromSage,} from "@/utils/serviceUpdates.mjs";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ name: string }> }) {
    const routeParams = await context.params;
    const name = typeof routeParams?.name === "string" ? routeParams.name.trim() : "";

    if (!name) {
        return jsonError("Service name is required.", 400);
    }

    let body: unknown = null;
    try {
        body = await request.json();
    } catch {
        return jsonError("Request body must be valid JSON.", 400);
    }

    const requestBody = body && typeof body === "object" ? body : {};

    try {
        const {status, payload} = await requestServiceImageUpdateFromSage({
            serviceName: name,
            body: requestBody,
            sageJsonImpl: sageJson,
            withNoonaAuthHeadersImpl: withNoonaAuthHeaders,
        });
        return NextResponse.json(payload, {status});
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonError(formatServiceImageUpdateErrorMessage(message));
    }
}
