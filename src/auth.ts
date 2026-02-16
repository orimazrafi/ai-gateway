import jwt from "jsonwebtoken";
import fetch from "node-fetch";
import { config } from "./config.js";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "change-me-in-production";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const DASHBOARD_URL = process.env.DASHBOARD_URL || "http://localhost:5173";

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

export function isAuthEnabled(): boolean {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

export function getGoogleClientId(): string {
  return GOOGLE_CLIENT_ID;
}

/** Verify Google One Tap ID token (from frontend) and return user. */
export async function verifyGoogleIdToken(credential: string): Promise<AuthUser | null> {
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );
    if (!res.ok) return null;
    const payload = (await res.json()) as { sub?: string; email?: string; name?: string; picture?: string };
    if (!payload?.sub) return null;
    return {
      id: payload.sub,
      email: payload.email || payload.sub,
      name: payload.name,
      picture: payload.picture,
    };
  } catch {
    return null;
  }
}

/** Redirect URI for Google OAuth: where Google sends the user after login. Use dashboard so Next.js has a real route. */
function getRedirectUri(): string {
  const dashboard = process.env.DASHBOARD_URL || "http://localhost:5173";
  return `${dashboard.replace(/\/$/, "")}/auth/callback`;
}

export function getLoginRedirectUrl(): string {
  const redirectUri = getRedirectUri();
  const scope = encodeURIComponent("openid email profile");
  return (
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    "&response_type=code" +
    `&scope=${scope}` +
    "&access_type=offline" +
    "&prompt=consent"
  );
}

export async function exchangeCodeForUser(code: string): Promise<AuthUser | null> {
  const redirectUri = getRedirectUri();

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error("Google token error:", tokenRes.status, text);
    return null;
  }

  const tokenData = (await tokenRes.json()) as { id_token?: string; access_token?: string };
  const idToken = tokenData.id_token;
  if (!idToken) return null;

  const payload = jwt.decode(idToken) as { sub?: string; email?: string; name?: string; picture?: string } | null;
  if (!payload?.sub) return null;

  return {
    id: payload.sub,
    email: payload.email || payload.sub,
    name: payload.name,
    picture: payload.picture,
  };
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, picture: user.picture, iss: "ai-gateway" },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub?: string; email?: string; name?: string; picture?: string };
    if (!payload?.sub) return null;
    return { id: payload.sub, email: payload.email || payload.sub, name: payload.name, picture: payload.picture };
  } catch {
    return null;
  }
}

export function getDashboardRedirectWithToken(token: string): string {
  return `${DASHBOARD_URL}#token=${encodeURIComponent(token)}`;
}
