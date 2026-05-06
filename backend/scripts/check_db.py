import asyncio
from app.models.database import engine, User, Course, Material, Enrollment, PerformanceMetric, AsyncSessionLocal
from sqlalchemy import select

async def check():
    async with AsyncSessionLocal() as db:
        users = (await db.execute(select(User))).scalars().all()
        print(f"Users: {len(users)}")
        for u in users:
            print(f" - {u.email} ({u.role})")
            
        courses = (await db.execute(select(Course))).scalars().all()
        print(f"Courses: {len(courses)}")
        for c in courses:
            print(f" - {c.name} (ID: {c.id}, Professor ID: {c.user_id})")
            
        enrollments = (await db.execute(select(Enrollment))).scalars().all()
        print(f"Enrollments: {len(enrollments)}")
        for e in enrollments:
            print(f" - Student {e.student_id} -> Course {e.course_id}")
            
        materials = (await db.execute(select(Material))).scalars().all()
        print(f"Materials: {len(materials)}")
        
        metrics = (await db.execute(select(PerformanceMetric))).scalars().all()
        print(f"Metrics: {len(metrics)}")

if __name__ == "__main__":
    asyncio.run(check())
