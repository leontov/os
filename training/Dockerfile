# syntax=docker/dockerfile:1.5

FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential cmake && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN cmake -S . -B build -DKOLIBRI_ENABLE_TESTS=OFF && \
    cmake --build build --target kolibri_sim

ENTRYPOINT ["./build/kolibri_sim", "soak"]
CMD ["--minutes", "60"]
