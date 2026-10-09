import { describe, expect, it } from 'vitest';
import { contractPeriodLabel, isContractPublication } from '@/lib/contractDates';
describe('Separate contract reporting dates', () => {
  const dates = { contract_start_date: '2026-09-16', contract_end_date: '2026-10-16' };
  it('includes both boundary days without using collection dates', () => {
    expect(isContractPublication('2026-09-16T00:00:00Z', dates)).toBe(true);
    expect(isContractPublication('2026-10-16T23:59:59Z', dates)).toBe(true);
    expect(isContractPublication('2026-09-15T23:59:59Z', dates)).toBe(false);
    expect(isContractPublication(null, dates)).toBe(false);
  });
  it('labels official dates and leaves unrelated campaigns without an override', () => {
    expect(contractPeriodLabel(dates)).toBe('16 Sep 2026 – 16 Oct 2026');
    expect(contractPeriodLabel({})).toBe(null);
  });
});