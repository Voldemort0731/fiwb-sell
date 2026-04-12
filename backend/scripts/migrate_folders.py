import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), '..', 'app.db')

def upgrade():
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return
        
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if column exists
        cursor.execute("PRAGMA table_info(chat_threads)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if "folder_name" not in columns:
            print("Adding folder_name column to chat_threads...")
            cursor.execute("ALTER TABLE chat_threads ADD COLUMN folder_name VARCHAR(255)")
            conn.commit()
            print("Successfully added folder_name.")
        else:
            print("fast-forward: folder_name column already exists.")
            
    except Exception as e:
        print(f"Migration failed: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    upgrade()
