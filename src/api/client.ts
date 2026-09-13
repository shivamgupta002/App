import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";
import Constants from "expo-constants";

import { secureStorage } from "@/utils/secureStorage";
import {
  CallTarget,
  InitiateCallResponse,
  InitiateTextResponse,
  PublicVehicleResponse,
  QRCodeResponse,
  TokenResponse,
  Vehicle,
  VehicleListResponse,
} from "./types";


/**
 * PUBLIC, unauthenticated masked call — mirrors POST /calls/initiate in
 * app/routers/calls.py. target="owner" (default) bridges to the vehicle
 * owner's real number; target="emergency" bridges to the vehicle's stored
 * emergency_contact instead. Neither number is ever exposed to this client
 * — only Twilio's masked caller ID is visible on either leg of the call.
 */

export async function initiateCall(
  token: string,
  scannerPhone: string,
  target: CallTarget = "owner"
): Promise<InitiateCallResponse> {
  if (USE_MOCK) return { status: "calling", call_id: "mock-call-id" };
  const { data } = await api.post<InitiateCallResponse>("/calls/initiate", {
    token,
    scanner_phone: scannerPhone,
    target,
  });
  return data;
}

/**
 * PUBLIC, unauthenticated masked text — mirrors POST /texts/initiate.
 * One-way: sends `message` to the owner's real phone via a shared Twilio
 * number; there is no reply channel back to the scanner yet (see the
 * backend router's docstring).
 */

export async function initiateText(
  token: string,
  scannerPhone: string,
  message: string
): Promise<InitiateTextResponse> {
  if (USE_MOCK) return { status: "sent", text_id: "mock-text-id" };
  const { data } = await api.post<InitiateTextResponse>("/texts/initiate", {
    token,
    scanner_phone: scannerPhone,
    message,
  });
  return data;
}

// Runtime flag, not a hardcoded boolean — set via app.config.js / EAS env,
// so QA can still flip to mock offline demo mode without a code change.
export const USE_MOCK: boolean =
  Constants.expoConfig?.extra?.USE_MOCK === true ||
  process.env.EXPO_PUBLIC_USE_MOCK === "true";

const API_BASE_URL: string =
  Constants.expoConfig?.extra?.API_BASE_URL ?? "http://127.0.0.1:8000";

// SCAN_BASE_URL is the public web host a printed QR sticker points at —
// this mirrors the backend's settings.FRONTEND_URL used to build
// scan_url = f"{FRONTEND_URL}/vehicle/{token}" in app/services/qr_service.py.
// Kept separate from API_BASE_URL since the scan page is served by the
// frontend/web host, not the API host, and separate from the universal-link
// domain in app.json's associatedDomains/intentFilters, which must match
// this value exactly for a scanned sticker to open the app directly.
const SCAN_BASE_URL: string =
  Constants.expoConfig?.extra?.SCAN_BASE_URL ?? "https://parkconnect.app";

const ACCESS_TOKEN_KEY = "pc_access_token";
const REFRESH_TOKEN_KEY = "pc_refresh_token";

// ---- token storage (via secureStorage: SecureStore on native, localStorage
// fallback on web — see src/utils/secureStorage.ts for why) ----
export const tokenStorage = {
  async getAccessToken() {
    return secureStorage.getItemAsync(ACCESS_TOKEN_KEY);
  },
  async getRefreshToken() {
    return secureStorage.getItemAsync(REFRESH_TOKEN_KEY);
  },
  async setTokens(tokens: TokenResponse) {
    await secureStorage.setItemAsync(ACCESS_TOKEN_KEY, tokens.access_token);
    await secureStorage.setItemAsync(REFRESH_TOKEN_KEY, tokens.refresh_token);
  },
  async clear() {
    await secureStorage.deleteItemAsync(ACCESS_TOKEN_KEY);
    await secureStorage.deleteItemAsync(REFRESH_TOKEN_KEY);
  },
};

