import { CheckCircle2 } from "lucide-react";

import { OutreachForm } from "@/components/OutreachForm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Campaign builder - Outreachyr",
};

const checklist = [
  "Make sure the company name matches your intended employer.",
  "Read the subject and opening message before previewing.",
  "Confirm recipients and resume attachment before sending.",
];

export default function DashboardPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] overflow-x-hidden bg-muted">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-12">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-[calc(100vw-2.5rem)] sm:max-w-3xl">
            <Badge variant="secondary">Campaign builder</Badge>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Preview the outreach campaign before anything sends.
            </h1>
            <p className="mt-4 text-lg leading-8 text-muted-foreground">
              Add a company, confirm the message, attach a resume, and preview
              matched recruiters. Sending stays locked until you check the final
              review box.
            </p>
          </div>
          <Alert className="max-w-[calc(100vw-2.5rem)] border-primary/20 bg-accent text-accent-foreground lg:max-w-sm">
            <CheckCircle2 aria-hidden="true" />
            <AlertTitle>Review mode is on.</AlertTitle>
            <AlertDescription className="text-accent-foreground/80">
              Previewing recruiters is separate from sending email.
            </AlertDescription>
          </Alert>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <OutreachForm />
          <Card className="h-fit rounded-2xl bg-card shadow-sm">
            <CardHeader className="px-6">
              <CardTitle className="text-lg">Review checklist</CardTitle>
              <CardDescription>
                Use this pass before unlocking the final send action.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6">
              <ol className="flex flex-col gap-4 text-sm leading-6 text-muted-foreground">
                {checklist.map((item, index) => (
                  <li key={item} className="flex gap-3">
                    <Badge
                      variant="secondary"
                      className="mt-0.5 size-6 shrink-0 rounded-full p-0 text-xs font-bold"
                    >
                      {index + 1}
                    </Badge>
                    {item}
                  </li>
                ))}
              </ol>
              <Alert className="mt-6 bg-foreground text-background">
                <CheckCircle2 aria-hidden="true" />
                <AlertDescription className="text-background/80">
                  Outreachyr shows the final recipient list first. If anything
                  looks wrong, change the fields and preview again.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
