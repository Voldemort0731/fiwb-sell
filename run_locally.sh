#!/bin/bash
# run_locally.sh - Startup script for FIWB Chatbot

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting FIWB Neural Academic Assistant...${NC}\n"

# Backend
echo -e "${GREEN}Starting FastAPI Backend on port 8002...${NC}"
cd backend
# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    echo "Installing backend dependencies..."
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

# Run backend in the background
./venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8002 &
BACKEND_PID=$!

# Frontend
echo -e "\n${GREEN}Starting Next.js Frontend on port 3000...${NC}"
cd ../frontend
# Install if node_modules is missing
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

# Run frontend
npm run dev &
FRONTEND_PID=$!

echo -e "\n${BLUE}Both servers are running!${NC}"
echo -e "Frontend: http://localhost:3000"
echo -e "Backend: http://localhost:8002\n"
echo -e "Press Ctrl+C to stop both servers."

# Wait for process termination
trap "kill $BACKEND_PID $FRONTEND_PID" SIGINT SIGTERM
wait
