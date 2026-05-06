import asyncio
import sqlite3
import os

async def migrate():
    db_path = "./app.db"
    if not os.path.exists(db_path):
        print("Database not found, skipping migration (init_db will create it).")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Add columns to users table
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'student'")
        print("Added 'role' column to users table.")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e):
            print("'role' column already exists.")
        else:
            print(f"Error adding 'role' column: {e}")

    try:
        cursor.execute("ALTER TABLE users ADD COLUMN mastery_elo INTEGER DEFAULT 1000")
        print("Added 'mastery_elo' column to users table.")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e):
            print("'mastery_elo' column already exists.")
        else:
            print(f"Error adding 'mastery_elo' column: {e}")

    conn.commit()
    conn.close()
    print("Migration completed.")

if __name__ == "__main__":
    asyncio.run(migrate())
