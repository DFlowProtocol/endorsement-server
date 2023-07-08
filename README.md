# DFlow Endorsement Server
This guide is for order flow sources who intend to route orders via DFlow order flow auctions (OFAs). In order to do so, an order flow source must run an _endorsement server_. This repository contains an implementation of an endorsement server by DFlow.

An endorsement server endorses an order flow source's users' quote requests. By endorsing its users' quote requests, an order flow source allows its users to fetch quotes and swap tokens via its DFlow auctions. An endorsement request returns an endorsement object containing a digital signature from your endorsement private key, which can be any Ed25519 keypair.

## Run using Docker
This repository contains a Dockerfile that can be used to build a Docker image for the endorsement server. The image is published to the github container registry at ghcr.io/dflowprotocol/endorsement-server:latest.

#### Get the Docker image
```console
$ docker pull ghcr.io/dflowprotocol/endorsement-server:latest
```
Alternatively, you can build the Docker image by running the following from the server directory:
```console
$ docker build --tag ghcr.io/dflowprotocol/endorsement-server:latest .
```

#### Generate an endorsement key
In this example, we write the endorsement key to the host's file system at `$(pwd)/endorsement-server-config/endorsementKey.json`.
```console
$ mkdir endorsement-server-config
$ docker run --mount type=bind,source=$(pwd)/endorsement-server-config,target=/app/config/ \
    ghcr.io/dflowprotocol/endorsement-server:latest key generate --outfile /app/config/endorsementKey.json
```

#### Run the endorsement server
In this example, we run the endorsement server using the endorsement key generated in the previous step.
```console
$ docker run -itp 8082:8082 \
    --mount type=bind,source=$(pwd)/endorsement-server-config,target=/app/config/ \
    ghcr.io/dflowprotocol/endorsement-server:latest start --endorsement-key-path /app/config/endorsementKey.json
```

## Endorsement Server API
### GET /endorsement

#### Request
You must specify the retail trader's wallet address as a query parameter in your request if the endorsement will be used to request a firm quote. If you specify a platform fee in basis points and a platform fee receiver, quotes fetched using the endorsement will include a platform fee that is paid to the platform fee receiver. The following parameters may be specified as URL query parameters:

| Parameter | Description |
| - | - |
| retailTrader | Optional public key of the retail trader's wallet on the settlement network, encoded using the encoding scheme used for wallet addresses on the settlement network. Must be specified if the endorsement will be used to request a firm quote. |
| platformFeeBps | Optional platform fee amount in basis points. Fractional basis points are not supported. |
| platformFeeReceiver | Optional public key of the platform fee receiver's wallet on the settlement network, encoded using the encoding scheme used for wallet addresses on the settlement network. |
| sendToken | Optional send token address. If specified, the endorsement can only be used to request a quote where the retail trader sends the specified token. |
| receiveToken | Optional receive token address. If specified, the endorsement can only be used to request a quote where the retail trader receives the specified token. |
| sendQty | Optional send quantity, specified as a fixed-point number. If specified, if the endorsement can only be used to request a quote where the retail trader sends exactly this quantity of the send token. Cannot be specified if the send token is unspecified. Cannot be specified if the max send quantity is specified. |
| maxSendQty | Optional maximum send quantity, specified as a fixed-point number. If specified, if the endorsement can only be used to request a quote where the retail trader sends at most this quantity of the send token. Cannot be specified if the send token is unspecified. Cannot be specified if the send quantity is specified. |

##### cURL
```console
$ curl --location 'localhost:8082/endorsement?retailTrader=0x7251a7e0664FBB7691cA5951eD2B2A340Da07175'
```

##### TypeScript
```ts
// Use your endorsement server's URL
const endorsementServerURL = "http://localhost:8082/endorsement";
const walletAddress = "0x7251a7e0664FBB7691cA5951eD2B2A340Da07175";
const endorsementURL = `${endorsementServerURL}?retailTrader=${walletAddress}`;
const endorsement = await(await fetch(endorsementURL)).json();
```

##### cURL with platform fee
```console
$ curl --location 'localhost:8082/endorsement?retailTrader=0x7251a7e0664FBB7691cA5951eD2B2A340Da07175&platformFeeBps=85&platformFeeReceiver=0xA82c0A88fC0F1cD41F032EEEc37b06a3c6957e13'
```

