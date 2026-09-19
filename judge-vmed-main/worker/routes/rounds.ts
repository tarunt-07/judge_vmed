import { Hono } from 'hono';
import type { Round, RoundStatus } from '../../shared/api';
import { requireRole } from '../auth';
import { parseCriteria } from '../criteria';
import { fail, isForeignKeyViolation, isUniqueViolation, newId, readBody, str } from '../lib';
import type { AppEnv } from '../types';

const MAX_TEAMS_PER_ROUND = 2000;

interface RoundRow {
  id: string;
  name: string;
  position: number;
  status: RoundStatus;
  created_at: string;
}

interface CriterionRow {
  id: string;
  round_id: string;
  name: string;
  max_marks: number;
  weight: number;
}

export async function loadRounds(db: D1Database): Promise<Round[]> {
  const [rounds, criteria, links, counts] = await db.batch([
    db.prepare('SELECT * FROM rounds ORDER BY position'),
    db.prepare('SELECT * FROM criteria ORDER BY position'),
    db.prepare('SELECT round_id, team_id FROM round_teams'),
    db.prepare('SELECT round_id, COUNT(*) AS n FROM evaluations GROUP BY round_id'),
  ]);
  const evaluationCounts = new Map(
    (counts.results as { round_id: string; n: number }[]).map((row) => [row.round_id, row.n]),
  );
  return (rounds.results as RoundRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    position: row.position,
    status: row.status,
    createdAt: row.created_at,
    criteria: (criteria.results as CriterionRow[])
      .filter((c) => c.round_id === row.id)
      .map((c) => ({ id: c.id, name: c.name, maxMarks: c.max_marks, weight: c.weight })),
    teamIds: (links.results as { round_id: string; team_id: string }[])
      .filter((link) => link.round_id === row.id)
      .map((link) => link.team_id),
    evaluationCount: evaluationCounts.get(row.id) ?? 0,
  }));
}

export async function loadRound(db: D1Database, id: string): Promise<Round> {
  const [roundRows, criteria, links, counts] = await db.batch([
    db.prepare('SELECT * FROM rounds WHERE id = ?').bind(id),
    db.prepare('SELECT * FROM criteria WHERE round_id = ? ORDER BY position').bind(id),
    db.prepare('SELECT team_id FROM round_teams WHERE round_id = ?').bind(id),
    db.prepare('SELECT COUNT(*) AS n FROM evaluations WHERE round_id = ?').bind(id),
  ]);
  const row = (roundRows.results as RoundRow[])[0];
  if (!row) fail(404, 'Round not found.');
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    status: row.status,
    createdAt: row.created_at,
    criteria: (criteria.results as CriterionRow[]).map((c) => ({
      id: c.id,
      name: c.name,
      maxMarks: c.max_marks,
      weight: c.weight,
    })),
    teamIds: (links.results as { team_id: string }[]).map((link) => link.team_id),
    evaluationCount: (counts.results as { n: number }[])[0]?.n ?? 0,
  };
}

export async function loadOpenRounds(db: D1Database) {
  const [rounds, criteria] = await db.batch([
    db.prepare("SELECT id, name FROM rounds WHERE status = 'open' ORDER BY position"),
    db.prepare(
      "SELECT c.* FROM criteria c JOIN rounds r ON r.id = c.round_id WHERE r.status = 'open' ORDER BY c.position",
    ),
  ]);
  return (rounds.results as { id: string; name: string }[]).map((row) => ({
    id: row.id,
    name: row.name,
    criteria: (criteria.results as CriterionRow[])
      .filter((c) => c.round_id === row.id)
      .map((c) => ({ id: c.id, name: c.name, maxMarks: c.max_marks, weight: c.weight })),
  }));
}

export const rounds = new Hono<AppEnv>();
rounds.use('*', requireRole('admin'));

rounds.get('/', async (c) => c.json(await loadRounds(c.env.DB)));

rounds.post('/', async (c) => {
  const body = await readBody(c);
  const name = str(body, 'name', 'Round name', 1, 120);
  const id = newId();
  try {
    await c.env.DB.prepare(
      'INSERT INTO rounds (id, name, position) SELECT ?, ?, COALESCE(MAX(position), 0) + 1 FROM rounds',
    )
      .bind(id, name)
      .run();
  } catch (err) {
    if (isUniqueViolation(err)) fail(409, 'A round with this name already exists.');
    throw err;
  }
  return c.json(await loadRound(c.env.DB, id), 201);
});

