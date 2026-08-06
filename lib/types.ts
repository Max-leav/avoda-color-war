export type User = {
  id: string;
  username: string;
  email: string;
  balance: number;
  is_admin: boolean;
  created_at: string;
};

export type Market = {
  id: string;
  creator_id: string | null;
  title: string;
  description: string | null;
  close_time: string;
  resolved: boolean;
  winning_side: "yes" | "no" | null;
  yes_pool: number;
  no_pool: number;
  created_at: string;
};

export type Bet = {
  id: string;
  user_id: string;
  market_id: string;
  side: "yes" | "no";
  amount: number;
  price: number;
  payout: number | null;
  timestamp: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  type: "signup_bonus" | "bet_placed" | "payout" | "admin_adjustment";
  amount: number;
  description: string | null;
  timestamp: string;
};

export type PaymentInfo = {
  user_id: string;
  venmo_handle: string | null;
  phone_last4: string | null;
  updated_at: string;
};

/** A user row as returned by the admin search, with payment details joined on. */
export type AdminUserResult = User & {
  venmo_handle: string | null;
  phone_last4: string | null;
};
