import { Suspense } from "react";
import { Loader2 } from "lucide-react";

import { SendingAccountsView } from "@/components/mail-connections/SendingAccountsView";

export const metadata = {
  title: "Sending Accounts - Outreachyr",
};

export default function SendingAccountsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center text-muted-foreground">
          <Loader2 className="size-8 animate-spin" aria-label="Loading" />
        </div>
      }
    >
      <SendingAccountsView />
    </Suspense>
  );
}
