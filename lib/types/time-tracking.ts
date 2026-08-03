export type TimeSession = Readonly<{
  id: string;
  userId: string;
  occurrenceId: string;
  behaviorId: string;
  startedAt: string;
  stoppedAt: string | null;
}>;

export type OccurrenceTimeTracking = Readonly<{
  sessions: TimeSession[];
  runningSession: TimeSession | null;
  recordedSeconds: number;
}>;
