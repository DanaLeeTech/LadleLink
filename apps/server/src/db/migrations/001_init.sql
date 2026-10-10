CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  servings REAL NOT NULL DEFAULT 1,
  steps TEXT NOT NULL,
  ingredients TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  photo_path TEXT,
  source_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
