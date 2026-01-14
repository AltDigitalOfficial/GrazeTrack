import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

import { apiGet, apiPostJson, apiPutJson, apiPostForm, apiPutForm } from "@/lib/api";
import { useRanch } from "@/lib/ranchContext";

type RanchDTO = {
  id: string;
  name?: string | null;
  description?: string | null;
  dba?: string | null;
  phone?: string | null;

  phys_street?: string | null;
  phys_city?: string | null;
  phys_state?: string | null;
  phys_zip?: string | null;

  mail_street?: string | null;
  mail_city?: string | null;
  mail_state?: string | null;
  mail_zip?: string | null;

  logoImageUrl?: string | null;
  brandImageUrl?: string | null;
};

export default function RanchSettingsPage() {
  const { activeRanchId, loading: meLoading, error: meError, refreshMe } = useRanch();

  // Ranch identity
  const [name, setName] = useState("");
  const [dba, setDba] = useState("");
  const [phone, setPhone] = useState("");

  // Physical Address
  const [physStreet, setPhysStreet] = useState("");
  const [physCity, setPhysCity] = useState("");
  const [physState, setPhysState] = useState("");
  const [physZip, setPhysZip] = useState("");

  // Mailing Address
  const [sameAsPhysical, setSameAsPhysical] = useState(false);
  const [mailStreet, setMailStreet] = useState("");
  const [mailCity, setMailCity] = useState("");
  const [mailState, setMailState] = useState("");
  const [mailZip, setMailZip] = useState("");

  // Branding
  const [brandImage, setBrandImage] = useState<File | null>(null);
  const [logoImage, setLogoImage] = useState<File | null>(null);

  // UX state
  const [saving, setSaving] = useState(false);
  const [loadingRanch, setLoadingRanch] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setDba("");
    setPhone("");

    setPhysStreet("");
    setPhysCity("");
    setPhysState("");
    setPhysZip("");

    setSameAsPhysical(false);
    setMailStreet("");
    setMailCity("");
    setMailState("");
    setMailZip("");

    setBrandImage(null);
    setLogoImage(null);

    setSaveSuccess(false);
    setErrorMsg(null);
  };

  const markDirty = () => {
    setSaveSuccess(false);
    setErrorMsg(null);
  };

  useEffect(() => {
    if (!saveSuccess) return;
    const t = setTimeout(() => setSaveSuccess(false), 4000);
    return () => clearTimeout(t);
  }, [saveSuccess]);

  // ✅ Load ranch data whenever activeRanchId changes (login/user switch)
  useEffect(() => {
    let alive = true;

    const load = async () => {
      if (!activeRanchId) {
        resetForm();
        return;
      }

      setLoadingRanch(true);
      setErrorMsg(null);

      try {
        const r = await apiGet<RanchDTO>(`/ranches/${activeRanchId}`);
        if (!alive) return;

        setName(r.name ?? "");
        setDba(r.dba ?? "");
        setPhone(r.phone ?? "");

        setPhysStreet(r.phys_street ?? "");
        setPhysCity(r.phys_city ?? "");
        setPhysState(r.phys_state ?? "");
        setPhysZip(r.phys_zip ?? "");

        setMailStreet(r.mail_street ?? "");
        setMailCity(r.mail_city ?? "");
        setMailState(r.mail_state ?? "");
        setMailZip(r.mail_zip ?? "");

        const physical = `${r.phys_street ?? ""}|${r.phys_city ?? ""}|${r.phys_state ?? ""}|${r.phys_zip ?? ""}`;
        const mailing = `${r.mail_street ?? ""}|${r.mail_city ?? ""}|${r.mail_state ?? ""}|${r.mail_zip ?? ""}`;
        setSameAsPhysical(physical.length > 3 && physical === mailing);

        setSaveSuccess(false);
      } catch (err: any) {
        console.error("Error loading ranch:", err);
        if (alive) setErrorMsg(err?.message || "Failed to load ranch.");
      } finally {
        if (alive) setLoadingRanch(false);
      }
    };

    load();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRanchId]);

  const handleSameAsPhysical = (checked: boolean) => {
    markDirty();
    setSameAsPhysical(checked);

    if (checked) {
      setMailStreet(physStreet);
      setMailCity(physCity);
      setMailState(physState);
      setMailZip(physZip);
    }
  };

  const handleSubmit = async () => {
    if (saving) return;

    setSaving(true);
    setErrorMsg(null);

    try {
      const finalMailStreet = sameAsPhysical ? physStreet : mailStreet;
      const finalMailCity = sameAsPhysical ? physCity : mailCity;
      const finalMailState = sameAsPhysical ? physState : mailState;
      const finalMailZip = sameAsPhysical ? physZip : mailZip;

      const payload = {
        name,
        dba,
        phone,
        phys_street: physStreet,
        phys_city: physCity,
        phys_state: physState,
        phys_zip: physZip,
        mail_street: finalMailStreet,
        mail_city: finalMailCity,
        mail_state: finalMailState,
        mail_zip: finalMailZip,
      };

      const hasFiles = Boolean(brandImage || logoImage);

      const isUpdate = Boolean(activeRanchId);
      const path = isUpdate ? `/ranches/${activeRanchId}` : `/ranches`;

      let result: { id: string };

      if (!hasFiles) {
        result = isUpdate
          ? await apiPutJson<{ id: string }>(path, payload)
          : await apiPostJson<{ id: string }>(path, payload);
      } else {
        const form = new FormData();
        for (const [k, v] of Object.entries(payload)) form.append(k, v ?? "");
        if (brandImage) form.append("brand", brandImage);
        if (logoImage) form.append("logo", logoImage);

        result = isUpdate
          ? await apiPutForm<{ id: string }>(path, form)
          : await apiPostForm<{ id: string }>(path, form);
      }

      setBrandImage(null);
      setLogoImage(null);
      setSaveSuccess(true);

      // If we created a ranch, /me needs to reflect membership/activeRanchId
      // so refresh the global context once.
      if (!isUpdate && result?.id) {
        await refreshMe();
      }
    } catch (err: any) {
      console.error("Save failed:", err);
      setSaveSuccess(false);
      setErrorMsg(err?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const disabled = saving || loadingRanch || meLoading;

  return (
    <div className="max-w-4xl mx-auto py-10 space-y-6">
      <h1 className="text-3xl font-bold">Ranch Settings</h1>

      {meError && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800">
          <strong>Profile error:</strong> {meError}
        </div>
      )}

      {saveSuccess && (
        <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-green-800">
          <strong>Data saved successfully!</strong>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800">
          <strong>Save failed:</strong> {errorMsg}
        </div>
      )}

      {(meLoading || loadingRanch) && (
        <div className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-stone-700">
          Loading…
        </div>
      )}

      {/* Ranch Identity */}
      <section className="space-y-4 border p-6 rounded-lg">
        <h2 className="text-xl font-semibold">Ranch Identity</h2>

        <div>
          <Label>Ranch Name *</Label>
          <Input
            placeholder="Lazy S Ranch"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              markDirty();
            }}
            required
            disabled={disabled}
          />
        </div>

        <div>
          <Label>DBA (optional)</Label>
          <Input
            placeholder="Doing business as..."
            value={dba}
            onChange={(e) => {
              setDba(e.target.value);
              markDirty();
            }}
            disabled={disabled}
          />
        </div>

        <div>
          <Label>Ranch Phone Number *</Label>
          <Input
            placeholder="(555) 123-4567"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              markDirty();
            }}
            required
            disabled={disabled}
          />
        </div>
      </section>

      {/* Physical Address */}
      <section className="space-y-4 border p-6 rounded-lg">
        <h2 className="text-xl font-semibold">Physical Address *</h2>

        <div>
          <Label>Street</Label>
          <Input
            value={physStreet}
            onChange={(e) => {
              setPhysStreet(e.target.value);
              markDirty();
            }}
            required
            disabled={disabled}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>City</Label>
            <Input
              value={physCity}
              onChange={(e) => {
                setPhysCity(e.target.value);
                markDirty();
              }}
              required
              disabled={disabled}
            />
          </div>
          <div>
            <Label>State</Label>
            <Input
              value={physState}
              onChange={(e) => {
                setPhysState(e.target.value);
                markDirty();
              }}
              required
              disabled={disabled}
            />
          </div>
          <div>
            <Label>ZIP</Label>
            <Input
              value={physZip}
              onChange={(e) => {
                setPhysZip(e.target.value);
                markDirty();
              }}
              required
              disabled={disabled}
            />
          </div>
        </div>
      </section>

      {/* Mailing Address */}
      <section className="space-y-4 border p-6 rounded-lg">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={sameAsPhysical}
            onCheckedChange={(val) => handleSameAsPhysical(Boolean(val))}
            disabled={disabled}
          />
          <Label>Mailing address same as physical</Label>
        </div>

        <h2 className="text-xl font-semibold">Mailing Address</h2>

        <div>
          <Label>Street</Label>
          <Input
            value={mailStreet}
            onChange={(e) => {
              setMailStreet(e.target.value);
              markDirty();
            }}
            disabled={disabled || sameAsPhysical}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>City</Label>
            <Input
              value={mailCity}
              onChange={(e) => {
                setMailCity(e.target.value);
                markDirty();
              }}
              disabled={disabled || sameAsPhysical}
            />
          </div>
          <div>
            <Label>State</Label>
            <Input
              value={mailState}
              onChange={(e) => {
                setMailState(e.target.value);
                markDirty();
              }}
              disabled={disabled || sameAsPhysical}
            />
          </div>
          <div>
            <Label>ZIP</Label>
            <Input
              value={mailZip}
              onChange={(e) => {
                setMailZip(e.target.value);
                markDirty();
              }}
              disabled={disabled || sameAsPhysical}
            />
          </div>
        </div>
      </section>

      {/* Branding */}
      <section className="space-y-4 border p-6 rounded-lg">
        <h2 className="text-xl font-semibold">Branding</h2>

        <div>
          <Label>Ranch Brand (optional)</Label>
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => {
              setBrandImage(e.target.files?.[0] || null);
              markDirty();
            }}
            disabled={disabled}
          />
        </div>

        <div>
          <Label>Business Logo (optional)</Label>
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => {
              setLogoImage(e.target.files?.[0] || null);
              markDirty();
            }}
            disabled={disabled}
          />
        </div>
      </section>

      <Button className="w-full" onClick={handleSubmit} disabled={disabled}>
        {saving ? "Saving…" : saveSuccess ? "Saved ✓" : "Save Ranch"}
      </Button>
    </div>
  );
}