// Called by AuthContext to force navigation back to login on refresh failure.
let onAuthFailure: (() => void) | null = null;
export function registerAuthFailureHandler(handler: () => void) {
  onAuthFailure = handler;
}

// ---- dev-only, PII-safe logging ----
const REDACT_KEYS = ["access_token", "refresh_token", "password", "phone_number", "emergency_contact"];
function safeLog(label: string, data: unknown) {
  if (!__DEV__) return;
  const clone = JSON.parse(JSON.stringify(data ?? {}));
  const redact = (obj: any) => {
    if (obj && typeof obj === "object") {
      for (const k of Object.keys(obj)) {
        if (REDACT_KEYS.includes(k)) obj[k] = "[REDACTED]";
        else if (typeof obj[k] === "object") redact(obj[k]);
      }
    }
  };
  redact(clone);
  console.log(`[api] ${label}`, clone);
}

// ---- axios instance ----
export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await tokenStorage.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  safeLog(`-> ${config.method?.toUpperCase()} ${config.url}`, config.data);
  return config;
});

// Single-flight refresh so concurrent 401s don't all race /auth/refresh.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const refresh_token = await tokenStorage.getRefreshToken();
        if (!refresh_token) return null;
        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refresh_token });
        await secureStorage.setItemAsync(ACCESS_TOKEN_KEY, data.access_token);
        return data.access_token as string;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => {
    safeLog(`<- ${response.status} ${response.config.url}`, response.data);
    return response;
  },
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };

    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      // Refresh failed too -> force logout.
      await tokenStorage.clear();
      onAuthFailure?.();
    }

    safeLog(`x  ${error.response?.status} ${original?.url}`, error.response?.data);
    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// Endpoint functions — signatures screens call. USE_MOCK swaps implementation
// only here, never at the call site.
// ---------------------------------------------------------------------------

export async function register(payload: {
  full_name: string;
  email: string;
  phone_number: string;
  password: string;
}): Promise<{ message: string }> {
  if (USE_MOCK) return { message: "Registration successful (mock)." };
  const { data } = await api.post("/auth/register", payload);
  return data;
}

export async function verifyOtp(phone_number: string, code: string): Promise<TokenResponse> {
  if (USE_MOCK) {
    const fake = { access_token: "mock_access", refresh_token: "mock_refresh", token_type: "bearer" };
    await tokenStorage.setTokens(fake);
    return fake;
  }
  const { data } = await api.post<TokenResponse>("/auth/verify-otp", { phone_number, code });
  await tokenStorage.setTokens(data);
  return data;
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  if (USE_MOCK) {
    const fake = { access_token: "mock_access", refresh_token: "mock_refresh", token_type: "bearer" };
    await tokenStorage.setTokens(fake);
    return fake;
  }
  const { data } = await api.post<TokenResponse>("/auth/login", { email, password });
  await tokenStorage.setTokens(data);
  return data;
}

export async function logout(): Promise<void> {
  await tokenStorage.clear();
}

export async function listVehicles(skip = 0, limit = 20): Promise<VehicleListResponse> {
  if (USE_MOCK) return { total: 0, skip, limit, vehicles: [] };
  const { data } = await api.get<VehicleListResponse>("/vehicles", { params: { skip, limit } });
  return data;
}

export async function getVehicle(vehicleId: string): Promise<Vehicle> {
  if (USE_MOCK) throw new Error("getVehicle mock not implemented");
  const { data } = await api.get<Vehicle>(`/vehicles/${vehicleId}`);
  return data;
}

export async function createVehicle(payload: Omit<Vehicle, "id" | "is_active" | "created_at" | "updated_at">): Promise<Vehicle> {
  if (USE_MOCK) throw new Error("createVehicle mock not implemented");
  const { data } = await api.post<Vehicle>("/vehicles", payload);
  return data;
}

