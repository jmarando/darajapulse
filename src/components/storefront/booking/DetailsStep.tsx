import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BuyerState } from "@/lib/storefrontCheckout";

/** Step 3: who's booking. Only a name and an email are needed. */
export default function DetailsStep({ buyer, onChange }: { buyer: BuyerState; onChange: (b: BuyerState) => void }) {
  const [forClient, setForClient] = useState(buyer.client !== "");
  const set = (k: keyof BuyerState) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...buyer, [k]: e.target.value });
  return (
    <div className="mt-4 grid max-w-xl gap-4 sm:grid-cols-2">
      <div className="space-y-1.5"><Label htmlFor="b-name">Your name</Label><Input id="b-name" autoComplete="name" value={buyer.name} onChange={set("name")} /></div>
      <div className="space-y-1.5"><Label htmlFor="b-company">Company</Label><Input id="b-company" autoComplete="organization" value={buyer.company} onChange={set("company")} /></div>
      <div className="space-y-1.5"><Label htmlFor="b-email">Email</Label><Input id="b-email" type="email" autoComplete="email" value={buyer.email} onChange={set("email")} /></div>
      <div className="space-y-1.5"><Label htmlFor="b-phone">Phone</Label><Input id="b-phone" type="tel" autoComplete="tel" value={buyer.phone} onChange={set("phone")} placeholder="0712 345 678" /></div>
      <div className="space-y-1.5"><Label htmlFor="b-kra">KRA PIN (optional, for your tax invoice)</Label><Input id="b-kra" value={buyer.kra_pin} onChange={set("kra_pin")} /></div>
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 pt-6 text-sm font-medium">
          <input type="checkbox" checked={forClient}
            onChange={(e) => { setForClient(e.target.checked); if (!e.target.checked) onChange({ ...buyer, client: "" }); }} />
          I'm booking for a client
        </label>
        {forClient && <Input aria-label="Client's name" value={buyer.client} onChange={set("client")} placeholder="Client's name" />}
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">Your booking link and receipts go to this email.</p>
    </div>
  );
}
