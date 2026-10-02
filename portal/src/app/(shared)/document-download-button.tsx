"use client";

import { useState } from "react";

type DocumentDownloadButtonProps = {
  documentId: string;
  label?: string;
};

export function DocumentDownloadButton({
  documentId,
  label = "Download",
}: DocumentDownloadButtonProps) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setWorking(true);
    setError("");

    try {
      const response = await fetch("/api/documents/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok || !result.url) {
        throw new Error(result.error || "Download link could not be created.");
      }

      window.location.assign(result.url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Download failed.");
      setWorking(false);
    }
  }

  return (
    <span className="document-action-stack">
      <button className="text-button" type="button" onClick={download} disabled={working}>
        {working ? "Preparing…" : label}
      </button>
      {error ? <span className="field-message" role="alert">{error}</span> : null}
    </span>
  );
}
