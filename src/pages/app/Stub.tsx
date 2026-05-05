import { Card } from "@/components/ui/card";
import { Construction } from "lucide-react";

const Stub = ({ title, body }: { title: string; body: string }) => (
  <div className="p-8 max-w-4xl mx-auto">
    <div className="text-xs uppercase tracking-widest text-muted-foreground">Coming next</div>
    <h1 className="font-display text-4xl font-semibold mt-1 mb-6">{title}</h1>
    <Card className="p-12 text-center">
      <Construction className="w-10 h-10 mx-auto text-accent" />
      <p className="mt-4 text-muted-foreground max-w-md mx-auto">{body}</p>
    </Card>
  </div>
);
export default Stub;
