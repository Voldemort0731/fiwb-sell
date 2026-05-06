import asyncio
from app.models.database import AsyncSessionLocal, User, Course, Material
from sqlalchemy import select

async def seed():
    async with AsyncSessionLocal() as db:
        # Create Professor
        prof_res = await db.execute(select(User).where(User.id == 1))
        prof = prof_res.scalar_one_or_none()
        if not prof:
            prof = User(id=1, email="prof@fiwb.edu", name="Professor Smith", role="professor")
            db.add(prof)
        else:
            prof.role = "professor"

        # Create Student
        std_res = await db.execute(select(User).where(User.id == 2))
        std = std_res.scalar_one_or_none()
        if not std:
            std = User(id=2, email="student@fiwb.edu", name="Alice Student", role="student")
            db.add(std)

        await db.commit()
        
        # Create a sample course for the professor
        course_res = await db.execute(select(Course).where(Course.user_id == 1))
        if not course_res.scalar_one_or_none():
            course = Course(user_id=1, name="CS101: Intro to AI", description="Foundational AI concepts")
            db.add(course)
            await db.commit()
            print("Seeded Professor, Student, and Course.")
        else:
            print("DB already seeded.")

if __name__ == "__main__":
    asyncio.run(seed())
