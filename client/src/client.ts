import { apiBasePath, endorsementPath, paymentInLieuApprovalPath } from "./api-path";
import {
    EndorsementRequest,
    EndorsementResponse,
    PaymentInLieuApprovalRequest,
    PaymentInLieuApprovalResponse,
    schemaEndorsementResponse,
    schemaPaymentInLieuApprovalResponse,
} from "./type";

export async function getEndorsement(
    endorsementServerURL: string,
    params: EndorsementRequest,
): Promise<EndorsementResponse> {
    const definedParams = Object.entries(params).filter(x => x[1] !== undefined);
    const stringParams = definedParams.reduce((acc, curr) => {
        acc[curr[0]] = curr[1].toString();
        return acc;
    }, {} as Record<string, string>);
    const urlParams = new URLSearchParams(stringParams);
    const url = `${endorsementServerURL}${apiBasePath}${endorsementPath}?${urlParams}`;
    const responseObj = await fetch(url);
    await throwIfNotOkay(responseObj);
    const response = await responseObj.json();
    const parsedResponse = schemaEndorsementResponse.parse(response);
    return parsedResponse;
}

export async function getPaymentInLieuApproval(
    endorsementServerURL: string,
    params: PaymentInLieuApprovalRequest,
): Promise<PaymentInLieuApprovalResponse> {
    const url = `${endorsementServerURL}${apiBasePath}${paymentInLieuApprovalPath}`;
    const requestBody = JSON.stringify(params);
    const responseObj = await post(url, requestBody);
    await throwIfNotOkay(responseObj);
    const response = await responseObj.json();
    const parsedResponse = schemaPaymentInLieuApprovalResponse.parse(response);
    return parsedResponse;
}

function post(url: string, body: string): Promise<Response> {
    return fetch(url, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(body).toString(),
        },
        body,
    });
}

async function throwIfNotOkay(response: Response): Promise<void> {
    if (!response.ok) {
        let errorResponse;
        try {
            errorResponse = await response.json();
        } catch (error) {
            throw new Error("An unknown error occurred");
        }
        if (typeof errorResponse.error === "string") {
            throw new Error(errorResponse.error);
        }
        throw new Error(JSON.stringify(errorResponse));
    }
}
