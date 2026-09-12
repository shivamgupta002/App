export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface Vehicle {
  id: string;
  vehicle_type: "car" | "bike";
  vehicle_number: string;
  brand: string;
  model: string;
  color: string;
  emergency_contact: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VehicleListResponse {
  total: number;
  skip: number;
  limit: number;
  vehicles: Vehicle[];
}

export interface QRCodeResponse {
  token: string;
  qr_image_url: string | null;
}

// GET /vehicle/{token} — the public, unauthenticated scan-page payload.
// Deliberately narrow: never add owner/contact/vehicle_number fields here,
// mirroring the privacy boundary enforced server-side in
// app/schemas/qr.py::PublicVehicleResponse. This type exists so the mobile
// app's own deep-link handler (if it ever renders scan data locally instead
// of just deferring to the web page) can't accidentally widen that contract.
export interface PublicVehicleResponse {
  vehicle_type: "car" | "bike";
  brand: string;
  model: string;
  color: string;
  is_active: boolean;
}

export interface ApiError {
  code?: string;
  message: string;
}