export type Role = 'admin' | 'judge';

export interface Account {
  id: string;
  role: Role;
  email: string | null;
  username: string | null;
  displayName: string;
  active: boolean;
  linked: boolean;
  createdAt: string;
}

export interface AppConfig {
  clerkPublishableKey: string;
}

export interface Team {
  id: string;
  name: string;
  teamLead: string;
  extra: Record<string, string>;
  createdAt: string;
}

export interface ImportResult {
  created: number;
  updated: number;
}

export type RoundStatus = 'draft' | 'open' | 'closed';

export interface CriterionInput {
  name: string;
  maxMarks: number;
  weight: number;
}

export interface Criterion extends CriterionInput {
  id: string;
}

export interface Round {
  id: string;
  name: string;
  position: number;
  status: RoundStatus;
  criteria: Criterion[];
  teamIds: string[];
  evaluationCount: number;
  createdAt: string;
}

export type ResultRound = Pick<Round, 'id' | 'name' | 'position' | 'status'>;

export interface MarkEntry {
  criterionId: string;
  name: string;
  maxMarks: number;
  weight: number;
  marks: number;
}

export interface JudgeRound {
  id: string;
  name: string;
  criteria: Criterion[];
}

export type JudgeTeamStatus = 'available' | 'judged-by-you' | 'judged';

export interface JudgeTeam {
  id: string;
  name: string;
  teamLead: string;
  ps: string;
  shortDesc: string;
  status: JudgeTeamStatus;
}

export interface ResultRow {
  rank: number | null;
  team: { id: string; name: string; teamLead: string };
  evaluation: {
    judge: string;
    marks: MarkEntry[];
    total: number;
    remarks: string;
    submittedAt: string;
  } | null;
}

export interface RoundResults {
  round: { id: string; name: string; status: RoundStatus };
  criteria: Criterion[];
  rows: ResultRow[];
}
