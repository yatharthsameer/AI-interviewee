# Production Dockerfile for AI Interview MVP Backend
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NODE_ENV=production

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Create app user (security best practice)
RUN groupadd -g 1001 appgroup && \
    useradd -r -u 1001 -g appgroup appuser

# Set work directory
WORKDIR /app

# Create necessary directories and set permissions
RUN mkdir -p /app/data && \
    chown -R appuser:appgroup /app

# Copy requirements and install dependencies
COPY production_requirements.txt .
RUN pip install --no-cache-dir -r production_requirements.txt

# Copy application code
COPY . .

# Remove development files
RUN rm -f requirements.txt env.example users.db *.pyc

# Set ownership
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 5002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5002/api/admin/stats || exit 1

# Production command using gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:5002", "--workers", "2", "--threads", "4", "--timeout", "120", "server:APP"] 