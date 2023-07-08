import { schemaEndorsement, schemaPaymentInLieuToken } from "@dflow-protocol/signatory-client-lib";
import { z } from "zod";

export type EndorsementRequest = z.infer<typeof schemaEndorsementRequest>;
export const schemaEndorsementRequest = z.object({
    /** Optional public key of the retail trader's wallet on the settlement network, encoded using
     * the encoding scheme used for wallet addresses on the settlement network. Must be specified if
     * the endorsement will be used to request a firm quote. */
    retailTrader: z.optional(z.string()),
    /** Optional platform fee amount in basis points. Fractional basis points are not supported. */
    platformFeeBps: z.optional(z.string()),
    /** Optional public key of the platform fee receiver's wallet on the settlement network, encoded
     * using the encoding scheme used for wallet addresses on the settlement network. */
    platformFeeReceiver: z.optional(z.string()),
    /** Optional send token address. If specified, the endorsement can only be used to request a
     * quote where the retail trader sends the specified token. */
    sendToken: z.optional(z.string()),
    /** Optional receive token address. If specified, the endorsement can only be used to request a
     * quote where the retail trader receives the specified token. */
    receiveToken: z.optional(z.string()),
    /** Optional send quantity, specified as a fixed-point number. If specified, if the
     * endorsement can only be used to request a quote where the retail trader sends exactly this
     * quantity of the send token. Cannot be specified if the send token is unspecified. Cannot be
     * specified if the max send quantity is specified. */
    sendQty: z.optional(z.string()),
    /** Optional maximum send quantity, specified as a fixed-point number. If specified, if the
     * endorsement can only be used to request a quote where the retail trader sends at most this
     * quantity of the send token. Cannot be specified if the send token is unspecified. Cannot be
     * specified if the send quantity is specified. */
    maxSendQty: z.optional(z.string()),
});

export type EndorsementResponse = z.infer<typeof schemaEndorsementResponse>;
export const schemaEndorsementResponse = schemaEndorsement;

export type PaymentInLieuApprovalRequest = z.infer<typeof schemaPaymentInLieuApprovalRequest>;
export const schemaPaymentInLieuApprovalRequest = z.object({
    paymentInLieuToken: schemaPaymentInLieuToken,
});

export type PaymentInLieuApprovalResponse = z.infer<typeof schemaPaymentInLieuApprovalResponse>;
export const schemaPaymentInLieuApprovalResponse = z.object({
    /** Base58-encoded Ed25519 public key used to sign the approval message. */
    approver: z.string(),
    /** Approver's Base64-encoded approval signature of `paymentInLieuToken.signature` */
    approval: z.string(),
});
