"use client";

import { useState } from "react";
import { Button, Field, Panel, PanelHeader, Select, TextInput } from "./ui";
import {
  CATEGORY_OPTIONS,
  WHO_OPTIONS,
  type Category,
  type Diet,
  type HelpNeed,
  type Transport,
  type Urgency,
  type Who,
} from "@/lib/types";

const DIETS: { value: Diet; label: string }[] = [
  { value: "any", label: "No restriction" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "halal", label: "Halal" },
  { value: "kosher", label: "Kosher" },
  { value: "gluten-free", label: "Gluten-free" },
];

const TRANSPORT: { value: Transport; label: string }[] = [
  { value: "walking", label: "🚶 Walking only" },
  { value: "transit", label: "🚌 Bus / transit" },
  { value: "bike", label: "🚲 Bike" },
  { value: "car", label: "🚗 I have a car" },
];

const URGENCY: { value: Urgency; label: string }[] = [
  { value: "tonight", label: "Tonight" },
  { value: "today", label: "Sometime today" },
  { value: "this-week", label: "This week" },
];

export default function RequestHelpForm({
  onSubmit,
  busy,
}: {
  onSubmit: (need: HelpNeed) => void;
  busy?: boolean;
}) {
  const [need, setNeed] = useState("Dinner tonight");
  const [locationText, setLocationText] = useState("Oakland, CA");
  const [diet, setDiet] = useState<Diet>("vegetarian");
  const [transport, setTransport] = useState<Transport>("walking");
  const [urgency, setUrgency] = useState<Urgency>("tonight");
  const [notes, setNotes] = useState("");
  const [phone, setPhone] = useState("");
  const [who, setWho] = useState<Who>("anyone");
  const [category, setCategory] = useState<Category>("food");
  const cat = CATEGORY_OPTIONS.find((c) => c.value === category)!;

  return (
    <Panel className="hl-rise overflow-hidden">
      <PanelHeader
        title="What do you need help with?"
        subtitle="Answer four things and HelpLoop researches what's actually open near you."
      />
      <form
        className="space-y-3.5 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          onSubmit({
            category,
            need: need.trim() || cat.placeholder,
            locationText: locationText.trim() || "Oakland, CA",
            lat: 0,
            lng: 0,
            diet,
            transport,
            urgency,
            who,
            notes: notes.trim() || undefined,
            phone: phone.trim() || undefined,
          });
        }}
      >
        <div className="grid grid-cols-3 gap-2">
          {CATEGORY_OPTIONS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => {
                setCategory(c.value);
                setNeed(c.placeholder);
              }}
              className={`rounded-xl border px-2 py-2.5 text-[15px] font-semibold transition ${
                category === c.value
                  ? "border-violet-400/60 bg-violet-500/20 text-violet-100"
                  : "border-white/10 bg-white/[0.03] text-mist-400 hover:border-white/25"
              }`}
            >
              {c.emoji} {c.label}
              {c.value !== "food" && (
                <span className="ml-1 rounded bg-white/10 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-mist-400">
                  beta
                </span>
              )}
            </button>
          ))}
        </div>

        <Field label="Who are you?" hint="changes which doors are open">
          <div className="grid grid-cols-2 gap-1.5">
            {WHO_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                title={o.hint}
                onClick={() => setWho(o.value)}
                className={`rounded-lg border px-2 py-1.5 text-left text-[13px] font-semibold leading-tight transition ${
                  who === o.value
                    ? "border-violet-400/60 bg-violet-500/20 text-violet-100"
                    : "border-white/10 bg-white/[0.03] text-mist-400 hover:border-white/25"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="I need">
          <TextInput
            value={need}
            onChange={(e) => setNeed(e.target.value)}
            placeholder={cat.placeholder}
          />
        </Field>

        <Field label="Near" hint="City, neighbourhood or address">
          <TextInput
            value={locationText}
            onChange={(e) => setLocationText(e.target.value)}
            placeholder="Oakland, CA"
          />
        </Field>

        <div className={`grid gap-3 ${category === "food" ? "grid-cols-2" : "grid-cols-1"}`}>
          {category === "food" && (
          <Field label="Dietary need">
            <Select value={diet} onChange={(e) => setDiet(e.target.value as Diet)}>
              {DIETS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
          )}
          <Field label="Getting there">
            <Select
              value={transport}
              onChange={(e) => setTransport(e.target.value as Transport)}
            >
              {TRANSPORT.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="How soon">
          <div className="grid grid-cols-3 gap-2">
            {URGENCY.map((u) => (
              <button
                key={u.value}
                type="button"
                onClick={() => setUrgency(u.value)}
                className={`rounded-xl border px-2 py-2 text-[13.5px] font-semibold transition ${
                  urgency === u.value
                    ? "border-violet-400/60 bg-violet-500/20 text-violet-100"
                    : "border-white/10 bg-white/[0.03] text-mist-400 hover:border-white/25"
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Phone" hint="optional - only your volunteer sees it">
          <TextInput
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(510) 555-0123"
            autoComplete="tel"
          />
        </Field>

        <Field label="Anything else" hint="optional">
          <TextInput
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Two people, no ID on me"
          />
        </Field>

        <Button type="submit" size="lg" disabled={busy} className="w-full">
          {busy ? "Researching…" : "Find help"}
        </Button>

        <p className="text-center text-[11.5px] leading-relaxed text-ink-500">
          No account, no ID, nothing stored about you beyond this request.
        </p>
      </form>
    </Panel>
  );
}
