FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy bot code
COPY *.py .
COPY sample_cookies.json .

# Create data directory for database
RUN mkdir -p /app/data

# Set environment variables (can be overridden)
ENV DB_PATH=/app/data/netflix_cookies.db
ENV PYTHONUNBUFFERED=1

# Expose port (not needed for Telegram bot but good practice)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import sqlite3; conn = sqlite3.connect('/app/data/netflix_cookies.db'); conn.close()" || exit 1

# Run the bot
CMD ["python", "main.py"]
