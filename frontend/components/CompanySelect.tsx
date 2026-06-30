"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Building2, CheckCircle2, ChevronDown, PenLine } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  COMPANY_OPTIONS,
  companyOptionForValue,
  isKnownCompany,
} from "@/lib/companies";
import { cn } from "@/lib/utils";

function CompanyLogo({
  logo,
  label,
  className,
}: {
  logo?: string;
  label: string;
  className?: string;
}) {
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt=""
        aria-hidden
        className={cn("size-5 shrink-0 object-contain", className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground",
        className
      )}
      aria-hidden
    >
      <Building2 className="size-3" />
    </span>
  );
}

export function CompanySelect({
  value,
  onChange,
  invalid,
  placeholder = "Select a company",
}: {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  placeholder?: string;
}) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"list" | "other">(() =>
    value.trim() && !isKnownCompany(value) ? "other" : "list"
  );

  const selected = companyOptionForValue(value);
  const companyReady = value.trim().length > 0;

  useEffect(() => {
    if (value.trim() && !isKnownCompany(value)) {
      setMode("other");
    }
  }, [value]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function selectOption(key: string) {
    onChange(key);
    setMode("list");
    setOpen(false);
  }

  function chooseOther() {
    setMode("other");
    onChange("");
    setOpen(false);
  }

  if (mode === "other") {
    return (
      <div className="space-y-2">
        <div className="relative">
          <Input
            id="company"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Type company name"
            className="h-10 rounded-xl pr-11 text-sm font-medium"
            autoComplete="organization"
            aria-invalid={invalid || undefined}
          />
          {companyReady ? (
            <CheckCircle2
              aria-hidden="true"
              className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-primary"
            />
          ) : null}
          <label
            htmlFor="company"
            className="absolute left-3 top-0 -translate-y-1/2 bg-card px-1 text-xs font-medium text-muted-foreground"
          >
            Company
          </label>
        </div>
        <button
          type="button"
          className="text-xs font-medium text-primary hover:underline"
          onClick={() => {
            setMode("list");
            onChange("");
          }}
        >
          Choose from list
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id="company"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-invalid={invalid || undefined}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex h-10 w-full items-center gap-2.5 rounded-xl border border-input bg-background px-3 pr-10 text-left text-sm font-medium transition-colors",
          "hover:bg-muted/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          open && "border-ring ring-3 ring-ring/50",
          !selected && "text-muted-foreground"
        )}
      >
        {selected ? (
          <>
            <CompanyLogo logo={selected.logo} label={selected.label} />
            <span className="min-w-0 flex-1 truncate text-foreground">
              {selected.label}
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate">{placeholder}</span>
        )}
        <ChevronDown
          aria-hidden
          className={cn(
            "pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {companyReady ? (
        <CheckCircle2
          aria-hidden="true"
          className="pointer-events-none absolute right-9 top-1/2 size-4 -translate-y-1/2 text-primary"
        />
      ) : null}
      <label
        htmlFor="company"
        className="pointer-events-none absolute left-3 top-0 -translate-y-1/2 bg-card px-1 text-xs font-medium text-muted-foreground"
      >
        Company
      </label>

      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Companies"
          className="absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-popover py-1 shadow-lg"
        >
          {COMPANY_OPTIONS.map((option) => {
            const isSelected = selected?.key === option.key;
            return (
              <li key={option.key} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent",
                    isSelected && "bg-accent/80"
                  )}
                  onClick={() => selectOption(option.key)}
                >
                  <CompanyLogo logo={option.logo} label={option.label} />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {option.label}
                  </span>
                </button>
              </li>
            );
          })}
          <li role="presentation" className="my-1 border-t border-border" />
          <li role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={false}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
              onClick={chooseOther}
            >
              <span
                className="flex size-5 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-muted-foreground"
                aria-hidden
              >
                <PenLine className="size-3" />
              </span>
              <span className="font-medium text-foreground">Other company…</span>
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
