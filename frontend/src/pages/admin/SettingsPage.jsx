import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  getAppSettings,
  saveAppSettings,
  resetAppSettings,
} from "../../lib/appSettings";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Separator } from "../../components/ui/separator";
import { Badge } from "../../components/ui/badge";

const PRESETS = [
  {
    name: "Amber Navy",
    primary_color: "#155263",
    accent_color: "#ff6f3c",
    sidebar_color: "#155263",
  },
  {
    name: "Nordic Blue",
    primary_color: "#0f4c75",
    accent_color: "#3282b8",
    sidebar_color: "#1b262c",
  },
  {
    name: "Classic Navy",
    primary_color: "#394867",
    accent_color: "#9ba4b5",
    sidebar_color: "#212a3e",
  },
  {
    name: "Campus Sunset",
    primary_color: "#002b5b",
    accent_color: "#ea5455",
    sidebar_color: "#002b5b",
  },
  {
    name: "Soft Coral",
    primary_color: "#f38181",
    accent_color: "#95e1d3",
    sidebar_color: "#fce38a",
  },
  {
    name: "Mint Sky",
    primary_color: "#71c9ce",
    accent_color: "#a6e3e9",
    sidebar_color: "#cbf1f5",
  },
];

function ColorField({ label, value, onChange, helper }) {
  const inputRef = useRef(null);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        {helper ? <span className="text-xs text-muted-foreground">{helper}</span> : null}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="h-10 w-10 rounded-lg border shadow-inner"
          style={{ background: value }}
          onClick={() => inputRef.current?.click()}
          aria-label={`${label} color swatch`}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-xs"
        />
        <input
          ref={inputRef}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 rounded-lg border bg-background p-1"
          aria-label={`${label} color picker`}
        />
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-sm"
    >
      <span
        className={[
          "h-5 w-9 rounded-full border transition-all",
          checked ? "bg-primary border-primary" : "bg-muted border-border",
        ].join(" ")}
      >
        <span
          className={[
            "block h-4 w-4 rounded-full bg-background shadow-sm transition-all",
            checked ? "translate-x-4" : "translate-x-0",
          ].join(" ")}
        />
      </span>
      <span className="text-muted-foreground">{label}</span>
    </button>
  );
}