/**
 * Updates an existing vehicle. Mirrors PUT /vehicles/{id} (see
 * app/routers/vehicles.py::update_vehicle / app/schemas/vehicle.py::
 * VehicleUpdateRequest) — every field is optional so callers can send a
 * partial patch, and `vehicle_number` is deliberately NOT accepted here:
 * the backend schema doesn't allow updating it (it's treated as immutable
 * after creation), so it must be omitted rather than sent as unchanged.
 * Ownership is enforced server-side; a vehicle that isn't the caller's own
 * (or doesn't exist) returns 404, same "don't leak existence" behavior as
 * the other vehicle routes.
 */
export async function updateVehicle(
  vehicleId: string,
  payload: Partial<
    Pick<Vehicle, "vehicle_type" | "brand" | "model" | "color" | "emergency_contact">
  >
): Promise<Vehicle> {
  if (USE_MOCK) throw new Error("updateVehicle mock not implemented");
  const { data } = await api.put<Vehicle>(`/vehicles/${vehicleId}`, payload);
  return data;
}

/**
 * Fetches this vehicle's one-and-only QR code, creating it on the vehicle's
 * very first call. This is NOT a "regenerate" action — the backend
 * (app/routers/qr.py::generate_vehicle_qr / app/services/qr_service.py::
 * issue_qr_for_vehicle) is intentionally idempotent: once a vehicle has a
 * QRCode document, every call to this endpoint returns that SAME token and
 * image forever, whether it's currently active, dormant, or expired.
 *
 * There is currently no backend endpoint that invalidates a vehicle's
 * existing token and issues a new one. If/when the product wants a true
 * "regenerate my sticker" action (e.g. after a suspected leak), that needs
 * a new backend endpoint first — do not fake one client-side by re-calling
 * this function and assuming the token changed, since it won't.
 */
export async function getOrCreateVehicleQr(vehicleId: string): Promise<QRCodeResponse> {
  if (USE_MOCK) return { token: "mock-token", qr_image_url: null };
  const { data } = await api.post<QRCodeResponse>(`/vehicles/${vehicleId}/qr`);
  return data;
}

/** @deprecated Use getOrCreateVehicleQr — kept so existing call sites don't break. */
export const generateVehicleQr = getOrCreateVehicleQr;

/**
 * Builds the public scan URL for a token, matching the backend's own
 * construction in app/services/qr_service.py:
 *   scan_url = f"{settings.FRONTEND_URL}/vehicle/{token}"
 * This is what gets embedded in the printed QR image, what "Share QR"
 * shares, and what the universal-link / app-link config in app.json routes
 * back into this app's own app/vehicle/[token].tsx screen.
 */
export function buildScanUrl(token: string): string {
  return `${SCAN_BASE_URL}/vehicle/${token}`;
}

/**
 * PUBLIC, unauthenticated lookup — mirrors GET /vehicle/{token} in
 * app/routers/qr.py. Used when the app itself (not just the web page)
 * wants to render scan results in-app after a universal/app link opens it
 * directly on a signed-in owner's device. Deliberately typed to return only
 * PublicVehicleResponse's narrow field set — never widen this without
 * checking the privacy boundary comment in the backend router first.
 *
 * No Authorization header is sent or needed; if the user happens to be
 * logged in, the request interceptor will still attach one, which the
 * backend ignores since this route takes no auth dependency.
 */
export async function fetchPublicVehicleByToken(token: string): Promise<PublicVehicleResponse> {
  if (USE_MOCK) {
    return { vehicle_type: "car", brand: "Toyota", model: "Innova", color: "White", is_active: true };
  }
  const { data } = await api.get<PublicVehicleResponse>(`/vehicle/${token}`);
  return data;
}

export async function deleteVehicle(vehicleId: string): Promise<void> {
  if (USE_MOCK) return;
  await api.delete(`/vehicles/${vehicleId}`);
}
