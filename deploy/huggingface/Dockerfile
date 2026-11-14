# Backend container for a Hugging Face Space (Docker SDK).
# deploy.sh copies this file next to backend/api.py, backend/pipeline/ and
# backend/requirements.txt, so paths below are relative to that folder.

FROM python:3.13-slim

# Spaces run the container as user 1000; give it a home and own the app folder
# so the pipeline can write its cache to ./output.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1
WORKDIR $HOME/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

COPY --chown=user api.py ./
COPY --chown=user pipeline ./pipeline

# Spaces send traffic to port 7860 through an HTTPS proxy. --proxy-headers makes
# the API build https:// PNG links from the proxy's X-Forwarded-Proto header.
EXPOSE 7860
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "7860", \
     "--proxy-headers", "--forwarded-allow-ips", "*"]
