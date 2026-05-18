import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Facebook } from "lucide-react";

const ConnectFacebook = () => {
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
          <Facebook className="w-7 h-7" />
        </div>
        <h1 className="font-display text-3xl mt-4">Connect Facebook</h1>
        <p className="text-muted-foreground mt-3">
          {name ? `Hi ${name.split(" ")[0]} — ` : ""}Facebook integration is coming soon. Check back shortly to link your page.
        </p>
      </Card>
    </div>
  );
};

export default ConnectFacebook;
