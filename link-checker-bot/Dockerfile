FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy bot code
COPY *.py .

# Create data directory
RUN mkdir -p /app/data

ENV DB_PATH=/app/data/link_checker.db
ENV PYTHONUNBUFFERED=1

EXPOSE 8443

CMD ["python", "main.py"]
