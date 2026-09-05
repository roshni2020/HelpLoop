"use client";

// The supply side. One form, one button: "I have food to share."
// Creates a live pin that the ranking treats like any other resource.

import dynamic from "next/dynamic";
import { useState } from "react";
import { useRealtime } from "@/components/RealtimeProvider";
import { Button, Chip, Field, Panel, PanelHeader, TextInput, timeAgo } from "@/components/ui";

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-ink-950" />,
});

const DIETARY = ["vegetarian", "vegan", "halal", "kosher", "gluten-free", "nut-free"];

function defaultUntil(): string {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  d.setMinutes(Math.round(d.getMinutes() / 15) * 15, 0, 0);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function OfferPage() {
  const realtime = useRealtime();
  const [providerName, setProviderName] = useState("");
  const [foodType, setFoodType] = useState("");
  const [quantity, setQuantity] = useState(20);
  const [locationText, setLocationText] = useState("");
  const [until, setUntil] = useState(defaultUntil());
  const [dietary, setDietary] = useState<string[]>([]);
  const [instructions, setInstructions] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<string | null>(null);

  const mine = realtime.offers.filter((o) => o.providerName === providerName.trim() && providerName.trim());
  const center = realtime.offers[0]
    ? { lat: realtime.offers[0].lat, lng: realtime.offers[0].lng }
    : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!providerName.trim() || !foodType.trim() || !locationText.trim()) {
      setError("Name, what you have, and where it is are needed.");
      return;
    }
    setBusy(true);
    try {
      const geo = (await fetch(`/api/geocode?q=${encodeURIComponent(locationText)}`).then((r) =>
        r.json(),
      )) as { lat: number; lng: number; label: string; fallback?: boolean };
      if (geo.fallback) {
        setError("Couldn't place that address. Try adding the city.");
        return;
      }
      const [hh, mm] = until.split(":").map(Number);
      const availableUntil = new Date();
      availableUntil.setHours(hh, mm, 0, 0);
      if (availableUntil.getTime() < Date.now()) availableUntil.setDate(availableUntil.getDate() + 1);

      const id = await realtime.createOffer({
        providerName: providerName.trim(),
        foodType: foodType.trim(),
        quantity,
        locationText: geo.label.split(",").slice(0, 2).join(",").trim(),
        lat: geo.lat,
        lng: geo.lng,
        availableUntil: availableUntil.getTime(),
        dietary,
        instructions: instructions.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      setPosted(id);
      setFoodType("");
      setInstructions("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post the offer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative h-full w-full">
      <MapCanvas center={center} offers={realtime.offers} requests={realtime.requests} />

      <div className="absolute inset-y-0 left-0 flex w-full max-w-[460px] flex-col gap-3 overflow-y-auto p-3 md:max-w-[440px]">
        <div className="flex shrink-0 flex-col gap-3">
          <Panel className="hl-rise overflow-hidden">
            <PanelHeader
              title="I have food to share"
              subtitle="Post it once. It shows on the map and gets offered to whoever it fits, until it runs out."
            />
            <form className="space-y-3.5 p-4" onSubmit={submit}>
              <Field label="You are">
                <TextInput
                  value={providerName}
                  onChange={(e) => setProviderName(e.target.value)}
                  placeholder="Nabila's Kitchen"
                  autoComplete="organization"
                />
              </Field>
              <Field label="What you have">
                <TextInput
                  value={foodType}
                  onChange={(e) => setFoodType(e.target.value)}
                  placeholder="Vegetarian biryani, boxed"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="How many">
                  <TextInput
                    type="number"
                    min={1}
                    max={500}
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value) || 1)}
                  />
                </Field>
                <Field label="Pick up before">
                  <TextInput type="time" value={until} onChange={(e) => setUntil(e.target.value)} />
                </Field>
              </div>
              <Field label="Pickup location" hint="address or cross-streets">
                <TextInput
                  value={locationText}
                  onChange={(e) => setLocationText(e.target.value)}
                  placeholder="1420 Foothill Blvd, Oakland"
                  autoComplete="street-address"
                />
              </Field>
              <Field label="Dietary" hint="tap all that apply">
                <div className="flex flex-wrap gap-1.5">
                  {DIETARY.map((d) => {
                    const on = dietary.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setDietary(on ? dietary.filter((x) => x !== d) : [...dietary, d])
                        }
                        className={`rounded-full border px-2.5 py-1 text-[12.5px] font-semibold transition ${
                          on
                            ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200"
                            : "border-white/10 bg-white/[0.03] text-mist-400 hover:border-white/25"
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="Pickup instructions" hint="optional">
                <TextInput
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Side door, ask for Sam"
                />
              </Field>
              <Field label="Phone" hint="optional - only the volunteer picking up sees it">
                <TextInput
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(510) 555-0142"
                  autoComplete="tel"
                />
              </Field>

              {error && (
                <p className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-[13px] text-rose-200">
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? "Posting…" : "🍱 Post it to the map"}
              </Button>
              {realtime.mode !== "convex" && (
                <p className="text-center text-[12px] text-amber-300">
                  Offers need Convex — set NEXT_PUBLIC_CONVEX_URL.
                </p>
              )}
            </form>
          </Panel>

          {posted && (
            <Panel className="hl-pop overflow-hidden border-emerald-400/40">
              <div className="p-4 text-center">
                <div className="text-3xl">🍱</div>
                <p className="mt-1 text-[17px] font-bold text-white">Live on the map</p>
                <p className="mt-1 text-[13.5px] text-mist-400">
                  It&apos;s now a candidate for anyone nearby asking for food. The count drops as
                  people claim it.
                </p>
              </div>
            </Panel>
          )}

          {mine.length > 0 && (
            <Panel className="hl-rise overflow-hidden">
              <PanelHeader title="Your offers" subtitle="Live counts. They update as meals are claimed." />
              <ul className="divide-y divide-white/5">
                {mine.map((o) => (
                  <li key={o._id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-white">{o.foodType}</p>
                      <p className="text-[12px] text-mist-400">
                        until{" "}
                        {new Date(o.availableUntil).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}{" "}
                        · posted {timeAgo(o.createdAt)}
                      </p>
                    </div>
                    <Chip tone={o.remaining > 0 ? "good" : "neutral"}>
                      {o.remaining}/{o.quantity} left
                    </Chip>
                    <button
                      onClick={() => realtime.closeOffer(o._id)}
                      className="text-[12px] text-mist-400 hover:text-rose-300"
                      title="Take it off the map"
                    >
                      close
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
