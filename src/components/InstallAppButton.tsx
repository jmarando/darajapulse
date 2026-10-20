import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

/** Sidebar "Install app" action; hidden once installed or where the browser can't install. */
const InstallAppButton = ({ className = "" }: { className?: string }) => {
  const { canInstall, install } = useInstallPrompt();
  if (!canInstall) return null;
  return (
    <Button variant="ghost" size="sm" className={`w-full justify-start ${className}`} onClick={install}>
      <Download className="w-4 h-4 mr-2" /> Install app
    </Button>
  );
};

export default InstallAppButton;
