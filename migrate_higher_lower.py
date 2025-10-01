"""
Migration script to add last_played_higher_lower column to users table.
Run this once to update your database.
"""
import sqlite3
import os

# Path to the database
DB_PATH = os.path.join('instance', 'tamagochi.sqlite')

def migrate():
    """Add last_played_higher_lower column to users table"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(users)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'last_played_higher_lower' not in columns:
            print("Adding last_played_higher_lower column to users table...")
            cursor.execute("ALTER TABLE users ADD COLUMN last_played_higher_lower DATETIME")
            conn.commit()
            print("[SUCCESS] Migration successful! Column added.")
        else:
            print("[INFO] Column already exists. No migration needed.")
        
    except Exception as e:
        print(f"[ERROR] Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    if not os.path.exists(DB_PATH):
        print(f"❌ Database not found at {DB_PATH}")
        exit(1)
    
    migrate()
