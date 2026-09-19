// @vitest-environment happy-dom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoundResults } from '../../shared/api';
import { ApiProvider } from '../api';
import { ToastProvider } from '../components/ui';
import { JudgePage } from './Judge';
import { ResultsPage } from './Results';
import { TeamsPage } from './Teams';

let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn<typeof fetch>();
const result: RoundResults = {
  round: { id: 'open', name: 'Round 1', status: 'open' },
  criteria: [{ id: 'impact', name: 'Impact', maxMarks: 10, weight: 1 }],
  rows: [{
    rank: 1, team: { id: 'alpha', name: 'Alpha', teamLead: 'Asha' },
    evaluation: { judge: 'Judge (@judge)', total: 80, remarks: 'Useful idea', submittedAt: '2026-09-14',
      marks: [{ criterionId: 'impact', name: 'Impact', maxMarks: 10, weight: 1, marks: 8 }] },
  }],
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset().mockImplementation(async (input, options) => {
    const path = String(input);
    if (options?.method === 'DELETE') return new Response(null, { status: 204 });
    if (path === '/api/results') return Response.json([{ id: 'open', name: 'Round 1', status: 'open', position: 1 }]);
    if (path === '/api/results/open') return Response.json(result);
    if (path === '/api/judging/rounds') return Response.json([{ id: 'open', name: 'Round 1', criteria: result.criteria }]);
    if (path === '/api/judging/rounds/open/teams') return Response.json([{
      id: 'alpha', name: 'Alpha', teamLead: 'Asha', ps: 'PS-01',
      shortDesc: 'Care, wherever you are\n<script>plain text</script>', status: 'available',
    }]);
    if (path === '/api/teams') return Response.json([]);
    throw new Error(`Unexpected request: ${path}`);
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(page: ReactNode) {
  await act(async () => root.render(
    <ToastProvider><ApiProvider getToken={async () => 'token'}>{page}</ApiProvider></ToastProvider>,
  ));
}

describe('judge views', () => {
  it('loads results without the admin rounds API and hides reset controls', async () => {
    await render(<ResultsPage role="judge" />);
    expect(container.querySelector('table')?.textContent).toContain('Alpha');
    expect(container.querySelector('table')?.textContent).toContain('80.00');
    expect(container.querySelector('table')?.textContent).toContain('Useful idea');
    expect(container.querySelector('[title="Reset score"]')).toBeNull();
    expect(container.querySelector('thead')?.textContent).not.toContain('Actions');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/results', '/api/results/open']);
    const exportButton = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Export CSV');
    expect(exportButton?.disabled).toBe(false);
  });

  it('retains the admin reset flow', async () => {
    await render(<ResultsPage role="admin" />);
    await act(async () => container.querySelector<HTMLButtonElement>('[title="Reset score"]')!.click());
    const confirm = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Reset score');
    expect(confirm).toBeDefined();
    await act(async () => confirm!.click());
    expect(fetchMock.mock.calls.some(([url, options]) => url === '/api/results/open/teams/alpha' && options?.method === 'DELETE')).toBe(true);
  });

  it('shows PS and description as text alongside the scoring form', async () => {
    await render(<JudgePage />);
    await act(async () => container.querySelector<HTMLButtonElement>('.picklist button')!.click());
    expect(container.querySelector('.team-brief')?.textContent).toContain('PS-01');
    expect(container.querySelector('.team-brief')?.textContent).toContain('Care, wherever you are\n<script>plain text</script>');
    expect(container.querySelector('.team-brief script')).toBeNull();
    expect(container.querySelector('input[aria-label="Marks for Impact, maximum 10"]')).not.toBeNull();
  });

  it('links the CSV download and paste example to the new format', async () => {
    await render(<TeamsPage />);
    const importButton = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Import CSV');
    await act(async () => importButton!.click());
    expect(container.querySelector('a[download]')?.getAttribute('href')).toBe('/vmedithon-teams-template.csv');
    expect(container.querySelector('textarea[aria-label="CSV content"]')?.getAttribute('placeholder'))
      .toBe('Team Name,Team Leader Name,PS,Short Desc');
  });

  it('sends PS and short description from the add team form', async () => {
    await render(<TeamsPage />);
    const addButton = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Add team');
    await act(async () => addButton!.click());
    const fill = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const form = container.querySelector('form')!;
    const [name, lead] = form.querySelectorAll('input');
    const [ps, desc] = form.querySelectorAll('textarea');
    await act(async () => {
      fill(name, 'Gamma');
      fill(lead, 'Gita');
      fill(ps, 'PS-07');
      fill(desc, 'Triage chatbot');
    });
    await act(async () => form.requestSubmit());
    const post = fetchMock.mock.calls.find(([url, options]) => url === '/api/teams' && options?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ name: 'Gamma', teamLead: 'Gita', ps: 'PS-07', shortDesc: 'Triage chatbot' });
  });
});
