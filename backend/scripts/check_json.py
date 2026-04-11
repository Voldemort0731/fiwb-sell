import sqlite3
import json
import os

def check_materials():
    db_path = "fiwb.db"
    if not os.path.exists(db_path):
        print("db not found")
        return
    
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("SELECT id, attachments FROM materials")
    rows = c.fetchall()
    
    invalid_count = 0
    for row_id, attachments in rows:
        if attachments:
            try:
                json.loads(attachments)
            except Exception as e:
                print(f"Row {row_id} has invalid JSON: {e}")
                print(f"Content: {attachments}")
                invalid_count += 1
    
    print(f"\nTotal invalid rows found: {invalid_count}")
    conn.close()

if __name__ == "__main__":
    check_materials()
