import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";


const ENV_API_BASE =
  globalThis?.process?.env?.REACT_APP_API_BASE ||
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE) ||
  "";

function normalizeBase(base) {
  if (!base) return "";
  return base.replace(/\/+$/, "");
}

function Spinner({ size = 5, className = "" }) {
  const px = `${size * 4}px`;
  return (
    <svg
      className={`animate-spin ${className}`}
      style={{ width: px, height: px }}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        className="opacity-25"
      />
      <path
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        fill="currentColor"
        className="opacity-75"
      />
    </svg>
  );
}

function useDebounce(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function App() {
  const [tab, setTab] = useState("contacts");

  const [apiBaseInput, setApiBaseInput] = useState(
    () =>
      localStorage.getItem("API_BASE") ||
      ENV_API_BASE ||
      "http://localhost:8000"
  );
  const [apiBase, setApiBase] = useState(() =>
    normalizeBase(
      localStorage.getItem("API_BASE") ||
        ENV_API_BASE ||
        "http://localhost:8000"
    )
  );

  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);

  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editPayload, setEditPayload] = useState({});

  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [lastFetchInfo, setLastFetchInfo] = useState(null);

  // UI helpers
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 200);
  const [sort, setSort] = useState("recent");
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (apiBase) fetchAllCards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  function showToast(txt) {
    setToast(txt);
  }

  function saveApiBase() {
    const v = normalizeBase(apiBaseInput.trim());
    localStorage.setItem("API_BASE", v);
    setApiBase(v);
    setError(null);
    showToast("Backend saved");
  }

  async function doFetch(path, opts = {}) {
    setError(null);
    const url = apiBase
      ? `${apiBase}${path.startsWith("/") ? path : "/" + path}`
      : path.startsWith("/")
      ? path
      : "/" + path;
    setLastFetchInfo({
      url,
      opts: {
        method: opts.method || "GET",
        headers: opts.headers || {},
        body: opts.body ? "<<body>>" : undefined,
      },
      ts: new Date().toISOString(),
    });

    try {
      const res = await fetch(url, opts);
      const ct = res.headers.get("content-type") || "";
      const body = ct.includes("application/json")
        ? await res.json()
        : await res.text();
      if (!res.ok) {
        const detail =
          (body && body.detail) ||
          (typeof body === "string" ? body : JSON.stringify(body));
        throw new Error(`HTTP ${res.status} ${res.statusText} — ${detail}`);
      }
      return body;
    } catch (e) {
      console.error("doFetch error", e);
      throw e;
    }
  }

  async function fetchAllCards() {
    setLoadingContacts(true);
    setError(null);
    try {
      const res = await doFetch("/all_cards");
      setContacts(res.data || []);
    } catch (e) {
      setContacts([]);
      setError(String(e));
    } finally {
      setLoadingContacts(false);
    }
  }

  function clearExtract() {
    setParsed(null);
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = null;
  }

  async function handleExtract(e) {
    e?.preventDefault();
    setError(null);
    if (!file) return setError("Choose an image first");
    setIsExtracting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const headers = {};
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      const url = apiBase ? `${apiBase}/extract` : "/extract";
      setLastFetchInfo({
        url,
        opts: { method: "POST", headers, body: "<<formdata>>" },
        ts: new Date().toISOString(),
      });

      const res = await fetch(url, { method: "POST", headers, body: form });
      const ct = res.headers.get("content-type") || "";
      const body = ct.includes("application/json")
        ? await res.json()
        : await res.text();
      if (!res.ok) {
        const detail =
          (body && body.detail) ||
          (typeof body === "string" ? body : JSON.stringify(body));
        throw new Error(`HTTP ${res.status} ${res.statusText} — ${detail}`);
      }
      setParsed(body);
      setTab("extract");
      showToast("Extraction successful — review fields before saving");
    } catch (e) {
      console.error("extract error", e);
      setError(String(e));
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleSave(parsedData) {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: parsedData.name || null,
        designation: parsedData.designation || null,
        company: parsedData.company || null,
        phone_numbers: parsedData.phone_numbers || [],
        email: parsedData.email || null,
        website: parsedData.website || null,
        address: parsedData.address || null,
        social_links: parsedData.social_links || [],
        more_details: parsedData.more_details || "",
        additional_notes: parsedData.additional_notes || "",
      };
      await doFetch("/create_card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // optimistic UI: append a lightweight card until fetchAllCards completes
      setContacts((c) => [{ _id: `tmp-${Date.now()}`, ...payload }, ...c]);
      await fetchAllCards();
      clearExtract();
      setTab("contacts");
      showToast("Saved");
    } catch (e) {
      console.error("save error", e);
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Delete contact?")) return;

    // optimistic remove
    const prev = contacts;
    setContacts((c) => c.filter((x) => x._id !== id));
    try {
      await doFetch(`/delete_card/${id}`, { method: "DELETE" });
      showToast("Deleted");
    } catch (e) {
      setContacts(prev);
      setError(String(e));
    }
  }

  function startEdit(card) {
    setEditingId(card._id);
    setEditPayload({ ...card });
  }

  async function saveEdit() {
    if (!editingId) return;
    try {
      await doFetch(`/update_card/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editPayload),
      });
      setEditingId(null);
      setEditPayload({});
      await fetchAllCards();
      showToast("Updated");
    } catch (e) {
      setError(String(e));
    }
  }

  // per-contact vCard (uses backend endpoint as before)
  async function downloadVcard(card) {
    try {
      const payload = {
        name: card.name,
        company: card.company,
        title: card.designation,
        phone: card.phone_numbers && card.phone_numbers[0],
        email: card.email,
        website: card.website,
        address: card.address,
      };
      const url = apiBase ? `${apiBase}/vcard` : "/vcard";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status} - ${txt}`);
      }
      const blob = await res.blob();
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = `${(card.name || "contact").replace(/\s+/g, "_")}.vcf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(u);
      showToast("vCard downloaded");
    } catch (e) {
      setError(String(e));
    }
  }

  async function ping() {
    try {
      const res = await doFetch("/ping");
      alert(`Ping OK — server ${res.time || ""}`);
    } catch (e) {
      setError(String(e));
    }
  }

  // Helpers for UI
  function initials(name) {
    if (!name) return "?";
    return name
      .split(" ")
      .map((s) => s[0]?.toUpperCase())
      .slice(0, 2)
      .join("");
  }

  function filteredAndSorted() {
    let list = [...contacts];
    if (debouncedQuery) {
      const q = debouncedQuery.toLowerCase();
      list = list.filter(
        (c) =>
          (c.name || "").toLowerCase().includes(q) ||
          (c.company || "").toLowerCase().includes(q) ||
          (c.email || "").toLowerCase().includes(q)
      );
    }
    if (sort === "alpha")
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    if (sort === "company")
      list.sort((a, b) => (a.company || "").localeCompare(b.company || ""));
    // recent: assume backend returns newest first
    return list;
  }

  // create a vCard string for one contact (vCard 3.0)
  function generateVcardText(contact) {
    const lines = ["BEGIN:VCARD", "VERSION:3.0"];
    if (contact.name) lines.push(`FN:${contact.name}`);
    if (contact.company) lines.push(`ORG:${contact.company}`);
    if (contact.designation) lines.push(`TITLE:${contact.designation}`);
    const phone = (contact.phone_numbers && contact.phone_numbers[0]) || "";
    if (phone) lines.push(`TEL;TYPE=WORK,VOICE:${phone}`);
    if (contact.email) lines.push(`EMAIL;TYPE=WORK:${contact.email}`);
    if (contact.website) lines.push(`URL:${contact.website}`);
    if (contact.address) lines.push(`ADR;TYPE=WORK:;;${contact.address}`);
    lines.push("END:VCARD");
    return lines.join("\n");
  }

  // Export all contacts as a single .vcf file (multiple vCards concatenated)
  function exportAllVcards() {
    if (!contacts || contacts.length === 0) {
      showToast("No contacts to export");
      return;
    }
    const allText = contacts.map((c) => generateVcardText(c)).join("\n");
    const blob = new Blob([allText], { type: "text/vcard;charset=utf-8" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = `contacts_${new Date().toISOString().slice(0, 10)}.vcf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(u);
    showToast("Exported all vCards");
  }

  // Excel export (tries xlsx, falls back to CSV)
  async function exportToExcel() {
    if (!contacts || contacts.length === 0) {
      showToast("No contacts to export");
      return;
    }

    // Normalize rows
    const rows = contacts.map((c) => ({
      Name: c.name || "",
      Designation: c.designation || "",
      Company: c.company || "",
      Phones: (c.phone_numbers || []).join("; "),
      Email: c.email || "",
      Website: c.website || "",
      Address: c.address || "",
      CreatedAt: c.created_at || "",
      EditedAt: c.edited_at || "",
      Notes: c.additional_notes || c.more_details || "",
    }));

    try {
      // try to dynamically import xlsx (SheetJS)
      const XLSX = await import(/* webpackChunkName: "xlsx" */ "xlsx");
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Contacts");
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contacts_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("Excel (.xlsx) exported");
    } catch (e) {
      // fallback to CSV
      try {
        const keys = Object.keys(rows[0]);
        const csv =
          keys.join(",") +
          "\n" +
          rows
            .map((r) =>
              keys
                .map((k) => {
                  const v = (r[k] ?? "").toString();
                  // escape quotes
                  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
                    return `"${v.replace(/"/g, '""')}"`;
                  }
                  return v;
                })
                .join(",")
            )
            .join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `contacts_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast("CSV exported (xlsx not available)");
      } catch (err) {
        console.error("Export to CSV failed", err);
        setError(String(err));
      }
    }
  }

  // Compact card component (hover-reveal — Option B)
  function Card({ c }) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        className="group w-full p-3 border rounded-lg flex items-center justify-between gap-4 hover:shadow-lg transition-shadow duration-150 bg-white"
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-500 via-pink-500 to-yellow-400 text-white font-semibold shadow">
            {initials(c.name)}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 truncate">
              {c.name || "—"}{" "}
              <span className="text-sm text-gray-400">
                {c.designation ? `· ${c.designation}` : ""}
              </span>
            </div>
            <div className="text-sm text-gray-500 truncate">{c.company}</div>
            <div className="text-xs text-gray-500 mt-1 truncate">
              {(c.phone_numbers || []).slice(0, 2).join(", ")}{" "}
              {c.email ? ` · ${c.email}` : ""}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            className="px-3 py-1 border rounded text-sm"
            onClick={() => downloadVcard(c)}
          >
            vCard
          </button>
          <button
            className="px-3 py-1 border rounded text-sm"
            onClick={() => startEdit(c)}
          >
            Edit
          </button>
          <button
            className="px-3 py-1 text-red-600 text-sm"
            onClick={() => handleDelete(c._id)}
          >
            Delete
          </button>
        </div>
      </motion.div>
    );
  }

  // Drag & drop handlers
  function onDropFile(ev) {
    ev.preventDefault();
    setDragOver(false);
    const f = ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (f) setFile(f);
  }

  function onPickFile(e) {
    setFile(e.target.files[0] || null);
  }

  const list = filteredAndSorted();

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-6">
      <div className="max-w-full mx-auto px-8">
        {" "}
        {/* full width container with padding */}
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Business Card Manager
            </h1>
            <p className="text-sm text-gray-500">
              Minimal · Modern · Interactive
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-500">Backend</div>
            <div className="px-3 py-1 rounded bg-white border text-sm text-gray-800">
              {apiBase || "(same origin)"}
            </div>
          </div>
        </header>
        <div className="bg-white rounded-2xl shadow p-3 overflow-hidden">
          <div className="flex gap-2 p-2 bg-gray-100 rounded-lg">
            <button
              className={`px-4 py-2 rounded-t-lg transition ${
                tab === "contacts"
                  ? "bg-white shadow text-gray-900"
                  : "text-gray-500"
              }`}
              onClick={() => setTab("contacts")}
            >
              Contacts
            </button>
            <button
              className={`px-4 py-2 rounded-t-lg transition ${
                tab === "extract"
                  ? "bg-white shadow text-gray-900"
                  : "text-gray-500"
              }`}
              onClick={() => setTab("extract")}
            >
              Extract
            </button>
            <button
              className={`px-4 py-2 rounded-t-lg transition ${
                tab === "settings"
                  ? "bg-white shadow text-gray-900"
                  : "text-gray-500"
              }`}
              onClick={() => setTab("settings")}
            >
              Settings
            </button>
            <button
              className={`px-4 py-2 rounded-t-lg transition ${
                tab === "debug"
                  ? "bg-white shadow text-gray-900"
                  : "text-gray-500"
              }`}
              onClick={() => setTab("debug")}
            >
              Debug
            </button>
          </div>

          <div className="p-4">
            {tab === "settings" && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <input
                  ref={inputRef}
                  className="md:col-span-2 p-3 border rounded-lg"
                  value={apiBaseInput}
                  onChange={(e) => setApiBaseInput(e.target.value)}
                  placeholder="Backend URL (e.g. https://ocr-backend.example.com)"
                />
                <div className="flex gap-2">
                  <button
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg"
                    onClick={saveApiBase}
                  >
                    Save
                  </button>
                  <button
                    className="px-4 py-2 border rounded-lg"
                    onClick={() => {
                      setApiBaseInput("");
                      setApiBase("");
                      localStorage.removeItem("API_BASE");
                    }}
                  >
                    Same origin
                  </button>
                </div>

                <div className="md:col-span-3 text-sm text-gray-600">
                  Security: keep your OpenAI key on the backend. Optionally
                  paste a key here for local testing only.
                </div>
                <div className="md:col-span-3 flex gap-2">
                  <input
                    className="flex-1 p-2 border rounded-lg"
                    placeholder="Optional: OpenAI key (local only)"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  <button
                    className="px-3 py-2 border rounded-lg"
                    onClick={() => setApiKey("")}
                  >
                    Clear
                  </button>
                  <button
                    className="px-3 py-2 border rounded-lg"
                    onClick={ping}
                  >
                    Ping
                  </button>
                </div>
              </div>
            )}

            {tab === "extract" && (
              <div>
                <form onSubmit={handleExtract} className="flex flex-col gap-4">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDropFile}
                    className={`p-4 rounded-lg border-dashed border-2 ${
                      dragOver
                        ? "border-indigo-300 bg-indigo-50"
                        : "border-gray-200 bg-gray-50"
                    } flex items-center gap-4`}
                  >
                    <div className="flex-1">
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={onPickFile}
                      />
                      <div className="text-sm text-gray-600">
                        Drop an image here or{" "}
                        <button
                          type="button"
                          className="underline"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          choose a file
                        </button>
                        .
                      </div>
                      {file && (
                        <div className="text-xs mt-2 font-semibold text-gray-800">
                          Selected:{" "}
                          <span className="font-bold">{file.name}</span> •{" "}
                          {(file.size / 1024).toFixed(0)} KB
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        disabled={isExtracting}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg flex items-center gap-2"
                      >
                        {isExtracting ? (
                          <>
                            <Spinner size={4} /> Extracting
                          </>
                        ) : (
                          "Extract"
                        )}
                      </button>
                      <button
                        type="button"
                        className="px-4 py-2 border rounded-lg"
                        onClick={clearExtract}
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  {error && <div className="text-sm text-red-600">{error}</div>}

                  {parsed ? (
                    <div className="bg-gray-50 p-4 rounded-lg border">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {[
                          "name",
                          "designation",
                          "company",
                          "email",
                          "website",
                          "address",
                        ].map((k) => (
                          <div key={k}>
                            <div className="text-xs text-gray-500 uppercase mb-1">
                              {k}
                            </div>
                            <input
                              className="w-full p-2 border rounded-lg"
                              value={parsed[k] || ""}
                              onChange={(e) =>
                                setParsed((p) => ({
                                  ...p,
                                  [k]: e.target.value,
                                }))
                              }
                            />
                          </div>
                        ))}

                        <div className="md:col-span-2">
                          <div className="text-xs text-gray-500 mb-1">
                            Phones (comma separated)
                          </div>
                          <input
                            className="w-full p-2 border rounded-lg"
                            value={(parsed.phone_numbers || []).join(", ")}
                            onChange={(e) =>
                              setParsed((p) => ({
                                ...p,
                                phone_numbers: e.target.value
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              }))
                            }
                          />
                        </div>

                        <div className="md:col-span-2">
                          <div className="text-xs text-gray-500 mb-1">
                            More details
                          </div>
                          <textarea
                            className="w-full p-2 border rounded-lg"
                            rows={3}
                            value={parsed.more_details || ""}
                            onChange={(e) =>
                              setParsed((p) => ({
                                ...p,
                                more_details: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          className="px-4 py-2 bg-green-600 text-white rounded-lg"
                          onClick={() => handleSave(parsed)}
                          disabled={saving}
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button
                          className="px-4 py-2 border rounded-lg"
                          onClick={() => setParsed(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">
                      Upload an image and press Extract to parse fields.
                    </div>
                  )}
                </form>
              </div>
            )}

            {tab === "contacts" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium">Contacts</h3>
                  <div className="flex items-center gap-2">
                    <input
                      className="p-2 border rounded-lg"
                      placeholder="Search by name, company, email"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <select
                      className="p-2 border rounded-lg"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="recent">Recent</option>
                      <option value="alpha">Name (A–Z)</option>
                      <option value="company">Company</option>
                    </select>
                    <button
                      className="px-3 py-2 border rounded-lg"
                      onClick={fetchAllCards}
                    >
                      Refresh
                    </button>

                    {/* Export vCards */}
                    <button
                      className="px-3 py-2 border rounded-lg"
                      onClick={exportAllVcards}
                      title="Export all contacts as a single .vcf"
                    >
                      Export vCards
                    </button>

                    {/* Excel/CSV export */}
                    <button
                      className="px-3 py-2 bg-green-600 text-white rounded-lg"
                      onClick={exportToExcel}
                      title="Export contacts to Excel (xlsx) or CSV"
                    >
                      Export Excel
                    </button>
                  </div>
                </div>

                {loadingContacts ? (
                  <div className="space-y-3">
                    <div className="h-14 bg-gray-100 rounded animate-pulse"></div>
                    <div className="h-14 bg-gray-100 rounded animate-pulse"></div>
                    <div className="h-14 bg-gray-100 rounded animate-pulse"></div>
                  </div>
                ) : list.length === 0 ? (
                  <div className="text-sm text-gray-500">
                    No contacts yet. Use Extract to create one.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <AnimatePresence>
                      {list.map((c) => (
                        <Card key={c._id} c={c} />
                      ))}
                    </AnimatePresence>
                  </div>
                )}

                {editingId && (
                  <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
                    <motion.div
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.95, opacity: 0 }}
                      className="bg-white rounded-lg p-4 w-full max-w-2xl"
                    >
                      <h4 className="font-semibold mb-2">Edit contact</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                          className="p-2 border rounded"
                          value={editPayload.name || ""}
                          onChange={(e) =>
                            setEditPayload((p) => ({
                              ...p,
                              name: e.target.value,
                            }))
                          }
                          placeholder="Name"
                        />
                        <input
                          className="p-2 border rounded"
                          value={editPayload.designation || ""}
                          onChange={(e) =>
                            setEditPayload((p) => ({
                              ...p,
                              designation: e.target.value,
                            }))
                          }
                          placeholder="Designation"
                        />
                        <input
                          className="p-2 border rounded"
                          value={editPayload.company || ""}
                          onChange={(e) =>
                            setEditPayload((p) => ({
                              ...p,
                              company: e.target.value,
                            }))
                          }
                          placeholder="Company"
                        />
                        <input
                          className="p-2 border rounded"
                          value={editPayload.email || ""}
                          onChange={(e) =>
                            setEditPayload((p) => ({
                              ...p,
                              email: e.target.value,
                            }))
                          }
                          placeholder="Email"
                        />
                        <input
                          className="p-2 border rounded md:col-span-2"
                          value={(editPayload.phone_numbers || []).join(", ")}
                          onChange={(e) =>
                            setEditPayload((p) => ({
                              ...p,
                              phone_numbers: e.target.value
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            }))
                          }
                          placeholder="Phones (comma)"
                        />
                        <textarea
                          className="p-2 border rounded md:col-span-2"
                          rows={3}
                          value={editPayload.additional_notes || ""}
                          onChange={(e) =>
                            setEditPayload((p) => ({
                              ...p,
                              additional_notes: e.target.value,
                            }))
                          }
                          placeholder="Notes"
                        />
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          className="px-3 py-2 border rounded"
                          onClick={() => {
                            setEditingId(null);
                            setEditPayload({});
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          className="px-3 py-2 bg-indigo-600 text-white rounded"
                          onClick={saveEdit}
                        >
                          Save
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </div>
            )}

            {tab === "debug" && (
              <div>
                <h3 className="font-medium mb-2">Debug / last fetch</h3>
                <pre className="text-xs bg-gray-50 p-3 rounded">
                  {JSON.stringify(lastFetchInfo, null, 2) || "(no fetch yet)"}
                </pre>
                {error && (
                  <div className="text-sm text-red-600 mt-2">{error}</div>
                )}
              </div>
            )}
          </div>
        </div>
        <footer className="mt-6 text-sm text-gray-500 text-center">
          FASTAPI + React Business Card Manager
        </footer>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="fixed right-6 bottom-6 bg-gray-900 text-white px-4 py-2 rounded shadow"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}