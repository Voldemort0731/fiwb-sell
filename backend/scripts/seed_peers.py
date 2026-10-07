import asyncio
from app.models.database import AsyncSessionLocal, User, PerformanceMetric, Course
from sqlalchemy import select
from datetime import datetime, timedelta, timezone

async def seed_peers():
    async with AsyncSessionLocal() as db:
        # Get Course ID for Course 1 (Advanced Neural Networks)
        course_res = await db.execute(select(Course).where(Course.name == "Advanced Neural Networks"))
        course_nn = course_res.scalar_one_or_none()
        course_nn_id = course_nn.id if course_nn else 1

        # Get Course ID for Course 2 (Quantum Computing 101)
        course_q_res = await db.execute(select(Course).where(Course.name == "Quantum Computing 101"))
        course_q = course_q_res.scalar_one_or_none()
        course_q_id = course_q.id if course_q else 2

        # Get Course ID for Course 3 (Philosophy of Mind)
        course_p_res = await db.execute(select(Course).where(Course.name == "Philosophy of Mind"))
        course_p = course_p_res.scalar_one_or_none()
        course_p_id = course_p.id if course_p else 3

        peers_data = [
            {
                "email": "jean.grey@university.edu",
                "name": "Jean Grey",
                "metrics": [
                    # Strong in Backpropagation (Scott's weakness), and Quantum Superposition
                    {"concept": "Backpropagation", "value": 0.88, "history": [0.35, 0.60, 0.88]},
                    {"concept": "Quantum Superposition", "value": 0.92, "history": [0.80, 0.92]},
                    {"concept": "Philosophy of Mind (Dualism)", "value": 0.35, "history": [0.35]}
                ]
            },
            {
                "email": "logan.howlett@university.edu",
                "name": "Logan Howlett",
                "metrics": [
                    # Strong in Philosophy of Mind (Dualism), weak in Quantum Superposition
                    {"concept": "Philosophy of Mind (Dualism)", "value": 0.85, "history": [0.50, 0.85]},
                    {"concept": "Loss Functions", "value": 0.78, "history": [0.78]},
                    {"concept": "Quantum Superposition", "value": 0.20, "history": [0.20]}
                ]
            },
            {
                "email": "ororo.munroe@university.edu",
                "name": "Ororo Munroe",
                "metrics": [
                    # Strong in Optimizer Algorithms and Qubits & Gates, weak in Backpropagation
                    {"concept": "Optimizer Algorithms", "value": 0.90, "history": [0.90]},
                    {"concept": "Qubits & Gates", "value": 0.85, "history": [0.50, 0.85]},
                    {"concept": "Backpropagation", "value": 0.38, "history": [0.38]}
                ]
            },
            {
                "email": "hank.mccoy@university.edu",
                "name": "Hank McCoy",
                "metrics": [
                    # Strong in Backpropagation and Activation Functions, weak in Qubits & Gates
                    {"concept": "Backpropagation", "value": 0.95, "history": [0.45, 0.70, 0.95]},
                    {"concept": "Activation Functions", "value": 0.92, "history": [0.92]},
                    {"concept": "Qubits & Gates", "value": 0.45, "history": [0.45]}
                ]
            }
        ]

        now = datetime.now(timezone.utc)

        for p in peers_data:
            # Check if user already exists
            user_res = await db.execute(select(User).where(User.email == p["email"]))
            user = user_res.scalar_one_or_none()
            if not user:
                user = User(email=p["email"], name=p["name"], role="student", role_finalized=True)
                db.add(user)
                await db.flush()

            # Add metrics & their history
            for m in p["metrics"]:
                concept = m["concept"]
                # Determine correct course ID for the concept
                cid = course_nn_id
                if concept in ["Quantum Superposition", "Qubits & Gates"]:
                    cid = course_q_id
                elif concept in ["Philosophy of Mind (Dualism)", "Functionalism"]:
                    cid = course_p_id

                # Delete existing metrics to prevent clutter
                await db.execute(
                    PerformanceMetric.__table__.delete().where(
                        PerformanceMetric.user_id == user.id,
                        PerformanceMetric.concept == concept
                    )
                )

                # Add historical entries
                for idx, val in enumerate(m["history"]):
                    timestamp = now - timedelta(days=(len(m["history"]) - 1 - idx))
                    metric = PerformanceMetric(
                        user_id=user.id,
                        course_id=cid,
                        concept=concept,
                        value=val,
                        metric_type="concept_mastery",
                        timestamp=timestamp
                    )
                    db.add(metric)

        await db.commit()
        print("Successfully seeded peer students and performance metrics.")

if __name__ == "__main__":
    asyncio.run(seed_peers())
