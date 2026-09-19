-- One evaluation per team per round. The UNIQUE constraint is what stops a second judge.
-- Foreign keys have no cascade, so a scored team or round cannot be deleted until its scores are reset.
CREATE TABLE evaluations (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES rounds(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  judge_id TEXT NOT NULL REFERENCES accounts(id),
  -- Snapshot of each criterion (name, max marks, weightage) with the marks given.
  marks_json TEXT NOT NULL CHECK(json_valid(marks_json)),
  total REAL NOT NULL CHECK(total BETWEEN 0 AND 100),
  remarks TEXT NOT NULL DEFAULT '' CHECK(length(remarks) <= 2000),
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(round_id, team_id)
);
CREATE INDEX evaluations_judge ON evaluations(judge_id);