rounds.patch('/:id', async (c) => {
  const body = await readBody(c);
  const round = await loadRound(c.env.DB, c.req.param('id'));

  let name = round.name;
  if (body.name !== undefined) name = str(body, 'name', 'Round name', 1, 120);

  let status = round.status;
  if (body.status !== undefined) {
    if (body.status !== 'open' && body.status !== 'closed') fail(400, 'Status must be open or closed.');
    if (body.status === 'open' && (round.criteria.length === 0 || round.teamIds.length === 0)) {
      fail(400, 'Add criteria and teams before opening this round.');
    }
    status = body.status;
  }

  try {
    await c.env.DB.prepare(
      "UPDATE rounds SET name = ?, status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
      .bind(name, status, round.id)
      .run();
  } catch (err) {
    if (isUniqueViolation(err)) fail(409, 'A round with this name already exists.');
    throw err;
  }
  return c.json(await loadRound(c.env.DB, round.id));
});

rounds.put('/:id/criteria', async (c) => {
  const body = await readBody(c);
  const round = await loadRound(c.env.DB, c.req.param('id'));
  if (round.evaluationCount > 0) {
    fail(409, 'Criteria are locked because judging has started. Reset all scores in Results to change them.');
  }
  const criteria = parseCriteria(body.criteria);

  const db = c.env.DB;
  // The guard repeats the lock inside the batch in case a score lands after the check above.
  const guard = db
    .prepare(
      "SELECT CASE WHEN EXISTS (SELECT 1 FROM evaluations WHERE round_id = ?) THEN json_extract('x', '$') END",
    )
    .bind(round.id);
  try {
    await db.batch([
      guard,
      db.prepare('DELETE FROM criteria WHERE round_id = ?').bind(round.id),
      ...criteria.map((item, index) =>
        db
          .prepare('INSERT INTO criteria (id, round_id, name, max_marks, weight, position) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(newId(), round.id, item.name, item.maxMarks, item.weight, index + 1),
      ),
    ]);
  } catch (err) {
    if (err instanceof Error && err.message.includes('malformed JSON')) {
      fail(409, 'Criteria are locked because judging has started. Reset all scores in Results to change them.');
    }
    throw err;
  }
  return c.json(await loadRound(db, round.id));
});

rounds.put('/:id/teams', async (c) => {
  const body = await readBody(c);
  const round = await loadRound(c.env.DB, c.req.param('id'));
  if (!Array.isArray(body.teamIds) || body.teamIds.some((id) => typeof id !== 'string')) {
    fail(400, 'teamIds must be a list of team IDs.');
  }
  const teamIds = [...new Set(body.teamIds as string[])];
  if (teamIds.length > MAX_TEAMS_PER_ROUND) fail(400, `A round can have at most ${MAX_TEAMS_PER_ROUND} teams.`);

  const db = c.env.DB;
  const [teamRows, judgedRows] = await db.batch([
    db.prepare('SELECT id FROM teams'),
    db
      .prepare('SELECT t.id, t.name FROM evaluations e JOIN teams t ON t.id = e.team_id WHERE e.round_id = ?')
      .bind(round.id),
  ]);
  const known = new Set((teamRows.results as { id: string }[]).map((row) => row.id));
  if (teamIds.some((id) => !known.has(id))) fail(400, 'Some selected teams no longer exist. Reload and try again.');

  const selected = new Set(teamIds);
  const removedJudged = (judgedRows.results as { id: string; name: string }[]).filter((row) => !selected.has(row.id));
  if (removedJudged.length > 0) {
    fail(409, `These teams already have scores in this round and cannot be removed: ${removedJudged.map((row) => row.name).join(', ')}.`);
  }

  await db.batch([
    db.prepare('DELETE FROM round_teams WHERE round_id = ?').bind(round.id),
    ...teamIds.map((teamId) =>
      db.prepare('INSERT INTO round_teams (round_id, team_id) VALUES (?, ?)').bind(round.id, teamId),
    ),
  ]);
  return c.json(await loadRound(db, round.id));
});

rounds.delete('/:id', async (c) => {
  try {
    const result = await c.env.DB.prepare('DELETE FROM rounds WHERE id = ?').bind(c.req.param('id')).run();
    if (result.meta.changes === 0) fail(404, 'Round not found.');
  } catch (err) {
    if (isForeignKeyViolation(err)) fail(409, 'This round has scores. Reset them in Results before deleting it.');
    throw err;
  }
  return c.body(null, 204);
});