##### TypeScript with platform fee
```ts
// Use your endorsement server's URL
const endorsementServerURL = "http://localhost:8082/endorsement";
const walletAddress = "0x7251a7e0664FBB7691cA5951eD2B2A340Da07175";
const platformFeeBps = 85;
const platformFeeReceiver = "0xA82c0A88fC0F1cD41F032EEEc37b06a3c6957e13";
const endorsementURL = `${endorsementServerURL}?retailTrader=${walletAddress}&platformFeeBps=${platformFeeBps}&platformFeeReceiver=${platformFeeReceiver}`;
const endorsement = await(await fetch(endorsementURL)).json();
```

#### Response
The response contains the following endorsement object that your client code will include when making a quote request or `sendTransaction` request via the DFlow Swap API. The DFlow network will verify that the request is properly endorsed if it is routed via an order flow auction.

```jsonc
{
  // Base58-encoded endorsement key public key used to sign the endorsement message
  "endorser": "string",
  // Base64-encoded Ed25519 signature of "{id},{expirationTime},{data}"
  "signature": "string",
  // Unique identifier for the endorsement
  "id": "string",
  // Expiration time as UTC. Number of seconds since Jan 1, 1970 00:00:00 UTC.
  "expirationTimeUTC": "integer",
  // The endorsement's data
  "data": "string",
}
```

### POST /paymentInLieuApproval
The `paymentInLieuApproval` endpoint is used to accept a payment in lieu. The request contains the payment in lieu token returned by the signatory server API and the response contains the approval that the signatory server requires to remit a payment in lieu.

#### Request
Specify the payment in lieu token returned by the signatory server API in the request body.
```json
{
    "paymentInLieuToken": {
        "issuer": "2AGChJgTw7BfaxhZCNpZwEfMYLVTEpQiBx2rmg21JS6n",
        "signature": "HA06SJxFc/khyqu/1vNVk9AvyiRCMfnCiA7Yy1eWRcPsgzLq515cIqhPtD/90+IRKlpKQRCSMEAU4Qb+fxoHDw==",
        "id": "f744627b-56c8-4e09-98e5-c77d969211c0",
        "notional": 333,
        "auctionId": 0,
        "auctionEpoch": 2,
        "endorsement": {
            "endorser": "endsMtTJP7W4cHe2szQ4DUTvW9xdtTXtBGtscgXsGsK",
            "signature": "kjIntjj5FEModvGHVoPk3cIf/HaVa6LpvmaVuluINzdgXNx8ErnXtGq20A/9H564Ae+Kvuik7aYMPZydS6jOCA==",
            "id": "xBwyBCFu2Qk=",
            "expirationTimeUTC": 1687534328,
            "data": "1|rtFMmRrBUKnz6hXm2KfEQBK7GLMq8ziHCt9yZrEMmF7|||||"
        }
    }
}
```

#### Response
The response contains the endorser's approval of the payment in lieu.
```json
{
    "approver": "endsMtTJP7W4cHe2szQ4DUTvW9xdtTXtBGtscgXsGsK",
    "approval": "sWjfnnPFjSQpHlCGXlAWrdCYAjbfgvZJNZ7NVAhH8qwV9Xv0Ql5pFqCMdudCqfRN8ZvpCvRIfk1TiPHiGPg7AA=="
}
```

## Configuration
The following walks through the endorsement server's various configuration options. These configuration options can be set via the endorsement server's CLI, by using a config file, or via environment variables. Options specified via the CLI take precedence over options specified in a config file. Options specified via environment variables take least precedence.

| CLI option | Config file field | Environment variable | Type | Description | Example value |
| - | - | - | - | - | - |
| `--config` | | | string | Path to the config file | ./config.yaml |
| `--endorsement-key-path` | `endorsementKeyPath` | | string | Path to the endorsement key file | ./endorsementKey.json |
| | | `ENDORSEMENT_KEY` | string | Endorsement private key as a JSON string | [242,113,180,...,80,173] |
| `--expiration-in-seconds` | `expirationInSeconds` | | integer | Each endorsement expires this many seconds after it is issued | 120 |
| `--disable-payment-in-lieu-approval` | `disablePaymentInLieuApproval` | | boolean | Disable payment in lieu approval endpoint | true |
| `--server.*` | `server` | | object | Server configuration options including port and CORS allowed origin |

#### Example config file
```yaml
endorsementKeyPath: ./endorsementKey.json
server:
    port: 8082
    cors:
        origin: "*"
```

## Run using Cargo
While we recommend using Docker to run the endorsement server, it can also be run using Cargo.

#### Build and run
From the server directory, run:
```console
$ cargo run -- --help
```

#### Generate an endorsement key
From the server directory, run:
```console
$ cargo run -- key generate
```

#### Run the endorsement server
In this example, we run the endorsement server using the endorsement key generated in the previous step. From the server directory, run:
```console
$ cargo run -- start --endorsement-key-path endorsementKey.json
```
