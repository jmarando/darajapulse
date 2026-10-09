export type ContractDates = { contract_start_date?: string | null; contract_end_date?: string | null; historical_start_date?: string | null; payment_eligibility_notes?: string | null };
export function contractPeriodLabel(dates: ContractDates) {
  if (!dates.contract_start_date || !dates.contract_end_date) return null;
  const format = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${format(dates.contract_start_date)} – ${format(dates.contract_end_date)}`;
}
export function isContractPublication(postedAt: string | null | undefined, dates: ContractDates) {
  if (!postedAt || !dates.contract_start_date || !dates.contract_end_date) return false;
  return postedAt.slice(0, 10) >= dates.contract_start_date && postedAt.slice(0, 10) <= dates.contract_end_date;
}