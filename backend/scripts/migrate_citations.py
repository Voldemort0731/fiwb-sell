import sqlite3
import os

db_path = "d:\\FIWB NEW\\new-chatbot\\backend\\fiwb.db"
# Also check for app.db just in case as it was mentioned in models
db_path_alt = "d:\\FIWB NEW\\new-chatbot\\backend\\app.db"

def migrate(path):
    if not os.path.exists(path):
        print(f"Skipping {path}, file not found.")
        return
        
    print(f"Migrating {path}...")
    conn = sqlite3.connect(path)
    cursor = conn.cursor()
    
    try:
        # Check if citations column exists
        cursor.execute("PRAGMA table_info(chat_messages)")
        columns = [col[1] for col in cursor.fetchall()]
        if 'citations' not in columns:
            print("Adding 'citations' column to 'chat_messages' table...")
            cursor.execute("ALTER TABLE chat_messages ADD COLUMN citations TEXT")
            conn.commit()
            print("Successfully added column.")
        else:
            print("Column 'citations' already exists.")
    except Exception as e:
        print(f"Error migrating {path}: {e}")
    finally:
        conn.close()

migrate(db_path)
migrate(db_path_alt)
