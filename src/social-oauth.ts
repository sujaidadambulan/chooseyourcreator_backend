import { ALL_PLATFORMS, PLATFORMS } from "./shared/index.js";
import { config, googleRedirectUri, socialRedirectUri } from "./config.js";
import { HttpError } from "./http.js";

export const CONNECTABLE = ["Instagram", "YouTube"] as const;
export type Connectable = (typeof CONNECTABLE)[number];

export type ConnectedProfile = {
  platform: Connectable;
  providerId: string;
  username: string;
  displayName: string;
  profileUrl: string;
  followers: number;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
};

const SLUG: Record<Connectable, "instagram" | "youtube"> = {
  Instagram: "instagram",
  YouTube: "youtube",
};

export function connectablePlatform(value: string): Connectable {
  const match = CONNECTABLE.find((platform) => platform.toLowerCase() === value.toLowerCase());
  if (!match || !ALL_PLATFORMS.includes(match)) throw new HttpError(400, "Choose Instagram or YouTube");
  return match;
}

export function socialConfigured(platform: Connectable): boolean {
  if (platform === "Instagram") return Boolean(config.instagramClientId && config.instagramClientSecret);
  return Boolean(config.googleClientId && config.googleClientSecret);
}

export function authorizationUrl(platform: Connectable, state: string): string {
  const slug = SLUG[platform];
  const redirectUri = socialRedirectUri(slug);
  if (platform === "Instagram") {
    const url = new URL("https://www.instagram.com/oauth/authorize");
    url.searchParams.set("client_id", config.instagramClientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "instagram_business_basic");
    url.searchParams.set("state", state);
    return url.toString();
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.googleClientId);
  url.searchParams.set("redirect_uri", googleRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/youtube.readonly");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "online");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return body;
}

export async function exchangeSocialCode(platform: Connectable, code: string): Promise<ConnectedProfile> {
  if (platform === "Instagram") return exchangeInstagram(code);
  return exchangeYouTube(code);
}

async function exchangeInstagram(code: string): Promise<ConnectedProfile> {
  const redirectUri = socialRedirectUri("instagram");
  const tokenResponse = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.instagramClientId,
      client_secret: config.instagramClientSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    }),
  });
  const tokenBody = await readJson(tokenResponse);
  const accessToken = String(tokenBody.access_token ?? "");
  if (!tokenResponse.ok || !accessToken) throw new HttpError(400, "Instagram authorization failed");
  const profileResponse = await fetch(
    `https://graph.instagram.com/v21.0/me?fields=user_id,username,name,followers_count&access_token=${encodeURIComponent(accessToken)}`,
  );
  const profile = await readJson(profileResponse);
  if (!profileResponse.ok) throw new HttpError(400, "Instagram profile could not be read");
  const username = String(profile.username ?? "");
  const followers = Number(profile.followers_count);
  if (!username || !Number.isFinite(followers)) {
    throw new HttpError(400, "Instagram did not share a follower count. Use a professional account.");
  }
  return {
    platform: "Instagram",
    providerId: String(profile.user_id ?? tokenBody.user_id ?? username),
    username,
    displayName: String(profile.name ?? username),
    profileUrl: `https://instagram.com/${username}`,
    followers: Math.round(followers),
    accessToken,
    refreshToken: "",
    expiresAt: null,
  };
}

async function exchangeYouTube(code: string): Promise<ConnectedProfile> {
  const redirectUri = googleRedirectUri();
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokenBody = await readJson(tokenResponse);
  const accessToken = String(tokenBody.access_token ?? "");
  if (!tokenResponse.ok || !accessToken) throw new HttpError(400, "YouTube authorization failed");
  const profileResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = await readJson(profileResponse);
  const items = Array.isArray(profile.items) ? profile.items : [];
  const channel = items[0] as { id?: string; snippet?: { title?: string; customUrl?: string }; statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean } } | undefined;
  if (!profileResponse.ok || !channel?.id) throw new HttpError(400, "No YouTube channel was found for this account");
  if (channel.statistics?.hiddenSubscriberCount) {
    throw new HttpError(400, "YouTube subscriber count is hidden on this channel");
  }
  const followers = Number(channel.statistics?.subscriberCount);
  if (!Number.isFinite(followers)) throw new HttpError(400, "YouTube did not share a subscriber count");
  const customUrl = channel.snippet?.customUrl;
  return {
    platform: "YouTube",
    providerId: channel.id,
    username: customUrl?.replace(/^@/, "") || channel.id,
    displayName: channel.snippet?.title || "YouTube channel",
    profileUrl: customUrl ? `https://www.youtube.com/${customUrl.startsWith("@") ? customUrl : `@${customUrl}`}` : `https://www.youtube.com/channel/${channel.id}`,
    followers: Math.round(followers),
    accessToken,
    refreshToken: String(tokenBody.refresh_token ?? ""),
    expiresAt: typeof tokenBody.expires_in === "number" ? new Date(Date.now() + tokenBody.expires_in * 1000) : null,
  };
}

