/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CsvError, parseCsv, parseTeamsCsv } from './csv';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas, newlines in quotes, CRLF and BOM', () => {
    const text = '﻿a,b\r\n"x, y","say ""hi"""\n"multi\nline",z\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['multi\nline', 'z'],
    ]);
  });

  it('keeps a last row without trailing newline and skips blank lines', () => {
    expect(parseCsv('a,b\n\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps empty fields', () => {
    expect(parseCsv('a,,c\n')).toEqual([['a', '', 'c']]);
  });

  it('rejects an unclosed quote', () => {
    expect(() => parseCsv('a,"b\n')).toThrow(CsvError);
  });
});

describe('parseTeamsCsv', () => {
  it('imports the downloadable four-column template', () => {
    const template = readFileSync(new URL('../public/vmedithon-teams-template.csv', import.meta.url), 'utf8');
    expect(parseTeamsCsv(template)).toEqual([
      { name: 'Pulse Pioneers', teamLead: 'Asha Sen', extra: { PS: 'PS-01', 'Short Desc': 'Remote patient monitoring' } },
      { name: 'Care Connect', teamLead: 'Ravi Kumar', extra: { PS: 'PS-02', 'Short Desc': 'Helping patients find nearby care, quickly' } },
    ]);
  });

  it('normalizes the new headers and preserves quoted multiline descriptions', () => {
    expect(parseTeamsCsv('short_desc,ps,TEAM LEADER NAME,team name\n"First line, details\nSecond line",PS-03,Asha,Alpha'))
      .toEqual([{ name: 'Alpha', teamLead: 'Asha', extra: { 'Short Desc': 'First line, details\nSecond line', PS: 'PS-03' } }]);
  });

  it('allows blank optional PS and description values', () => {
    expect(parseTeamsCsv('Team Name,Team Leader Name,PS,Short Desc\nAlpha,Asha,,'))
      .toEqual([{ name: 'Alpha', teamLead: 'Asha', extra: {} }]);
  });

  it('maps flexible headers and ignores unrelated columns', () => {
    const teams = parseTeamsCsv('Team Name,team_lead,Track,College\nAlpha, Asha ,Hackathon,\nBeta,Ravi,Buildathon,VIT\n');
    expect(teams).toEqual([
      { name: 'Alpha', teamLead: 'Asha', extra: {} },
      { name: 'Beta', teamLead: 'Ravi', extra: {} },
    ]);
  });

  it('imports a registration form export and drops contact and payment columns', () => {
    const header = [
      'Name', 'Signed-in e-mail', 'Submitted at', 'Updated at',
      'Team details - Number of people in your team, including the team lead',
      'Team details - Team name', 'Team details - Problem statement',
      'Team details - Short description of your solution',
      'Team leader details - Full name', 'Team leader details - E-mail address',
      'Team leader details - Contact number', 'Team leader details - Payment screenshot',
      'Team member (1) - Full name', 'Team member (1) - E-mail address',
      'Team member (1) - Contact number', 'Team member (1) - Payment screenshot',
    ].map((h) => `"${h}"`).join(',');
    const row = (team: string, ps: string, desc: string, lead: string) =>
      [
        'lead@example.com', 'lead@example.com', '2026-09-15T06:35:49.476Z', '2026-09-15T06:35:49.476Z', '2',
        team, ps, desc, lead, 'lead@example.com', '9000000000', 'https://example.com/pay/1',
        'Member', 'member@example.com', '9000000001', 'https://example.com/pay/2',
      ].map((v) => `"${v.replace(/"/g, '""')}"`).join(',');
    const csv = `﻿${header}\n${row('Alpha', 'Rural diagnostics', 'An app, with "AI"', 'Asha Sen')}\n${row('Beta', '', '', 'Ravi')}`;
    expect(parseTeamsCsv(csv)).toEqual([
      { name: 'Alpha', teamLead: 'Asha Sen', extra: { PS: 'Rural diagnostics', 'Short Desc': 'An app, with "AI"' } },
      { name: 'Beta', teamLead: 'Ravi', extra: {} },
    ]);
  });

  it('requires both name and lead headers', () => {
    expect(() => parseTeamsCsv('Team,Members\nA,3\n')).toThrow('"Team Name" and "Team Leader Name"');
  });

  it('requires at least one team', () => {
    expect(() => parseTeamsCsv('Team Name,Team Lead\n')).toThrow('at least one team');
  });

  it('reports missing values and case-insensitive duplicates with row numbers', () => {
    const run = () => parseTeamsCsv('Team Name,Team Lead\nAlpha,Asha\n,Ravi\nALPHA,Meena\n');
    expect(run).toThrow(CsvError);
    try {
      run();
    } catch (err) {
      expect((err as Error).message).toBe(
        'Row 3: team name and team lead are required.\nRow 4: "ALPHA" is repeated (first on row 2).',
      );
    }
  });
});
