export class CsvError extends Error {}

export const MAX_TEAMS = 2000;
const MAX_ERRORS_SHOWN = 20;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  for (; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else inQuotes = false;
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (inQuotes) throw new CsvError('A quoted value is not closed.');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

export interface TeamInput {
  name: string;
  teamLead: string;
  extra: Record<string, string>;
}

// Team details shown to judges are stored in extra_json under these keys.
export const PS_KEY = 'PS';
export const DESC_KEY = 'Short Desc';
export const MAX_DETAIL_CHARS = 2000;

/** Builds extra_json from the optional judge-facing details, skipping blanks. */
export function teamDetails(ps: string, shortDesc: string): Record<string, string> {
  const extra: Record<string, string> = {};
  if (ps) extra[PS_KEY] = ps;
  if (shortDesc) extra[DESC_KEY] = shortDesc;
  return extra;
}

const headerKey = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, '');
const LEAD_HEADERS = new Set(['teamleadername', 'teamlead', 'lead', 'teamleader', 'leader', 'teamleadname']);

// Rules are tried in order, so exact template headers win over looser matches.
// The looser rules cover registration form exports such as "Team details - Team name"
// and "Team leader details - Full name". Every other column is ignored.
type Rule = (key: string) => boolean;
const NAME_RULES: Rule[] = [(k) => k === 'teamname' || k === 'team', (k) => k.endsWith('teamname'), (k) => k === 'name'];
const LEAD_RULES: Rule[] = [(k) => LEAD_HEADERS.has(k), (k) => k.startsWith('teamlead') && k.endsWith('name')];
const PS_RULES: Rule[] = [(k) => k === 'ps' || k === 'problemstatement', (k) => k.endsWith('problemstatement')];
const DESC_RULES: Rule[] = [(k) => k === 'shortdesc' || k === 'shortdescription', (k) => k.includes('shortdesc')];

function findColumn(keys: string[], rules: Rule[]): number {
  for (const rule of rules) {
    const col = keys.findIndex(rule);
    if (col >= 0) return col;
  }
  return -1;
}

export function parseTeamsCsv(text: string): TeamInput[] {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new CsvError('The file needs a header row and at least one team.');

  const keys = rows[0].map(headerKey);
  const nameCol = findColumn(keys, NAME_RULES);
  const leadCol = findColumn(keys, LEAD_RULES);
  const psCol = findColumn(keys, PS_RULES);
  const descCol = findColumn(keys, DESC_RULES);
  if (nameCol < 0 || leadCol < 0) {
    throw new CsvError('The header row must include "Team Name" and "Team Leader Name" columns.');
  }
  if (rows.length - 1 > MAX_TEAMS) throw new CsvError(`A file can contain at most ${MAX_TEAMS} teams.`);

  const errors: string[] = [];
  const firstRow = new Map<string, number>();
  const teams: TeamInput[] = [];

  rows.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const name = (cells[nameCol] ?? '').trim();
    const teamLead = (cells[leadCol] ?? '').trim();
    if (!name || !teamLead) {
      errors.push(`Row ${line}: team name and team lead are required.`);
      return;
    }
    if (name.length > 120 || teamLead.length > 120) {
      errors.push(`Row ${line}: team name and team lead must be 120 characters or fewer.`);
      return;
    }
    const key = name.toLowerCase();
    const seen = firstRow.get(key);
    if (seen !== undefined) {
      errors.push(`Row ${line}: "${name}" is repeated (first on row ${seen}).`);
      return;
    }
    firstRow.set(key, line);

    const detail = (col: number) => (col < 0 ? '' : (cells[col] ?? '').trim().slice(0, MAX_DETAIL_CHARS));
    teams.push({ name, teamLead, extra: teamDetails(detail(psCol), detail(descCol)) });
  });

  if (errors.length > 0) {
    const shown = errors.slice(0, MAX_ERRORS_SHOWN).join('\n');
    const more = errors.length > MAX_ERRORS_SHOWN ? `\n…and ${errors.length - MAX_ERRORS_SHOWN} more.` : '';
    throw new CsvError(shown + more);
  }
  return teams;
}
