import asyncio
from app.models.database import engine, Base, User, Course, Material, Enrollment, PerformanceMetric, AsyncSessionLocal, init_db
from sqlalchemy import select
import json
from datetime import datetime

async def seed():
    await init_db()
    async with AsyncSessionLocal() as db:
        # Check if we have any users
        user_res = await db.execute(select(User))
        user = user_res.scalar_one_or_none()
        
        if not user:
            # Create a mock professor and student
            prof = User(email="prof@university.edu", name="Prof. Xavier", role="professor", role_finalized=True)
            std = User(email="student@university.edu", name="Scott Summers", role="student", role_finalized=True)
            db.add_all([prof, std])
            await db.flush()
        else:
            # Use existing
            prof_res = await db.execute(select(User).where(User.role == "professor"))
            prof = prof_res.scalar_one_or_none()
            std_res = await db.execute(select(User).where(User.role == "student"))
            std = std_res.scalar_one_or_none()
            if not prof or not std:
                print("Missing professor or student in DB.")
                return

        # 2. Create courses
        courses = [
            {"name": "Advanced Neural Networks", "section": "CS401", "teacher": prof.name},
            {"name": "Quantum Computing 101", "section": "PH202", "teacher": prof.name},
            {"name": "Philosophy of Mind", "section": "HU105", "teacher": prof.name},
        ]
        
        for c_data in courses:
            existing = await db.execute(select(Course).where(Course.name == c_data["name"], Course.user_id == prof.id))
            if existing.scalar_one_or_none():
                continue
            
            course = Course(user_id=prof.id, **c_data, source="institutional")
            db.add(course)
            await db.flush()
            
            # Add some dummy materials
            mats = ["Syllabus", "Week 1: Fundamentals", "Week 2: Intermediate Concepts"]
            for m_title in mats:
                mat = Material(
                    user_id=prof.id,
                    course_id=course.id,
                    title=f"{c_data['name']} - {m_title}",
                    material_type="file",
                    source="institutional",
                    content_preview=f"Preview for {m_title}",
                    full_text=f"Full text for {m_title}"
                )
                db.add(mat)
            
            # 3. Create dummy student & enrollment
            std_res = await db.execute(select(User).where(User.role == "student"))
            student = std_res.scalar_one_or_none()
            if student:
                enrollment = Enrollment(student_id=student.id, course_id=course.id)
                db.add(enrollment)
                
                # Add some metrics
                metrics = [
                    {"concept": "Neural Networks", "value": 0.85},
                    {"concept": "Backpropagation", "value": 0.42},
                    {"concept": "Activation Functions", "value": 0.91}
                ] if c_data["name"] == "Advanced Neural Networks" else []
                
                for m in metrics:
                    metric = PerformanceMetric(
                        user_id=student.id,
                        course_id=course.id,
                        concept=m["concept"],
                        value=m["value"],
                        metric_type="concept_mastery"
                    )
                    db.add(metric)

        await db.commit()
        print("Seed successful. Professor dashboard should now be populated.")

if __name__ == "__main__":
    asyncio.run(seed())
