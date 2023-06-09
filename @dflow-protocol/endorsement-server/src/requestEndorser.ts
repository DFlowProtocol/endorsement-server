import {
    EndorsementRequest,
    PaymentInLieuApprovalRequest,
} from "@dflow-protocol/endorsement-client-lib";
import {
    makeEndorsementData,
    makeEndorsementMessage,
    makePaymentInLieuApprovalMessage,
    makePaymentInLieuMessage,
} from "@dflow-protocol/signatory-client-lib";
import bs58 from "bs58";
import { randomBytes } from "crypto";
import { InvalidEndorsementRequest } from "./error";
import nacl from "tweetnacl";

export type EndorseResult = EndorsedResult | NotEndorsedResult

export type EndorsedResult = {
    endorsed: true
    endorsement: {
        signature: string
        id: string
        expirationTimeUTC: number
        data: string
    }
}

export type NotEndorsedResult = {
    endorsed: false
    reason: NotEndorsedReason
}

export enum NotEndorsedReason {
    RateLimitExceeded = 1,
}

export type ApprovePaymentInLieuResult = PaymentInLieuApprovedResult | PaymentInLieuRejectedResult

export type PaymentInLieuApprovedResult = {
    approved: true
    approval: string
}

export type PaymentInLieuRejectedResult = {
    approved: false
    reason: PaymentInLieuRejectedReason
}

export enum PaymentInLieuRejectedReason {
    EndorsementExpired = 1,
    RateLimitExceeded = 2,
    InvalidPaymentInLieuTokenSignature = 3,
}

export class RequestEndorser {
    readonly keypair: nacl.SignKeyPair;
    readonly base58PublicKey: string;
    readonly expirationInSeconds: number;

    constructor(keypair: nacl.SignKeyPair, expirationInSeconds: number) {
        this.keypair = keypair;
        this.base58PublicKey = bs58.encode(this.keypair.publicKey);
        this.expirationInSeconds = expirationInSeconds;
    }

    async maybeEndorse(request: EndorsementRequest, now: Date): Promise<EndorseResult> {
        const id = randomBytes(8).toString("base64");
        const nowUTCSeconds = Math.floor(now.getTime() / 1000);
        const expirationTimeUTC = nowUTCSeconds + this.expirationInSeconds;

        const { platformFeeBps, platformFeeReceiver } = request;
        let platformFee;
        if (platformFeeBps !== undefined && platformFeeReceiver !== undefined) {
            const parsedPlatformFeeBps = tryParsePlatformFeeBps(platformFeeBps);
            if (parsedPlatformFeeBps === null) {
                throw new InvalidEndorsementRequest("invalid platformFeeBps");
            }
            platformFee = { bps: parsedPlatformFeeBps, receiver: platformFeeReceiver };
        } else if (platformFeeBps !== undefined) {
            throw new InvalidEndorsementRequest("platformFeeReceiver not specified");
        } else if (platformFeeReceiver !== undefined) {
            throw new InvalidEndorsementRequest("platformFeeBps not specified");
        }

        const sendToken = request.sendToken;
        const sendQty = request.sendQty;
        const maxSendQty = request.maxSendQty;
        if (sendQty && maxSendQty) {
            throw new InvalidEndorsementRequest(
                "request cannot specify both sendQty and maxSendQty"
            );
        } else if (sendQty) {
            if (!isValidSendQty(sendQty)) {
                throw new InvalidEndorsementRequest("invalid sendQty");
            }
            if (!sendToken) {
                throw new InvalidEndorsementRequest(
                    "sendToken must be specified if sendQty is specified"
                );
            }
        } else if (maxSendQty) {
            if (!isValidSendQty(maxSendQty)) {
                throw new InvalidEndorsementRequest("invalid maxSendQty");
            }
            if (!sendToken) {
                throw new InvalidEndorsementRequest(
                    "sendToken must be specified if maxSendQty is specified"
                );
            }
        }

        const endorsementData = makeEndorsementData({
            retailTrader: request.retailTrader,
            platformFee,
            sendToken,
            receiveToken: request.receiveToken,
            sendQuantity: sendQty,
            maxSendQuantity: maxSendQty,
        });

        const msg = makeEndorsementMessage(id, expirationTimeUTC, endorsementData);

        const msgBuffer = Buffer.from(msg, "utf-8");
        const signatureBuffer = nacl.sign.detached(msgBuffer, this.keypair.secretKey);
        const signature = Buffer.from(signatureBuffer).toString("base64");

        return {
            endorsed: true,
            endorsement: {
                signature,
                id,
                expirationTimeUTC,
                data: endorsementData,
            },
        };
    }

    async maybeApprovePaymentInLieu(
        request: PaymentInLieuApprovalRequest,
        now: Date,
    ): Promise<ApprovePaymentInLieuResult> {
        const paymentInLieuToken = request.paymentInLieuToken;

        // Check that endorsement is not expired
        const endorsement = paymentInLieuToken.endorsement;
        const nowUTCSeconds = Math.floor(now.getTime() / 1000);
        const expirationTimeUTCSeconds = endorsement.expirationTimeUTC;
        if (nowUTCSeconds >= expirationTimeUTCSeconds) {
            return { approved: false, reason: PaymentInLieuRejectedReason.EndorsementExpired };
        }

        // Verify the issuer's signature of the payment in lieu message. This is needed to ensure we
        // don't sign arbitrary payloads.
        const paymentInLieuMessage = makePaymentInLieuMessage(paymentInLieuToken);
        const paymentInLieuMessageBuffer = Buffer.from(paymentInLieuMessage, "utf-8");
        const paymentInLieuSignatureBuffer = Buffer.from(paymentInLieuToken.signature, "base64");
        const issuerPublicKey = bs58.decode(paymentInLieuToken.issuer);
        const isValidPaymentInLieuTokenSignature = nacl.sign.detached.verify(
            paymentInLieuMessageBuffer,
            paymentInLieuSignatureBuffer,
            issuerPublicKey,
        );
        if (!isValidPaymentInLieuTokenSignature) {
            return {
                approved: false,
                reason: PaymentInLieuRejectedReason.InvalidPaymentInLieuTokenSignature,
            };
        }

        const approvalMessage = makePaymentInLieuApprovalMessage(paymentInLieuToken);
        const approvalMessageBuffer = Buffer.from(approvalMessage, "utf-8");
        const approvalSignatureBuffer = nacl.sign.detached(
            approvalMessageBuffer,
            this.keypair.secretKey,
        );
        const approvalSignature = Buffer.from(approvalSignatureBuffer).toString("base64");
        return {
            approved: true,
            approval: approvalSignature,
        };
    }
}

function tryParsePlatformFeeBps(raw: string): number | null {
    try {
        const parsed = Number(BigInt(raw));
        if (parsed < 0 || parsed > 5000) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

function isValidSendQty(raw: string): boolean {
    try {
        BigInt(raw);
        return true;
    } catch {
        return false;
    }
}
