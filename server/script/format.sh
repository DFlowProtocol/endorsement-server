#!/bin/bash -xe
{ set +x; } 2>/dev/null
PROJECT_DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && cd .. && pwd )
set -x

(cd "$PROJECT_DIR" && \
    docker build --target rust-dev-env --tag endorsement-server-rust-dev-env:latest . 2>/dev/null)
docker run --rm --mount type=bind,source="$PROJECT_DIR",target=/app --workdir /app \
    endorsement-server-rust-dev-env:latest cargo fmt