export default function SettingsPage() {
  const [form, setForm] = useState(() => getAppSettings());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setForm(getAppSettings());
    setDirty(false);
  }, []);

  const update = (patch) => {
    setForm((p) => ({ ...p, ...patch }));
    setDirty(true);
  };

  const onSave = () => {
    saveAppSettings(form);
    toast.success("Settings saved");
    setDirty(false);
  };

  const onReset = () => {
    const s = resetAppSettings();
    setForm(s);
    setDirty(false);
    toast.message("Settings reset");
  };

  const logoPreview = useMemo(() => form.logo_data_url || "", [form.logo_data_url]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold font-display">App Settings</h2>
          <p className="text-sm text-muted-foreground">
            Customize branding, theme colors, header style, and announcements.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onReset}>
            Reset
          </Button>
          <Button onClick={onSave} disabled={!dirty}>
            Save Settings
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Branding</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">App Name</label>
                <Input
                  value={form.brand_name}
                  onChange={(e) => update({ brand_name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Organization Name</label>
                <Input
                  value={form.org_name}
                  onChange={(e) => update({ org_name: e.target.value })}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Tagline</label>
                <Input
                  value={form.tagline}
                  onChange={(e) => update({ tagline: e.target.value })}
                />
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 items-start">
              <div className="space-y-2">
                <label className="text-sm font-medium">Logo Upload</label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      update({ logo_data_url: String(reader.result || "") });
                    };
                    reader.readAsDataURL(file);
                  }}
                />
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="h-16 w-16 rounded-md border object-cover"
                  />
                ) : (
                  <div className="text-xs text-muted-foreground">No logo uploaded</div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Small Logo (Header)</label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      update({ logo_small_data_url: String(reader.result || "") });
                    };
                    reader.readAsDataURL(file);
                  }}
                />
                {form.logo_small_data_url ? (
                  <img
                    src={form.logo_small_data_url}
                    alt="Small logo preview"
                    className="h-12 w-12 rounded-md border object-cover"
                  />
                ) : (
                  <div className="text-xs text-muted-foreground">No small logo uploaded</div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Favicon</label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      update({ favicon_data_url: String(reader.result || "") });
                    };
                    reader.readAsDataURL(file);
                  }}
                />
                {form.favicon_data_url ? (
                  <img
                    src={form.favicon_data_url}
                    alt="Favicon preview"
                    className="h-10 w-10 rounded-md border object-cover"
                  />
                ) : (
                  <div className="text-xs text-muted-foreground">No favicon uploaded</div>
                )}
                <div className="text-xs text-muted-foreground">
                  Recommended: 32×32 or 48×48 PNG
                </div>
              </div>

              <div className="rounded-xl border p-4 bg-gradient-to-br from-muted/40 via-background to-background">
                <div className="text-xs text-muted-foreground">Preview</div>
                <div className="mt-2 flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-xl border"
                    style={{ background: form.primary_color }}
                  />
                  <div>
                    <div className="font-semibold font-display">{form.brand_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {form.tagline || "Tagline preview"}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Badge style={{ background: form.primary_color, color: "white" }}>
                    Primary
                  </Badge>
                  <Badge style={{ background: form.accent_color, color: "white" }}>Accent</Badge>
                  <Badge
                    style={{ background: form.sidebar_color, color: "white" }}
                  >
                    Sidebar
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Theme & Sidebar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-4">
                <ColorField
                  label="Primary Color"
                  value={form.primary_color}
                  onChange={(v) => update({ primary_color: v })}
                  helper="Buttons, highlights"
                />
                <ColorField
                  label="Accent Color"
                  value={form.accent_color}
                  onChange={(v) => update({ accent_color: v })}
                  helper="Badges, active states"
                />
                <ColorField
                  label="Sidebar Color"
                  value={form.sidebar_color}
                  onChange={(v) => update({ sidebar_color: v })}
                  helper="Sidebar background"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="text-sm font-medium">Theme Presets</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => update(p)}
                      className="rounded-xl border bg-background p-3 text-left transition hover:shadow-sm hover:border-primary/40"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-4 w-4 rounded-full border"
                          style={{ background: p.primary_color }}
                        />
                        <span
                          className="h-4 w-4 rounded-full border"
                          style={{ background: p.accent_color }}
                        />
                        <span
                          className="h-4 w-4 rounded-full border"
                          style={{ background: p.sidebar_color }}
                        />
                        <span className="text-xs font-medium">{p.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Layout & Notices</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium">Header Style</label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.header_style}
                  onChange={(e) => update({ header_style: e.target.value })}
                >
                  <option value="glass">Glass</option>
                  <option value="solid">Solid</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Notifications</label>
                <Toggle
                  checked={!!form.notifications_enabled}
                  onChange={(v) => update({ notifications_enabled: v })}
                  label="Enable notification bell"
                />
              </div>

              <Separator />

              <div className="space-y-3">
                <label className="text-sm font-medium">Notice Bar</label>
                <Toggle
                  checked={!!form.notice_enabled}
                  onChange={(v) => update({ notice_enabled: v })}
                  label="Enable scrolling notice"
                />
                <Input
                  placeholder="Notice text..."
                  value={form.notice_text}
                  onChange={(e) => update({ notice_text: e.target.value })}
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Style</label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={form.notice_style}
                      onChange={(e) => update({ notice_style: e.target.value })}
                    >
                      <option value="solid">Solid</option>
                      <option value="gradient">Gradient</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Speed</label>
                    <input
                      type="range"
                      min="10"
                      max="60"
                      value={form.notice_speed}
                      onChange={(e) => update({ notice_speed: Number(e.target.value || 0) })}
                      className="w-full"
                    />
                    <div className="text-[11px] text-muted-foreground">
                      {form.notice_speed}s
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <ColorField
                    label="Notice Background"
                    value={form.notice_bg_color}
                    onChange={(v) => update({ notice_bg_color: v })}
                  />
                  <ColorField
                    label="Notice Accent"
                    value={form.notice_accent_color}
                    onChange={(v) => update({ notice_accent_color: v })}
                    helper="Used in gradient mode"
                  />
                  <ColorField
                    label="Notice Text"
                    value={form.notice_text_color}
                    onChange={(v) => update({ notice_text_color: v })}
                  />
                </div>

                <div className="rounded-lg border px-3 py-2 text-xs font-medium">
                  <div
                    className="rounded-md px-3 py-2"
                    style={{
                      background:
                        form.notice_style === "gradient"
                          ? `linear-gradient(90deg, ${form.notice_bg_color}, ${form.notice_accent_color})`
                          : form.notice_bg_color,
                      color: form.notice_text_color,
                    }}
                  >
                    {form.notice_text || "Notice preview will appear here."}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
