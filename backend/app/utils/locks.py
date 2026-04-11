import asyncio

# Shared lock for Google API calls (google-api-python-client is not thread-safe)
GLOBAL_API_LOCK = asyncio.Lock()
