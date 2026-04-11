import sqlite3
import os

def check_material():
    db_path = "fiwb.db"
    if not os.path.exists(db_path):
        print("DB not found")
        return
    
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    # Check for the struct handout
    c.execute("SELECT title, content_preview, full_text FROM materials WHERE title LIKE '%struct%'")
    row = c.fetchone()
    
    if row:
        title, preview, full_text = row
        print(f"Title: {title}")
        print(f"Preview: {preview[:100] if preview else 'Empty'}")
        print(f"Full Text Length: {len(full_text) if full_text else 0}")
        if full_text:
             print(f"Full text snippet: {full_text[:200]}")
    else:
        print("Struct material not found in DB.")
    
    conn.close()

if __name__ == "__main__":
    check_material()
