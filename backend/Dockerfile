FROM python:3.11-slim

WORKDIR /app

RUN useradd --create-home --shell /bin/bash forge

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY app /app/app
COPY diagnostics /app/diagnostics
COPY evidence /app/evidence
COPY demo_repo /app/demo_repo

RUN chown -R forge:forge /app
USER forge

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
