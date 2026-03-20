export type UserRole = "owner" | "co_parent" | "caregiver" | "viewer";
export type PlanTier = "free" | "paid";
export type EventStatus = "pending" | "confirmed" | "cancelled";
export type IngestionStatus = "queued" | "processing" | "parsed" | "failed";
export type MessageType = "text" | "image" | "document" | "audio" | "video";

export interface Family {
  id: string;
  name: string;
  zip_code: string;
  lat: number | null;
  lng: number | null;
  plan_tier: PlanTier;
  ingestion_count: number;
  ingestion_reset: string;
  stripe_customer_id: string | null;
  stripe_sub_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  family_id: string;
  display_name: string;
  phone_e164: string | null;
  role: UserRole;
  push_token: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface Child {
  id: string;
  family_id: string;
  name: string;
  dob: string | null;
  age_in_months: number | null;
  notes: string | null;
  interests: string[];
  created_at: string;
}

export interface Event {
  id: string;
  family_id: string;
  child_id: string | null;
  ingested_doc_id: string | null;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  location: string | null;
  required_actions: string[] | null;
  completed_actions: number[];
  assigned_to: string | null;
  status: EventStatus;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface Theme {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  emoji: string | null;
  age_min_months: number;
  age_max_months: number;
  tags: string[] | null;
  cover_image_url: string | null;
  created_at: string;
}

export interface ThemeActivity {
  id: string;
  theme_id: string;
  sort_order: number;
  category: "watch" | "visit" | "buy" | "make";
  title: string;
  description: string | null;
  url: string | null;
  affiliate_tag: string | null;
  age_min_months: number | null;
  age_max_months: number | null;
}

export interface LocalEvent {
  id: string;
  title: string;
  description: string | null;
  organizer: string | null;
  venue_name: string | null;
  address: string | null;
  zip_code: string;
  lat: number | null;
  lng: number | null;
  start_at: string;
  end_at: string | null;
  age_min_months: number;
  age_max_months: number;
  tags: string[] | null;
  cost_cents: number;
  registration_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ParsedEvent {
  event_title: string;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:MM 24h
  end_time: string | null;
  location: string | null;
  required_actions: string[];
  child_name: string | null;
  confidence: "high" | "medium" | "low";
}

// Joined types for UI
export interface EventWithChild extends Event {
  children?: Pick<Child, "id" | "name" | "age_in_months"> | null;
  assigned_to_name?: string | null;
}

export interface ChildWithNextEvent extends Child {
  next_event?: Pick<Event, "id" | "title" | "start_at"> | null;
}

export interface ThemeWithActivities extends Theme {
  theme_activities: ThemeActivity[];
}
