CREATE TABLE rounds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(name) BETWEEN 1 AND 120),
  position INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'open', 'closed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE criteria (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE CHECK(length(name) BETWEEN 1 AND 120),
  max_marks INTEGER NOT NULL CHECK(max_marks BETWEEN 1 AND 1000),
  weight REAL NOT NULL CHECK(weight > 0 AND weight <= 1000),
  position INTEGER NOT NULL,
  UNIQUE(round_id, name)
);
CREATE INDEX criteria_round ON criteria(round_id, position);

-- Which teams take part in a round. Each round picks its own teams.
CREATE TABLE round_teams (
  round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  PRIMARY KEY (round_id, team_id)
);
CREATE INDEX round_teams_team ON round_teams(team_id);
