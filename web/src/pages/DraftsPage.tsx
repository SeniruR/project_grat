import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type DraftJobSummary } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Breadcrumbs, emailsCrumb, historyCrumb } from "../components/Breadcrumbs";

export function DraftsPage() {
  const { token } = useAuth();
  const [jobs, setJobs] = useState<DraftJobSummary[]>([]);
  const [mailMode, setMailMode] = useState("mock");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .draftJobs(token)
      .then((res) => {
        setJobs(res.jobs);
        setMailMode(res.mailMode);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load drafts"),
      );
  }, [token]);

  return (
    <div className="page">
      <Breadcrumbs
        items={[
          emailsCrumb,
          historyCrumb,
          { label: "Draft jobs" },
        ]}
      />
      <header className="page-header">
        <div>
          <p className="eyebrow">Cards</p>
          <h1>Draft jobs</h1>
          <p className="lede">
            Mock Outlook drafts created from cards · mail mode{" "}
            <code>{mailMode}</code>
          </p>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      {jobs.length === 0 ? (
        <p className="muted">
          No draft jobs yet. Compose will be available after Entra ID sign-in
          and server mail placement are completed.
        </p>
      ) : (
        <ul className="draft-job-list">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link to={`/drafts/${job.id}`} className="draft-job-row">
                <div>
                  <strong>{job.template.name}</strong>
                  <span className="meta">
                    v{job.templateVersion.version} · {job.completed}/{job.total}{" "}
                    · {job.status}
                  </span>
                </div>
                <span className="muted small">
                  {new Date(job.createdAt).toLocaleString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
