import { Platform } from "react-native";
import { supabase } from "./supabase";

/**
 * The pmrfp.com API, for the few things the app can't do with supabase-js
 * directly: photo processing (EXIF/GPS strip), the AI draft, and publishing
 * a project (service-role insert). Every call sends the Supabase access
 * token as a bearer token; the server verifies it with Supabase Auth.
 *
 * Point at a preview deploy with EXPO_PUBLIC_SITE_URL.
 */
export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const OFFLINE = "No connection. Check your signal and try again.";

/** Current access token. getSession() refreshes an expired one first. */
async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError("Sign in first.", 401);
  return token;
}

function fallbackMessage(status: number): string {
  if (status === 401) return "Sign in to your company account first.";
  if (status === 429) return "Too many tries. Wait a minute and try again.";
  if (status >= 500) return "Something went wrong on our side. Try again in a minute.";
  return "That didn't work. Try again.";
}

/** JSON request to the site API. Throws ApiError with the server's message. */
export async function apiFetch<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const token = await accessToken();
  const hasBody = init.body !== undefined;
  let res: Response;
  try {
    res = await fetch(`${SITE_URL}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      body: hasBody ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(OFFLINE, 0);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) throw new ApiError(body.error ?? fallbackMessage(res.status), res.status, body.code);
  return body as T;
}

export interface UploadedPhoto {
  url: string;
  path: string;
  width: number;
  height: number;
}

/**
 * Upload one JPEG to /api/projects/photos (multipart, field "file").
 * XMLHttpRequest rather than fetch because only XHR reports upload
 * progress in React Native.
 */
export async function uploadPhoto(uri: string, onProgress: (fraction: number) => void): Promise<UploadedPhoto> {
  const token = await accessToken();
  const form = new FormData();
  if (Platform.OS === "web") {
    // `expo start --web`: the uri is a blob:/data: URL.
    form.append("file", await (await fetch(uri)).blob(), "photo.jpg");
  } else {
    // React Native's FormData streams a local file from {uri, name, type}.
    form.append("file", { uri, name: "photo.jpg", type: "image/jpeg" } as unknown as Blob);
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SITE_URL}/api/projects/photos`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.timeout = 90_000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: Partial<UploadedPhoto> & { error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // Non-JSON, e.g. the platform's own 413 page.
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.url && body.path && body.width && body.height) {
        resolve({ url: body.url, path: body.path, width: body.width, height: body.height });
      } else {
        const msg =
          body.error ?? (xhr.status === 413 ? "That photo is too big. Try a smaller one." : "Upload failed. Tap to retry.");
        reject(new ApiError(msg, xhr.status));
      }
    };
    xhr.onerror = () => reject(new ApiError(OFFLINE, 0));
    xhr.ontimeout = () => reject(new ApiError("Upload timed out. Tap to retry.", 0));
    xhr.send(form);
  });
}
