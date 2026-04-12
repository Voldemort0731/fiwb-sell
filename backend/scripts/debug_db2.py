import sqlite3
import pprint

conn = sqlite3.connect(r'd:\FIWB NEW\new-chatbot\backend\fiwb.db')
cur = conn.cursor()
cur.execute("SELECT id, title, external_id, CASE WHEN file_content IS NOT NULL THEN 1 ELSE 0 END FROM materials WHERE title LIKE '%Convergence%'")
print('id | title | ext_id | has_content')
for row in cur.fetchall():
    print(row)
