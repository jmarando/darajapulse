import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { publicSupabase as supabase } from "@/integrations/supabase/publicClient";
import { Card } from "@/components/ui/card";
import { Twitter } from "lucide-react";

const ConnectTwitter = () => {
  const { influencerId } = useParams();
  const [name, setName] = useState<string>("");

  useEffect(() => {
    if (influencerId) {
      supabase.from("influencers").select("full_name").eq("id", influencerId).maybeSingle()
        .then(({ data }) => setName(data?.full_name ?? ""));
    }
  }, [influencerId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-paper p-6">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground mx-auto flex items-center justify-center">
          <Twitter className="w-7 h-7" />
        </div>
        <h1 className="font-display text-3xl mt-4">Connect X</h1>
        <p className="text-muted-foreground mt-3">
          {name ? `Hi ${name.split(" ")[0]} — ` : ""}X (Twitter) integration is coming soon. Check back shortly to link your account.
        </p>
      </Card>
    </div>
  );
};

export default ConnectTwitter;
