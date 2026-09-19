-- Team name is the import key. Columns beyond name and lead are kept in extra_json.
CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(name) BETWEEN 1 AND 120),
  team_lead TEXT NOT NULL CHECK(length(team_lead) BETWEEN 1 AND 120),
  extra_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(extra_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
