import { Hono } from 'hono';
import type { ImportResult, Team } from '../../shared/api';
import { requireRole } from '../auth';
import { CsvError, DESC_KEY, MAX_DETAIL_CHARS, PS_KEY, parseTeamsCsv, teamDetails } from '../csv';
import { type Body, fail, isForeignKeyViolation, isUniqueViolation, newId, readBody, str } from '../lib';
import type { AppEnv } from '../types';

const MAX_CSV_CHARS = 1_000_000;

export interface TeamRow {
  id: string;
  name: string;
  team_lead: string;
  extra_json: string;
  created_at: string;
}

export function toTeam(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    teamLead: row.team_lead,
    extra: JSON.parse(row.extra_json) as Record<string, string>,
    createdAt: row.created_at,
  };
}

export const teams = new Hono<AppEnv>();
teams.use('*', requireRole('admin'));

teams.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM teams ORDER BY name COLLATE NOCASE').all<TeamRow>();
  return c.json(results.map(toTeam));
});

teams.post('/import', async (c) => {
  const body = await readBody(c);
  if (typeof body.csv !== 'string' || !body.csv.trim()) fail(400, 'Choose a CSV file to upload.');
  if (body.csv.length > MAX_CSV_CHARS) fail(400, 'The CSV file is too large.');

  let parsed: ReturnType<typeof parseTeamsCsv>;
  try {
    parsed = parseTeamsCsv(body.csv);
  } catch (err) {
    if (err instanceof CsvError) fail(400, err.message);
    throw err;
  }

  const db = c.env.DB;
  const { results } = await db.prepare('SELECT lower(name) AS key FROM teams').all<{ key: string }>();
  const existing = new Set(results.map((row) => row.key));

  // One batch runs as a single transaction, so a failed import changes nothing.
  await db.batch(
    parsed.map((team) =>
      db
        .prepare(
          `INSERT INTO teams (id, name, team_lead, extra_json) VALUES (?, ?, ?, ?)
           ON CONFLICT(name) DO UPDATE SET team_lead = excluded.team_lead, extra_json = excluded.extra_json,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
        )
        .bind(newId(), team.name, team.teamLead, JSON.stringify(team.extra)),
    ),
  );

  const updated = parsed.filter((team) => existing.has(team.name.toLowerCase())).length;
  return c.json<ImportResult>({ created: parsed.length - updated, updated });
});

/** Reads an optional team detail. Missing or blank values become ''. */
function detail(body: Body, key: string, label: string): string {
  if (body[key] === undefined || body[key] === null) return '';
  return str(body, key, label, 0, MAX_DETAIL_CHARS);
}

teams.post('/', async (c) => {
  const body = await readBody(c);
  const name = str(body, 'name', 'Team name', 1, 120);
  const teamLead = str(body, 'teamLead', 'Team lead', 1, 120);
  const extra = teamDetails(detail(body, 'ps', 'Problem statement'), detail(body, 'shortDesc', 'Short description'));
  const id = newId();
  try {
    await c.env.DB.prepare('INSERT INTO teams (id, name, team_lead, extra_json) VALUES (?, ?, ?, ?)')
      .bind(id, name, teamLead, JSON.stringify(extra))
      .run();
  } catch (err) {
    if (isUniqueViolation(err)) fail(409, 'A team with this name already exists.');
    throw err;
  }
  const row = await c.env.DB.prepare('SELECT * FROM teams WHERE id = ?').bind(id).first<TeamRow>();
  return c.json(toTeam(row as TeamRow), 201);
});

teams.patch('/:id', async (c) => {
  const body = await readBody(c);
  const row = await c.env.DB.prepare('SELECT * FROM teams WHERE id = ?').bind(c.req.param('id')).first<TeamRow>();
  if (!row) fail(404, 'Team not found.');
  if (body.name !== undefined) row.name = str(body, 'name', 'Team name', 1, 120);
  if (body.teamLead !== undefined) row.team_lead = str(body, 'teamLead', 'Team lead', 1, 120);
  if (body.ps !== undefined || body.shortDesc !== undefined) {
    const extra = JSON.parse(row.extra_json) as Record<string, string>;
    const ps = body.ps !== undefined ? detail(body, 'ps', 'Problem statement') : (extra[PS_KEY] ?? '');
    const shortDesc =
      body.shortDesc !== undefined ? detail(body, 'shortDesc', 'Short description') : (extra[DESC_KEY] ?? '');
    delete extra[PS_KEY];
    delete extra[DESC_KEY];
    row.extra_json = JSON.stringify({ ...extra, ...teamDetails(ps, shortDesc) });
  }
  try {
    await c.env.DB.prepare(
      "UPDATE teams SET name = ?, team_lead = ?, extra_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
      .bind(row.name, row.team_lead, row.extra_json, row.id)
      .run();
  } catch (err) {
    if (isUniqueViolation(err)) fail(409, 'A team with this name already exists.');
    throw err;
  }
  return c.json(toTeam(row));
});

teams.delete('/:id', async (c) => {
  try {
    const result = await c.env.DB.prepare('DELETE FROM teams WHERE id = ?').bind(c.req.param('id')).run();
    if (result.meta.changes === 0) fail(404, 'Team not found.');
  } catch (err) {
    if (isForeignKeyViolation(err)) fail(409, 'This team has scores. Reset them in Results before deleting it.');
    throw err;
  }
  return c.body(null, 204);
});
