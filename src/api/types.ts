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

export interface ApiError {
  code?: string;
  message: string;
}