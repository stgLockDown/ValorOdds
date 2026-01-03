#!/bin/bash

# Railway.com startup script

echo "🚀 Starting Valor Odds Website on Railway..."

# Install http-server globally if not already installed
if ! command -v http-server &> /dev/null
then
    echo "📦 Installing http-server..."
    npm install -g http-server
fi

# Get the PORT from Railway environment variable (Railway provides this)
PORT=${PORT:-8080}

echo "🌐 Starting server on port $PORT..."

# Start http-server with the following options:
# -p $PORT : Use Railway's provided port
# -a 0.0.0.0 : Bind to all network interfaces (required for Railway)
# -c-1 : Disable caching for development
# --cors : Enable CORS
http-server . -p $PORT -a 0.0.0.0 -c-1 --cors

echo "✅ Server started successfully!"
