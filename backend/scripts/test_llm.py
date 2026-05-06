import os
import asyncio
from dotenv import load_dotenv
import litellm

# Load the keys we just wrote
load_dotenv(dotenv_path="d:/ANTHROPIC HACKATHON/new_chatbot/backend/.env")

async def test_openai():
    print(f"Testing LLM with Provider: {os.getenv('LLM_PROVIDER')}")
    try:
        response = await litellm.acompletion(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": "Hello! Confirm you are working."}]
        )
        print("SUCCESS: OpenAI responded!")
        print(f"Response: {response.choices[0].message.content}")
    except Exception as e:
        print(f"FAILED: {e}")

if __name__ == "__main__":
    asyncio.run(test_openai())
