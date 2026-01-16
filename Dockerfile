FROM python:3.13-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  gnupg \
  wget \
  build-essential \
  libffi-dev \
  libssl-dev \
  && rm -rf /var/lib/apt/lists/*

# Install Ollama (official installer)
RUN curl -fsSL https://ollama.ai/install.sh | sh

WORKDIR /app

COPY requirements.txt /app/
RUN pip install --no-cache-dir --upgrade pip setuptools wheel \
  && pip install --no-cache-dir -r requirements.txt

EXPOSE 11434

# Run Ollama HTTP server so the API is available at :11434
CMD ["ollama", "serve", "--host", "0.0.0.0"]
CMD ["ollama", "run", "qwen3-vl:8b", "--keepalive -1m"]