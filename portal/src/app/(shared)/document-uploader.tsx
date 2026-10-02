"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  type DocumentUploadIntent,
} from "@/lib/contracts/documents";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type DocumentUploaderProps = {
  orgId: string;
  requestId?: string | null;
  category: DocumentUploadIntent["category"];
  maxUploadMb: number;
  replacesDocumentId?: string | null;
  compact?: boolean;
  label?: string;
};

export function DocumentUploader({
  orgId,
  requestId = null,
  category,
  maxUploadMb,
  replacesDocumentId = null,
  compact = false,
  label = "Upload document",
}: DocumentUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  async function upload(file: File) {
    setMessage("");

    if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.type as (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number])) {
      setMessage("Choose a PDF, CSV, XLSX, DOCX, PNG, or JPG file.");
      return;
    }

    if (file.size > maxUploadMb * 1024 * 1024) {
      setMessage(`Files must be ${maxUploadMb} MB or smaller.`);
      return;
    }

    setWorking(true);

    try {
      const intentResponse = await fetch("/api/documents/upload-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          requestId,
          category,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          replacesDocumentId,
        }),
      });

      const intent = await intentResponse.json();
      if (!intentResponse.ok || !intent.ok || !intent.path || !intent.token || !intent.intentId) {
        throw new Error(intent.error || "The upload could not be authorized.");
      }

      const supabase = createBrowserSupabaseClient();
      const { error: storageError } = await supabase.storage
        .from("private-documents")
        .uploadToSignedUrl(intent.path, intent.token, file, {
          contentType: file.type,
          cacheControl: "3600",
        });

      if (storageError) {
        throw new Error("The file could not be uploaded.");
      }

      const completeResponse = await fetch("/api/documents/complete-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intentId: intent.intentId }),
      });
      const completed = await completeResponse.json();

      if (!completeResponse.ok || !completed.ok) {
        throw new Error(completed.error || "The uploaded file could not be finalized.");
      }

      setMessage("Upload complete.");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (uploadError) {
      setMessage(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className={compact ? "document-uploader document-uploader--compact" : "document-uploader"}>
      <label className={compact ? "text-button upload-label" : "button upload-label"}>
        <span>{working ? "Uploading…" : label}</span>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.csv,.xlsx,.docx,.png,.jpg,.jpeg"
          disabled={working}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </label>
      {message ? (
        <span className={message === "Upload complete." ? "upload-success" : "field-message"} role="status">
          {message}
        </span>
      ) : null}
    </div>
  );
}
