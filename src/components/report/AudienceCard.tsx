import { ReportCard } from "@/components/report/ReportOverview";
import { StatusChip } from "@/components/dash/chips";
import type { buildAudience } from "@/lib/audience";
import { compact } from "@/lib/reportInsights";

type Audience = ReturnType<typeof buildAudience>;

const whole = (pct: number) => `${pct.toFixed(0)}%`;

/** A label, its percentage and a hatched bar for it. */
function Row({ label, pct, className }: { label: string; pct: number; className?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
        <span className={className}>{label}</span>
        <span className="tabular-nums text-muted-foreground">{whole(pct)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary/70" aria-hidden>
        <div className="bar-hatch h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-[13px] font-medium">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

/** Who the campaign reached: Kenya against the rest of the world, then age, gender and cities. */
export function AudienceCard({ audience, creators, className }: { audience: Audience; creators: number; className?: string }) {
  const measured = audience.measuredCount === audience.creatorsWithData && audience.creatorsWithData > 0;
  const basis =
    `${audience.measuredCount} of ${audience.creatorCount} creators measured from their own account stats` +
    (audience.modelledCount > 0 ? ` · ${audience.modelledCount} estimated from platform, category, location and audience size` : "") +
    (audience.zeroFollowerCount > 0 ? ` · ${audience.zeroFollowerCount} without follower counts weighted at the roster average` : "");
  const languages = Array.from(audience.langs);
  return (
    <ReportCard
      className={className}
      title="Who we reached"
      subtitle={basis}
      action={<StatusChip tone={measured ? "good" : "info"}>{measured ? "Measured" : "Estimated"}</StatusChip>}
    >
      <div className="grid gap-8 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px]">Kenya</span>
            <span className="text-[32px] font-light leading-none tracking-[-0.02em] tabular-nums">{whole(audience.weightedKE)}</span>
          </div>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-secondary/70" aria-hidden>
            <div className="bar-solid h-full" style={{ width: `${Math.min(100, Math.max(0, audience.weightedKE))}%` }} />
            <div className="bar-hatch h-full" style={{ width: `${Math.min(100, Math.max(0, audience.diaspora))}%` }} />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-3 text-[13px] text-muted-foreground">
            <span>Diaspora and rest of world</span>
            <span className="tabular-nums">{whole(audience.diaspora)}</span>
          </div>
          <dl className="mt-6 grid grid-cols-3 gap-6 border-t border-border/70 pt-5">
            <div>
              <dt className="text-[12px] text-muted-foreground">Combined followers</dt>
              <dd className="mt-1 text-[22px] font-light leading-none tracking-[-0.02em] tabular-nums">{compact(audience.totalFollowers)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted-foreground">Creators</dt>
              <dd className="mt-1 text-[22px] font-light leading-none tracking-[-0.02em] tabular-nums">{creators}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted-foreground">Languages</dt>
              <dd className="mt-1 text-[22px] font-light leading-none tracking-[-0.02em] tabular-nums">{audience.langs.size || 1}</dd>
            </div>
          </dl>
        </div>
        <div>
          <h3 className="mb-3 text-[13px] font-medium">Languages</h3>
          {languages.length === 0 ? (
            <span className="text-[13px] text-muted-foreground">—</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {languages.map((l) => (
                <span key={l} className="rounded-full border border-border/70 px-2.5 py-1 text-[12px]">{l}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-8 border-t border-border/70 pt-6 md:grid-cols-3">
        <Group title="Age">
          {audience.ages.map((a) => <Row key={a.bucket} label={a.bucket} pct={a.pct} />)}
        </Group>
        <Group title="Gender">
          {audience.genders.map((g) => <Row key={g.gender} label={g.gender} pct={g.pct} className="capitalize" />)}
        </Group>
        <Group title="Top cities">
          {audience.cities.length === 0 && <span className="text-[13px] text-muted-foreground">—</span>}
          {audience.cities.map((c) => <Row key={c.city} label={c.city} pct={c.pct} />)}
        </Group>
      </div>
    </ReportCard>
  );
}
