import sqlite3
import os

def check_db():
    db_path = "fiwb.db"
    if not os.path.exists(db_path):
        print("DB not found")
        return
    
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    print("--- Local DB Indexing Status ---")
    c.execute("SELECT count(*) FROM materials WHERE indexed_in_memsapien = 1")
    indexed_count = c.fetchone()[0]
    c.execute("SELECT count(*) FROM materials WHERE indexed_in_memsapien = 0")
    not_indexed_count = c.fetchone()[0]
    
    print(f"Indexed in Memsapien: {indexed_count}")
    print(f"Not Indexed: {not_indexed_count}")
    
    print("\nRecent Indexed Materials:")
    c.execute("SELECT title, material_type, external_id FROM materials WHERE indexed_in_memsapien = 1 LIMIT 10")
    for title, mtype, eid in c.fetchall():
        print(f"- [{mtype}] {title} (ID: {eid})")
    
    conn.close()

if __name__ == "__main__":
    check_db()
