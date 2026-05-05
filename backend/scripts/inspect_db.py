import sqlite3
import os

db_path = "/Users/owaissayyed/Github Repos/new-chatbot/new-chatbot/backend/fiwb.db"

if not os.path.exists(db_path):
    print(f"DB not found at {db_path}")
    # try app.db
    db_path = "/Users/owaissayyed/Github Repos/new-chatbot/new-chatbot/backend/app.db"

print(f"Connecting to {db_path}...")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT id, title, source, length(file_content), mime_type, external_id FROM materials WHERE source = 'manual_upload'")
rows = cursor.fetchall()

print("Manual Uploads in DB:")
for row in rows:
    print(f"ID: {row[0]}, Title: {row[1]}, Source: {row[2]}, Size: {row[3]}, Mime: {row[4]}, ExtID: {row[5]}")

conn.close()
