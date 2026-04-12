import asyncio
from app.intelligence.retrieval import RetrievalOrchestrator

async def test():
    orchestrator = RetrievalOrchestrator('owaissayyed2007@gmail.com')
    ctx = await orchestrator.retrieve_context('Summarize the lec-11', 'academic_question', [])
    for c in ctx.get('course_context', []):
        print('Chunk:', c.get('metadata'))

if __name__ == '__main__':
    asyncio.run(test())
