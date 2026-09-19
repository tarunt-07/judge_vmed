PRAGMA foreign_keys = ON;

-- Admins are identified by email, judges by username. The CHECK keeps that fixed.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK(role IN ('admin', 'judge')),
  email TEXT UNIQUE COLLATE NOCASE,
  username TEXT UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 120),
  clerk_user_id TEXT UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (role = 'admin' AND email IS NOT NULL AND username IS NULL)
    OR (role = 'judge' AND username IS NOT NULL AND email IS NULL AND clerk_user_id IS NOT NULL)
  )
);
