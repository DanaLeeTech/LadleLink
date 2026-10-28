import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CupStandard, MeasurementPrefs } from "@ladlelink/types";
import { DEFAULT_MEASUREMENT_PREFS } from "@ladlelink/types";
import { usesAustralianMeasures } from "@ladlelink/units";
import { useAuth } from "../api";
import { isDemoMode } from "../data/demo";
import { resetDemoData } from "../data/demo-repository";
import { useRepository } from "../data/RepositoryProvider";
import { importSummary, parseBackupPayload } from "../data/recipe-validation";
import type { DataSourceMode, SyncStatus } from "../data/repository";

export function SettingsPage() {
  const repo = useRepository();
  const { token, setToken } = useAuth();
  const native = repo.isNative();
  const demo = isDemoMode();

  const [prefs, setPrefs] = useState<MeasurementPrefs>(DEFAULT_MEASUREMENT_PREFS);
  const [tokenDraft, setTokenDraft] = useState(token);
  const [mode, setMode] = useState<DataSourceMode>("docker");
  const [baseUrl, setBaseUrl] = useState("");
  const [dockerToken, setDockerToken] = useState("");
  const [folderName, setFolderName] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importReasons, setImportReasons] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setPrefs(await repo.getMeasurementPrefs());
        if (native) {
          setMode(await repo.getMode());
          const cfg = await repo.getDockerConfig();
          setBaseUrl(cfg.baseUrl);
          setDockerToken(cfg.authToken);
          const folder = await repo.getSafFolder();
          setFolderName(folder?.name ?? null);
          setSyncStatus(await repo.getSyncStatus());
        } else {
          setTokenDraft(token);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load settings");
      }
    })();
  }, [repo, native, token]);

  async function savePrefs(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const saved = await repo.setMeasurementPrefs(prefs);
      setPrefs(saved);
      setMessage("Measurement preferences saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function onExport() {
    const payload = await repo.exportAll();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ladlelink-export.json";
    a.click();
    URL.revokeObjectURL(url);
    setMessage("Export downloaded.");
  }

  async function onImportFile(file: File) {
    setError(null);
    setMessage(null);
    setImportReasons([]);
    try {
      const text = await file.text();
      const payload = parseBackupPayload(text);
      const result = await repo.importAll(payload);
      const summary = importSummary(result);
      setImportReasons(summary.reasons);
      if (summary.ok) setMessage(summary.message);
      else setError(summary.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    }
  }

  async function saveDataSource() {
    setBusy(true);
    setError(null);
    try {
      await repo.setMode(mode);
      await repo.setDockerConfig({ baseUrl, authToken: dockerToken });
      setSyncStatus(await repo.getSyncStatus());
      setMessage("Data source saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onTest() {
    setBusy(true);
    setError(null);
    try {
      await repo.setMode(mode);
      await repo.setDockerConfig({ baseUrl, authToken: dockerToken });
      const result = await repo.testConnection();
      if (result.ok) setMessage(result.message);
      else setError(result.message);
      setSyncStatus(await repo.getSyncStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSync() {
    setBusy(true);
    setError(null);
    try {
      await repo.setMode(mode);
      await repo.setDockerConfig({ baseUrl, authToken: dockerToken });
      const result = await repo.syncNow();
      setSyncStatus(await repo.getSyncStatus());
      if (result.conflicts.length > 0) {
        setMessage(
          `Sync done with ${result.conflicts.length} conflict(s). Open Resolve conflicts.`
        );
      } else {
        setMessage(`Synced (pushed ${result.pushed}, pulled ${result.pulled}).`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
      setSyncStatus(await repo.getSyncStatus());
    } finally {
      setBusy(false);
    }
  }

  async function onPickFolder() {
    setBusy(true);
    setError(null);
    try {
      const folder = await repo.pickSafFolder();
      setFolderName(folder?.name ?? null);
      setMode("drive");
      setMessage(folder ? `Folder linked: ${folder.name}` : "No folder selected");
      setSyncStatus(await repo.getSyncStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Folder pick failed");
    } finally {
      setBusy(false);
    }
  }

  async function onClearFolder() {
    await repo.clearSafFolder();
    setFolderName(null);
    setMessage("Folder link cleared.");
  }

  async function onResetDemo() {
    if (!window.confirm("Delete every recipe saved in this browser? This cannot be undone.")) return;
    await resetDemoData();
    window.location.reload();
  }

  return (
    <main className="panel">
      <div className="hero-block">
        <h1 className="page-title">Settings</h1>
        <p className="lede">
          Measurement defaults, data source, and one-click export/import for portability.
        </p>
      </div>

      {native && (
        <>
          <h2 className="section-label">Data source</h2>
          <div className="settings-grid">
            <div className="field">
              <label htmlFor="mode">Mode</label>
              <select
                id="mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as DataSourceMode)}
              >
                <option value="docker">Docker container (self-hosted API)</option>
                <option value="drive">Cloud folder (SAF / Drive sync)</option>
              </select>
            </div>

            {mode === "docker" && (
              <>
                <div className="field">
                  <label htmlFor="baseUrl">API base URL</label>
                  <input
                    id="baseUrl"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="http://192.168.1.10:8080"
                  />
                </div>
                <div className="field">
                  <label htmlFor="dockerToken">Auth token</label>
                  <input
                    id="dockerToken"
                    value={dockerToken}
                    onChange={(e) => setDockerToken(e.target.value)}
                    placeholder="optional"
                  />
                </div>
              </>
            )}

            {mode === "drive" && (
              <div className="field">
                <label>Synced folder</label>
                <p className="meta">
                  {folderName
                    ? `Linked: ${folderName} (stores ladlelink.json)`
                    : "No folder linked yet"}
                </p>
                <div className="toolbar">
                  <button className="btn" type="button" disabled={busy} onClick={() => void onPickFolder()}>
                    Pick folder
                  </button>
                  {folderName && (
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => void onClearFolder()}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="toolbar">
              <button className="btn" type="button" disabled={busy} onClick={() => void saveDataSource()}>
                Save data source
              </button>
              <button className="btn secondary" type="button" disabled={busy} onClick={() => void onTest()}>
                Test connection
              </button>
              <button className="btn secondary" type="button" disabled={busy} onClick={() => void onSync()}>
                Sync now
              </button>
            </div>

            {syncStatus && (
              <p className="meta">
                Last sync:{" "}
                {syncStatus.lastSyncAt
                  ? new Date(syncStatus.lastSyncAt).toLocaleString()
                  : "never"}
                {syncStatus.pendingConflicts > 0 && (
                  <>
                    {" · "}
                    <Link to="/conflicts">{syncStatus.pendingConflicts} conflict(s)</Link>
                  </>
                )}
                {syncStatus.lastError && <> · Error: {syncStatus.lastError}</>}
              </p>
            )}
          </div>
        </>
      )}

      <form className="settings-grid" onSubmit={savePrefs}>
        <h2 className="section-label">Measurement</h2>
        <div className="field">
          <label htmlFor="cupStandard">Cup standard</label>
          <select
            id="cupStandard"
            value={prefs.cupStandard}
            onChange={(e) => {
              const cupStandard = e.target.value as CupStandard;
              setPrefs({
                ...prefs,
                cupStandard,
                australianMeasures: cupStandard === "metric",
              });
            }}
          >
            <option value="metric">Metric (250 ml)</option>
            <option value="us">US (240 ml)</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="australianMeasures">
            <input
              id="australianMeasures"
              type="checkbox"
              checked={usesAustralianMeasures(prefs)}
              onChange={(e) =>
                setPrefs({
                  ...prefs,
                  australianMeasures: e.target.checked,
                  cupStandard: e.target.checked ? "metric" : "us",
                })
              }
            />{" "}
            Australian measures
          </label>
          <p className="meta">
            On: 20 ml tbsp, 5 ml tsp, 250 ml cup, imperial pints and quarts. Off: US
            measures (14.8 ml tbsp, 240 ml cup).
          </p>
        </div>

        <div className="field">
          <label htmlFor="dryPreferredUnit">Default dry unit</label>
          <select
            id="dryPreferredUnit"
            value={prefs.dryPreferredUnit}
            onChange={(e) => setPrefs({ ...prefs, dryPreferredUnit: e.target.value })}
          >
            <option value="g">g</option>
            <option value="kg">kg</option>
            <option value="oz">oz</option>
            <option value="lb">lb</option>
            <option value="cup">cup</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="wetPreferredUnit">Default wet unit</label>
          <select
            id="wetPreferredUnit"
            value={prefs.wetPreferredUnit}
            onChange={(e) => setPrefs({ ...prefs, wetPreferredUnit: e.target.value })}
          >
            <option value="ml">ml</option>
            <option value="l">l</option>
            <option value="cup">cup</option>
            <option value="fl_oz">fl_oz</option>
            <option value="tbsp">tbsp</option>
            <option value="tsp">tsp</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="massSystem">Mass system</label>
          <select
            id="massSystem"
            value={prefs.massSystem}
            onChange={(e) =>
              setPrefs({ ...prefs, massSystem: e.target.value as MeasurementPrefs["massSystem"] })
            }
          >
            <option value="metric">Metric (g/kg)</option>
            <option value="imperial">Imperial (oz/lb)</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="volumeSystem">Volume system</label>
          <select
            id="volumeSystem"
            value={prefs.volumeSystem}
            onChange={(e) =>
              setPrefs({
                ...prefs,
                volumeSystem: e.target.value as MeasurementPrefs["volumeSystem"],
              })
            }
          >
            <option value="metric">Metric (ml/l)</option>
            <option value="customary">Customary (tsp/tbsp/cup)</option>
          </select>
        </div>

        <button className="btn" type="submit">
          Save measurement prefs
        </button>
      </form>

      {demo && (
        <>
          <h2 className="section-label">Demo data</h2>
          <div className="settings-grid">
            <p className="meta">
              This public demo keeps every recipe in this browser — there is no server database,
              and nothing you add is uploaded or shared. Use <strong>Export all recipes</strong>{" "}
              below to save a copy to your device.
            </p>
            <button className="btn secondary" type="button" onClick={() => void onResetDemo()}>
              Clear demo data
            </button>
          </div>
        </>
      )}

      {!native && !demo && (
        <>
          <h2 className="section-label">Access token</h2>
          <div className="settings-grid">
            <div className="field">
              <label htmlFor="token">Bearer token (if your server sets AUTH_TOKEN)</label>
              <input
                id="token"
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value)}
                placeholder="optional"
              />
            </div>
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                setToken(tokenDraft.trim());
                setMessage("Token saved in this browser.");
              }}
            >
              Save token
            </button>
          </div>
        </>
      )}

      <h2 className="section-label">Portability</h2>
      <div className="toolbar">
        <button className="btn" type="button" onClick={() => void onExport()}>
          Export all recipes
        </button>
        <label className="btn secondary" style={{ cursor: "pointer" }}>
          Import JSON
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImportFile(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
      {importReasons.length > 0 && (
        <details className="import-reasons">
          <summary>
            {importReasons.length === 1
              ? "Why 1 entry was skipped"
              : `Why ${importReasons.length} entries were skipped`}
          </summary>
          <ul>
            {importReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
