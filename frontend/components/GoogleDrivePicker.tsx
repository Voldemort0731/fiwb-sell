"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

interface PickerConfig {
  clientId: string;
  apiKey: string;
  appId: string;
  accessToken?: string;
  userEmail?: string;
}

interface GoogleDrivePickerProps {
  onFilesSelected: (fileIds: string[]) => void;
  triggerElement: (openPicker: () => void) => React.ReactNode;
}

export default function GoogleDrivePicker({ onFilesSelected, triggerElement }: GoogleDrivePickerProps) {
  const [config, setConfig] = useState<PickerConfig | null>(null);
  const [syncing, setSyncing] = useState(false);

  // 1. Fetch config from backend
  useEffect(() => {
    api.get("/integrations/drive/config")
      .then(setConfig)
      .catch((err) => console.error("Failed to load Drive config:", err));
  }, []);

  const createPicker = useCallback((accessToken: string) => {
    if (!config) return;
    const g = window as any;

    try {
      // Important: Some browsers need the token to be set explicitly in gapi too
      if (g.gapi && g.gapi.auth) {
        g.gapi.auth.setToken({ access_token: accessToken });
      }

      // Root view for all documents
      const docsView = new g.google.picker.DocsView(g.google.picker.ViewId.DOCS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)
        .setEnableDrives(true)
        .setParent('root');

      // Explicit folders view
      const folderView = new g.google.picker.DocsView(g.google.picker.ViewId.FOLDERS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)
        .setEnableDrives(true);

      const picker = new g.google.picker.PickerBuilder()
        .addView(docsView)
        .addView(folderView)
        .setOAuthToken(accessToken)
        .setDeveloperKey(config.apiKey)
        .setOrigin(window.location.protocol + "//" + window.location.host)
        .enableFeature(g.google.picker.Feature.SUPPORT_DRIVES)
        .enableFeature(g.google.picker.Feature.SUPPORT_TEAM_DRIVES)
        .enableFeature(g.google.picker.Feature.MULTISELECT_ENABLED)
        .setCallback((data: any) => {
          if (data.action === (g.google.picker as any).Action.PICKED) {
            const docs = data.docs;
            if (!docs || docs.length === 0) return;
            const ids = docs.map((d: any) => d.id);
            onFilesSelected(ids);
          }
          if (data.action === (g.google.picker as any).Action.CANCEL) {
            setSyncing(false);
          }
        })
        .build();

      picker.setVisible(true);
    } catch (err) {
      console.error("Picker failed", err);
      alert("Failed to initialize Google Picker. Check if third-party cookies are blocked.");
    }
  }, [config, onFilesSelected]);

  const openPicker = useCallback(async () => {
    if (!config) {
      alert("Drive configuration is still loading...");
      return;
    }

    if (!config.accessToken) {
      alert("Drive not connected. Please connect your Google account first.");
      return;
    }

    setSyncing(true);
    try {
      // 1. Load GAPI (for Picker module)
      const loadGapi = () => {
        return new Promise((resolve) => {
          const g = window as any;
          if (g.gapi && g.google?.picker) {
            resolve(true);
          } else {
            const script = document.createElement("script");
            script.src = "https://apis.google.com/js/api.js";
            script.id = "google-api-script-ref";
            script.onload = () => {
              g.gapi.load("picker", resolve);
            };
            document.body.appendChild(script);
          }
        });
      };

      // 2. Load GSI (for Auth with Hint)
      const loadGsi = () => {
        return new Promise((resolve) => {
          if (window.google?.accounts?.oauth2) {
            resolve(true);
          } else {
            const script = document.createElement("script");
            script.src = "https://accounts.google.com/gsi/client";
            script.id = "google-gsi-script-ref";
            script.onload = resolve;
            document.body.appendChild(script);
          }
        });
      };

      await Promise.all([loadGapi(), loadGsi()]);

      // 3. Request fresh token with Hint (Account Enforcement)
      console.log("DrivePicker: Requesting token for", config.userEmail);
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: config.clientId,
        scope: "https://www.googleapis.com/auth/drive.readonly",
        hint: config.userEmail, 
        callback: (response: any) => {
          if (response.error !== undefined) {
            console.error("Auth error:", response);
            alert(`Authorization failed: ${response.error}`);
            setSyncing(false);
            return;
          }
          console.log("DrivePicker: Token acquired, opening picker...");
          createPicker(response.access_token);
        },
      });

      // Use prompt: "" (consent if needed) instead of "none" for better reliability with hints
      tokenClient.requestAccessToken({ prompt: "" }); 
    } catch (e) {
      console.error("Picker boot failed", e);
      setSyncing(false);
    }
  }, [config, createPicker]);

  return <>{triggerElement(openPicker)}</>;
}
