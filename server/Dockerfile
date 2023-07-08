# docker build --tag endorsement-server:latest .

FROM rust:1.70.0-slim-buster as rust-dev-env
RUN rustup component add clippy rustfmt
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && apt-get clean && rm -rf /var/lib/apt/lists/*


FROM rust-dev-env as build-dependencies
# Build and cache dependencies
RUN USER=root cargo new --bin endorsement-server
WORKDIR /endorsement-server
COPY ./Cargo.lock ./Cargo.lock
COPY ./Cargo.toml ./Cargo.toml
RUN cargo build --release
RUN rm -rf src target/release/endorsement-server* target/release/deps/endorsement_server*


FROM build-dependencies as build
COPY ./src ./src
RUN cargo build --release


FROM build as check
RUN cargo clippy --all-targets --all-features -- -D warnings
RUN cargo test --release
RUN cargo fmt --check


FROM gcr.io/distroless/cc as release
COPY --from=build /endorsement-server/target/release/endorsement-server .
STOPSIGNAL SIGINT
ENTRYPOINT ["./endorsement-server"]
