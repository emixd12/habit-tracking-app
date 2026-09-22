import { expect, it } from 'vitest';
import { DEFAULT_BRIEFING_CONFIG, projectBriefingContext } from '../packages/core/src/services/briefing-config';
import { validateAdvisorDayContext } from '../packages/core/src/services/advisor-day-context';
import { briefingFixture } from '../lib/services/briefing-fixtures';
import { prepareBriefing } from '../lib/services/briefing-pipeline';
import { DAILY_BRIEF_INSTRUCTIONS } from '../lib/services/daily-brief-consumer';
const config = { ...DEFAULT_BRIEFING_CONFIG, context: { ...DEFAULT_BRIEFING_CONFIG.context, includeHistoricalCompletionTimes: true } };

it('shows selected marking evidence in model facts and inspector independently of history counts and duration', () => {
  const source = briefingFixture('sparse', config);
  const result = prepareBriefing(source, config, source.capturedAt);
  expect(result.facts.cadence.historicalCompletionTimes?.behaviors[0]).toMatchObject({ sampleCount: 3, typicalMarkedTime: '08:15' });
  expect(result.facts.cadence).not.toHaveProperty('history');
  expect(result.contextControls.historicalCompletionTimes).toMatchObject({ requested: true, included: true });
  const off = projectBriefingContext(source, DEFAULT_BRIEFING_CONFIG);
  expect(off.facts.cadence).not.toHaveProperty('historicalCompletionTimes');
  expect(off.contextControls.historicalCompletionTimes).toMatchObject({ requested: false, included: false });
  expect(off.facts.cadence.occurrences[0].duration).toEqual(result.facts.cadence.occurrences[0].duration);
  expect(DAILY_BRIEF_INSTRUCTIONS).toContain('not actual performance, start or finish times');
  expect(DAILY_BRIEF_INSTRUCTIONS).toContain('Never recap Completed');
});
it('excludes unselected Behavior timing and explains sparse and incomplete evidence', () => {
  const source = briefingFixture('sparse', config);
  const excluded = projectBriefingContext(source, { ...config, scope: { ...config.scope, behaviorRefs: [] } });
  expect(excluded.facts.cadence.historicalCompletionTimes?.behaviors).toEqual([]);
  const narrow = { ...config, scope: { ...config.scope, historyDays: 2 } };
  expect(projectBriefingContext(briefingFixture('sparse', narrow), narrow).facts.cadence.historicalCompletionTimes?.behaviors[0]).toMatchObject({
    sampleCount: 2, typicalMarkedTime: null, reason: 'insufficient_samples', exclusions: { outsideWindow: 1 },
  });
  expect(projectBriefingContext(briefingFixture('incomplete_history', config), config).facts.cadence.historicalCompletionTimes?.behaviors[0].reason).toBe('history_limit_exceeded');
});
it('rejects malformed timing summaries and mismatched history/timezone before the model boundary', () => {
  const source = briefingFixture('sparse', config);
  for (const change of [ { timezone: 'UTC' }, { lookbackDays: 2 }, { semantics: 'actual_finish' } ]) {
    expect(() => validateAdvisorDayContext({ ...source, cadence: { ...source.cadence, historicalCompletionTimes: { ...source.cadence.historicalCompletionTimes, ...change } } })).toThrow();
  }
  for (const change of [{ sampleCount: -1 }, { sampleCount: 2 }, { typicalMarkedTime: '24:00' }, { reason: 'insufficient_samples' }, { behaviorRef: 'behavior_unauthorized' }]) {
    const timing = source.cadence.historicalCompletionTimes!;
    expect(() => validateAdvisorDayContext({ ...source, cadence: { ...source.cadence, historicalCompletionTimes: { ...timing, behaviors: [{ ...timing.behaviors[0], ...change }] } } })).toThrow();
  }
});
