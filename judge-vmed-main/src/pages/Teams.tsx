import { Check, Download, FileSpreadsheet, Plus, Trash2, Upload, Users } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { ImportResult, Team } from '../../shared/api';
import { useApi, useDebounced, useResource } from '../api';
import {
  Button,
  Empty,
  ErrorBanner,
  Field,
  Loading,
  Modal,
  PageHeading,
  Pagination,
  SearchInput,
  useAction,
  useToast,
} from '../components/ui';

const PAGE_SIZE = 25;

export function TeamsPage() {
  const teams = useResource<Team[]>('/teams');
  const toast = useToast();
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const [page, setPage] = useState(1);
  const [add, setAdd] = useState(false);
  const [importing, setImporting] = useState(false);
  const [removing, setRemoving] = useState<Team | null>(null);
  const action = useAction();
  const api = useApi();

  const extraColumns = useMemo(
    () => [...new Set((teams.data ?? []).flatMap((team) => Object.keys(team.extra)))],
    [teams.data],
  );
  const shown = useMemo(() => {
    const query = term.trim().toLowerCase();
    const list = teams.data ?? [];
    if (!query) return list;
    return list.filter(
      (team) => team.name.toLowerCase().includes(query) || team.teamLead.toLowerCase().includes(query),
    );
  }, [teams.data, term]);
  const pageItems = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <PageHeading
        eyebrow="MEET THE MAKERS"
        title="Teams, all together."
        description="Bring the builders on board. Add a team or import the whole lineup."
        actions={
          <>
            <Button variant="secondary" icon={Upload} onClick={() => setImporting(true)}>
              Import CSV
            </Button>
            <Button icon={Plus} onClick={() => setAdd(true)}>
              Add team
            </Button>
          </>
        }
      />
      <div className="inline-stats">
        <span>
          <strong>{teams.data?.length || 0}</strong> registered teams
        </span>
        <span>
          <Users size={16} />
          One row per team
        </span>
      </div>
      <section className="card">
        <div className="table-toolbar">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search by team or lead…"
          />
          <span className="toolbar-count">{shown.length} teams</span>
        </div>
        <ErrorBanner message={teams.error} retry={teams.reload} />
        {teams.loading && !teams.data ? (
          <Loading />
        ) : !shown.length ? (
          <Empty
            icon={Users}
            title={search ? 'No matching teams' : 'Welcome your first team'}
            description={
              search
                ? 'Try another team name or team lead.'
                : 'Add a team individually or bring everyone in with a CSV file.'
            }
            action={
              !search ? (
                <Button icon={Plus} onClick={() => setAdd(true)}>
                  Add a team
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Team</th>
                  {extraColumns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                  <th className="align-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((team) => (
                  <tr key={team.id}>
                    <td>
                      <div className="team-cell">
                        <strong>{team.name}</strong>
                        <span>Lead · {team.teamLead}</span>
                      </div>
                    </td>
                    {extraColumns.map((column) => (
                      <td key={column}>{team.extra[column] ?? ''}</td>
                    ))}
                    <td>
                      <div className="table-actions">
                        <button
                          className="icon-button"
                          title="Delete team"
                          aria-label={`Delete ${team.name}`}
                          onClick={() => {
                            action.setError('');
                            setRemoving(team);
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} total={shown.length} pageSize={PAGE_SIZE} onPage={setPage} />
      </section>
      {add && (
        <AddTeam
          onClose={() => setAdd(false)}
          onSaved={(name) => {
            setAdd(false);
            teams.reload();
            toast(`Added ${name}.`);
          }}
        />
      )}
      {importing && (
        <ImportTeams
          onClose={() => setImporting(false)}
          onSaved={(message) => {
            setImporting(false);
            teams.reload();
            toast(message);
          }}
        />
      )}
      {removing && (
        <Modal
          title="Delete this team?"
          description={removing.name}
          onClose={() => setRemoving(null)}
          busy={action.busy}
        >
          <p className="modal-copy">
            The team is removed from every round. Scores already submitted for it stay on record.
          </p>
          <ErrorBanner message={action.error} />
          <div className="modal-actions">
            <Button variant="secondary" disabled={action.busy} onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={action.busy}
              icon={Trash2}
              onClick={() =>
                void action.run(async () => {
                  await api.del(`/teams/${removing.id}`);
                  toast(`Deleted ${removing.name}.`);
                  setRemoving(null);
                  teams.reload();
                })
              }
            >
              Delete team
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function AddTeam({ onClose, onSaved }: { onClose: () => void; onSaved: (name: string) => void }) {
  const api = useApi();
  const action = useAction();
  const [name, setName] = useState('');
  const [teamLead, setTeamLead] = useState('');
  const [ps, setPs] = useState('');
  const [shortDesc, setShortDesc] = useState('');
  return (
    <Modal title="Add a team" description="One more idea in the making." onClose={onClose} busy={action.busy}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            await api.post('/teams', { name, teamLead, ps, shortDesc });
            onSaved(name);
          });
        }}
      >
        <Field label="Team name">
          <input
            required
            autoFocus
            maxLength={120}
            placeholder="e.g. The Trailblazers"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Team leader name">
          <input
            required
            maxLength={120}
            placeholder="Team leader’s full name"
            value={teamLead}
            onChange={(e) => setTeamLead(e.target.value)}
          />
        </Field>
        <Field label="Problem statement (optional)">
          <textarea
            rows={2}
            maxLength={2000}
            placeholder="e.g. PS-01 or the problem they chose"
            value={ps}
            onChange={(e) => setPs(e.target.value)}
          />
        </Field>
        <Field label="Short description of the solution (optional)">
          <textarea
            rows={3}
            maxLength={2000}
            placeholder="What the team is building"
            value={shortDesc}
            onChange={(e) => setShortDesc(e.target.value)}
          />
        </Field>
        <ErrorBanner message={action.error} />
        <div className="modal-actions">
          <Button variant="secondary" disabled={action.busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" icon={Plus} busy={action.busy}>
            Add team
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ImportTeams({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const api = useApi();
  const action = useAction();
  const input = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState('');
  const [filename, setFilename] = useState('');
  async function readFile(file?: File) {
    if (!file) return;
    if (file.size > 2_000_000) {
      action.setError('Choose a CSV file under 2 MB.');
      return;
    }
    setFilename(file.name);
    setCsv(await file.text());
    action.setError('');
  }
  return (
    <Modal
      title="Import teams from CSV"
      description="Add or update your whole lineup in one upload."
      onClose={onClose}
      busy={action.busy}
    >
      <div className="import-instructions">
        <FileSpreadsheet size={25} />
        <div>
          <strong>One team per row.</strong>
          <p>
            Use <code>Team Name</code>, <code>Team Leader Name</code>, <code>PS</code> and{' '}
            <code>Short Desc</code>, or upload the registration form export as is. Team name and leader
            name are required. Other columns (emails, phone numbers, payment screenshots) are ignored. A
            team name that already exists gets updated.
          </p>
          <a className="button ghost" href="/vmedithon-teams-template.csv" download>
            <Download size={16} />
            Download CSV template
          </a>
        </div>
      </div>
      <button
        className="upload-zone"
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void readFile(e.dataTransfer.files[0]);
        }}
      >
        <Upload size={26} />
        <strong>{filename || 'Choose or drop your CSV file'}</strong>
        <span>CSV files up to 2 MB</span>
      </button>
      <input
        type="file"
        accept=".csv,text/csv"
        ref={input}
        hidden
        onChange={(e) => void readFile(e.target.files?.[0])}
      />
      <details className="paste-csv">
        <summary>Or paste CSV content</summary>
        <textarea
          aria-label="CSV content"
          rows={5}
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setFilename('Pasted CSV');
          }}
          placeholder="Team Name,Team Leader Name,PS,Short Desc"
        />
      </details>
      <ErrorBanner message={action.error} />
      <div className="modal-actions">
        <Button variant="secondary" disabled={action.busy} onClick={onClose}>
          Cancel
        </Button>
        <Button
          icon={Check}
          disabled={!csv.trim()}
          busy={action.busy}
          onClick={() =>
            void action.run(async () => {
              const result = await api.post<ImportResult>('/teams/import', { csv });
              onSaved(`Imported ${filename || 'CSV'}: ${result.created} new, ${result.updated} updated.`);
            })
          }
        >
          Import teams
        </Button>
      </div>
    </Modal>
  );
}
