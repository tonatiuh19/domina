import dotenv from "dotenv";

dotenv.config({ override: false });

import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import mysql, {
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";
import { Resend } from "resend";
import Stripe from "stripe";
import { z } from "zod";
import type {
  AdminProfile,
  AdminRole,
  AppLanguage,
  Audience,
  CatalogKind,
  CatalogOption,
  Course,
  CourseEdition,
  CourseGalleryImage,
  CourseStatus,
  EditionStatus,
  EnrollmentStatus,
  PaginationInfo,
  PaymentMethod,
  UserProfile,
} from "../shared/api";

type AuthedRequest = Request & {
  user?: UserProfile;
  admin?: AdminProfile;
};

const emailSchema = z.string().trim().email().max(255).transform((value) => value.toLowerCase());

export function shouldSendLiveEmail(email: string): boolean {
  if (process.env.VITEST === "true") return false;
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (domain === "example.test" || domain === "example.com") return false;
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.SMTP_FROM?.trim());
}

function pepper(): string {
  const value = process.env.JWT_SECRET?.trim();
  if (!value) throw new Error("JWT_SECRET is required");
  return value;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashCode(code: string): string {
  return sha256(`${pepper()}:${code}`);
}

function hashToken(token: string): string {
  return sha256(token);
}

function newCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

function newToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function randomLetters(length: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

let pool: Pool | null = null;

function db(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 4000),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: process.env.DB_SSL === "false" ? undefined : { minVersion: "TLSv1.2" },
      waitForConnections: true,
      connectionLimit: process.env.VITEST ? 4 : 8,
      enableKeepAlive: true,
      connectTimeout: 20_000,
    });
  }
  return pool;
}

function bearer(req: Request): string | null {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/** Detect MySQL/TiDB duplicate-key failures (including TiDB `?` placeholders). */
export function isDuplicateKeyError(error: { code?: string; errno?: number; message?: string }): boolean {
  if (error?.code === "ER_DUP_ENTRY" || error?.errno === 1062) return true;
  return /duplicate entry/i.test(String(error?.message || ""));
}

/** Map known DB errors to client-safe status + copy. Returns null for unknown errors. */
export function mapFriendlyDbError(error: {
  code?: string;
  message?: string;
}): { status: number; error: string } | null {
  if (isDuplicateKeyError(error) || error?.code === "ER_DUP_ENTRY") {
    return { status: 409, error: "That record already exists." };
  }
  if (error?.code === "ER_NO_REFERENCED_ROW_2" || error?.code === "ER_ROW_IS_REFERENCED_2") {
    return { status: 400, error: "That record is linked to something else." };
  }
  return null;
}

function sendDbError(res: Response, error: { code?: string; message?: string }) {
  const mapped = mapFriendlyDbError(error);
  if (mapped) return res.status(mapped.status).json({ error: mapped.error });
  console.error(error?.message || error);
  return res.status(500).json({ error: "Something went wrong. Try again." });
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return value ? new String(value).toString() : "";
}

function money(cents: number, currency = "MXN", language: AppLanguage = "es"): string {
  return new Intl.NumberFormat(language === "en" ? "en-US" : "es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function parseListQuery(req: Request, defaults: { limit?: number; maxLimit?: number } = {}) {
  const maxLimit = defaults.maxLimit ?? 100;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(req.query.limit) || defaults.limit || 20));
  const search = String(req.query.search || "")
    .trim()
    .slice(0, 120);
  const sortBy = String(req.query.sortBy || "")
    .trim()
    .slice(0, 40);
  const sortDir = String(req.query.sortDir || "DESC").toUpperCase() === "ASC" ? "ASC" : "DESC";
  return { page, limit, search, sortBy, sortDir, offset: (page - 1) * limit };
}

function paginationOf(page: number, limit: number, total: number): PaginationInfo {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / Math.max(limit, 1))),
  };
}

function slugifyTitle(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

async function courseSlugExists(slug: string): Promise<boolean> {
  const [rows] = await db().query<RowDataPacket[]>("SELECT id FROM courses WHERE slug = ? LIMIT 1", [slug]);
  return Boolean(rows[0]);
}

/** Prefer `base`; if taken, try base-2 … base-99, then a timestamped fallback. */
async function allocateUniqueCourseSlug(preferred: string): Promise<string> {
  const cleaned = preferred.replace(/^-+|-+$/g, "").slice(0, 160);
  const base = cleaned || `curso-${Date.now()}`;
  if (!(await courseSlugExists(base))) return base;
  for (let n = 2; n <= 99; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, Math.max(1, 160 - suffix.length))}${suffix}`;
    if (!(await courseSlugExists(candidate))) return candidate;
  }
  return `${base.slice(0, 140)}-${Date.now()}`.slice(0, 160);
}

function publicSiteUrl(): string {
  return (process.env.VITE_PUBLIC_SITE_URL || "http://localhost:8080").trim().replace(/\/$/, "");
}

function smtpFromAddress(): string {
  const from = (process.env.SMTP_FROM || "").trim();
  const match = from.match(/<([^>]+)>/);
  return (match?.[1] || from || "hello@dominahabilidades.com").trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  return new Date(String(value || ""));
}

/** Local wall-clock stamp for ICS (workshop times are America/Mexico_City). */
function icsLocalStamp(value: unknown): string {
  const date = asDate(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "00";
  return `${get("year")}${get("month")}${get("day")}T${get("hour")}${get("minute")}${get("second")}`;
}

function icsUtcStamp(value: Date = new Date()): string {
  const iso = value.toISOString().replace(/[-:]/g, "");
  return `${iso.slice(0, 15)}Z`;
}

function formatWorkshopWhen(startsAt: unknown, endsAt: unknown, language: AppLanguage): string {
  const start = asDate(startsAt);
  const end = asDate(endsAt);
  const locale = language === "en" ? "en-US" : "es-MX";
  const dateFmt = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Mexico_City",
  });
  const timeFmt = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  });
  return `${dateFmt.format(start)} · ${timeFmt.format(start)} – ${timeFmt.format(end)}`;
}

function emailShell(title: string, body: string, language: AppLanguage = "es"): string {
  const tagline =
    language === "en"
      ? "Learn. Practice. Master. Guadalajara and Zapopan."
      : "Aprende. Practica. Domina. Guadalajara y Zapopan.";
  return `<!doctype html>
<html lang="${language === "en" ? "en" : "es"}">
<body style="margin:0;background:#f4f0e6;color:#1c1b19;font-family:Manrope,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f0e6;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" style="max-width:560px;background:#fffdf8;border:1px solid #e6e0d4;border-radius:22px;overflow:hidden;">
        <tr><td style="background:#12352b;padding:28px 32px;">
          <div style="font-size:11px;letter-spacing:.24em;font-weight:700;color:#d6f25c;">DOMINA</div>
          <div style="margin-top:10px;font-size:26px;line-height:1.15;font-weight:700;color:#f6f3ec;">${title}</div>
        </td></tr>
        <tr><td style="padding:28px 32px;font-size:15px;line-height:1.65;">${body}</td></tr>
        <tr><td style="padding:0 32px 28px;font-size:12px;color:#6d6a62;">${tagline}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

type EmailAttachment = {
  filename: string;
  content: string | Buffer;
  contentType?: string;
};

async function sendEmail(to: string, subject: string, html: string, attachments?: EmailAttachment[]) {
  if (!shouldSendLiveEmail(to)) return { skipped: true };
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.SMTP_FROM as string,
    to,
    subject,
    html,
    ...(attachments?.length ? { attachments } : {}),
  });
  return { skipped: false };
}

function buildSeatCalendarInvite(input: {
  enrollmentId: number;
  email: string;
  name: string;
  title: string;
  promise: string;
  startsAt: unknown;
  endsAt: unknown;
  venueName: string;
  venueAddress: string;
  city: string;
  language: AppLanguage;
}): string {
  const site = publicSiteUrl();
  const organizer = smtpFromAddress();
  const location = [input.venueName, input.venueAddress, input.city].filter(Boolean).join(", ");
  const summary = input.language === "en" ? `DOMINA · ${input.title}` : `DOMINA · ${input.title}`;
  const description = [
    input.promise,
    input.language === "en" ? `Your seat: ${site}/cuenta` : `Tu lugar: ${site}/cuenta`,
  ]
    .filter(Boolean)
    .join("\n");
  const uid = `enrollment-${input.enrollmentId}@domina`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DOMINA//Seat Confirmation//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsUtcStamp()}`,
    `DTSTART;TZID=America/Mexico_City:${icsLocalStamp(input.startsAt)}`,
    `DTEND;TZID=America/Mexico_City:${icsLocalStamp(input.endsAt)}`,
    `SUMMARY:${icsEscape(summary)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    location ? `LOCATION:${icsEscape(location)}` : null,
    `ORGANIZER;CN=DOMINA:mailto:${organizer}`,
    `ATTENDEE;CN=${icsEscape(input.name || input.email)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${input.email}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    `URL:${site}/cuenta`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #ebe6da;width:34%;vertical-align:top;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6d6a62;font-weight:700;">${label}</td>
    <td style="padding:10px 0;border-bottom:1px solid #ebe6da;vertical-align:top;font-size:15px;color:#1c1b19;font-weight:600;">${value}</td>
  </tr>`;
}

async function sendSeatConfirmationEmail(input: {
  enrollmentId: number;
  method: PaymentMethod;
  brand: string | null;
  last4: string | null;
}) {
  const [rows] = await db().query<RowDataPacket[]>(
    `SELECT u.email, u.first_name, u.last_name, u.preferred_language,
            e.amount_cents, e.currency,
            c.title, c.promise, c.slug,
            ed.starts_at, ed.ends_at, ed.venue_name, ed.venue_address, ed.city
       FROM enrollments e
       JOIN users u ON u.id = e.user_id
       JOIN course_editions ed ON ed.id = e.edition_id
       JOIN courses c ON c.id = ed.course_id
      WHERE e.id = ?
      LIMIT 1`,
    [input.enrollmentId],
  );
  const row = rows[0];
  if (!row?.email) return { skipped: true as const };

  const language: AppLanguage = row.preferred_language === "en" ? "en" : "es";
  const firstName = String(row.first_name || "").trim();
  const fullName = `${firstName} ${String(row.last_name || "").trim()}`.trim() || String(row.email);
  const title = String(row.title || "");
  const promise = String(row.promise || "");
  const venueName = String(row.venue_name || "");
  const venueAddress = String(row.venue_address || "");
  const city = String(row.city || "");
  const when = formatWorkshopWhen(row.starts_at, row.ends_at, language);
  const where = [venueName, venueAddress, city].filter(Boolean).join(" · ") || city || "Guadalajara";
  const amount = money(Number(row.amount_cents || 0), String(row.currency || "MXN"), language);
  const methodLabel = (() => {
    if (input.method === "oxxo") return "OXXO";
    if (input.method === "transfer") return language === "en" ? "Bank transfer" : "Transferencia";
    if (input.method === "company_invoice") return language === "en" ? "Company invoice" : "Factura empresa";
    if (input.method === "complimentary") return language === "en" ? "Complimentary" : "Cortesía";
    if (input.method === "coupon") return language === "en" ? "Coupon" : "Cupón";
    if (input.last4) {
      return language === "en"
        ? `Card ${input.brand || ""} ···· ${input.last4}`.replace(/\s+/g, " ").trim()
        : `Tarjeta ${input.brand || ""} ···· ${input.last4}`.replace(/\s+/g, " ").trim();
    }
    return language === "en" ? "Card" : "Tarjeta";
  })();
  const accountUrl = `${publicSiteUrl()}/cuenta`;
  const copy =
    language === "en"
      ? {
          subject: `Seat confirmed · ${title}`,
          headline: "You're in. Seat locked.",
          hello: firstName ? `Hi ${escapeHtml(firstName)},` : "Hi,",
          lead: `Payment cleared for <strong>${escapeHtml(title)}</strong>. Your place is reserved — show up ready to practice.`,
          when: "When",
          where: "Where",
          paid: "Paid",
          method: "Method",
          promise: "What you'll leave with",
          cta: "Open my practice",
          calendar: "A calendar invite is attached so you can add this workshop in one tap.",
          footer: "See you in the room.",
        }
      : {
          subject: `Lugar confirmado · ${title}`,
          headline: "Ya estás dentro. Lugar asegurado.",
          hello: firstName ? `Hola ${escapeHtml(firstName)},` : "Hola,",
          lead: `El pago de <strong>${escapeHtml(title)}</strong> quedó registrado. Tu lugar está reservado — llega listo para practicar.`,
          when: "Cuándo",
          where: "Dónde",
          paid: "Pagaste",
          method: "Método",
          promise: "Con lo que te vas",
          cta: "Abrir mi práctica",
          calendar: "Adjuntamos una invitación de calendario para que agregues el taller en un toque.",
          footer: "Te esperamos en la práctica.",
        };

  const body = `
    <p style="margin:0 0 14px;">${copy.hello}</p>
    <p style="margin:0 0 22px;">${copy.lead}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
      ${detailRow(copy.when, escapeHtml(when))}
      ${detailRow(copy.where, escapeHtml(where))}
      ${detailRow(copy.paid, escapeHtml(amount))}
      ${detailRow(copy.method, escapeHtml(methodLabel))}
      ${promise ? detailRow(copy.promise, escapeHtml(promise)) : ""}
    </table>
    <p style="margin:0 0 22px;">
      <a href="${accountUrl}" style="display:inline-block;background:#12352b;color:#d6f25c;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:.04em;padding:14px 20px;border-radius:999px;">${copy.cta}</a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:#6d6a62;">${copy.calendar}</p>
    <p style="margin:0;font-size:14px;font-weight:600;color:#12352b;">${copy.footer}</p>
  `;

  const ics = buildSeatCalendarInvite({
    enrollmentId: input.enrollmentId,
    email: String(row.email),
    name: fullName,
    title,
    promise,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    venueName,
    venueAddress,
    city,
    language,
  });

  return sendEmail(String(row.email), copy.subject, emailShell(copy.headline, body, language), [
    {
      filename: language === "en" ? "domina-workshop.ics" : "domina-taller.ics",
      content: Buffer.from(ics, "utf8"),
      contentType: "text/calendar; method=REQUEST; charset=UTF-8",
    },
  ]);
}

type OxxoVoucherDetails = {
  voucherUrl: string;
  reference: string | null;
  expiresAt: number | null;
};

function oxxoDetailsFromPaymentIntent(intent: Stripe.PaymentIntent | string | null | undefined): OxxoVoucherDetails | null {
  if (!intent || typeof intent === "string") return null;
  const details = intent.next_action?.oxxo_display_details;
  const voucherUrl = details?.hosted_voucher_url?.trim();
  if (!voucherUrl) return null;
  return {
    voucherUrl,
    reference: details?.number?.trim() || null,
    expiresAt: typeof details?.expires_after === "number" ? details.expires_after : null,
  };
}

async function resolveOxxoVoucherDetails(
  stripe: Stripe,
  checkoutSessionId: string,
  prefetched?: Stripe.Checkout.Session | null,
): Promise<OxxoVoucherDetails | null> {
  const session =
    prefetched ||
    (await stripe.checkout.sessions.retrieve(checkoutSessionId, {
      expand: ["payment_intent"],
    }));
  const fromSession = oxxoDetailsFromPaymentIntent(
    session.payment_intent as Stripe.PaymentIntent | string | null | undefined,
  );
  if (fromSession) return fromSession;

  const intentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent && typeof session.payment_intent === "object"
        ? session.payment_intent.id
        : null;
  if (!intentId) return null;
  const intent = await stripe.paymentIntents.retrieve(intentId);
  return oxxoDetailsFromPaymentIntent(intent);
}

function formatOxxoExpiry(expiresAt: number | null, language: AppLanguage): string {
  if (!expiresAt) {
    return language === "en" ? "Within 3 days" : "Dentro de 3 días";
  }
  const locale = language === "en" ? "en-US" : "es-MX";
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(new Date(expiresAt * 1000));
}

/** Branded OXXO voucher email with hosted barcode link. Exported for integration tests. */
export async function sendOxxoVoucherEmail(input: {
  enrollmentId: number;
  checkoutSessionId: string;
  session?: Stripe.Checkout.Session | null;
}): Promise<{ skipped: boolean; sent: boolean; reason?: string }> {
  const [rows] = await db().query<RowDataPacket[]>(
    `SELECT u.email, u.first_name, u.last_name, u.preferred_language,
            e.amount_cents, e.currency, e.status,
            c.title, c.promise,
            ed.starts_at, ed.ends_at, ed.venue_name, ed.venue_address, ed.city
       FROM enrollments e
       JOIN users u ON u.id = e.user_id
       JOIN course_editions ed ON ed.id = e.edition_id
       JOIN courses c ON c.id = ed.course_id
      WHERE e.id = ?
      LIMIT 1`,
    [input.enrollmentId],
  );
  const row = rows[0];
  if (!row?.email) return { skipped: true, sent: false, reason: "missing_enrollment" };
  if (row.status === "paid" || row.status === "attended") {
    return { skipped: true, sent: false, reason: "already_paid" };
  }

  let voucher: OxxoVoucherDetails | null = null;
  const stripe = stripeClient();
  if (stripe) {
    try {
      voucher = await resolveOxxoVoucherDetails(stripe, input.checkoutSessionId, input.session || null);
    } catch (error) {
      console.error("oxxo voucher resolve", error);
    }
  }
  if (!voucher?.voucherUrl) {
    // VITEST / missing Stripe details — still "succeed" without sending live mail.
    if (process.env.VITEST === "true" || !stripe) {
      return { skipped: true, sent: false, reason: "no_voucher_url" };
    }
    return { skipped: true, sent: false, reason: "no_voucher_url" };
  }

  const language: AppLanguage = row.preferred_language === "en" ? "en" : "es";
  const firstName = String(row.first_name || "").trim();
  const title = String(row.title || "");
  const promise = String(row.promise || "");
  const venueName = String(row.venue_name || "");
  const venueAddress = String(row.venue_address || "");
  const city = String(row.city || "");
  const when = formatWorkshopWhen(row.starts_at, row.ends_at, language);
  const where = [venueName, venueAddress, city].filter(Boolean).join(" · ") || city || "Guadalajara";
  const amount = money(Number(row.amount_cents || 0), String(row.currency || "MXN"), language);
  const expiresLabel = formatOxxoExpiry(voucher.expiresAt, language);
  const accountUrl = `${publicSiteUrl()}/cuenta`;
  const payUrl = `${publicSiteUrl()}/cuenta/pagar/${input.enrollmentId}`;

  const copy =
    language === "en"
      ? {
          subject: `OXXO voucher · ${title}`,
          headline: "Your OXXO voucher is ready.",
          hello: firstName ? `Hi ${escapeHtml(firstName)},` : "Hi,",
          lead: `Pay in cash at any OXXO to lock your seat in <strong>${escapeHtml(title)}</strong>. Show the barcode below — no card needed.`,
          amount: "Amount",
          reference: "Reference",
          expires: "Pay before",
          when: "Workshop",
          where: "Where",
          promise: "What you'll leave with",
          cta: "Open OXXO voucher",
          secondary: "Back to checkout",
          tip: "Keep this email until the cashier confirms payment. Once cash clears, your seat flips to paid automatically.",
          footer: "See you in the room.",
        }
      : {
          subject: `Voucher OXXO · ${title}`,
          headline: "Tu voucher OXXO está listo.",
          hello: firstName ? `Hola ${escapeHtml(firstName)},` : "Hola,",
          lead: `Paga en efectivo en cualquier OXXO para asegurar tu lugar en <strong>${escapeHtml(title)}</strong>. Muestra el código de barras — sin tarjeta.`,
          amount: "Monto",
          reference: "Referencia",
          expires: "Paga antes de",
          when: "Taller",
          where: "Dónde",
          promise: "Con lo que te vas",
          cta: "Abrir voucher OXXO",
          secondary: "Volver al checkout",
          tip: "Guarda este correo hasta que la caja confirme el pago. Cuando entre el efectivo, tu lugar pasa a pagado solo.",
          footer: "Te esperamos en la práctica.",
        };

  const body = `
    <p style="margin:0 0 14px;">${copy.hello}</p>
    <p style="margin:0 0 22px;">${copy.lead}</p>
    <div style="margin:0 0 22px;padding:22px 20px;border-radius:18px;background:linear-gradient(135deg,#12352b 0%,#1a4a3c 55%,#24352b 100%);color:#f6f3ec;">
      <div style="font-size:11px;letter-spacing:.2em;font-weight:700;color:#d6f25c;text-transform:uppercase;">OXXO</div>
      <div style="margin-top:8px;font-size:34px;line-height:1.1;font-weight:800;letter-spacing:-0.02em;">${escapeHtml(amount)}</div>
      ${
        voucher.reference
          ? `<div style="margin-top:14px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:rgba(246,243,236,.7);">${copy.reference}</div>
             <div style="margin-top:4px;font-size:18px;font-weight:700;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em;">${escapeHtml(voucher.reference)}</div>`
          : ""
      }
      <div style="margin-top:14px;font-size:12px;color:rgba(246,243,236,.75);">${copy.expires}: <strong style="color:#d6f25c;">${escapeHtml(expiresLabel)}</strong></div>
    </div>
    <p style="margin:0 0 18px;">
      <a href="${escapeHtml(voucher.voucherUrl)}" style="display:inline-block;background:#d6f25c;color:#12352b;text-decoration:none;font-weight:800;font-size:14px;letter-spacing:.03em;padding:15px 22px;border-radius:999px;">${copy.cta}</a>
    </p>
    <p style="margin:0 0 22px;">
      <a href="${payUrl}" style="display:inline-block;color:#12352b;text-decoration:underline;font-weight:700;font-size:13px;">${copy.secondary}</a>
      &nbsp;·&nbsp;
      <a href="${accountUrl}" style="display:inline-block;color:#6d6a62;text-decoration:underline;font-weight:600;font-size:13px;">${language === "en" ? "My practice" : "Mi práctica"}</a>
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
      ${detailRow(copy.when, escapeHtml(when))}
      ${detailRow(copy.where, escapeHtml(where))}
      ${detailRow(copy.amount, escapeHtml(amount))}
      ${promise ? detailRow(copy.promise, escapeHtml(promise)) : ""}
    </table>
    <p style="margin:0 0 10px;font-size:13px;color:#6d6a62;">${copy.tip}</p>
    <p style="margin:0;font-size:14px;font-weight:600;color:#12352b;">${copy.footer}</p>
  `;

  const result = await sendEmail(String(row.email), copy.subject, emailShell(copy.headline, body, language));
  return { skipped: Boolean(result.skipped), sent: !result.skipped };
}

function roleLabel(role: AdminRole, language: AppLanguage): string {
  const map: Record<AdminRole, { es: string; en: string }> = {
    owner: { es: "Owner", en: "Owner" },
    coordinator: { es: "Coordinación", en: "Coordinator" },
    instructor: { es: "Instructor", en: "Instructor" },
    finance: { es: "Finanzas", en: "Finance" },
    company: { es: "Empresa", en: "Company" },
  };
  return map[role][language === "en" ? "en" : "es"];
}

async function sendStaffWelcomeEmail(input: {
  email: string;
  firstName: string;
  role: AdminRole;
  language?: AppLanguage;
}) {
  const language = input.language || "es";
  const accessUrl = `${publicSiteUrl()}/acceso/equipo`;
  const role = roleLabel(input.role, language);
  const copy =
    language === "en"
      ? {
          subject: "You're on the DOMINA team",
          headline: "Welcome to the workshop ops.",
          hello: input.firstName ? `Hi ${escapeHtml(input.firstName)},` : "Hi,",
          lead: `Your <strong>${escapeHtml(role)}</strong> access is ready. No password — request a one-time code with this email and you're in.`,
          access: "Where to enter",
          role: "Your role",
          cta: "Open team access",
          tip: "Bookmark the team door. Codes expire in 10 minutes.",
        }
      : {
          subject: "Te sumamos al equipo DOMINA",
          headline: "Bienvenido a la operación del taller.",
          hello: input.firstName ? `Hola ${escapeHtml(input.firstName)},` : "Hola,",
          lead: `Tu acceso de <strong>${escapeHtml(role)}</strong> está listo. Sin contraseña: pide un código a este correo y entras.`,
          access: "Puerta de acceso",
          role: "Tu rol",
          cta: "Abrir acceso del equipo",
          tip: "Guarda esta puerta. Los códigos caducan en 10 minutos.",
        };

  const body = `
    <p style="margin:0 0 14px;">${copy.hello}</p>
    <p style="margin:0 0 22px;">${copy.lead}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
      ${detailRow(copy.role, escapeHtml(role))}
      ${detailRow(copy.access, escapeHtml(accessUrl))}
    </table>
    <p style="margin:0 0 18px;">
      <a href="${accessUrl}" style="display:inline-block;background:#12352b;color:#d6f25c;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:.04em;padding:14px 20px;border-radius:999px;">${copy.cta}</a>
    </p>
    <p style="margin:0;font-size:13px;color:#6d6a62;">${copy.tip}</p>
  `;
  return sendEmail(input.email, copy.subject, emailShell(copy.headline, body, language));
}

async function createAdminNotification(input: {
  adminId: number;
  kind: string;
  title: string;
  body: string;
  linkPath?: string | null;
  enrollmentId?: number | null;
  editionId?: number | null;
}) {
  await db().execute(
    `INSERT INTO admin_notifications (
       admin_id, kind, title, body, link_path, enrollment_id, edition_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.adminId,
      input.kind.slice(0, 40),
      input.title.slice(0, 200),
      input.body.slice(0, 500),
      input.linkPath || null,
      input.enrollmentId ?? null,
      input.editionId ?? null,
    ],
  );
}

async function sendInstructorEnrollmentEmail(input: {
  email: string;
  firstName: string;
  preferredLanguage: AppLanguage | null;
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  whenLabel: string;
  methodLabel: string;
  editionId: number;
}) {
  const language: AppLanguage = input.preferredLanguage === "en" ? "en" : "es";
  const rosterUrl = `${publicSiteUrl()}/admin/mis-ediciones/${input.editionId}`;
  const copy =
    language === "en"
      ? {
          subject: `New paid seat · ${input.courseTitle}`,
          headline: "A learner just locked a seat.",
          hello: input.firstName ? `Hi ${escapeHtml(input.firstName)},` : "Hi,",
          lead: `<strong>${escapeHtml(input.learnerName)}</strong> paid for <strong>${escapeHtml(input.courseTitle)}</strong>.`,
          learner: "Learner",
          when: "When",
          method: "Method",
          cta: "Open my roster",
        }
      : {
          subject: `Nueva inscripción · ${input.courseTitle}`,
          headline: "Un participante aseguró su lugar.",
          hello: input.firstName ? `Hola ${escapeHtml(input.firstName)},` : "Hola,",
          lead: `<strong>${escapeHtml(input.learnerName)}</strong> pagó <strong>${escapeHtml(input.courseTitle)}</strong>.`,
          learner: "Participante",
          when: "Cuándo",
          method: "Método",
          cta: "Abrir mi lista",
        };

  const body = `
    <p style="margin:0 0 14px;">${copy.hello}</p>
    <p style="margin:0 0 22px;">${copy.lead}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
      ${detailRow(copy.learner, escapeHtml(`${input.learnerName} · ${input.learnerEmail}`))}
      ${detailRow(copy.when, escapeHtml(input.whenLabel))}
      ${detailRow(copy.method, escapeHtml(input.methodLabel))}
    </table>
    <p style="margin:0;">
      <a href="${rosterUrl}" style="display:inline-block;background:#12352b;color:#d6f25c;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:.04em;padding:14px 20px;border-radius:999px;">${copy.cta}</a>
    </p>
  `;
  return sendEmail(input.email, copy.subject, emailShell(copy.headline, body, language));
}

/** Email + in-app bell for the edition's assigned instructor when a seat becomes paid. */
export async function notifyInstructorOfPaidEnrollment(
  enrollmentId: number,
  method: PaymentMethod,
): Promise<void> {
  const [rows] = await db().query<RowDataPacket[]>(
    `SELECT e.id AS enrollment_id, e.edition_id, e.amount_cents, e.currency,
            u.email AS learner_email, u.first_name AS learner_first, u.last_name AS learner_last,
            c.title AS course_title,
            ed.starts_at, ed.ends_at, ed.instructor_admin_id,
            a.email AS instructor_email, a.first_name AS instructor_first,
            a.preferred_language AS instructor_language, a.status AS instructor_status
       FROM enrollments e
       JOIN users u ON u.id = e.user_id
       JOIN course_editions ed ON ed.id = e.edition_id
       JOIN courses c ON c.id = ed.course_id
       LEFT JOIN admins a ON a.id = ed.instructor_admin_id AND a.role = 'instructor'
      WHERE e.id = ?
      LIMIT 1`,
    [enrollmentId],
  );
  const row = rows[0];
  if (!row?.instructor_admin_id || !row.instructor_email) return;
  if (row.instructor_status === "disabled") return;

  const language: AppLanguage = row.instructor_language === "en" ? "en" : "es";
  const learnerName =
    `${String(row.learner_first || "").trim()} ${String(row.learner_last || "").trim()}`.trim() ||
    String(row.learner_email);
  const whenLabel = formatWorkshopWhen(row.starts_at, row.ends_at, language);
  const methodLabel =
    method === "oxxo"
      ? "OXXO"
      : method === "transfer"
        ? language === "en"
          ? "Bank transfer"
          : "Transferencia"
        : method === "company_invoice"
          ? language === "en"
            ? "Company invoice"
            : "Factura empresa"
          : method === "complimentary"
            ? language === "en"
              ? "Complimentary"
              : "Cortesía"
            : method === "coupon"
              ? language === "en"
                ? "Coupon"
                : "Cupón"
              : language === "en"
                ? "Card"
                : "Tarjeta";
  const title =
    language === "en"
      ? `New paid seat · ${row.course_title}`
      : `Nueva inscripción · ${row.course_title}`;
  const body =
    language === "en"
      ? `${learnerName} paid for ${row.course_title}`
      : `${learnerName} pagó ${row.course_title}`;
  const editionId = Number(row.edition_id);
  const linkPath = `/admin/mis-ediciones/${editionId}`;
  const instructorAdminId = Number(row.instructor_admin_id);

  // One bell row per paid enrollment (idempotent on retries / double fulfill).
  const [existingNotes] = await db().query<RowDataPacket[]>(
    `SELECT id FROM admin_notifications
      WHERE admin_id = ? AND enrollment_id = ? AND kind = 'enrollment_paid'
      LIMIT 1`,
    [instructorAdminId, enrollmentId],
  );
  if (existingNotes[0]) return;

  await createAdminNotification({
    adminId: instructorAdminId,
    kind: "enrollment_paid",
    title,
    body,
    linkPath,
    enrollmentId,
    editionId,
  });

  await sendInstructorEnrollmentEmail({
    email: String(row.instructor_email),
    firstName: String(row.instructor_first || ""),
    preferredLanguage: language,
    learnerName,
    learnerEmail: String(row.learner_email || ""),
    courseTitle: String(row.course_title || ""),
    whenLabel,
    methodLabel,
    editionId,
  });
}

async function assertAssignableInstructor(instructorAdminId: number | null | undefined): Promise<boolean> {
  if (instructorAdminId == null) return true;
  const [rows] = await db().query<RowDataPacket[]>(
    `SELECT id FROM admins
      WHERE id = ? AND role = 'instructor' AND status IN ('active', 'invited')
      LIMIT 1`,
    [instructorAdminId],
  );
  return Boolean(rows[0]);
}

async function storeLoginCode(
  table: "user_login_codes" | "admin_login_codes" | "company_login_codes",
  email: string,
  purpose: "login" | "register",
) {
  const code = newCode();
  await db().execute(
    `INSERT INTO ${table} (email, code_hash, purpose, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
    [email, hashCode(code), purpose],
  );
  return code;
}

async function consumeLoginCode(
  table: "user_login_codes" | "admin_login_codes" | "company_login_codes",
  email: string,
  code: string,
) {
  const [rows] = await db().query<RowDataPacket[]>(
    `SELECT id FROM ${table}
      WHERE email = ? AND code_hash = ? AND consumed_at IS NULL AND expires_at > NOW()
      ORDER BY id DESC LIMIT 1`,
    [email, hashCode(code)],
  );
  const row = rows[0];
  if (!row) return false;
  await db().execute(`UPDATE ${table} SET consumed_at = NOW() WHERE id = ?`, [row.id]);
  return true;
}

function userFromRow(row: RowDataPacket): UserProfile {
  return {
    id: Number(row.id),
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    audience: row.audience,
    preferredLanguage: (row.preferred_language as AppLanguage | null) || null,
  };
}

function adminFromRow(row: RowDataPacket): AdminProfile {
  return {
    id: Number(row.id),
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    preferredLanguage: (row.preferred_language as AppLanguage | null) || null,
    role: row.role,
    status: row.status,
    companyId: row.company_id == null ? null : Number(row.company_id),
    companyName: row.company_name || null,
  };
}

/** Ops staff with full admin APIs. Instructors are gated to /api/instructor/* only. */
function isOpsStaff(admin: AdminProfile) {
  return admin.role === "owner" || admin.role === "coordinator" || admin.role === "finance";
}

function isCompanyRole(admin: AdminProfile) {
  return admin.role === "company";
}

function canWriteOperations(admin: AdminProfile) {
  return admin.role === "owner" || admin.role === "coordinator";
}

/** Owners and coordinators manage the Instructores roster and invitations. */
function canManageInstructors(admin: AdminProfile) {
  return admin.role === "owner" || admin.role === "coordinator";
}

function isInstructorRole(admin: AdminProfile) {
  return admin.role === "instructor";
}

/** Owner, finance, and coordinator may confirm/reject SPEI transfers and edit bank settings. */
function canManageTransfers(admin: AdminProfile) {
  return admin.role === "owner" || admin.role === "finance" || admin.role === "coordinator";
}

/** Owner and finance manage DOMINA-owned coupon codes. */
function canManageCoupons(admin: AdminProfile) {
  return admin.role === "owner" || admin.role === "finance";
}

function transferReferenceFor(enrollmentId: number) {
  return `DOMINA-${enrollmentId}`;
}

function normalizeCouponCode(raw: string) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function computeCouponDiscount(input: {
  listAmountCents: number;
  discountType: "percent" | "fixed";
  percentOff: number | null;
  amountOffCents: number | null;
}): { discountCents: number; finalAmountCents: number } {
  const list = Math.max(0, Math.floor(input.listAmountCents));
  let discount = 0;
  if (input.discountType === "percent") {
    const pct = Math.min(100, Math.max(0, Number(input.percentOff || 0)));
    discount = Math.min(list, Math.floor((list * pct) / 100));
  } else {
    discount = Math.min(list, Math.max(0, Math.floor(Number(input.amountOffCents || 0))));
  }
  return { discountCents: discount, finalAmountCents: Math.max(0, list - discount) };
}

type BankTransferSettings = {
  bankName: string;
  accountHolder: string;
  clabe: string;
  accountNumber: string | null;
  bankCode: string | null;
  instructionsEs: string | null;
  instructionsEn: string | null;
  expiresAfterDays: number;
  isEnabled: boolean;
};

function bankSettingsFromRow(row: RowDataPacket): BankTransferSettings {
  return {
    bankName: String(row.bank_name || ""),
    accountHolder: String(row.account_holder || ""),
    clabe: String(row.clabe || ""),
    accountNumber: row.account_number ? String(row.account_number) : null,
    bankCode: row.bank_code ? String(row.bank_code) : null,
    instructionsEs: row.instructions_es ? String(row.instructions_es) : null,
    instructionsEn: row.instructions_en ? String(row.instructions_en) : null,
    expiresAfterDays: Math.max(1, Number(row.expires_after_days || 3)),
    isEnabled: Number(row.is_enabled) === 1,
  };
}

async function loadBankTransferSettings(): Promise<BankTransferSettings | null> {
  const [rows] = await db().query<RowDataPacket[]>(
    "SELECT * FROM site_bank_transfer_settings WHERE id = 1 LIMIT 1",
  );
  if (!rows[0]) return null;
  return bankSettingsFromRow(rows[0]);
}

function transferInstructionsPayload(input: {
  enrollmentId: number;
  paymentId: number;
  reference: string;
  expiresAt: string;
  amountCents: number;
  currency: string;
  settings: BankTransferSettings;
  language: AppLanguage;
}) {
  return {
    status: "pending_transfer" as const,
    enrollmentId: input.enrollmentId,
    paymentId: input.paymentId,
    reference: input.reference,
    expiresAt: input.expiresAt,
    amountCents: input.amountCents,
    currency: input.currency,
    bank: {
      bankName: input.settings.bankName,
      accountHolder: input.settings.accountHolder,
      clabe: input.settings.clabe,
      accountNumber: input.settings.accountNumber,
      bankCode: input.settings.bankCode,
      instructions:
        input.language === "en"
          ? input.settings.instructionsEn || input.settings.instructionsEs
          : input.settings.instructionsEs || input.settings.instructionsEn,
    },
  };
}

function editionFromRow(row: RowDataPacket): CourseEdition {
  return {
    id: Number(row.id),
    courseId: Number(row.course_id),
    companyId: row.company_id == null ? null : Number(row.company_id),
    instructorAdminId: row.instructor_admin_id == null ? null : Number(row.instructor_admin_id),
    instructorName: row.instructor_name || null,
    venueId: row.venue_id == null ? null : Number(row.venue_id),
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    venueName: row.venue_name,
    venueAddress: row.venue_address,
    city: row.city,
    status: row.status,
    capacity: Number(row.capacity),
    priceCents: Number(row.price_cents),
    currency: row.currency,
    minEnrollment: Number(row.min_enrollment),
    notes: row.notes,
    paidCount: Number(row.paid_count || 0),
    heldCount: Number(row.held_count || 0),
  };
}

function courseFromRow(row: RowDataPacket): Course {
  return {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    categoryId: Number(row.category_id),
    audienceId: Number(row.audience_id),
    levelId: Number(row.level_id),
    cityId: Number(row.city_id),
    category: row.category_slug || row.category,
    categoryLabel: row.category_label || row.category_slug || row.category || "",
    audience: row.audience_slug || row.audience,
    audienceLabel: row.audience_label || row.audience_slug || row.audience || "",
    level: row.level_slug || row.level,
    levelLabel: row.level_label || row.level_slug || row.level || "",
    summary: row.summary,
    descriptionHtml: row.description_html || null,
    promise: row.promise,
    durationHours: Number(row.duration_hours),
    capacity: Number(row.capacity),
    priceCents: Number(row.price_cents),
    currency: row.currency,
    minEnrollment: Number(row.min_enrollment),
    practiceRatio: Number(row.practice_ratio),
    status: row.status,
    city: row.city_label || row.city || "",
    citySlug: row.city_slug || "",
    runOfShow: row.run_of_show,
    materials: row.materials,
    safetyNotes: row.safety_notes,
    coverImageUrl: row.cover_image_url || null,
  };
}

const COURSE_SELECT = `
  SELECT c.*,
    cat.slug AS category_slug, cat.label AS category_label,
    aud.slug AS audience_slug, aud.label AS audience_label,
    lvl.slug AS level_slug, lvl.label AS level_label,
    city.slug AS city_slug, city.label AS city_label
  FROM courses c
  JOIN course_categories cat ON cat.id = c.category_id
  JOIN course_audiences aud ON aud.id = c.audience_id
  JOIN course_levels lvl ON lvl.id = c.level_id
  JOIN course_cities city ON city.id = c.city_id
`;

type CatalogTable =
  | "course_categories"
  | "course_levels"
  | "course_audiences"
  | "course_cities"
  | "course_venues";

const CATALOG_KIND_META: Record<CatalogKind, { table: CatalogTable }> = {
  categories: { table: "course_categories" },
  levels: { table: "course_levels" },
  audiences: { table: "course_audiences" },
  cities: { table: "course_cities" },
  venues: { table: "course_venues" },
};

function parseCatalogKind(value: string): CatalogKind | null {
  if (
    value === "categories" ||
    value === "levels" ||
    value === "audiences" ||
    value === "cities" ||
    value === "venues"
  ) {
    return value;
  }
  return null;
}

function catalogOptionFromRow(kind: CatalogKind, row: RowDataPacket): CatalogOption {
  return {
    id: Number(row.id),
    kind,
    slug: row.slug,
    label: row.label,
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order),
    address: kind === "venues" ? row.address || "" : null,
    cityId: kind === "venues" && row.city_id != null ? Number(row.city_id) : null,
    cityLabel: kind === "venues" ? row.city_label || null : null,
  };
}

async function assertActiveCatalogId(kind: CatalogKind, id: number): Promise<boolean> {
  const meta = CATALOG_KIND_META[kind];
  const [rows] = await db().query<RowDataPacket[]>(
    `SELECT id FROM ${meta.table} WHERE id = ? AND is_active = 1 LIMIT 1`,
    [id],
  );
  return Boolean(rows[0]);
}

async function loadVenue(id: number): Promise<{
  id: number;
  label: string;
  address: string;
  cityLabel: string;
} | null> {
  const [rows] = await db().query<RowDataPacket[]>(
    `SELECT v.id, v.label, v.address, city.label AS city_label
       FROM course_venues v
       JOIN course_cities city ON city.id = v.city_id
      WHERE v.id = ? LIMIT 1`,
    [id],
  );
  if (!rows[0]) return null;
  return {
    id: Number(rows[0].id),
    label: String(rows[0].label),
    address: String(rows[0].address || ""),
    cityLabel: String(rows[0].city_label || ""),
  };
}

function galleryImageFromRow(row: RowDataPacket): CourseGalleryImage {
  return {
    id: Number(row.id),
    courseId: Number(row.course_id),
    imageUrl: row.image_url,
    caption: row.caption || null,
    sortOrder: Number(row.sort_order),
  };
}

async function galleryForCourse(courseId: number): Promise<CourseGalleryImage[]> {
  const [rows] = await db().query<RowDataPacket[]>(
    "SELECT * FROM course_gallery_images WHERE course_id = ? ORDER BY sort_order ASC, id ASC",
    [courseId],
  );
  return rows.map(galleryImageFromRow);
}

/** Allowlist-style scrub for staff-authored course HTML before persist. */
function sanitizeCourseHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<\/?(?:iframe|object|embed|form|input|button|meta|link|style)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "")
    .trim();
}

const EDITION_SELECT = `
  SELECT e.*,
         TRIM(CONCAT(COALESCE(a.first_name, ''), ' ', COALESCE(a.last_name, ''))) AS instructor_name,
         (SELECT COUNT(*) FROM enrollments n WHERE n.edition_id = e.id AND n.status IN ('paid','attended')) AS paid_count,
         (SELECT COUNT(*) FROM enrollments n WHERE n.edition_id = e.id AND n.status IN ('pending','paid','attended')) AS held_count
    FROM course_editions e
    LEFT JOIN admins a ON a.id = e.instructor_admin_id
`;

async function editionsForCourse(courseId: number, publicOnly: boolean) {
  const statusSql = publicOnly ? "AND e.status IN ('presale','confirmed')" : "";
  const [rows] = await db().query<RowDataPacket[]>(
    `${EDITION_SELECT} WHERE e.course_id = ? ${statusSql} ORDER BY e.starts_at ASC`,
    [courseId],
  );
  return rows.map(editionFromRow);
}

const requireUser: RequestHandler = async (req, res, next) => {
  try {
    const token = bearer(req);
    if (!token) return res.status(401).json({ error: "Sign in to continue." });
    const [rows] = await db().query<RowDataPacket[]>(
      `SELECT u.* FROM user_sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > NOW() LIMIT 1`,
      [hashToken(token)],
    );
    if (!rows[0]) return res.status(401).json({ error: "That session expired. Request a new code." });
    (req as AuthedRequest).user = userFromRow(rows[0]);
    next();
  } catch (error) {
    sendDbError(res, error as { code?: string });
  }
};

const requireAdmin: RequestHandler = async (req, res, next) => {
  try {
    const token = bearer(req);
    if (!token) return res.status(401).json({ error: "Staff sign-in required." });
    const [rows] = await db().query<RowDataPacket[]>(
      `SELECT a.*, c.name AS company_name
         FROM admin_sessions s
         JOIN admins a ON a.id = s.admin_id
         LEFT JOIN companies c ON c.id = a.company_id
        WHERE s.token_hash = ? AND s.expires_at > NOW() AND a.status <> 'disabled' LIMIT 1`,
      [hashToken(token)],
    );
    if (!rows[0]) return res.status(401).json({ error: "That staff session expired." });
    (req as AuthedRequest).admin = adminFromRow(rows[0]);
    next();
  } catch (error) {
    sendDbError(res, error as { code?: string });
  }
};

const requireOpsStaff: RequestHandler = async (req, res, next) => {
  await requireAdmin(req, res, (error) => {
    if (error) return next(error);
    const admin = (req as AuthedRequest).admin;
    if (!admin || !isOpsStaff(admin)) {
      return res.status(403).json({ error: "This area is for the operations team." });
    }
    next();
  });
};

function stripeSecret(): string {
  return process.env.STRIPE_SECRET_KEY?.trim() || process.env.STRIPE_TEST_SECRET_KEY?.trim() || "";
}

function stripeClient(): Stripe | null {
  const key = stripeSecret();
  if (!key || process.env.VITEST === "true") return null;
  return new Stripe(key);
}

const CDN_IMAGES_UPLOAD_URL = "https://disruptinglabs.com/data/api/uploadImages.php";
const CDN_UPLOAD_PUBLIC_BASE = "https://disruptinglabs.com/data/api";
const DOMINA_CDN_FOLDER = "domina";

function normalizeCdnUploadUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  if (!trimmed.includes("disruptinglabs.com/data/")) return trimmed;
  if (trimmed.includes("disruptinglabs.com/data/api/")) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname.startsWith("/data/domina/assets/")) return trimmed;
    if (/^https:\/\/disruptinglabs\.com\/data\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/(main_image|images|files)\//.test(trimmed)) {
      return trimmed.replace("disruptinglabs.com/data/", "disruptinglabs.com/data/api/data/");
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

function buildCdnPublicUrl(relativePath: string): string {
  if (relativePath.startsWith("http")) return normalizeCdnUploadUrl(relativePath) || relativePath;
  const path = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  return `${CDN_UPLOAD_PUBLIC_BASE}${path}`;
}

async function uploadCourseImageToCdn(input: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  uploadId: string;
}): Promise<string> {
  if (process.env.VITEST === "true") {
    return buildCdnPublicUrl(`/data/${DOMINA_CDN_FOLDER}/${input.uploadId}/main_image/${input.filename}`);
  }
  const safeId = input.uploadId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120) || "course";
  const form = new FormData();
  form.append("main_folder", DOMINA_CDN_FOLDER);
  form.append("id", safeId);
  form.append(
    "main_image",
    new Blob([new Uint8Array(input.buffer)], { type: input.mimeType }),
    input.filename,
  );
  const res = await fetch(CDN_IMAGES_UPLOAD_URL, { method: "POST", body: form });
  if (!res.ok) throw new Error(`CDN upload failed: HTTP ${res.status}`);
  const data = (await res.json()) as {
    success?: boolean;
    main_image?: { path?: string };
    error?: string;
  };
  if (!data.success || !data.main_image?.path) {
    throw new Error(data.error || "CDN returned no image path");
  }
  return buildCdnPublicUrl(data.main_image.path);
}

function originOf(req: Request): string {
  const configured = (process.env.VITE_PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
  const headerOrigin = (req.get("origin") || "").trim().replace(/\/$/, "");
  let refererOrigin = "";
  try {
    const referer = req.get("referer");
    if (referer) refererOrigin = new URL(referer).origin.replace(/\/$/, "");
  } catch {
    refererOrigin = "";
  }
  const host = (req.get("x-forwarded-host") || req.get("host") || "").split(",")[0]?.trim();
  const proto = (req.get("x-forwarded-proto") || req.protocol || "http").split(",")[0]?.trim();
  const hostOrigin = host ? `${proto}://${host}`.replace(/\/$/, "") : "";

  const candidates = [headerOrigin, refererOrigin, hostOrigin].filter(Boolean);
  const local = candidates.find((origin) => /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin));
  if (local) return local.startsWith("http") ? local : `http://${local}`;

  if (configured) return configured;
  return hostOrigin || "http://localhost:8080";
}

function paymentMethodFromSession(session: Stripe.Checkout.Session): PaymentMethod {
  const intent = session.payment_intent;
  if (intent && typeof intent === "object") {
    const method = intent.payment_method;
    if (method && typeof method === "object") {
      if (method.type === "oxxo") return "oxxo";
      if (method.type === "card") return "card";
    }
    if (intent.payment_method_types?.includes("oxxo") && !intent.payment_method_types.includes("card")) {
      return "oxxo";
    }
  }
  if (Array.isArray(session.payment_method_types) && session.payment_method_types.includes("oxxo")) {
    // Prefer oxxo only when card was not used
    if (session.payment_status !== "paid") return "oxxo";
  }
  return "card";
}

function cardDetailsFromSession(session: Stripe.Checkout.Session): {
  brand: string | null;
  last4: string | null;
  paymentIntentId: string | null;
} {
  let brand: string | null = null;
  let last4: string | null = null;
  let paymentIntentId: string | null = null;
  const intent = session.payment_intent;
  if (intent && typeof intent === "object") {
    paymentIntentId = intent.id;
    const method = intent.payment_method;
    if (method && typeof method === "object" && method.card) {
      brand = method.card.brand || null;
      last4 = method.card.last4 || null;
    }
  }
  return { brand, last4, paymentIntentId };
}

/** Mark an enrollment as waiting on OXXO cash (voucher issued, session complete + unpaid). */
export async function markEnrollmentPendingOxxo(input: {
  enrollmentId: number;
  checkoutSessionId: string;
}): Promise<void> {
  await db().execute(
    "UPDATE payments SET method = 'oxxo', status = 'processing' WHERE stripe_checkout_session_id = ?",
    [input.checkoutSessionId],
  );
  await db().execute(
    `UPDATE enrollments
        SET payment_method = 'oxxo',
            stripe_checkout_session_id = COALESCE(?, stripe_checkout_session_id)
      WHERE id = ? AND status = 'pending'`,
    [input.checkoutSessionId, input.enrollmentId],
  );
}

/** Fulfill a seat after Stripe, SPEI confirm, or VITEST simulate. Exported for payment/webhook integration tests. */
export async function markEnrollmentPaid(input: {
  enrollmentId: number;
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  brand: string | null;
  last4: string | null;
  method: PaymentMethod;
  /** When set, update this payments row instead of inserting a new ledger entry. */
  paymentId?: number | null;
}): Promise<{ newlyPaid: boolean }> {
  const [rows] = await db().query<RowDataPacket[]>(
    "SELECT * FROM enrollments WHERE id = ? LIMIT 1",
    [input.enrollmentId],
  );
  const enrollment = rows[0];
  if (!enrollment) return { newlyPaid: false };
  // Do not revive cancelled / no-show seats via late webhooks or SPEI confirm.
  if (enrollment.status === "cancelled" || enrollment.status === "no_show") {
    return { newlyPaid: false };
  }
  // Superseded Stripe session (e.g. learner switched OXXO → SPEI): ignore late cash/card settle.
  if (input.checkoutSessionId) {
    const [sessionPay] = await db().query<RowDataPacket[]>(
      "SELECT id, status FROM payments WHERE stripe_checkout_session_id = ? LIMIT 1",
      [input.checkoutSessionId],
    );
    if (sessionPay[0]?.status === "failed") {
      return { newlyPaid: false };
    }
  }
  const [paidUpdate] = await db().execute<ResultSetHeader>(
    `UPDATE enrollments
        SET status = 'paid', payment_method = ?, card_brand = ?, card_last4 = ?,
            stripe_checkout_session_id = COALESCE(?, stripe_checkout_session_id),
            stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id),
            paid_at = COALESCE(paid_at, NOW())
      WHERE id = ? AND status IN ('pending', 'waitlist')`,
    [
      input.method,
      input.brand,
      input.last4,
      input.checkoutSessionId,
      input.paymentIntentId,
      input.enrollmentId,
    ],
  );
  const newlyPaid = paidUpdate.affectedRows > 0;
  if (!newlyPaid) {
    const [again] = await db().query<RowDataPacket[]>(
      "SELECT status FROM enrollments WHERE id = ? LIMIT 1",
      [input.enrollmentId],
    );
    if (again[0]?.status !== "paid" && again[0]?.status !== "attended") {
      return { newlyPaid: false };
    }
  }
  if (input.paymentId) {
    await db().execute(
      `UPDATE payments
          SET status = 'succeeded', method = ?, card_brand = ?, card_last4 = ?,
              stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id),
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [input.method, input.brand, input.last4, input.paymentIntentId, input.paymentId],
    );
  } else if (input.checkoutSessionId) {
    const [existing] = await db().query<RowDataPacket[]>(
      "SELECT id FROM payments WHERE stripe_checkout_session_id = ? LIMIT 1",
      [input.checkoutSessionId],
    );
    if (existing[0]) {
      await db().execute(
        `UPDATE payments SET status = 'succeeded', method = ?, card_brand = ?, card_last4 = ?, stripe_payment_intent_id = ?
          WHERE id = ?`,
        [input.method, input.brand, input.last4, input.paymentIntentId, existing[0].id],
      );
    } else {
      try {
        await db().execute(
          `INSERT INTO payments (
             enrollment_id, user_id, company_id, edition_id, amount_cents, currency, status, method,
             card_brand, card_last4, stripe_checkout_session_id, stripe_payment_intent_id
           ) VALUES (?, ?, ?, ?, ?, ?, 'succeeded', ?, ?, ?, ?, ?)`,
          [
            enrollment.id,
            enrollment.user_id,
            enrollment.company_id,
            enrollment.edition_id,
            enrollment.amount_cents,
            enrollment.currency,
            input.method,
            input.brand,
            input.last4,
            input.checkoutSessionId,
            input.paymentIntentId,
          ],
        );
      } catch (error) {
        if (!isDuplicateKeyError(error as { code?: string; errno?: number; message?: string })) throw error;
        await db().execute(
          `UPDATE payments
              SET status = 'succeeded', method = ?, card_brand = ?, card_last4 = ?,
                  stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id)
            WHERE stripe_checkout_session_id = ?`,
          [input.method, input.brand, input.last4, input.paymentIntentId, input.checkoutSessionId],
        );
      }
    }
  } else {
    await db().execute(
      `INSERT INTO payments (
         enrollment_id, user_id, company_id, edition_id, amount_cents, currency, status, method,
         card_brand, card_last4, stripe_checkout_session_id, stripe_payment_intent_id
       ) VALUES (?, ?, ?, ?, ?, ?, 'succeeded', ?, ?, ?, ?, ?)`,
      [
        enrollment.id,
        enrollment.user_id,
        enrollment.company_id,
        enrollment.edition_id,
        enrollment.amount_cents,
        enrollment.currency,
        input.method,
        input.brand,
        input.last4,
        input.checkoutSessionId,
        input.paymentIntentId,
      ],
    );
  }

  if (newlyPaid) {
    if (enrollment.coupon_id) {
      try {
        await consumeCouponRedemption(Number(enrollment.id));
      } catch (error) {
        console.error("coupon redemption consume", error);
      }
    }
    try {
      await notifyInstructorOfPaidEnrollment(input.enrollmentId, input.method);
    } catch (error) {
      console.error("instructor paid notification", error);
    }
  }
  return { newlyPaid };
}

async function invalidateOpenCheckoutForEnrollment(enrollmentId: number, reason: string) {
  await cancelActiveTransferForEnrollment(enrollmentId, reason);
  const [rows] = await db().query<RowDataPacket[]>(
    "SELECT stripe_checkout_session_id FROM enrollments WHERE id = ? LIMIT 1",
    [enrollmentId],
  );
  const sessionId = rows[0]?.stripe_checkout_session_id ? String(rows[0].stripe_checkout_session_id) : "";
  if (sessionId) {
    const stripe = stripeClient();
    if (stripe) {
      try {
        await stripe.checkout.sessions.expire(sessionId);
      } catch (error) {
        console.warn("stripe session expire on coupon change", error);
      }
    }
  }
  await db().execute(
    `UPDATE payments
        SET status = 'failed',
            reject_reason = COALESCE(reject_reason, ?),
            updated_at = CURRENT_TIMESTAMP
      WHERE enrollment_id = ?
        AND status IN ('requires_payment', 'processing')`,
    [reason.slice(0, 400), enrollmentId],
  );
  await db().execute(
    `UPDATE enrollments
        SET stripe_checkout_session_id = NULL,
            stripe_payment_intent_id = NULL,
            payment_method = NULL
      WHERE id = ? AND status = 'pending'`,
    [enrollmentId],
  );
}

type DbQueryable = Pick<Pool, "query" | "execute">;

/** Applied holds older than this are released so max_redemptions inventory is not stuck. */
const COUPON_HOLD_TTL_HOURS = 48;

async function countActiveCouponHolds(
  couponId: number,
  exec: DbQueryable = db(),
): Promise<number> {
  const [rows] = await exec.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
       FROM coupon_redemptions
      WHERE coupon_id = ? AND status IN ('applied', 'consumed')`,
    [couponId],
  );
  return Number(rows[0]?.total || 0);
}

async function loadCouponForApply(
  code: string,
  exec: DbQueryable = db(),
  forUpdate = false,
): Promise<RowDataPacket | null> {
  const [rows] = await exec.query<RowDataPacket[]>(
    `SELECT * FROM coupons WHERE code = ? LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
    [normalizeCouponCode(code)],
  );
  return rows[0] || null;
}

async function couponInScope(
  coupon: RowDataPacket,
  courseId: number,
  editionId: number,
  exec: DbQueryable = db(),
): Promise<boolean> {
  const scope = String(coupon.scope || "all");
  if (scope === "all") return true;
  if (scope === "course") {
    const [rows] = await exec.query<RowDataPacket[]>(
      "SELECT 1 AS ok FROM coupon_courses WHERE coupon_id = ? AND course_id = ? LIMIT 1",
      [coupon.id, courseId],
    );
    return Boolean(rows[0]);
  }
  if (scope === "edition") {
    const [rows] = await exec.query<RowDataPacket[]>(
      "SELECT 1 AS ok FROM coupon_editions WHERE coupon_id = ? AND edition_id = ? LIMIT 1",
      [coupon.id, editionId],
    );
    return Boolean(rows[0]);
  }
  return false;
}

type CouponApplyError = { status: number; error: string; code: string };

async function validateCouponForEnrollment(
  input: {
    coupon: RowDataPacket;
    enrollmentId: number;
    userId: number;
    courseId: number;
    editionId: number;
    listAmountCents: number;
  },
  exec: DbQueryable = db(),
): Promise<CouponApplyError | { discountCents: number; finalAmountCents: number }> {
  const coupon = input.coupon;
  if (!Number(coupon.active)) {
    return { status: 404, error: "That coupon is not available.", code: "coupon_inactive" };
  }
  const now = Date.now();
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) {
    return { status: 409, error: "That coupon is not active yet.", code: "coupon_not_started" };
  }
  if (coupon.ends_at && new Date(coupon.ends_at).getTime() < now) {
    return { status: 409, error: "That coupon has expired.", code: "coupon_expired" };
  }
  if (String(coupon.currency || "MXN").toUpperCase() !== "MXN") {
    return { status: 409, error: "That coupon currency is not supported.", code: "coupon_currency" };
  }
  if (!(await couponInScope(coupon, input.courseId, input.editionId, exec))) {
    return { status: 409, error: "That coupon does not apply to this workshop.", code: "coupon_scope" };
  }

  const [userUsed] = await exec.query<RowDataPacket[]>(
    `SELECT id FROM coupon_redemptions
      WHERE coupon_id = ? AND user_id = ?
        AND (
          status = 'consumed'
          OR (status = 'applied' AND enrollment_id <> ?)
        )
      LIMIT 1`,
    [coupon.id, input.userId, input.enrollmentId],
  );
  if (userUsed[0]) {
    return { status: 409, error: "You already used this coupon.", code: "coupon_user_limit" };
  }

  const max = coupon.max_redemptions == null ? null : Number(coupon.max_redemptions);
  if (max != null && Number.isFinite(max)) {
    const [selfHold] = await exec.query<RowDataPacket[]>(
      `SELECT id FROM coupon_redemptions
        WHERE coupon_id = ? AND enrollment_id = ? AND status IN ('applied', 'consumed')
        LIMIT 1`,
      [coupon.id, input.enrollmentId],
    );
    const held = await countActiveCouponHolds(Number(coupon.id), exec);
    const effective = selfHold[0] ? held : held + 1;
    if (effective > max) {
      return { status: 409, error: "This coupon has reached its redemption limit.", code: "coupon_maxed" };
    }
  }

  const discountType = coupon.discount_type === "fixed" ? "fixed" : "percent";
  return computeCouponDiscount({
    listAmountCents: input.listAmountCents,
    discountType,
    percentOff: coupon.percent_off == null ? null : Number(coupon.percent_off),
    amountOffCents: coupon.amount_off_cents == null ? null : Number(coupon.amount_off_cents),
  });
}

/** Release abandoned applied holds and restore pending seat list prices. */
export async function expireStaleCouponHolds(enrollmentId?: number): Promise<number> {
  const params: unknown[] = [COUPON_HOLD_TTL_HOURS];
  let enrollmentFilter = "";
  if (enrollmentId != null && Number.isFinite(enrollmentId) && enrollmentId > 0) {
    enrollmentFilter = " AND r.enrollment_id = ?";
    params.push(enrollmentId);
  }
  const [stale] = await db().query<RowDataPacket[]>(
    `SELECT r.id AS redemption_id, r.enrollment_id, e.status AS enrollment_status,
            e.list_amount_cents, ed.price_cents AS edition_price_cents
       FROM coupon_redemptions r
       JOIN enrollments e ON e.id = r.enrollment_id
       JOIN course_editions ed ON ed.id = e.edition_id
      WHERE r.status = 'applied'
        AND r.created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)
        ${enrollmentFilter}`,
    params,
  );
  let released = 0;
  for (const row of stale) {
    await db().execute(
      `UPDATE coupon_redemptions
          SET status = 'released', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'applied'`,
      [row.redemption_id],
    );
    if (row.enrollment_status === "pending" || row.enrollment_status === "waitlist") {
      const restoreCents = Number(row.list_amount_cents ?? row.edition_price_cents ?? 0);
      await invalidateOpenCheckoutForEnrollment(Number(row.enrollment_id), "coupon_hold_expired");
      await db().execute(
        `UPDATE enrollments
            SET coupon_id = NULL,
                list_amount_cents = NULL,
                discount_cents = 0,
                amount_cents = ?,
                payment_method = NULL,
                stripe_checkout_session_id = NULL,
                stripe_payment_intent_id = NULL
          WHERE id = ? AND status IN ('pending', 'waitlist') AND coupon_id IS NOT NULL`,
        [restoreCents, row.enrollment_id],
      );
    }
    released += 1;
  }
  return released;
}

function couponSummaryFromRows(
  coupon: {
    id: unknown;
    code: unknown;
    name: unknown;
    discount_type: unknown;
    percent_off: unknown;
    amount_off_cents: unknown;
  } | null | undefined,
  enrollment: RowDataPacket,
) {
  if (!coupon || !enrollment.coupon_id) return null;
  return {
    id: Number(coupon.id),
    code: String(coupon.code),
    name: String(coupon.name),
    discountType: coupon.discount_type === "fixed" ? ("fixed" as const) : ("percent" as const),
    percentOff: coupon.percent_off == null ? null : Number(coupon.percent_off),
    amountOffCents: coupon.amount_off_cents == null ? null : Number(coupon.amount_off_cents),
    listAmountCents: Number(enrollment.list_amount_cents ?? enrollment.amount_cents),
    discountCents: Number(enrollment.discount_cents || 0),
    finalAmountCents: Number(enrollment.amount_cents),
  };
}

async function consumeCouponRedemption(enrollmentId: number) {
  await db().execute(
    `UPDATE coupon_redemptions
        SET status = 'consumed', updated_at = CURRENT_TIMESTAMP
      WHERE enrollment_id = ? AND status = 'applied'`,
    [enrollmentId],
  );
}

async function releaseCouponRedemption(enrollmentId: number) {
  await db().execute(
    `UPDATE coupon_redemptions
        SET status = 'released', updated_at = CURRENT_TIMESTAMP
      WHERE enrollment_id = ? AND status = 'applied'`,
    [enrollmentId],
  );
}

/** Mark expired SPEI rows failed and reopen checkout (enrollment stays pending). */
export async function expireStaleTransferPayments(enrollmentId?: number): Promise<number> {
  const params: unknown[] = [];
  let enrollmentFilter = "";
  if (enrollmentId != null && Number.isFinite(enrollmentId) && enrollmentId > 0) {
    enrollmentFilter = " AND enrollment_id = ?";
    params.push(enrollmentId);
  }
  const [stale] = await db().query<RowDataPacket[]>(
    `SELECT id, enrollment_id FROM payments
      WHERE method = 'transfer'
        AND status = 'processing'
        AND transfer_expires_at IS NOT NULL
        AND transfer_expires_at < NOW()
        ${enrollmentFilter}`,
    params,
  );
  if (!stale.length) return 0;
  const paymentIds = stale.map((row) => Number(row.id));
  const enrollmentIds = [
    ...new Set(stale.map((row) => Number(row.enrollment_id)).filter((id) => Number.isFinite(id) && id > 0)),
  ];
  await db().execute(
    `UPDATE payments
        SET status = 'failed',
            rejected_at = COALESCE(rejected_at, NOW()),
            reject_reason = COALESCE(NULLIF(reject_reason, ''), 'expired'),
            updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${paymentIds.map(() => "?").join(",")})`,
    paymentIds,
  );
  if (enrollmentIds.length) {
    await db().execute(
      `UPDATE enrollments
          SET payment_method = NULL
        WHERE id IN (${enrollmentIds.map(() => "?").join(",")})
          AND status = 'pending'
          AND payment_method = 'transfer'`,
      enrollmentIds,
    );
  }
  return paymentIds.length;
}

async function cancelActiveTransferForEnrollment(
  enrollmentId: number,
  reason: string,
): Promise<void> {
  await db().execute(
    `UPDATE payments
        SET status = 'failed',
            rejected_at = COALESCE(rejected_at, NOW()),
            reject_reason = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE enrollment_id = ?
        AND method = 'transfer'
        AND status = 'processing'`,
    [reason.slice(0, 400), enrollmentId],
  );
  await db().execute(
    `UPDATE enrollments
        SET payment_method = NULL
      WHERE id = ? AND status = 'pending' AND payment_method = 'transfer'`,
    [enrollmentId],
  );
}

export async function confirmTransferPayment(input: {
  paymentId: number;
  adminId: number;
}): Promise<{ newlyPaid: boolean; enrollmentId: number } | null> {
  await expireStaleTransferPayments();
  const [rows] = await db().query<RowDataPacket[]>(
    `SELECT p.*, e.status AS enrollment_status
       FROM payments p
       JOIN enrollments e ON e.id = p.enrollment_id
      WHERE p.id = ? AND p.method = 'transfer' LIMIT 1`,
    [input.paymentId],
  );
  const payment = rows[0];
  if (!payment) return null;
  if (payment.status === "succeeded") {
    return { newlyPaid: false, enrollmentId: Number(payment.enrollment_id) };
  }
  if (payment.status !== "processing") return null;
  if (
    payment.enrollment_status === "cancelled" ||
    payment.enrollment_status === "no_show"
  ) {
    return null;
  }
  if (payment.transfer_expires_at && new Date(payment.transfer_expires_at).getTime() < Date.now()) {
    await expireStaleTransferPayments(Number(payment.enrollment_id));
    return null;
  }

  await db().execute(
    `UPDATE payments
        SET confirmed_by_admin_id = ?,
            confirmed_at = NOW(),
            rejected_at = NULL,
            reject_reason = NULL,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [input.adminId, input.paymentId],
  );

  const paid = await markEnrollmentPaid({
    enrollmentId: Number(payment.enrollment_id),
    checkoutSessionId: payment.stripe_checkout_session_id
      ? String(payment.stripe_checkout_session_id)
      : null,
    paymentIntentId: null,
    brand: null,
    last4: null,
    method: "transfer",
    paymentId: input.paymentId,
  });
  return { newlyPaid: paid.newlyPaid, enrollmentId: Number(payment.enrollment_id) };
}

export async function rejectTransferPayment(input: {
  paymentId: number;
  reason?: string | null;
}): Promise<{ ok: true; enrollmentId: number } | null> {
  await expireStaleTransferPayments();
  const [rows] = await db().query<RowDataPacket[]>(
    "SELECT id, enrollment_id, status FROM payments WHERE id = ? AND method = 'transfer' LIMIT 1",
    [input.paymentId],
  );
  const payment = rows[0];
  if (!payment) return null;
  if (payment.status === "failed") {
    return { ok: true, enrollmentId: Number(payment.enrollment_id) };
  }
  if (payment.status !== "processing") return null;

  const reason = (input.reason || "rejected").trim().slice(0, 400) || "rejected";
  await db().execute(
    `UPDATE payments
        SET status = 'failed',
            rejected_at = NOW(),
            reject_reason = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [reason, input.paymentId],
  );
  await db().execute(
    `UPDATE enrollments
        SET payment_method = NULL
      WHERE id = ? AND status = 'pending' AND payment_method = 'transfer'`,
    [payment.enrollment_id],
  );
  return { ok: true, enrollmentId: Number(payment.enrollment_id) };
}

function buildApp(): Express {
  const app = express();
  app.set("trust proxy", 1);
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        const allowed = new Set(
          [process.env.VITE_PUBLIC_SITE_URL, "http://localhost:8080", "https://localhost:8080"].filter(
            Boolean,
          ) as string[],
        );
        if (allowed.has(origin) || origin.endsWith(".vercel.app")) return callback(null, true);
        return callback(null, false);
      },
    }),
  );

  app.post(
    "/api/webhooks/stripe",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const stripe = stripeClient();
      const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
      if (!stripe || !secret) return res.status(503).json({ error: "Stripe webhooks are not configured." });
      const signature = req.get("stripe-signature");
      if (!signature) return res.status(400).json({ error: "Missing Stripe signature." });
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(req.body, signature, secret);
      } catch {
        return res.status(400).json({ error: "Invalid Stripe signature." });
      }
      if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
        const session = event.data.object as Stripe.Checkout.Session;
        const enrollmentId = Number(session.metadata?.enrollment_id);
        // Card settles on completed+paid; OXXO settles on async_payment_succeeded.
        const shouldFulfill =
          event.type === "checkout.session.async_payment_succeeded" ||
          (event.type === "checkout.session.completed" && session.payment_status === "paid");
        if (enrollmentId && shouldFulfill) {
          let brand: string | null = null;
          let last4: string | null = null;
          let paymentIntentId: string | null = null;
          let method: PaymentMethod = "card";
          try {
            const full = await stripe.checkout.sessions.retrieve(session.id, {
              expand: ["payment_intent.payment_method"],
            });
            const details = cardDetailsFromSession(full);
            brand = details.brand;
            last4 = details.last4;
            paymentIntentId = details.paymentIntentId;
            method = paymentMethodFromSession(full);
          } catch (error) {
            console.error("stripe expand", error);
          }
          const paid = await markEnrollmentPaid({
            enrollmentId,
            checkoutSessionId: session.id,
            paymentIntentId,
            brand,
            last4,
            method,
          });
          if (paid.newlyPaid) {
            try {
              await sendSeatConfirmationEmail({
                enrollmentId,
                method,
                brand,
                last4,
              });
            } catch (error) {
              console.error("seat confirmation email", error);
            }
          }
        } else if (enrollmentId && event.type === "checkout.session.completed" && session.payment_status === "unpaid") {
          // OXXO voucher issued — keep seat pending until cash is paid.
          await markEnrollmentPendingOxxo({ enrollmentId, checkoutSessionId: session.id });
          try {
            let full: Stripe.Checkout.Session = session;
            try {
              full = await stripe.checkout.sessions.retrieve(session.id, { expand: ["payment_intent"] });
            } catch (error) {
              console.warn("oxxo voucher expand", error);
            }
            await sendOxxoVoucherEmail({ enrollmentId, checkoutSessionId: session.id, session: full });
          } catch (error) {
            console.error("oxxo voucher email", error);
          }
        }
      } else if (event.type === "checkout.session.async_payment_failed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const enrollmentId = Number(session.metadata?.enrollment_id);
        if (enrollmentId) {
          await db().execute(
            "UPDATE payments SET status = 'failed' WHERE stripe_checkout_session_id = ? AND status = 'processing'",
            [session.id],
          );
        }
      }
      res.json({ received: true });
    },
  );

  app.use(express.json({ limit: "6mb" }));

  const authLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 12,
    skip: () => process.env.VITEST === "true",
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many codes. Wait a few minutes and try again." },
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/catalog/courses", async (_req, res) => {
    try {
      const [rows] = await db().query<RowDataPacket[]>(
        `${COURSE_SELECT} WHERE c.status = 'published' ORDER BY cat.slug, c.title`,
      );
      const courses = [];
      for (const row of rows) {
        const course = courseFromRow(row);
        course.editions = await editionsForCourse(course.id, true);
        courses.push(course);
      }
      res.json({ courses });
    } catch (error) {
      sendDbError(res, error as { code?: string });
    }
  });

  app.get("/api/catalog/courses/:slug", async (req, res) => {
    try {
      const [rows] = await db().query<RowDataPacket[]>(
        `${COURSE_SELECT} WHERE c.slug = ? AND c.status = 'published' LIMIT 1`,
        [req.params.slug],
      );
      if (!rows[0]) return res.status(404).json({ error: "That course is not published." });
      const course = courseFromRow(rows[0]);
      course.editions = await editionsForCourse(course.id, true);
      course.gallery = await galleryForCourse(course.id);
      res.json({ course });
    } catch (error) {
      sendDbError(res, error as { code?: string });
    }
  });

  app.post("/api/auth/user/check", authLimiter, async (req, res) => {
    const parsed = z.object({ email: emailSchema }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid email." });
    const [rows] = await db().query<RowDataPacket[]>("SELECT id FROM users WHERE email = ? LIMIT 1", [
      parsed.data.email,
    ]);
    res.json({ exists: Boolean(rows[0]) });
  });

  app.post("/api/auth/user/request-otp", authLimiter, async (req, res) => {
    const parsed = z
      .object({
        email: emailSchema,
        firstName: z.string().trim().max(120).optional(),
        lastName: z.string().trim().max(120).optional(),
        audience: z.enum(["professional", "student", "general"]).optional(),
        preferredLanguage: z.enum(["es", "en"]).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid email." });
    const { email, firstName, lastName, audience, preferredLanguage } = parsed.data;
    const [rows] = await db().query<RowDataPacket[]>("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    const exists = Boolean(rows[0]);
    if (!exists && !firstName) {
      return res.status(400).json({ error: "Add your name to open an account.", code: "profile_required" });
    }
    if (!exists) {
      await db().execute(
        "INSERT INTO users (email, first_name, last_name, audience, preferred_language) VALUES (?, ?, ?, ?, ?)",
        [
          email,
          firstName || "",
          lastName || "",
          (audience || "professional") as Audience,
          preferredLanguage || null,
        ],
      );
    }
    const code = await storeLoginCode("user_login_codes", email, exists ? "login" : "register");
    await sendEmail(
      email,
      "Tu código DOMINA",
      emailShell(
        "Entra con este código",
        `<p>Tu código de acceso es</p><p style="font-size:32px;letter-spacing:.28em;font-weight:700;color:#12352b;">${code}</p><p>Caduca en 10 minutos. Si no lo pediste, ignora este correo.</p>`,
      ),
    );
    res.json({ ok: true, ...(process.env.VITEST === "true" ? { devCode: code } : {}) });
  });

  app.post("/api/auth/user/verify-otp", authLimiter, async (req, res) => {
    const parsed = z
      .object({
        email: emailSchema,
        code: z.string().regex(/^\d{6}$/),
        preferredLanguage: z.enum(["es", "en"]).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter the 6-digit code." });
    const ok = await consumeLoginCode("user_login_codes", parsed.data.email, parsed.data.code);
    if (!ok) return res.status(400).json({ error: "That code is invalid or expired." });
    const [rows] = await db().query<RowDataPacket[]>("SELECT * FROM users WHERE email = ? LIMIT 1", [
      parsed.data.email,
    ]);
    if (!rows[0]) return res.status(404).json({ error: "Create an account first." });
    if (!rows[0].preferred_language && parsed.data.preferredLanguage) {
      await db().execute("UPDATE users SET preferred_language = ? WHERE id = ?", [
        parsed.data.preferredLanguage,
        rows[0].id,
      ]);
      rows[0].preferred_language = parsed.data.preferredLanguage;
    }
    const token = newToken();
    await db().execute(
      "INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))",
      [rows[0].id, hashToken(token)],
    );
    res.json({ token, user: userFromRow(rows[0]) });
  });

  app.post("/api/auth/user/logout", requireUser, async (req, res) => {
    const token = bearer(req);
    if (token) await db().execute("DELETE FROM user_sessions WHERE token_hash = ?", [hashToken(token)]);
    res.json({ ok: true });
  });

  app.get("/api/auth/user/me", requireUser, (req, res) => {
    res.json({ user: (req as AuthedRequest).user });
  });

  app.patch("/api/auth/user/me", requireUser, async (req, res) => {
    const parsed = z
      .object({
        firstName: z.string().trim().min(1).max(120),
        lastName: z.string().trim().max(120),
        phone: z.string().trim().max(40).nullable().optional(),
        audience: z.enum(["professional", "student", "general"]),
        preferredLanguage: z.enum(["es", "en"]).nullable().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the profile fields." });
    const user = (req as AuthedRequest).user as UserProfile;
    if (parsed.data.preferredLanguage !== undefined) {
      await db().execute(
        "UPDATE users SET first_name = ?, last_name = ?, phone = ?, audience = ?, preferred_language = ? WHERE id = ?",
        [
          parsed.data.firstName,
          parsed.data.lastName,
          parsed.data.phone || null,
          parsed.data.audience,
          parsed.data.preferredLanguage,
          user.id,
        ],
      );
    } else {
      await db().execute(
        "UPDATE users SET first_name = ?, last_name = ?, phone = ?, audience = ? WHERE id = ?",
        [parsed.data.firstName, parsed.data.lastName, parsed.data.phone || null, parsed.data.audience, user.id],
      );
    }
    const [rows] = await db().query<RowDataPacket[]>("SELECT * FROM users WHERE id = ?", [user.id]);
    res.json({ user: userFromRow(rows[0]) });
  });

  app.put("/api/auth/user/language", requireUser, async (req, res) => {
    const parsed = z.object({ language: z.enum(["es", "en"]) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose es or en." });
    const user = (req as AuthedRequest).user as UserProfile;
    await db().execute("UPDATE users SET preferred_language = ? WHERE id = ?", [parsed.data.language, user.id]);
    const [rows] = await db().query<RowDataPacket[]>("SELECT * FROM users WHERE id = ?", [user.id]);
    res.json({ user: userFromRow(rows[0]) });
  });

  app.post("/api/auth/admin/check", authLimiter, async (req, res) => {
    const parsed = z.object({ email: emailSchema }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid email." });
    const [rows] = await db().query<RowDataPacket[]>("SELECT id FROM admins WHERE email = ? LIMIT 1", [
      parsed.data.email,
    ]);
    res.json({ exists: Boolean(rows[0]) });
  });

  app.post("/api/auth/admin/request-otp", authLimiter, async (req, res) => {
    const parsed = z
      .object({
        email: emailSchema,
        companyName: z.string().trim().min(2).max(200).optional(),
        contactName: z.string().trim().max(160).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid email." });
    const email = parsed.data.email;
    const [rows] = await db().query<RowDataPacket[]>(
      "SELECT id, status FROM admins WHERE email = ? LIMIT 1",
      [email],
    );
    const [countRows] = await db().query<RowDataPacket[]>("SELECT COUNT(*) AS c FROM admins");
    const bootstrap = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const canBootstrap = !rows[0] && Number(countRows[0]?.c || 0) === 0 && bootstrap === email;

    if (!rows[0] && parsed.data.companyName) {
      const contact = parsed.data.contactName?.trim() || "";
      const [companyResult] = await db().execute<ResultSetHeader>(
        "INSERT INTO companies (name, email, contact_name) VALUES (?, ?, ?)",
        [parsed.data.companyName, email, contact],
      );
      const firstName = contact ? contact.split(/\s+/)[0] : "Empresa";
      const lastName = contact.includes(" ") ? contact.split(/\s+/).slice(1).join(" ") : "";
      await db().execute(
        "INSERT INTO admins (email, first_name, last_name, role, status, company_id) VALUES (?, ?, ?, 'company', 'active', ?)",
        [email, firstName, lastName, companyResult.insertId],
      );
    } else if (canBootstrap) {
      await db().execute(
        "INSERT INTO admins (email, first_name, role, status) VALUES (?, 'Owner', 'owner', 'active')",
        [email],
      );
    } else if (!rows[0]) {
      return res.json({ ok: true });
    } else if (rows[0].status === "disabled") {
      return res.json({ ok: true });
    }

    const code = await storeLoginCode("admin_login_codes", email, "login");
    await sendEmail(
      email,
      "Código de acceso DOMINA",
      emailShell(
        "Acceso al portal",
        `<p>Tu código es</p><p style="font-size:32px;letter-spacing:.28em;font-weight:700;color:#12352b;">${code}</p><p>Caduca en 10 minutos.</p>`,
      ),
    );
    res.json({ ok: true, ...(process.env.VITEST === "true" ? { devCode: code } : {}) });
  });

  app.post("/api/auth/admin/verify-otp", authLimiter, async (req, res) => {
    const parsed = z
      .object({
        email: emailSchema,
        code: z.string().regex(/^\d{6}$/),
        preferredLanguage: z.enum(["es", "en"]).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter the 6-digit code." });
    const ok = await consumeLoginCode("admin_login_codes", parsed.data.email, parsed.data.code);
    if (!ok) return res.status(400).json({ error: "That code is invalid or expired." });
    let [rows] = await db().query<RowDataPacket[]>(
      `SELECT a.*, c.name AS company_name
         FROM admins a
         LEFT JOIN companies c ON c.id = a.company_id
        WHERE a.email = ? LIMIT 1`,
      [parsed.data.email],
    );
    if (!rows[0]) {
      const bootstrap = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
      const [countRows] = await db().query<RowDataPacket[]>("SELECT COUNT(*) AS c FROM admins");
      if (bootstrap === parsed.data.email && Number(countRows[0]?.c || 0) === 0) {
        await db().execute(
          "INSERT INTO admins (email, first_name, role, status) VALUES (?, 'Owner', 'owner', 'active')",
          [parsed.data.email],
        );
        [rows] = await db().query<RowDataPacket[]>(
          `SELECT a.*, c.name AS company_name
             FROM admins a
             LEFT JOIN companies c ON c.id = a.company_id
            WHERE a.email = ? LIMIT 1`,
          [parsed.data.email],
        );
      }
    }
    if (!rows[0] || rows[0].status === "disabled") {
      return res.status(403).json({ error: "This inbox is not on the team." });
    }
    if (rows[0].status === "invited") {
      await db().execute("UPDATE admins SET status = 'active' WHERE id = ?", [rows[0].id]);
      rows[0].status = "active";
    }
    if (!rows[0].preferred_language && parsed.data.preferredLanguage) {
      await db().execute("UPDATE admins SET preferred_language = ? WHERE id = ?", [
        parsed.data.preferredLanguage,
        rows[0].id,
      ]);
      rows[0].preferred_language = parsed.data.preferredLanguage;
    }
    const token = newToken();
    await db().execute(
      "INSERT INTO admin_sessions (admin_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 14 DAY))",
      [rows[0].id, hashToken(token)],
    );
    res.json({ token, admin: adminFromRow(rows[0]) });
  });

  app.post("/api/auth/admin/logout", requireAdmin, async (req, res) => {
    const token = bearer(req);
    if (token) await db().execute("DELETE FROM admin_sessions WHERE token_hash = ?", [hashToken(token)]);
    res.json({ ok: true });
  });

  app.get("/api/auth/admin/me", requireAdmin, (req, res) => {
    res.json({ admin: (req as AuthedRequest).admin });
  });

  app.put("/api/auth/admin/language", requireAdmin, async (req, res) => {
    const parsed = z.object({ language: z.enum(["es", "en"]) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose es or en." });
    const admin = (req as AuthedRequest).admin as AdminProfile;
    await db().execute("UPDATE admins SET preferred_language = ? WHERE id = ?", [parsed.data.language, admin.id]);
    const [rows] = await db().query<RowDataPacket[]>(
      `SELECT a.*, c.name AS company_name
         FROM admins a
         LEFT JOIN companies c ON c.id = a.company_id
        WHERE a.id = ? LIMIT 1`,
      [admin.id],
    );
    res.json({ admin: adminFromRow(rows[0]) });
  });

  app.get("/api/portal/enrollments", requireUser, async (req, res) => {
    const user = (req as AuthedRequest).user as UserProfile;
    const [rows] = await db().query<RowDataPacket[]>(
      `SELECT e.*, c.title, c.slug, c.promise, cat.slug AS category, c.cover_image_url,
              ed.starts_at, ed.ends_at, ed.venue_name, ed.city, ed.status AS edition_status
         FROM enrollments e
         JOIN course_editions ed ON ed.id = e.edition_id
         JOIN courses c ON c.id = ed.course_id
         JOIN course_categories cat ON cat.id = c.category_id
        WHERE e.user_id = ?
        ORDER BY ed.starts_at DESC`,
      [user.id],
    );
    res.json({
      enrollments: rows.map((row) => ({
        id: Number(row.id),
        editionId: Number(row.edition_id),
        status: row.status as EnrollmentStatus,
        amountCents: Number(row.amount_cents),
        currency: row.currency,
        listAmountCents: row.list_amount_cents == null ? null : Number(row.list_amount_cents),
        discountCents: Number(row.discount_cents || 0),
        couponId: row.coupon_id == null ? null : Number(row.coupon_id),
        paymentMethod: row.payment_method,
        cardBrand: row.card_brand,
        cardLast4: row.card_last4,
        title: row.title,
        slug: row.slug,
        promise: row.promise,
        category: row.category,
        coverImageUrl: row.cover_image_url || null,
        startsAt: iso(row.starts_at),
        endsAt: iso(row.ends_at),
        venueName: row.venue_name,
        city: row.city,
        editionStatus: row.edition_status,
      })),
    });
  });

  app.get("/api/portal/recommendations", requireUser, async (req, res) => {
    const user = (req as AuthedRequest).user as UserProfile;
    const [rows] = await db().query<RowDataPacket[]>(
      `${COURSE_SELECT}
        WHERE c.status = 'published'
          AND c.id NOT IN (
            SELECT ed.course_id FROM enrollments e
              JOIN course_editions ed ON ed.id = e.edition_id
             WHERE e.user_id = ? AND e.status IN ('paid','attended','pending')
          )
        ORDER BY cat.slug, lvl.slug
        LIMIT 3`,
      [user.id],
    );
    res.json({ courses: rows.map(courseFromRow) });
  });

  app.post("/api/portal/enrollments", requireUser, async (req, res) => {
    const parsed = z.object({ editionId: z.number().int().positive() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose an edition." });
    const user = (req as AuthedRequest).user as UserProfile;
    try {
      const [editions] = await db().query<RowDataPacket[]>(
        `${EDITION_SELECT} WHERE e.id = ? LIMIT 1`,
        [parsed.data.editionId],
      );
      const edition = editions[0];
      if (!edition || !["presale", "confirmed"].includes(edition.status)) {
        return res.status(404).json({ error: "That edition is not open." });
      }

      const [existingRows] = await db().query<RowDataPacket[]>(
        "SELECT id, status FROM enrollments WHERE edition_id = ? AND user_id = ? LIMIT 1",
        [edition.id, user.id],
      );
      const existing = existingRows[0];
      if (existing) {
        if (existing.status === "paid" || existing.status === "attended") {
          return res.json({
            enrollmentId: Number(existing.id),
            alreadyPaid: true,
          });
        }
        if (existing.status === "pending" || existing.status === "waitlist") {
          // Resume an unpaid hold instead of failing with a duplicate-key 409.
          return res.json({ enrollmentId: Number(existing.id), resumed: true });
        }
        await db().execute(
          `UPDATE enrollments
              SET status = 'pending', amount_cents = ?, currency = ?,
                  payment_method = NULL, card_brand = NULL, card_last4 = NULL,
                  stripe_checkout_session_id = NULL, stripe_payment_intent_id = NULL, paid_at = NULL,
                  coupon_id = NULL, list_amount_cents = NULL, discount_cents = 0
            WHERE id = ?`,
          [edition.price_cents, edition.currency, existing.id],
        );
        await releaseCouponRedemption(Number(existing.id));
        return res.json({ enrollmentId: Number(existing.id), resumed: true });
      }

      if (Number(edition.held_count) >= Number(edition.capacity)) {
        return res.status(409).json({ error: "This edition is full." });
      }
      const [result] = await db().execute<ResultSetHeader>(
        `INSERT INTO enrollments (edition_id, user_id, status, amount_cents, currency)
         VALUES (?, ?, 'pending', ?, ?)`,
        [edition.id, user.id, edition.price_cents, edition.currency],
      );
      res.status(201).json({ enrollmentId: result.insertId });
    } catch (error) {
      const err = error as { code?: string };
      if (err?.code === "ER_DUP_ENTRY") {
        const [rows] = await db().query<RowDataPacket[]>(
          "SELECT id, status FROM enrollments WHERE edition_id = ? AND user_id = ? LIMIT 1",
          [parsed.data.editionId, user.id],
        );
        if (rows[0] && (rows[0].status === "pending" || rows[0].status === "waitlist")) {
          return res.json({ enrollmentId: Number(rows[0].id), resumed: true });
        }
        return res.status(409).json({ error: "You already have a seat in this edition.", code: "already_enrolled" });
      }
      sendDbError(res, err);
    }
  });

  app.post("/api/portal/checkout", requireUser, async (req, res) => {
    const parsed = z
      .object({
        enrollmentId: z.number().int().positive(),
        /** When true, cancel an active SPEI hold so card/OXXO checkout can start. */
        preferStripe: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose a seat to pay." });
    const user = (req as AuthedRequest).user as UserProfile;
    try {
      await expireStaleTransferPayments(parsed.data.enrollmentId);
      await expireStaleCouponHolds(parsed.data.enrollmentId);
      const [rows] = await db().query<RowDataPacket[]>(
        `SELECT e.*, c.title, u.preferred_language
           FROM enrollments e
           JOIN course_editions ed ON ed.id = e.edition_id
           JOIN courses c ON c.id = ed.course_id
           JOIN users u ON u.id = e.user_id
          WHERE e.id = ? AND e.user_id = ? LIMIT 1`,
        [parsed.data.enrollmentId, user.id],
      );
      const enrollment = rows[0];
      if (!enrollment) return res.status(404).json({ error: "That seat was not found." });
      if (enrollment.status === "paid" || enrollment.status === "attended") {
        return res.status(409).json({ error: "This seat is already paid.", code: "already_paid" });
      }
      if (enrollment.status === "cancelled" || enrollment.status === "no_show") {
        return res.status(409).json({ error: "This seat is no longer available.", code: "seat_unavailable" });
      }
      if (Number(enrollment.amount_cents) <= 0) {
        return res.status(409).json({
          error: "This seat is free with your coupon. Confirm it without card or transfer.",
          code: "coupon_free",
        });
      }

      const language: AppLanguage = enrollment.preferred_language === "en" ? "en" : "es";
      const settings = await loadBankTransferSettings();

      // Active SPEI hold: return instructions unless the learner explicitly switches to Stripe.
      const [activeTransferRows] = await db().query<RowDataPacket[]>(
        `SELECT id, transfer_reference, transfer_expires_at, amount_cents, currency
           FROM payments
          WHERE enrollment_id = ? AND method = 'transfer' AND status = 'processing'
          ORDER BY id DESC LIMIT 1`,
        [enrollment.id],
      );
      const activeTransfer = activeTransferRows[0];
      if (activeTransfer && !parsed.data.preferStripe) {
        if (!settings) {
          return res.status(503).json({ error: "Bank transfer is not configured yet." });
        }
        return res.json(
          transferInstructionsPayload({
            enrollmentId: Number(enrollment.id),
            paymentId: Number(activeTransfer.id),
            reference: String(activeTransfer.transfer_reference || transferReferenceFor(Number(enrollment.id))),
            expiresAt: iso(activeTransfer.transfer_expires_at),
            amountCents: Number(activeTransfer.amount_cents || enrollment.amount_cents),
            currency: String(activeTransfer.currency || enrollment.currency || "MXN"),
            settings,
            language,
          }),
        );
      }
      if (activeTransfer && parsed.data.preferStripe) {
        await cancelActiveTransferForEnrollment(Number(enrollment.id), "switched_to_stripe");
      }

      // OXXO voucher already issued: under VITEST (no Stripe) report pending_oxxo.
      // In production we mint a fresh Checkout Session below so payment methods stay available.
      const stripe = stripeClient();
      if (!stripe) {
        if (enrollment.payment_method === "oxxo" && enrollment.status === "pending") {
          return res.json({
            status: "pending_oxxo",
            enrollmentId: Number(enrollment.id),
            sessionId: enrollment.stripe_checkout_session_id || null,
          });
        }
        return res.status(503).json({ error: "Card payments are not configured yet." });
      }

      // Refresh-safe: reuse an open session only if it already exposes card + OXXO
      // and redirects back to this same site origin (avoids prod return_url while on localhost).
      const siteOrigin = originOf(req);
      if (enrollment.stripe_checkout_session_id) {
        try {
          const existing = await stripe.checkout.sessions.retrieve(String(enrollment.stripe_checkout_session_id));
          const methods = existing.payment_method_types || [];
          const hasCardAndOxxo = methods.includes("card") && methods.includes("oxxo");
          const returnUrl = String(existing.return_url || "");
          const sameOrigin =
            returnUrl.startsWith(`${siteOrigin}/cuenta/pagar/`) ||
            returnUrl.startsWith(`${siteOrigin}/cuenta/exito`);

          // Prior OXXO voucher (complete + unpaid): keep the payment row, unlock the seat,
          // and fall through to create a new open session so card/OXXO UI can render again.
          if (existing.status === "complete" && existing.payment_status === "unpaid") {
            await markEnrollmentPendingOxxo({
              enrollmentId: Number(enrollment.id),
              checkoutSessionId: existing.id,
            });
            await db().execute(
              "UPDATE enrollments SET payment_method = NULL WHERE id = ? AND status = 'pending'",
              [enrollment.id],
            );
          } else if (existing.status === "open" && existing.client_secret && hasCardAndOxxo && sameOrigin) {
            return res.json({ clientSecret: existing.client_secret, sessionId: existing.id, reused: true });
          } else if (existing.status === "open") {
            try {
              await stripe.checkout.sessions.expire(existing.id);
            } catch (expireError) {
              console.warn("stripe session expire failed", expireError);
            }
          }
        } catch (error) {
          console.warn("stripe session reuse failed", error);
        }
      }

      // Seat was flagged OXXO from a prior voucher — clear the lock before minting a new session.
      if (enrollment.payment_method === "oxxo") {
        await db().execute(
          "UPDATE enrollments SET payment_method = NULL WHERE id = ? AND status = 'pending'",
          [enrollment.id],
        );
      }

      const locale = enrollment.preferred_language === "en" ? "en" : "es";
      // Return to the pay page so closing the OXXO voucher keeps the learner in checkout
      // (card success still confirms via session_id and navigates to /cuenta/exito).
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ui_mode: "elements",
        locale,
        customer_email: user.email,
        // Explicit list so OXXO always appears (Dashboard dynamic methods alone often hide it).
        payment_method_types: ["card", "oxxo"],
        payment_method_options: {
          oxxo: { expires_after_days: 3 },
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: String(enrollment.currency || "mxn").toLowerCase(),
              unit_amount: Number(enrollment.amount_cents),
              product_data: { name: enrollment.title },
            },
          },
        ],
        metadata: {
          enrollment_id: String(enrollment.id),
          edition_id: String(enrollment.edition_id),
          user_id: String(user.id),
        },
        return_url: `${siteOrigin}/cuenta/pagar/${enrollment.id}?session_id={CHECKOUT_SESSION_ID}`,
        integration_identifier: `domina_checkout_${randomLetters(8)}`,
      });

      const [existingPayments] = await db().query<RowDataPacket[]>(
        `SELECT id FROM payments
          WHERE enrollment_id = ? AND status IN ('requires_payment', 'processing')
          ORDER BY id DESC LIMIT 1`,
        [enrollment.id],
      );
      if (existingPayments[0]) {
        await db().execute(
          `UPDATE payments
              SET stripe_checkout_session_id = ?, status = 'requires_payment', method = 'card', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          [session.id, existingPayments[0].id],
        );
      } else {
        await db().execute(
          `INSERT INTO payments (
             enrollment_id, user_id, edition_id, amount_cents, currency, status, method, stripe_checkout_session_id
           ) VALUES (?, ?, ?, ?, ?, 'requires_payment', 'card', ?)`,
          [
            enrollment.id,
            user.id,
            enrollment.edition_id,
            enrollment.amount_cents,
            enrollment.currency,
            session.id,
          ],
        );
      }
      await db().execute("UPDATE enrollments SET stripe_checkout_session_id = ? WHERE id = ?", [
        session.id,
        enrollment.id,
      ]);
      res.json({ clientSecret: session.client_secret, sessionId: session.id });
    } catch (error) {
      const stripeError = error as { type?: string; message?: string; raw?: { message?: string } };
      console.error("checkout create", stripeError?.message || error);
      if (stripeError?.type?.startsWith("Stripe") || stripeError?.raw?.message) {
        return res.status(502).json({
          error: stripeError.raw?.message || stripeError.message || "Stripe could not start checkout.",
        });
      }
      sendDbError(res, error as { code?: string; message?: string });
    }
  });

  app.get("/api/portal/enrollments/:id", requireUser, async (req, res) => {
    const enrollmentId = Number(req.params.id);
    if (!Number.isFinite(enrollmentId) || enrollmentId < 1) {
      return res.status(400).json({ error: "Invalid enrollment." });
    }
    const user = (req as AuthedRequest).user as UserProfile;
    await expireStaleTransferPayments(enrollmentId);
    await expireStaleCouponHolds(enrollmentId);
    const [rows] = await db().query<RowDataPacket[]>(
      `SELECT e.*, c.title, c.slug, c.promise, cat.slug AS category, c.cover_image_url,
              ed.starts_at, ed.ends_at, ed.venue_name, ed.city, ed.status AS edition_status,
              u.preferred_language,
              cp.code AS coupon_code, cp.name AS coupon_name, cp.discount_type AS coupon_discount_type,
              cp.percent_off AS coupon_percent_off, cp.amount_off_cents AS coupon_amount_off_cents
         FROM enrollments e
         JOIN course_editions ed ON ed.id = e.edition_id
         JOIN courses c ON c.id = ed.course_id
         JOIN course_categories cat ON cat.id = c.category_id
         JOIN users u ON u.id = e.user_id
         LEFT JOIN coupons cp ON cp.id = e.coupon_id
        WHERE e.id = ? AND e.user_id = ? LIMIT 1`,
      [enrollmentId, user.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "That seat was not found." });
    const row = rows[0];
    let transfer: ReturnType<typeof transferInstructionsPayload> | null = null;
    if (row.payment_method === "transfer" && row.status === "pending" && Number(row.amount_cents) > 0) {
      const settings = await loadBankTransferSettings();
      const [transferRows] = await db().query<RowDataPacket[]>(
        `SELECT id, transfer_reference, transfer_expires_at, amount_cents, currency
           FROM payments
          WHERE enrollment_id = ? AND method = 'transfer' AND status = 'processing'
          ORDER BY id DESC LIMIT 1`,
        [enrollmentId],
      );
      if (settings && transferRows[0]) {
        const language: AppLanguage = row.preferred_language === "en" ? "en" : "es";
        transfer = transferInstructionsPayload({
          enrollmentId,
          paymentId: Number(transferRows[0].id),
          reference: String(transferRows[0].transfer_reference || transferReferenceFor(enrollmentId)),
          expiresAt: iso(transferRows[0].transfer_expires_at),
          amountCents: Number(transferRows[0].amount_cents || row.amount_cents),
          currency: String(transferRows[0].currency || row.currency || "MXN"),
          settings,
          language,
        });
      }
    }
    const coupon =
      row.coupon_id == null
        ? null
        : couponSummaryFromRows(
            {
              id: row.coupon_id,
              code: row.coupon_code,
              name: row.coupon_name,
              discount_type: row.coupon_discount_type,
              percent_off: row.coupon_percent_off,
              amount_off_cents: row.coupon_amount_off_cents,
            },
            row,
          );
    res.json({
      enrollment: {
        id: Number(row.id),
        editionId: Number(row.edition_id),
        status: row.status as EnrollmentStatus,
        amountCents: Number(row.amount_cents),
        currency: row.currency,
        listAmountCents: row.list_amount_cents == null ? null : Number(row.list_amount_cents),
        discountCents: Number(row.discount_cents || 0),
        couponId: row.coupon_id == null ? null : Number(row.coupon_id),
        coupon,
        paymentMethod: row.payment_method,
        cardBrand: row.card_brand,
        cardLast4: row.card_last4,
        title: row.title,
        slug: row.slug,
        promise: row.promise,
        category: row.category,
        coverImageUrl: row.cover_image_url || null,
        startsAt: iso(row.starts_at),
        endsAt: iso(row.ends_at),
        venueName: row.venue_name,
        city: row.city,
        editionStatus: row.edition_status,
        transfer,
      },
    });
  });

  app.post("/api/portal/checkout/confirm", requireUser, async (req, res) => {
    const parsed = z.object({ sessionId: z.string().trim().min(8).max(255) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Missing checkout session." });
    const stripe = stripeClient();
    if (!stripe) return res.status(503).json({ error: "Card payments are not configured yet." });
    const user = (req as AuthedRequest).user as UserProfile;
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(parsed.data.sessionId, {
        expand: ["payment_intent.payment_method"],
      });
    } catch {
      return res.status(404).json({ error: "That payment session was not found." });
    }
    if (session.metadata?.user_id !== String(user.id)) {
      return res.status(403).json({ error: "That payment belongs to another account." });
    }
    const enrollmentId = Number(session.metadata?.enrollment_id);
    if (!enrollmentId) return res.status(400).json({ error: "That payment is not tied to a seat." });

    // OXXO: voucher created, cash still pending at the store.
    if (session.status === "complete" && session.payment_status === "unpaid") {
      await markEnrollmentPendingOxxo({ enrollmentId, checkoutSessionId: session.id });
      let voucherPayload: {
        url: string;
        reference: string | null;
        expiresAt: number | null;
        amountCents: number;
        currency: string;
        courseTitle: string;
      } | null = null;
      try {
        const expanded = await stripe.checkout.sessions.retrieve(session.id, { expand: ["payment_intent"] });
        const details = await resolveOxxoVoucherDetails(stripe, session.id, expanded);
        const [enrollRows] = await db().query<RowDataPacket[]>(
          `SELECT e.amount_cents, e.currency, c.title
             FROM enrollments e
             JOIN course_editions ed ON ed.id = e.edition_id
             JOIN courses c ON c.id = ed.course_id
            WHERE e.id = ? LIMIT 1`,
          [enrollmentId],
        );
        if (details?.voucherUrl && enrollRows[0]) {
          voucherPayload = {
            url: details.voucherUrl,
            reference: details.reference,
            expiresAt: details.expiresAt,
            amountCents: Number(enrollRows[0].amount_cents || 0),
            currency: String(enrollRows[0].currency || "MXN"),
            courseTitle: String(enrollRows[0].title || ""),
          };
        }
        await sendOxxoVoucherEmail({ enrollmentId, checkoutSessionId: session.id, session: expanded });
      } catch (error) {
        console.error("oxxo voucher email", error);
      }
      return res.json({
        status: "pending_oxxo",
        enrollmentId,
        sessionId: session.id,
        voucher: voucherPayload,
      });
    }

    if (session.payment_status !== "paid") {
      return res.status(409).json({ error: "That payment is not complete yet." });
    }
    const details = cardDetailsFromSession(session);
    const method = paymentMethodFromSession(session);
    const paid = await markEnrollmentPaid({
      enrollmentId,
      checkoutSessionId: session.id,
      paymentIntentId: details.paymentIntentId,
      brand: details.brand,
      last4: details.last4,
      method,
    });
    if (paid.newlyPaid) {
      try {
        await sendSeatConfirmationEmail({
          enrollmentId,
          method,
          brand: details.brand,
          last4: details.last4,
        });
      } catch (error) {
        console.error("seat confirmation email", error);
      }
    }
    res.json({ status: "paid", enrollmentId });
  });

  app.post("/api/portal/checkout/oxxo-email", requireUser, async (req, res) => {
    const parsed = z
      .object({
        enrollmentId: z.number().int().positive(),
        sessionId: z.string().trim().min(8).max(255).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose a seat with an OXXO voucher." });
    const user = (req as AuthedRequest).user as UserProfile;

    const [enrollmentRows] = await db().query<RowDataPacket[]>(
      "SELECT id, status FROM enrollments WHERE id = ? AND user_id = ? LIMIT 1",
      [parsed.data.enrollmentId, user.id],
    );
    if (!enrollmentRows[0]) return res.status(404).json({ error: "That seat was not found." });
    if (enrollmentRows[0].status === "paid" || enrollmentRows[0].status === "attended") {
      return res.status(409).json({ error: "This seat is already paid.", code: "already_paid" });
    }

    let checkoutSessionId = parsed.data.sessionId || null;
    if (!checkoutSessionId) {
      const [paymentRows] = await db().query<RowDataPacket[]>(
        `SELECT stripe_checkout_session_id FROM payments
          WHERE enrollment_id = ? AND method = 'oxxo' AND status = 'processing'
          ORDER BY id DESC LIMIT 1`,
        [parsed.data.enrollmentId],
      );
      checkoutSessionId = paymentRows[0]?.stripe_checkout_session_id
        ? String(paymentRows[0].stripe_checkout_session_id)
        : null;
    }
    if (!checkoutSessionId) {
      return res.status(409).json({ error: "No OXXO voucher found for this seat.", code: "oxxo_missing" });
    }

    try {
      const result = await sendOxxoVoucherEmail({
        enrollmentId: parsed.data.enrollmentId,
        checkoutSessionId,
      });
      if (!result.sent && result.reason === "no_voucher_url" && process.env.VITEST !== "true") {
        return res.status(502).json({ error: "Could not load the OXXO voucher from Stripe yet." });
      }
      return res.json({
        ok: true,
        skipped: result.skipped,
        sessionId: checkoutSessionId,
      });
    } catch (error) {
      console.error("oxxo email route", error);
      return res.status(502).json({ error: "Could not send the OXXO voucher email." });
    }
  });

  app.post("/api/portal/checkout/oxxo-voucher", requireUser, async (req, res) => {
    const parsed = z
      .object({
        enrollmentId: z.number().int().positive(),
        sessionId: z.string().trim().min(8).max(255).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose a seat with an OXXO voucher." });
    const user = (req as AuthedRequest).user as UserProfile;

    const [enrollmentRows] = await db().query<RowDataPacket[]>(
      `SELECT e.id, e.status, e.amount_cents, e.currency, c.title
         FROM enrollments e
         JOIN course_editions ed ON ed.id = e.edition_id
         JOIN courses c ON c.id = ed.course_id
        WHERE e.id = ? AND e.user_id = ? LIMIT 1`,
      [parsed.data.enrollmentId, user.id],
    );
    if (!enrollmentRows[0]) return res.status(404).json({ error: "That seat was not found." });
    if (enrollmentRows[0].status === "paid" || enrollmentRows[0].status === "attended") {
      return res.status(409).json({ error: "This seat is already paid.", code: "already_paid" });
    }

    let checkoutSessionId = parsed.data.sessionId || null;
    if (!checkoutSessionId) {
      const [paymentRows] = await db().query<RowDataPacket[]>(
        `SELECT stripe_checkout_session_id FROM payments
          WHERE enrollment_id = ? AND method = 'oxxo' AND status = 'processing'
          ORDER BY id DESC LIMIT 1`,
        [parsed.data.enrollmentId],
      );
      checkoutSessionId = paymentRows[0]?.stripe_checkout_session_id
        ? String(paymentRows[0].stripe_checkout_session_id)
        : null;
    }
    if (!checkoutSessionId) {
      return res.status(409).json({ error: "No OXXO voucher found for this seat.", code: "oxxo_missing" });
    }

    if (process.env.VITEST === "true" || !stripeClient()) {
      return res.json({
        sessionId: checkoutSessionId,
        voucher: {
          url: `https://payments.stripe.com/oxxo/voucher/test_${checkoutSessionId}`,
          reference: "1234 5678 9012 3465 7890 1234 5678 9012",
          expiresAt: Math.floor(Date.now() / 1000) + 3 * 86400,
          amountCents: Number(enrollmentRows[0].amount_cents || 0),
          currency: String(enrollmentRows[0].currency || "MXN"),
          courseTitle: String(enrollmentRows[0].title || ""),
        },
      });
    }

    try {
      const stripe = stripeClient()!;
      const details = await resolveOxxoVoucherDetails(stripe, checkoutSessionId);
      if (!details?.voucherUrl) {
        return res.status(502).json({ error: "Could not load the OXXO voucher from Stripe yet." });
      }
      return res.json({
        sessionId: checkoutSessionId,
        voucher: {
          url: details.voucherUrl,
          reference: details.reference,
          expiresAt: details.expiresAt,
          amountCents: Number(enrollmentRows[0].amount_cents || 0),
          currency: String(enrollmentRows[0].currency || "MXN"),
          courseTitle: String(enrollmentRows[0].title || ""),
        },
      });
    } catch (error) {
      console.error("oxxo voucher route", error);
      return res.status(502).json({ error: "Could not load the OXXO voucher." });
    }
  });

  app.post("/api/portal/checkout/transfer", requireUser, async (req, res) => {
    const parsed = z.object({ enrollmentId: z.number().int().positive() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose a seat to pay by transfer." });
    const user = (req as AuthedRequest).user as UserProfile;
    try {
      await expireStaleTransferPayments(parsed.data.enrollmentId);
      const settings = await loadBankTransferSettings();
      if (!settings || !settings.isEnabled) {
        return res.status(503).json({ error: "Bank transfer is not available right now.", code: "transfer_disabled" });
      }

      const [rows] = await db().query<RowDataPacket[]>(
        `SELECT e.*, u.preferred_language
           FROM enrollments e
           JOIN users u ON u.id = e.user_id
          WHERE e.id = ? AND e.user_id = ? LIMIT 1`,
        [parsed.data.enrollmentId, user.id],
      );
      const enrollment = rows[0];
      if (!enrollment) return res.status(404).json({ error: "That seat was not found." });
      if (enrollment.status === "paid" || enrollment.status === "attended") {
        return res.status(409).json({ error: "This seat is already paid.", code: "already_paid" });
      }
      if (enrollment.status === "cancelled" || enrollment.status === "no_show") {
        return res.status(409).json({ error: "This seat is no longer available.", code: "seat_unavailable" });
      }
      if (Number(enrollment.amount_cents) <= 0) {
        return res.status(409).json({
          error: "This seat is free with your coupon. Confirm it without transfer.",
          code: "coupon_free",
        });
      }

      const language: AppLanguage = enrollment.preferred_language === "en" ? "en" : "es";
      const reference = transferReferenceFor(Number(enrollment.id));

      const [existing] = await db().query<RowDataPacket[]>(
        `SELECT id, transfer_reference, transfer_expires_at, amount_cents, currency
           FROM payments
          WHERE enrollment_id = ? AND method = 'transfer' AND status = 'processing'
          ORDER BY id DESC LIMIT 1`,
        [enrollment.id],
      );
      if (existing[0]) {
        await db().execute(
          "UPDATE enrollments SET payment_method = 'transfer' WHERE id = ? AND status = 'pending'",
          [enrollment.id],
        );
        return res.json(
          transferInstructionsPayload({
            enrollmentId: Number(enrollment.id),
            paymentId: Number(existing[0].id),
            reference: String(existing[0].transfer_reference || reference),
            expiresAt: iso(existing[0].transfer_expires_at),
            amountCents: Number(existing[0].amount_cents || enrollment.amount_cents),
            currency: String(existing[0].currency || enrollment.currency || "MXN"),
            settings,
            language,
          }),
        );
      }

      // Expire open Stripe sessions so the learner is not charged twice.
      const stripe = stripeClient();
      if (stripe && enrollment.stripe_checkout_session_id) {
        try {
          const session = await stripe.checkout.sessions.retrieve(String(enrollment.stripe_checkout_session_id));
          if (session.status === "open") {
            await stripe.checkout.sessions.expire(session.id);
          }
        } catch (error) {
          console.warn("stripe expire before transfer", error);
        }
      }

      // Supersede prior card/OXXO holds — keep their stripe_checkout_session_id on a failed row
      // so a late OXXO cash webhook cannot fulfill after the learner switched to SPEI.
      await db().execute(
        `UPDATE payments
            SET status = 'failed',
                rejected_at = COALESCE(rejected_at, NOW()),
                reject_reason = 'switched_to_transfer',
                updated_at = CURRENT_TIMESTAMP
          WHERE enrollment_id = ?
            AND status IN ('requires_payment', 'processing')
            AND method <> 'transfer'`,
        [enrollment.id],
      );

      const expiresAt = new Date(Date.now() + settings.expiresAfterDays * 86400000);
      const [openTransfer] = await db().query<RowDataPacket[]>(
        `SELECT id FROM payments
          WHERE enrollment_id = ? AND method = 'transfer' AND status = 'processing'
          ORDER BY id DESC LIMIT 1`,
        [enrollment.id],
      );

      let paymentId: number;
      if (openTransfer[0]) {
        paymentId = Number(openTransfer[0].id);
        await db().execute(
          `UPDATE payments
              SET transfer_reference = ?,
                  transfer_expires_at = ?,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          [reference, expiresAt, paymentId],
        );
      } else {
        const [inserted] = await db().execute<ResultSetHeader>(
          `INSERT INTO payments (
             enrollment_id, user_id, edition_id, amount_cents, currency, status, method,
             transfer_reference, transfer_expires_at
           ) VALUES (?, ?, ?, ?, ?, 'processing', 'transfer', ?, ?)`,
          [
            enrollment.id,
            user.id,
            enrollment.edition_id,
            enrollment.amount_cents,
            enrollment.currency,
            reference,
            expiresAt,
          ],
        );
        paymentId = Number(inserted.insertId);
      }

      await db().execute(
        `UPDATE enrollments
            SET payment_method = 'transfer', stripe_checkout_session_id = NULL
          WHERE id = ? AND status = 'pending'`,
        [enrollment.id],
      );

      return res.json(
        transferInstructionsPayload({
          enrollmentId: Number(enrollment.id),
          paymentId,
          reference,
          expiresAt: iso(expiresAt),
          amountCents: Number(enrollment.amount_cents),
          currency: String(enrollment.currency || "MXN"),
          settings,
          language,
        }),
      );
    } catch (error) {
      sendDbError(res, error as { code?: string; message?: string });
    }
  });

  app.post("/api/portal/checkout/coupon", requireUser, async (req, res) => {
    const parsed = z
      .object({
        enrollmentId: z.number().int().positive(),
        code: z.string().trim().min(2).max(40),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a coupon code.", code: "coupon_required" });
    const user = (req as AuthedRequest).user as UserProfile;
    const code = normalizeCouponCode(parsed.data.code);
    if (!/^[A-Z0-9_-]{2,40}$/.test(code)) {
      return res.status(400).json({ error: "That coupon code looks invalid.", code: "coupon_invalid" });
    }
    let conn: PoolConnection | null = null;
    try {
      await expireStaleCouponHolds(parsed.data.enrollmentId);
      const [rows] = await db().query<RowDataPacket[]>(
        `SELECT e.*, ed.course_id, ed.price_cents AS edition_price_cents, c.title
           FROM enrollments e
           JOIN course_editions ed ON ed.id = e.edition_id
           JOIN courses c ON c.id = ed.course_id
          WHERE e.id = ? AND e.user_id = ? LIMIT 1`,
        [parsed.data.enrollmentId, user.id],
      );
      const enrollment = rows[0];
      if (!enrollment) return res.status(404).json({ error: "That seat was not found." });
      if (enrollment.status === "paid" || enrollment.status === "attended") {
        return res.status(409).json({ error: "This seat is already paid.", code: "already_paid" });
      }
      if (enrollment.status === "cancelled" || enrollment.status === "no_show") {
        return res.status(409).json({ error: "This seat is no longer available.", code: "seat_unavailable" });
      }

      // Invalidate open Stripe/SPEI outside the coupon lock (Stripe I/O).
      await invalidateOpenCheckoutForEnrollment(Number(enrollment.id), "coupon_applied");

      conn = await db().getConnection();
      await conn.beginTransaction();
      const coupon = await loadCouponForApply(code, conn, true);
      if (!coupon) {
        await conn.rollback();
        return res.status(404).json({ error: "That coupon was not found.", code: "coupon_not_found" });
      }

      const listAmountCents = Number(
        enrollment.list_amount_cents ?? enrollment.edition_price_cents ?? enrollment.amount_cents,
      );
      const validated = await validateCouponForEnrollment(
        {
          coupon,
          enrollmentId: Number(enrollment.id),
          userId: user.id,
          courseId: Number(enrollment.course_id),
          editionId: Number(enrollment.edition_id),
          listAmountCents,
        },
        conn,
      );
      if ("status" in validated) {
        await conn.rollback();
        return res.status(validated.status).json({ error: validated.error, code: validated.code });
      }

      await conn.execute(
        `UPDATE enrollments
            SET coupon_id = ?,
                list_amount_cents = ?,
                discount_cents = ?,
                amount_cents = ?,
                payment_method = NULL,
                stripe_checkout_session_id = NULL,
                stripe_payment_intent_id = NULL
          WHERE id = ? AND status IN ('pending', 'waitlist')`,
        [
          coupon.id,
          listAmountCents,
          validated.discountCents,
          validated.finalAmountCents,
          enrollment.id,
        ],
      );

      const [existingRedemption] = await conn.query<RowDataPacket[]>(
        "SELECT id, status FROM coupon_redemptions WHERE enrollment_id = ? LIMIT 1 FOR UPDATE",
        [enrollment.id],
      );
      if (existingRedemption[0]) {
        if (existingRedemption[0].status === "consumed") {
          await conn.rollback();
          return res.status(409).json({ error: "This seat already used a coupon.", code: "coupon_consumed" });
        }
        await conn.execute(
          `UPDATE coupon_redemptions
              SET coupon_id = ?, user_id = ?, list_amount_cents = ?, discount_cents = ?,
                  final_amount_cents = ?, status = 'applied', updated_at = CURRENT_TIMESTAMP,
                  created_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          [
            coupon.id,
            user.id,
            listAmountCents,
            validated.discountCents,
            validated.finalAmountCents,
            existingRedemption[0].id,
          ],
        );
      } else {
        await conn.execute(
          `INSERT INTO coupon_redemptions (
             coupon_id, enrollment_id, user_id, list_amount_cents, discount_cents, final_amount_cents, status
           ) VALUES (?, ?, ?, ?, ?, ?, 'applied')`,
          [
            coupon.id,
            enrollment.id,
            user.id,
            listAmountCents,
            validated.discountCents,
            validated.finalAmountCents,
          ],
        );
      }

      await conn.commit();
      return res.json({
        enrollmentId: Number(enrollment.id),
        amountCents: validated.finalAmountCents,
        listAmountCents,
        discountCents: validated.discountCents,
        currency: String(enrollment.currency || "MXN"),
        free: validated.finalAmountCents <= 0,
        coupon: {
          id: Number(coupon.id),
          code: String(coupon.code),
          name: String(coupon.name),
          discountType: coupon.discount_type === "fixed" ? "fixed" : "percent",
          percentOff: coupon.percent_off == null ? null : Number(coupon.percent_off),
          amountOffCents: coupon.amount_off_cents == null ? null : Number(coupon.amount_off_cents),
          listAmountCents,
          discountCents: validated.discountCents,
          finalAmountCents: validated.finalAmountCents,
        },
      });
    } catch (error) {
      if (conn) {
        try {
          await conn.rollback();
        } catch {
          /* ignore */
        }
      }
      sendDbError(res, error as { code?: string; message?: string });
    } finally {
      conn?.release();
    }
  });

  app.delete("/api/portal/checkout/coupon", requireUser, async (req, res) => {
    const parsed = z.object({ enrollmentId: z.number().int().positive() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose a seat." });
    const user = (req as AuthedRequest).user as UserProfile;
    try {
      const [rows] = await db().query<RowDataPacket[]>(
        `SELECT e.*, ed.price_cents AS edition_price_cents
           FROM enrollments e
           JOIN course_editions ed ON ed.id = e.edition_id
          WHERE e.id = ? AND e.user_id = ? LIMIT 1`,
        [parsed.data.enrollmentId, user.id],
      );
      const enrollment = rows[0];
      if (!enrollment) return res.status(404).json({ error: "That seat was not found." });
      if (enrollment.status === "paid" || enrollment.status === "attended") {
        return res.status(409).json({ error: "This seat is already paid.", code: "already_paid" });
      }
      if (!enrollment.coupon_id) {
        return res.json({
          enrollmentId: Number(enrollment.id),
          amountCents: Number(enrollment.amount_cents),
          removed: false,
        });
      }

      const restoreCents = Number(
        enrollment.list_amount_cents ?? enrollment.edition_price_cents ?? enrollment.amount_cents,
      );
      await invalidateOpenCheckoutForEnrollment(Number(enrollment.id), "coupon_removed");
      await releaseCouponRedemption(Number(enrollment.id));
      await db().execute(
        `UPDATE enrollments
            SET coupon_id = NULL,
                list_amount_cents = NULL,
                discount_cents = 0,
                amount_cents = ?,
                payment_method = NULL,
                stripe_checkout_session_id = NULL,
                stripe_payment_intent_id = NULL
          WHERE id = ? AND status IN ('pending', 'waitlist')`,
        [restoreCents, enrollment.id],
      );
      return res.json({
        enrollmentId: Number(enrollment.id),
        amountCents: restoreCents,
        listAmountCents: null,
        discountCents: 0,
        coupon: null,
        removed: true,
      });
    } catch (error) {
      sendDbError(res, error as { code?: string; message?: string });
    }
  });

  app.post("/api/portal/checkout/confirm-free", requireUser, async (req, res) => {
    const parsed = z.object({ enrollmentId: z.number().int().positive() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose a seat." });
    const user = (req as AuthedRequest).user as UserProfile;
    try {
      await expireStaleCouponHolds(parsed.data.enrollmentId);
      const [rows] = await db().query<RowDataPacket[]>(
        `SELECT e.*, ed.course_id, ed.price_cents AS edition_price_cents
           FROM enrollments e
           JOIN course_editions ed ON ed.id = e.edition_id
          WHERE e.id = ? AND e.user_id = ? LIMIT 1`,
        [parsed.data.enrollmentId, user.id],
      );
      const enrollment = rows[0];
      if (!enrollment) return res.status(404).json({ error: "That seat was not found." });
      if (enrollment.status === "paid" || enrollment.status === "attended") {
        return res.status(409).json({ error: "This seat is already paid.", code: "already_paid" });
      }
      if (enrollment.status === "cancelled" || enrollment.status === "no_show") {
        return res.status(409).json({ error: "This seat is no longer available.", code: "seat_unavailable" });
      }
      if (!enrollment.coupon_id || Number(enrollment.amount_cents) > 0) {
        return res.status(409).json({
          error: "This seat still has a balance to pay.",
          code: "not_free",
        });
      }

      const [couponRows] = await db().query<RowDataPacket[]>(
        "SELECT * FROM coupons WHERE id = ? LIMIT 1",
        [enrollment.coupon_id],
      );
      const coupon = couponRows[0];
      if (!coupon) {
        return res.status(409).json({ error: "That coupon is no longer available.", code: "coupon_inactive" });
      }
      const listAmountCents = Number(
        enrollment.list_amount_cents ?? enrollment.edition_price_cents ?? enrollment.amount_cents,
      );
      const validated = await validateCouponForEnrollment({
        coupon,
        enrollmentId: Number(enrollment.id),
        userId: user.id,
        courseId: Number(enrollment.course_id),
        editionId: Number(enrollment.edition_id),
        listAmountCents,
      });
      if ("status" in validated) {
        return res.status(validated.status).json({ error: validated.error, code: validated.code });
      }
      if (validated.finalAmountCents > 0) {
        return res.status(409).json({
          error: "This seat still has a balance to pay.",
          code: "not_free",
        });
      }

      const paid = await markEnrollmentPaid({
        enrollmentId: Number(enrollment.id),
        checkoutSessionId: `coupon_free_${enrollment.id}`,
        paymentIntentId: null,
        brand: null,
        last4: null,
        method: "coupon",
      });
      if (paid.newlyPaid) {
        try {
          await sendSeatConfirmationEmail({
            enrollmentId: Number(enrollment.id),
            method: "coupon",
            brand: null,
            last4: null,
          });
        } catch (error) {
          console.error("coupon free confirmation email", error);
        }
      }
      return res.json({ enrollmentId: Number(enrollment.id), status: "paid", newlyPaid: paid.newlyPaid });
    } catch (error) {
      sendDbError(res, error as { code?: string; message?: string });
    }
  });

  if (process.env.VITEST === "true") {
    app.post("/api/portal/checkout/simulate", requireUser, async (req, res) => {
      const parsed = z
        .object({
          enrollmentId: z.number().int().positive(),
          brand: z.string().max(40).optional(),
          last4: z.string().regex(/^\d{4}$/).optional(),
          pendingOxxo: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid test payment." });
      const user = (req as AuthedRequest).user as UserProfile;
      const [rows] = await db().query<RowDataPacket[]>(
        "SELECT id, edition_id, amount_cents, currency FROM enrollments WHERE id = ? AND user_id = ? LIMIT 1",
        [parsed.data.enrollmentId, user.id],
      );
      if (!rows[0]) return res.status(404).json({ error: "That seat was not found." });

      if (parsed.data.pendingOxxo) {
        const sessionId = `cs_test_oxxo_${parsed.data.enrollmentId}_${Date.now()}`;
        const [existingPayments] = await db().query<RowDataPacket[]>(
          `SELECT id FROM payments
            WHERE enrollment_id = ? AND status IN ('requires_payment', 'processing')
            ORDER BY id DESC LIMIT 1`,
          [parsed.data.enrollmentId],
        );
        if (existingPayments[0]) {
          await db().execute(
            `UPDATE payments
                SET stripe_checkout_session_id = ?, status = 'processing', method = 'oxxo', updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
            [sessionId, existingPayments[0].id],
          );
        } else {
          await db().execute(
            `INSERT INTO payments (
               enrollment_id, user_id, edition_id, amount_cents, currency, status, method, stripe_checkout_session_id
             ) VALUES (?, ?, ?, ?, ?, 'processing', 'oxxo', ?)`,
            [
              parsed.data.enrollmentId,
              user.id,
              rows[0].edition_id,
              rows[0].amount_cents,
              rows[0].currency,
              sessionId,
            ],
          );
        }
        await markEnrollmentPendingOxxo({
          enrollmentId: parsed.data.enrollmentId,
          checkoutSessionId: sessionId,
        });
        return res.json({ ok: true, status: "pending_oxxo", sessionId });
      }

      await markEnrollmentPaid({
        enrollmentId: parsed.data.enrollmentId,
        checkoutSessionId: `vitest_${parsed.data.enrollmentId}_${Date.now()}`,
        paymentIntentId: null,
        brand: parsed.data.brand || "visa",
        last4: parsed.data.last4 || "4242",
        method: "card",
      });
      res.json({ ok: true });
    });
  }

  app.post("/api/portal/feedback", requireUser, async (req, res) => {
    const parsed = z
      .object({
        enrollmentId: z.number().int().positive(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().trim().max(800).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Add a rating from 1 to 5." });
    const user = (req as AuthedRequest).user as UserProfile;
    const [rows] = await db().query<RowDataPacket[]>(
      "SELECT id, status FROM enrollments WHERE id = ? AND user_id = ? LIMIT 1",
      [parsed.data.enrollmentId, user.id],
    );
    if (!rows[0] || !["paid", "attended"].includes(rows[0].status)) {
      return res.status(404).json({ error: "Feedback opens after the seat is confirmed." });
    }
    try {
      await db().execute(
        `INSERT INTO feedback (enrollment_id, rating, comment) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment)`,
        [parsed.data.enrollmentId, parsed.data.rating, parsed.data.comment || null],
      );
      res.status(201).json({ ok: true });
    } catch (error) {
      sendDbError(res, error as { code?: string });
    }
  });

  app.get("/api/admin/company/requests", requireAdmin, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!isCompanyRole(admin) || !admin.companyId) {
      return res.status(403).json({ error: "Company access required." });
    }
    const [rows] = await db().query<RowDataPacket[]>(
      "SELECT * FROM company_requests WHERE company_id = ? ORDER BY created_at DESC",
      [admin.companyId],
    );
    res.json({
      requests: rows.map((row) => ({
        id: Number(row.id),
        title: row.title,
        headcount: Number(row.headcount),
        notes: row.notes,
        status: row.status,
        created_at: iso(row.created_at),
      })),
    });
  });

  app.post("/api/admin/company/requests", requireAdmin, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!isCompanyRole(admin) || !admin.companyId) {
      return res.status(403).json({ error: "Company access required." });
    }
    const parsed = z
      .object({
        title: z.string().trim().min(3).max(200),
        headcount: z.number().int().min(4).max(80),
        notes: z.string().trim().max(2000).optional(),
        courseId: z.number().int().positive().nullable().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Describe the private session." });
    const [result] = await db().execute<ResultSetHeader>(
      `INSERT INTO company_requests (company_id, course_id, title, headcount, notes) VALUES (?, ?, ?, ?, ?)`,
      [admin.companyId, parsed.data.courseId || null, parsed.data.title, parsed.data.headcount, parsed.data.notes || null],
    );
    res.status(201).json({ id: result.insertId });
  });

  app.get("/api/admin/dashboard", requireOpsStaff, async (_req, res) => {
    const [rows] = await db().query<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM courses WHERE status = 'published') AS published_courses,
         (SELECT COUNT(*) FROM course_editions WHERE status IN ('presale','confirmed') AND starts_at >= NOW()) AS upcoming_editions,
         (SELECT COUNT(*) FROM enrollments WHERE status IN ('paid','attended')) AS paid_seats,
         (SELECT COALESCE(SUM(amount_cents), 0) FROM payments WHERE status = 'succeeded') AS revenue_cents,
         (SELECT COUNT(*) FROM company_requests WHERE status IN ('new','quoted')) AS open_requests`,
    );
    const [upcoming] = await db().query<RowDataPacket[]>(
      `${EDITION_SELECT.replace("SELECT e.*", "SELECT e.*, c.title AS course_title")}
         JOIN courses c ON c.id = e.course_id
        WHERE e.starts_at >= NOW() AND e.status <> 'cancelled'
        ORDER BY e.starts_at ASC LIMIT 6`,
    );
    res.json({
      stats: {
        publishedCourses: Number(rows[0].published_courses),
        upcomingEditions: Number(rows[0].upcoming_editions),
        paidSeats: Number(rows[0].paid_seats),
        revenueCents: Number(rows[0].revenue_cents),
        openRequests: Number(rows[0].open_requests),
      },
      upcoming: upcoming.map((row) => ({ ...editionFromRow(row), courseTitle: row.course_title })),
    });
  });

  app.get("/api/admin/catalog/:kind", requireOpsStaff, async (req, res) => {
    const kind = parseCatalogKind(String(req.params.kind || ""));
    if (!kind) return res.status(400).json({ error: "Unknown catalog kind." });
    const includeInactive = String(req.query.includeInactive || "") === "1" || String(req.query.includeInactive || "") === "true";
    const meta = CATALOG_KIND_META[kind];
    const activeSql = includeInactive ? "" : kind === "venues" ? "WHERE v.is_active = 1" : "WHERE is_active = 1";
    const [rows] =
      kind === "venues"
        ? await db().query<RowDataPacket[]>(
            `SELECT v.*, city.label AS city_label
               FROM course_venues v
               JOIN course_cities city ON city.id = v.city_id
               ${activeSql}
               ORDER BY v.sort_order ASC, v.label ASC`,
          )
        : await db().query<RowDataPacket[]>(
            `SELECT * FROM ${meta.table}
              ${activeSql}
              ORDER BY sort_order ASC, label ASC`,
          );
    res.json({ options: rows.map((row) => catalogOptionFromRow(kind, row)) });
  });

  app.post("/api/admin/catalog/:kind", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canWriteOperations(admin)) return res.status(403).json({ error: "Only owners and coordinators can manage catalog options." });
    const kind = parseCatalogKind(String(req.params.kind || ""));
    if (!kind) return res.status(400).json({ error: "Unknown catalog kind." });
    const parsed = z
      .object({
        label: z.string().trim().min(2).max(160),
        slug: z
          .string()
          .trim()
          .regex(/^[a-z0-9-]*$/)
          .max(80)
          .optional(),
        sortOrder: z.number().int().min(0).max(10_000).optional(),
        address: z.string().trim().max(255).optional(),
        cityId: z.number().int().positive().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the option fields." });
    const slug = (parsed.data.slug && parsed.data.slug.length > 0
      ? slugifyTitle(parsed.data.slug)
      : slugifyTitle(parsed.data.label)
    ).slice(0, 80);
    if (!slug) return res.status(400).json({ error: "Provide a label that can become a slug." });
    const meta = CATALOG_KIND_META[kind];
    try {
      if (kind === "venues") {
        if (!parsed.data.cityId) return res.status(400).json({ error: "Pick a city for the venue." });
        if (!(await assertActiveCatalogId("cities", parsed.data.cityId))) {
          return res.status(400).json({ error: "That city is inactive or missing." });
        }
        const [result] = await db().execute<ResultSetHeader>(
          `INSERT INTO course_venues (slug, label, address, city_id, is_active, sort_order) VALUES (?, ?, ?, ?, 1, ?)`,
          [
            slug,
            parsed.data.label,
            parsed.data.address || "",
            parsed.data.cityId,
            parsed.data.sortOrder ?? 100,
          ],
        );
        const [rows] = await db().query<RowDataPacket[]>(
          `SELECT v.*, city.label AS city_label
             FROM course_venues v
             JOIN course_cities city ON city.id = v.city_id
            WHERE v.id = ? LIMIT 1`,
          [result.insertId],
        );
        return res.status(201).json({ option: catalogOptionFromRow(kind, rows[0]) });
      }

      const [result] = await db().execute<ResultSetHeader>(
        `INSERT INTO ${meta.table} (slug, label, is_active, sort_order) VALUES (?, ?, 1, ?)`,
        [slug, parsed.data.label, parsed.data.sortOrder ?? 100],
      );
      const [rows] = await db().query<RowDataPacket[]>(`SELECT * FROM ${meta.table} WHERE id = ? LIMIT 1`, [
        result.insertId,
      ]);
      res.status(201).json({ option: catalogOptionFromRow(kind, rows[0]) });
    } catch (error) {
      sendDbError(res, error as { code?: string });
    }
  });

  app.patch("/api/admin/catalog/:kind/:id", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canWriteOperations(admin)) return res.status(403).json({ error: "Only owners and coordinators can manage catalog options." });
    const kind = parseCatalogKind(String(req.params.kind || ""));
    if (!kind) return res.status(400).json({ error: "Unknown catalog kind." });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid option id." });
    const parsed = z
      .object({
        label: z.string().trim().min(2).max(160).optional(),
        slug: z
          .string()
          .trim()
          .regex(/^[a-z0-9-]+$/)
          .max(80)
          .optional(),
        sortOrder: z.number().int().min(0).max(10_000).optional(),
        isActive: z.boolean().optional(),
        address: z.string().trim().max(255).optional(),
        cityId: z.number().int().positive().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the option fields." });
    const meta = CATALOG_KIND_META[kind];
    const sets: string[] = [];
    const values: unknown[] = [];
    if (parsed.data.label !== undefined) {
      sets.push("label = ?");
      values.push(parsed.data.label);
    }
    if (parsed.data.slug !== undefined) {
      sets.push("slug = ?");
      values.push(slugifyTitle(parsed.data.slug).slice(0, 80));
    }
    if (parsed.data.sortOrder !== undefined) {
      sets.push("sort_order = ?");
      values.push(parsed.data.sortOrder);
    }
    if (parsed.data.isActive !== undefined) {
      sets.push("is_active = ?");
      values.push(parsed.data.isActive ? 1 : 0);
    }
    if (kind === "venues") {
      if (parsed.data.address !== undefined) {
        sets.push("address = ?");
        values.push(parsed.data.address);
      }
      if (parsed.data.cityId !== undefined) {
        if (!(await assertActiveCatalogId("cities", parsed.data.cityId))) {
          return res.status(400).json({ error: "That city is inactive or missing." });
        }
        sets.push("city_id = ?");
        values.push(parsed.data.cityId);
      }
    }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update." });
    values.push(id);
    try {
      const [result] = await db().execute<ResultSetHeader>(
        `UPDATE ${meta.table} SET ${sets.join(", ")} WHERE id = ?`,
        values as (string | number)[],
      );
      if (!result.affectedRows) return res.status(404).json({ error: "Option not found." });
      const [rows] =
        kind === "venues"
          ? await db().query<RowDataPacket[]>(
              `SELECT v.*, city.label AS city_label
                 FROM course_venues v
                 JOIN course_cities city ON city.id = v.city_id
                WHERE v.id = ? LIMIT 1`,
              [id],
            )
          : await db().query<RowDataPacket[]>(`SELECT * FROM ${meta.table} WHERE id = ? LIMIT 1`, [id]);
      res.json({ option: catalogOptionFromRow(kind, rows[0]) });
    } catch (error) {
      sendDbError(res, error as { code?: string });
    }
  });

  app.get("/api/admin/courses", requireOpsStaff, async (req, res) => {
    const q = parseListQuery(req, { limit: 20 });
    const sortMap: Record<string, string> = {
      title: "c.title",
      status: "c.status",
      priceCents: "c.price_cents",
      category: "cat.slug",
      updatedAt: "c.updated_at",
      createdAt: "c.created_at",
    };
    const orderCol = sortMap[q.sortBy] || "c.updated_at";
    const params: unknown[] = [];
    let where = "WHERE 1=1";
    if (q.search) {
      where += " AND (c.title LIKE ? OR c.slug LIKE ? OR c.promise LIKE ? OR city.label LIKE ?)";
      const like = `%${q.search}%`;
      params.push(like, like, like, like);
    }
    const [countRows] = await db().query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
         FROM courses c
         JOIN course_cities city ON city.id = c.city_id
         ${where}`,
      params,
    );
    const total = Number(countRows[0]?.total || 0);
    const [rows] = await db().query<RowDataPacket[]>(
      `${COURSE_SELECT} ${where} ORDER BY ${orderCol} ${q.sortDir}, c.id DESC LIMIT ? OFFSET ?`,
      [...params, q.limit, q.offset],
    );
    res.json({
      courses: rows.map(courseFromRow),
      pagination: paginationOf(q.page, q.limit, total),
    });
  });

  app.get("/api/admin/courses/slug-availability", requireOpsStaff, async (req, res) => {
    const fromSlug = String(req.query.slug || "").trim();
    const fromTitle = String(req.query.title || "").trim();
    const requested = slugifyTitle(fromSlug || fromTitle);
    if (!requested) {
      return res.status(400).json({ error: "Provide a title or slug to check." });
    }
    try {
      const available = !(await courseSlugExists(requested));
      const suggested = available ? requested : await allocateUniqueCourseSlug(requested);
      res.json({ requested, available, suggested });
    } catch (error) {
      sendDbError(res, error as { code?: string });
    }
  });

  app.post("/api/admin/courses", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canWriteOperations(admin)) return res.status(403).json({ error: "Only owners and coordinators can edit courses." });
    const parsed = z
      .object({
        title: z.string().trim().min(3).max(200),
        slug: z
          .string()
          .trim()
          .regex(/^[a-z0-9-]*$/)
          .max(160)
          .optional(),
        categoryId: z.number().int().positive(),
        audienceId: z.number().int().positive(),
        levelId: z.number().int().positive(),
        cityId: z.number().int().positive(),
        summary: z.string().trim().min(8),
        promise: z.string().trim().min(4).max(320),
        descriptionHtml: z.string().trim().max(200_000).optional().nullable(),
        durationHours: z.number().positive().max(40),
        capacity: z.number().int().min(1).max(80),
        priceCents: z.number().int().min(0),
        minEnrollment: z.number().int().min(1),
        status: z.enum(["draft", "published", "archived"]).optional(),
        runOfShow: z.string().trim().max(20_000).optional().nullable(),
        materials: z.string().trim().max(20_000).optional().nullable(),
        safetyNotes: z.string().trim().max(20_000).optional().nullable(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the course fields." });
    const data = parsed.data;
    const preferred =
      (data.slug && data.slug.length > 0 ? slugifyTitle(data.slug) : slugifyTitle(data.title)) || `curso-${Date.now()}`;

    try {
      const [catOk, audOk, lvlOk, cityOk] = await Promise.all([
        assertActiveCatalogId("categories", data.categoryId),
        assertActiveCatalogId("audiences", data.audienceId),
        assertActiveCatalogId("levels", data.levelId),
        assertActiveCatalogId("cities", data.cityId),
      ]);
      if (!catOk || !audOk || !lvlOk || !cityOk) {
        return res.status(400).json({ error: "Pick an active category, level, audience, and city." });
      }

      if (data.slug && data.slug.length > 0 && (await courseSlugExists(preferred))) {
        const suggested = await allocateUniqueCourseSlug(preferred);
        return res.status(409).json({
          error: "That slug is already in use.",
          suggested,
        });
      }

      const slug = await allocateUniqueCourseSlug(preferred);
      const [result] = await db().execute<ResultSetHeader>(
        `INSERT INTO courses (
           slug, title, category_id, audience_id, level_id, summary, description_html, promise, duration_hours,
           capacity, price_cents, min_enrollment, city_id, status, run_of_show, materials, safety_notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          slug,
          data.title,
          data.categoryId,
          data.audienceId,
          data.levelId,
          data.summary,
          data.descriptionHtml || null,
          data.promise,
          data.durationHours,
          data.capacity,
          data.priceCents,
          data.minEnrollment,
          data.cityId,
          data.status || "draft",
          data.runOfShow || null,
          data.materials || null,
          data.safetyNotes || null,
        ],
      );
      res.status(201).json({ id: result.insertId, slug, slugAdjusted: slug !== preferred });
    } catch (error) {
      const err = error as { code?: string };
      if (err?.code === "ER_DUP_ENTRY") {
        try {
          const suggested = await allocateUniqueCourseSlug(preferred);
          return res.status(409).json({ error: "That slug is already in use.", suggested });
        } catch (retryError) {
          return sendDbError(res, retryError as { code?: string });
        }
      }
      sendDbError(res, err);
    }
  });

  app.get("/api/admin/courses/:id", requireOpsStaff, async (req, res) => {
    const [rows] = await db().query<RowDataPacket[]>(`${COURSE_SELECT} WHERE c.id = ? LIMIT 1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Course not found." });
    const course = courseFromRow(rows[0]);
    course.gallery = await galleryForCourse(course.id);
    const editions = await editionsForCourse(course.id, false);
    const editionId = Number(req.query.editionId) || editions[0]?.id;
    let participants: RowDataPacket[] = [];
    if (editionId) {
      const [people] = await db().query<RowDataPacket[]>(
        `SELECT e.id, e.status, e.amount_cents, e.currency, e.payment_method, e.card_brand, e.card_last4, e.paid_at,
                u.first_name, u.last_name, u.email, u.phone, u.audience
           FROM enrollments e
           JOIN users u ON u.id = e.user_id
          WHERE e.edition_id = ?
          ORDER BY e.created_at DESC`,
        [editionId],
      );
      participants = people;
    }
    const [feedback] = await db().query<RowDataPacket[]>(
      `SELECT ROUND(AVG(f.rating), 1) AS average_rating, COUNT(f.id) AS reviews
         FROM feedback f
         JOIN enrollments e ON e.id = f.enrollment_id
         JOIN course_editions ed ON ed.id = e.edition_id
        WHERE ed.course_id = ?`,
      [course.id],
    );
    res.json({
      course,
      editions,
      editionId,
      participants: participants.map((row) => ({
        id: Number(row.id),
        status: row.status,
        amountCents: Number(row.amount_cents),
        currency: row.currency,
        paymentMethod: row.payment_method,
        cardBrand: row.card_brand,
        cardLast4: row.card_last4,
        paidAt: row.paid_at ? iso(row.paid_at) : null,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
        audience: row.audience,
      })),
      feedback: {
        averageRating: feedback[0]?.average_rating == null ? null : Number(feedback[0].average_rating),
        reviews: Number(feedback[0]?.reviews || 0),
      },
    });
  });

  app.patch("/api/admin/courses/:id", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canWriteOperations(admin)) return res.status(403).json({ error: "Only owners and coordinators can edit courses." });
    const parsed = z
      .object({
        title: z.string().trim().min(3).max(200).optional(),
        summary: z.string().trim().min(8).optional(),
        descriptionHtml: z.string().max(50000).nullable().optional(),
        promise: z.string().trim().min(4).max(320).optional(),
        status: z.enum(["draft", "published", "archived"]).optional(),
        priceCents: z.number().int().min(0).optional(),
        capacity: z.number().int().min(1).max(80).optional(),
        minEnrollment: z.number().int().min(1).optional(),
        runOfShow: z.string().max(8000).nullable().optional(),
        materials: z.string().max(4000).nullable().optional(),
        safetyNotes: z.string().max(4000).nullable().optional(),
        coverImageUrl: z.string().url().max(500).nullable().optional(),
        categoryId: z.number().int().positive().optional(),
        audienceId: z.number().int().positive().optional(),
        levelId: z.number().int().positive().optional(),
        cityId: z.number().int().positive().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the course fields." });
    const data = parsed.data;
    if (data.categoryId && !(await assertActiveCatalogId("categories", data.categoryId))) {
      return res.status(400).json({ error: "That category is inactive or missing." });
    }
    if (data.audienceId && !(await assertActiveCatalogId("audiences", data.audienceId))) {
      return res.status(400).json({ error: "That audience is inactive or missing." });
    }
    if (data.levelId && !(await assertActiveCatalogId("levels", data.levelId))) {
      return res.status(400).json({ error: "That level is inactive or missing." });
    }
    if (data.cityId && !(await assertActiveCatalogId("cities", data.cityId))) {
      return res.status(400).json({ error: "That city is inactive or missing." });
    }
    const map: Record<string, string> = {
      title: "title",
      summary: "summary",
      descriptionHtml: "description_html",
      promise: "promise",
      status: "status",
      priceCents: "price_cents",
      capacity: "capacity",
      minEnrollment: "min_enrollment",
      runOfShow: "run_of_show",
      materials: "materials",
      safetyNotes: "safety_notes",
      coverImageUrl: "cover_image_url",
      categoryId: "category_id",
      audienceId: "audience_id",
      levelId: "level_id",
      cityId: "city_id",
    };
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of Object.entries(map)) {
      if (data[key as keyof typeof data] !== undefined) {
        sets.push(`${column} = ?`);
        let value = data[key as keyof typeof data];
        if (key === "descriptionHtml" && typeof value === "string") {
          value = sanitizeCourseHtml(value) || null;
        }
        values.push(value);
      }
    }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update." });
    values.push(req.params.id);
    await db().query(`UPDATE courses SET ${sets.join(", ")} WHERE id = ?`, values);
    res.json({ ok: true });
  });

  app.post("/api/admin/courses/:id/cover-image", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canWriteOperations(admin)) return res.status(403).json({ error: "Only owners and coordinators can update course images." });
    const parsed = z
      .object({
        dataBase64: z.string().min(32),
        filename: z.string().trim().min(3).max(180),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose a JPEG, PNG, or WebP image." });
    const [rows] = await db().query<RowDataPacket[]>("SELECT id, slug FROM courses WHERE id = ? LIMIT 1", [
      req.params.id,
    ]);
    if (!rows[0]) return res.status(404).json({ error: "Course not found." });
    try {
      const buffer = Buffer.from(parsed.data.dataBase64, "base64");
      if (buffer.byteLength > 4.5 * 1024 * 1024) {
        return res.status(400).json({ error: "Keep the image under 4.5 MB." });
      }
      const url = await uploadCourseImageToCdn({
        buffer,
        filename: parsed.data.filename,
        mimeType: parsed.data.mimeType,
        uploadId: String(rows[0].slug),
      });
      await db().execute("UPDATE courses SET cover_image_url = ? WHERE id = ?", [url, rows[0].id]);
      res.json({ url });
    } catch (error) {
      console.error("cdn cover upload", error);
      res.status(502).json({ error: "Could not upload that image to the CDN." });
    }
  });

  app.post("/api/admin/courses/:id/gallery", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canWriteOperations(admin)) return res.status(403).json({ error: "Only owners and coordinators can update course images." });
    const parsed = z
      .object({
        dataBase64: z.string().min(32),
        filename: z.string().trim().min(3).max(180),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        caption: z.string().trim().max(200).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose a JPEG, PNG, or WebP image." });
    const [rows] = await db().query<RowDataPacket[]>("SELECT id, slug FROM courses WHERE id = ? LIMIT 1", [
      req.params.id,
    ]);
    if (!rows[0]) return res.status(404).json({ error: "Course not found." });
    const [countRows] = await db().query<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM course_gallery_images WHERE course_id = ?",
      [rows[0].id],
    );
    if (Number(countRows[0]?.total || 0) >= 12) {
      return res.status(400).json({ error: "A course can have up to 12 gallery images." });
    }
    try {
      const buffer = Buffer.from(parsed.data.dataBase64, "base64");
      if (buffer.byteLength > 4.5 * 1024 * 1024) {
        return res.status(400).json({ error: "Keep the image under 4.5 MB." });
      }
      const url = await uploadCourseImageToCdn({
        buffer,
        filename: parsed.data.filename,
        mimeType: parsed.data.mimeType,
        uploadId: `${rows[0].slug}-gallery`,
      });
      const [orderRows] = await db().query<RowDataPacket[]>(
        "SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM course_gallery_images WHERE course_id = ?",
        [rows[0].id],
      );
      const sortOrder = Number(orderRows[0]?.max_order ?? -1) + 1;
      const [result] = await db().execute<ResultSetHeader>(
        "INSERT INTO course_gallery_images (course_id, image_url, caption, sort_order) VALUES (?, ?, ?, ?)",
        [rows[0].id, url, parsed.data.caption || null, sortOrder],
      );
      res.json({
        image: {
          id: Number(result.insertId),
          courseId: Number(rows[0].id),
          imageUrl: url,
          caption: parsed.data.caption || null,
          sortOrder,
        } satisfies CourseGalleryImage,
      });
    } catch (error) {
      console.error("cdn gallery upload", error);
      res.status(502).json({ error: "Could not upload that image to the CDN." });
    }
  });

  app.patch("/api/admin/courses/:id/gallery/:imageId", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canWriteOperations(admin)) return res.status(403).json({ error: "Only owners and coordinators can update course images." });
    const parsed = z.object({ caption: z.string().trim().max(200).nullable() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the caption." });
    const [result] = await db().execute<ResultSetHeader>(
      "UPDATE course_gallery_images SET caption = ? WHERE id = ? AND course_id = ?",
      [parsed.data.caption, req.params.imageId, req.params.id],
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Gallery image not found." });
    res.json({ ok: true });
  });

  app.delete("/api/admin/courses/:id/gallery/:imageId", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canWriteOperations(admin)) return res.status(403).json({ error: "Only owners and coordinators can update course images." });
    const [result] = await db().execute<ResultSetHeader>(
      "DELETE FROM course_gallery_images WHERE id = ? AND course_id = ?",
      [req.params.imageId, req.params.id],
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Gallery image not found." });
    res.json({ ok: true });
  });

  app.post("/api/admin/courses/:id/editions", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canWriteOperations(admin)) return res.status(403).json({ error: "Only owners and coordinators can schedule editions." });
    const parsed = z
      .object({
        startsAt: z.string().min(8),
        endsAt: z.string().min(8),
        venueId: z.number().int().positive(),
        capacity: z.number().int().min(1),
        priceCents: z.number().int().min(0),
        minEnrollment: z.number().int().min(1),
        instructorAdminId: z.number().int().positive().nullable().optional(),
        notes: z.string().max(4000).optional(),
        status: z.enum(["draft", "presale", "confirmed", "completed", "cancelled"]).default("presale"),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the edition fields." });
    const data = parsed.data;
    const venue = await loadVenue(data.venueId);
    if (!venue || !(await assertActiveCatalogId("venues", data.venueId))) {
      return res.status(400).json({ error: "Pick an active venue." });
    }
    if (!(await assertAssignableInstructor(data.instructorAdminId))) {
      return res.status(400).json({ error: "Pick an active instructor.", code: "instructor_invalid" });
    }
    const [result] = await db().execute<ResultSetHeader>(
      `INSERT INTO course_editions (
         course_id, instructor_admin_id, venue_id, starts_at, ends_at, venue_name, venue_address, city,
         status, capacity, price_cents, min_enrollment, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        data.instructorAdminId || null,
        venue.id,
        data.startsAt,
        data.endsAt,
        venue.label,
        venue.address,
        venue.cityLabel,
        data.status as EditionStatus,
        data.capacity,
        data.priceCents,
        data.minEnrollment,
        data.notes || null,
      ],
    );
    res.status(201).json({ id: result.insertId });
  });

  app.patch("/api/admin/editions/:id", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canWriteOperations(admin)) return res.status(403).json({ error: "Only owners and coordinators can edit editions." });
    const parsed = z
      .object({
        status: z.enum(["draft", "presale", "confirmed", "completed", "cancelled"]).optional(),
        venueId: z.number().int().positive().optional(),
        capacity: z.number().int().min(1).optional(),
        priceCents: z.number().int().min(0).optional(),
        minEnrollment: z.number().int().min(1).optional(),
        instructorAdminId: z.number().int().positive().nullable().optional(),
        notes: z.string().max(4000).nullable().optional(),
        startsAt: z.string().optional(),
        endsAt: z.string().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the edition fields." });
    if (
      parsed.data.instructorAdminId !== undefined &&
      !(await assertAssignableInstructor(parsed.data.instructorAdminId))
    ) {
      return res.status(400).json({ error: "Pick an active instructor.", code: "instructor_invalid" });
    }
    const map: Record<string, string> = {
      status: "status",
      capacity: "capacity",
      priceCents: "price_cents",
      minEnrollment: "min_enrollment",
      instructorAdminId: "instructor_admin_id",
      notes: "notes",
      startsAt: "starts_at",
      endsAt: "ends_at",
    };
    const sets: string[] = [];
    const values: unknown[] = [];
    if (parsed.data.venueId !== undefined) {
      const venue = await loadVenue(parsed.data.venueId);
      if (!venue || !(await assertActiveCatalogId("venues", parsed.data.venueId))) {
        return res.status(400).json({ error: "Pick an active venue." });
      }
      sets.push("venue_id = ?", "venue_name = ?", "venue_address = ?", "city = ?");
      values.push(venue.id, venue.label, venue.address, venue.cityLabel);
    }
    for (const [key, column] of Object.entries(map)) {
      if (parsed.data[key as keyof typeof parsed.data] !== undefined) {
        sets.push(`${column} = ?`);
        values.push(parsed.data[key as keyof typeof parsed.data]);
      }
    }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update." });
    values.push(req.params.id);
    await db().query(`UPDATE course_editions SET ${sets.join(", ")} WHERE id = ?`, values);
    res.json({ ok: true });
  });

  app.patch("/api/admin/enrollments/:id", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canWriteOperations(admin)) return res.status(403).json({ error: "Only owners and coordinators can update seats." });
    const parsed = z
      .object({
        status: z.enum(["pending", "paid", "waitlist", "cancelled", "attended", "no_show"]).optional(),
        paymentMethod: z.enum(["card", "transfer", "company_invoice", "complimentary"]).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the seat update." });
    if (parsed.data.paymentMethod && parsed.data.paymentMethod !== "card" && parsed.data.status !== "cancelled") {
      const paid = await markEnrollmentPaid({
        enrollmentId: Number(req.params.id),
        checkoutSessionId: `manual_${req.params.id}_${Date.now()}`,
        paymentIntentId: null,
        brand: null,
        last4: null,
        method: parsed.data.paymentMethod,
      });
      if (parsed.data.status && parsed.data.status !== "paid") {
        await db().execute("UPDATE enrollments SET status = ? WHERE id = ?", [parsed.data.status, req.params.id]);
      } else if (paid.newlyPaid) {
        try {
          await sendSeatConfirmationEmail({
            enrollmentId: Number(req.params.id),
            method: parsed.data.paymentMethod,
            brand: null,
            last4: null,
          });
        } catch (error) {
          console.error("seat confirmation email", error);
        }
      }
      return res.json({ ok: true });
    }
    const sets: string[] = [];
    const values: unknown[] = [];
    if (parsed.data.status) {
      sets.push("status = ?");
      values.push(parsed.data.status as EnrollmentStatus);
    }
    if (parsed.data.paymentMethod) {
      sets.push("payment_method = ?");
      values.push(parsed.data.paymentMethod as PaymentMethod);
    }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update." });
    values.push(req.params.id);
    await db().query(`UPDATE enrollments SET ${sets.join(", ")} WHERE id = ?`, values);
    res.json({ ok: true });
  });

  app.get("/api/admin/editions", requireOpsStaff, async (req, res) => {
    const courseId = Number(req.query.courseId) || 0;
    const params: unknown[] = [];
    let where = "WHERE ed.status IN ('presale', 'confirmed')";
    if (courseId > 0) {
      where += " AND ed.course_id = ?";
      params.push(courseId);
    }
    const [rows] = await db().query<RowDataPacket[]>(
      `SELECT ed.*, c.title AS course_title, c.slug AS course_slug,
              (SELECT COUNT(*) FROM enrollments n WHERE n.edition_id = ed.id AND n.status IN ('paid','attended')) AS paid_count,
              (SELECT COUNT(*) FROM enrollments n WHERE n.edition_id = ed.id AND n.status IN ('pending','paid','attended')) AS held_count
         FROM course_editions ed
         JOIN courses c ON c.id = ed.course_id
         ${where}
        ORDER BY ed.starts_at ASC
        LIMIT 200`,
      params,
    );
    res.json({
      editions: rows.map((row) => ({
        ...editionFromRow(row),
        courseTitle: row.course_title,
        courseSlug: row.course_slug,
      })),
    });
  });

  app.get("/api/admin/payments", requireOpsStaff, async (req, res) => {
    const q = parseListQuery(req, { limit: 25 });
    const sortMap: Record<string, string> = {
      createdAt: "p.created_at",
      amountCents: "p.amount_cents",
      status: "p.status",
      method: "p.method",
      courseTitle: "c.title",
    };
    const orderCol = sortMap[q.sortBy] || "p.created_at";
    const params: unknown[] = [];
    let where = "WHERE 1=1";
    if (q.search) {
      where +=
        " AND (c.title LIKE ? OR u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR co.name LIKE ? OR cp.code LIKE ?)";
      const like = `%${q.search}%`;
      params.push(like, like, like, like, like, like);
    }
    const [countRows] = await db().query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
         FROM payments p
         LEFT JOIN course_editions ed ON ed.id = p.edition_id
         LEFT JOIN courses c ON c.id = ed.course_id
         LEFT JOIN users u ON u.id = p.user_id
         LEFT JOIN companies co ON co.id = p.company_id
         LEFT JOIN enrollments e ON e.id = p.enrollment_id
         LEFT JOIN coupons cp ON cp.id = e.coupon_id
         ${where}`,
      params,
    );
    const total = Number(countRows[0]?.total || 0);
    const [rows] = await db().query<RowDataPacket[]>(
      `SELECT p.*, c.title AS course_title, u.email, u.first_name, u.last_name, co.name AS company_name,
              e.discount_cents, e.list_amount_cents, cp.code AS coupon_code
         FROM payments p
         LEFT JOIN course_editions ed ON ed.id = p.edition_id
         LEFT JOIN courses c ON c.id = ed.course_id
         LEFT JOIN users u ON u.id = p.user_id
         LEFT JOIN companies co ON co.id = p.company_id
         LEFT JOIN enrollments e ON e.id = p.enrollment_id
         LEFT JOIN coupons cp ON cp.id = e.coupon_id
         ${where}
        ORDER BY ${orderCol} ${q.sortDir}, p.id DESC
        LIMIT ? OFFSET ?`,
      [...params, q.limit, q.offset],
    );
    res.json({
      payments: rows.map((row) => ({
        id: Number(row.id),
        amountCents: Number(row.amount_cents),
        currency: row.currency,
        status: row.status,
        method: row.method,
        cardBrand: row.card_brand,
        cardLast4: row.card_last4,
        courseTitle: row.course_title,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        companyName: row.company_name,
        couponCode: row.coupon_code || null,
        listAmountCents: row.list_amount_cents == null ? null : Number(row.list_amount_cents),
        discountCents: Number(row.discount_cents || 0),
        createdAt: iso(row.created_at),
      })),
      pagination: paginationOf(q.page, q.limit, total),
    });
  });

  app.get("/api/admin/participants", requireOpsStaff, async (req, res) => {
    const q = parseListQuery(req, { limit: 25 });
    const courseId = Number(req.query.courseId) || 0;
    const editionId = Number(req.query.editionId) || 0;
    const sortMap: Record<string, string> = {
      createdAt: "e.created_at",
      status: "e.status",
      email: "u.email",
      firstName: "u.first_name",
      courseTitle: "c.title",
      startsAt: "ed.starts_at",
      amountCents: "e.amount_cents",
    };
    const orderCol = sortMap[q.sortBy] || "e.created_at";
    const params: unknown[] = [];
    let where = "WHERE 1=1";
    if (courseId > 0) {
      where += " AND c.id = ?";
      params.push(courseId);
    }
    if (editionId > 0) {
      where += " AND ed.id = ?";
      params.push(editionId);
    }
    if (q.search) {
      where +=
        " AND (u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR c.title LIKE ? OR u.phone LIKE ? OR cp.code LIKE ? OR CAST(e.id AS CHAR) LIKE ?)";
      const like = `%${q.search}%`;
      params.push(like, like, like, like, like, like, like);
    }
    const [countRows] = await db().query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
         FROM enrollments e
         JOIN users u ON u.id = e.user_id
         JOIN course_editions ed ON ed.id = e.edition_id
         JOIN courses c ON c.id = ed.course_id
         LEFT JOIN coupons cp ON cp.id = e.coupon_id
         ${where}`,
      params,
    );
    const total = Number(countRows[0]?.total || 0);
    const [rows] = await db().query<RowDataPacket[]>(
      `SELECT e.id, e.status, e.amount_cents, e.currency, e.payment_method, e.card_brand, e.card_last4,
              e.paid_at, e.created_at, e.edition_id, e.discount_cents, e.list_amount_cents,
              u.first_name, u.last_name, u.email, u.phone, u.audience,
              c.id AS course_id, c.title AS course_title, c.slug AS course_slug,
              ed.starts_at, ed.city, cp.code AS coupon_code
         FROM enrollments e
         JOIN users u ON u.id = e.user_id
         JOIN course_editions ed ON ed.id = e.edition_id
         JOIN courses c ON c.id = ed.course_id
         LEFT JOIN coupons cp ON cp.id = e.coupon_id
         ${where}
        ORDER BY ${orderCol} ${q.sortDir}, e.id DESC
        LIMIT ? OFFSET ?`,
      [...params, q.limit, q.offset],
    );
    res.json({
      participants: rows.map((row) => ({
        id: Number(row.id),
        status: row.status,
        amountCents: Number(row.amount_cents),
        currency: row.currency,
        listAmountCents: row.list_amount_cents == null ? null : Number(row.list_amount_cents),
        discountCents: Number(row.discount_cents || 0),
        couponCode: row.coupon_code || null,
        paymentMethod: row.payment_method,
        cardBrand: row.card_brand,
        cardLast4: row.card_last4,
        paidAt: row.paid_at ? iso(row.paid_at) : null,
        createdAt: iso(row.created_at),
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
        audience: row.audience,
        courseId: Number(row.course_id),
        courseTitle: row.course_title,
        courseSlug: row.course_slug,
        editionId: Number(row.edition_id),
        startsAt: iso(row.starts_at),
        city: row.city,
      })),
      pagination: paginationOf(q.page, q.limit, total),
    });
  });

  app.post("/api/admin/participants", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canWriteOperations(admin)) {
      return res.status(403).json({ error: "Only owners and coordinators can add participants." });
    }
    const parsed = z
      .object({
        email: emailSchema,
        firstName: z.string().trim().min(1).max(120),
        lastName: z.string().trim().max(120).default(""),
        phone: z.string().trim().max(40).optional().nullable(),
        editionId: z.number().int().positive(),
        paymentMethod: z.enum(["complimentary", "transfer", "company_invoice", "card"]),
        sendConfirmationEmail: z.boolean().optional().default(true),
        amountCents: z.number().int().min(0).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the participant fields." });
    const data = parsed.data;
    try {
      const [editions] = await db().query<RowDataPacket[]>(
        `SELECT ed.*, c.title
           FROM course_editions ed
           JOIN courses c ON c.id = ed.course_id
          WHERE ed.id = ?
          LIMIT 1`,
        [data.editionId],
      );
      const edition = editions[0];
      if (!edition) return res.status(404).json({ error: "That edition was not found." });

      const [users] = await db().query<RowDataPacket[]>("SELECT * FROM users WHERE email = ? LIMIT 1", [data.email]);
      let userId = users[0]?.id as number | undefined;
      if (!userId) {
        const [created] = await db().execute<ResultSetHeader>(
          `INSERT INTO users (email, first_name, last_name, phone, audience, preferred_language)
           VALUES (?, ?, ?, ?, 'professional', 'es')`,
          [data.email, data.firstName, data.lastName || "", data.phone || null],
        );
        userId = created.insertId;
      } else {
        await db().execute(
          `UPDATE users
              SET first_name = COALESCE(NULLIF(?, ''), first_name),
                  last_name = COALESCE(NULLIF(?, ''), last_name),
                  phone = COALESCE(?, phone)
            WHERE id = ?`,
          [data.firstName, data.lastName || "", data.phone || null, userId],
        );
      }

      const [existing] = await db().query<RowDataPacket[]>(
        "SELECT id, status FROM enrollments WHERE edition_id = ? AND user_id = ? LIMIT 1",
        [data.editionId, userId],
      );
      const amountCents = data.amountCents ?? Number(edition.price_cents);
      let enrollmentId = existing[0] ? Number(existing[0].id) : 0;
      if (existing[0]) {
        if (["paid", "attended"].includes(String(existing[0].status))) {
          return res.status(409).json({ error: "That participant already has a confirmed seat." });
        }
        await db().execute(
          `UPDATE enrollments
              SET status = 'pending', amount_cents = ?, currency = ?, payment_method = NULL,
                  card_brand = NULL, card_last4 = NULL, paid_at = NULL
            WHERE id = ?`,
          [amountCents, edition.currency, enrollmentId],
        );
      } else {
        const [held] = await db().query<RowDataPacket[]>(
          `SELECT COUNT(*) AS held
             FROM enrollments
            WHERE edition_id = ? AND status IN ('pending', 'paid', 'attended')`,
          [data.editionId],
        );
        if (Number(held[0]?.held || 0) >= Number(edition.capacity)) {
          return res.status(409).json({ error: "This edition is full." });
        }
        const [inserted] = await db().execute<ResultSetHeader>(
          `INSERT INTO enrollments (edition_id, user_id, status, amount_cents, currency)
           VALUES (?, ?, 'pending', ?, ?)`,
          [data.editionId, userId, amountCents, edition.currency],
        );
        enrollmentId = inserted.insertId;
      }

      const paid = await markEnrollmentPaid({
        enrollmentId,
        checkoutSessionId: `manual_${enrollmentId}_${Date.now()}`,
        paymentIntentId: null,
        brand: null,
        last4: null,
        method: data.paymentMethod,
      });

      if (data.sendConfirmationEmail && paid.newlyPaid) {
        try {
          await sendSeatConfirmationEmail({
            enrollmentId,
            method: data.paymentMethod,
            brand: null,
            last4: null,
          });
        } catch (error) {
          console.error("manual participant confirmation email", error);
        }
      }

      res.status(201).json({ enrollmentId, userId, newlyPaid: paid.newlyPaid });
    } catch (error) {
      sendDbError(res, error as { code?: string });
    }
  });

  const couponBodySchema = z
    .object({
      code: z.string().trim().min(2).max(40),
      name: z.string().trim().min(1).max(120),
      description: z.string().trim().max(400).optional().nullable(),
      discountType: z.enum(["percent", "fixed"]),
      percentOff: z.number().min(0).max(100).optional().nullable(),
      amountOffCents: z.number().int().min(1).optional().nullable(),
      scope: z.enum(["all", "course", "edition"]).default("all"),
      courseIds: z.array(z.number().int().positive()).optional().default([]),
      editionIds: z.array(z.number().int().positive()).optional().default([]),
      maxRedemptions: z.number().int().positive().optional().nullable(),
      startsAt: z.string().trim().min(4).max(40).optional().nullable(),
      endsAt: z.string().trim().min(4).max(40).optional().nullable(),
      active: z.boolean().optional().default(true),
    })
    .superRefine((value, ctx) => {
      if (value.discountType === "percent") {
        if (value.percentOff == null || !Number.isFinite(value.percentOff) || value.percentOff <= 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "percentOff required", path: ["percentOff"] });
        }
      }
      if (value.discountType === "fixed") {
        if (value.amountOffCents == null || value.amountOffCents < 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "amountOffCents required",
            path: ["amountOffCents"],
          });
        }
      }
      if (value.scope === "course" && (!value.courseIds || value.courseIds.length < 1)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "courseIds required", path: ["courseIds"] });
      }
      if (value.scope === "edition" && (!value.editionIds || value.editionIds.length < 1)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "editionIds required", path: ["editionIds"] });
      }
    });

  const couponPatchSchema = z.object({
    code: z.string().trim().min(2).max(40).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(400).optional().nullable(),
    discountType: z.enum(["percent", "fixed"]).optional(),
    percentOff: z.number().min(0).max(100).optional().nullable(),
    amountOffCents: z.number().int().min(1).optional().nullable(),
    scope: z.enum(["all", "course", "edition"]).optional(),
    courseIds: z.array(z.number().int().positive()).optional(),
    editionIds: z.array(z.number().int().positive()).optional(),
    maxRedemptions: z.number().int().positive().optional().nullable(),
    startsAt: z.string().trim().min(4).max(40).optional().nullable(),
    endsAt: z.string().trim().min(4).max(40).optional().nullable(),
    active: z.boolean().optional(),
  });

  async function replaceCouponScopes(
    couponId: number,
    scope: "all" | "course" | "edition",
    courseIds: number[],
    editionIds: number[],
  ) {
    await db().execute("DELETE FROM coupon_courses WHERE coupon_id = ?", [couponId]);
    await db().execute("DELETE FROM coupon_editions WHERE coupon_id = ?", [couponId]);
    if (scope === "course") {
      for (const courseId of courseIds) {
        await db().execute("INSERT INTO coupon_courses (coupon_id, course_id) VALUES (?, ?)", [couponId, courseId]);
      }
    }
    if (scope === "edition") {
      for (const editionId of editionIds) {
        await db().execute("INSERT INTO coupon_editions (coupon_id, edition_id) VALUES (?, ?)", [couponId, editionId]);
      }
    }
  }

  async function couponAdminPayload(couponId: number) {
    const [rows] = await db().query<RowDataPacket[]>("SELECT * FROM coupons WHERE id = ? LIMIT 1", [couponId]);
    const coupon = rows[0];
    if (!coupon) return null;
    const [courseRows] = await db().query<RowDataPacket[]>(
      "SELECT course_id FROM coupon_courses WHERE coupon_id = ?",
      [couponId],
    );
    const [editionRows] = await db().query<RowDataPacket[]>(
      "SELECT edition_id FROM coupon_editions WHERE coupon_id = ?",
      [couponId],
    );
    const redemptions = await countActiveCouponHolds(couponId);
    return {
      id: Number(coupon.id),
      code: String(coupon.code),
      name: String(coupon.name),
      description: coupon.description || null,
      discountType: coupon.discount_type === "fixed" ? ("fixed" as const) : ("percent" as const),
      percentOff: coupon.percent_off == null ? null : Number(coupon.percent_off),
      amountOffCents: coupon.amount_off_cents == null ? null : Number(coupon.amount_off_cents),
      currency: String(coupon.currency || "MXN"),
      scope: String(coupon.scope || "all") as "all" | "course" | "edition",
      courseIds: courseRows.map((row) => Number(row.course_id)),
      editionIds: editionRows.map((row) => Number(row.edition_id)),
      maxRedemptions: coupon.max_redemptions == null ? null : Number(coupon.max_redemptions),
      redemptionCount: redemptions,
      startsAt: coupon.starts_at ? iso(coupon.starts_at) : null,
      endsAt: coupon.ends_at ? iso(coupon.ends_at) : null,
      active: Boolean(Number(coupon.active)),
      createdAt: iso(coupon.created_at),
      updatedAt: iso(coupon.updated_at),
    };
  }

  app.get("/api/admin/coupons", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canManageCoupons(admin)) {
      return res.status(403).json({ error: "Only owners and finance can manage coupons." });
    }
    const q = parseListQuery(req, { limit: 25 });
    const sortMap: Record<string, string> = {
      code: "c.code",
      name: "c.name",
      createdAt: "c.created_at",
      endsAt: "c.ends_at",
      active: "c.active",
    };
    const orderCol = sortMap[q.sortBy] || "c.created_at";
    const params: unknown[] = [];
    let where = "WHERE 1=1";
    if (q.search) {
      where += " AND (c.code LIKE ? OR c.name LIKE ? OR c.description LIKE ?)";
      const like = `%${q.search}%`;
      params.push(like, like, like);
    }
    const [countRows] = await db().query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM coupons c ${where}`,
      params,
    );
    const total = Number(countRows[0]?.total || 0);
    const [rows] = await db().query<RowDataPacket[]>(
      `SELECT c.*,
              (SELECT COUNT(*) FROM coupon_redemptions r
                WHERE r.coupon_id = c.id AND r.status IN ('applied', 'consumed')) AS redemption_count
         FROM coupons c
         ${where}
        ORDER BY ${orderCol} ${q.sortDir}, c.id DESC
        LIMIT ? OFFSET ?`,
      [...params, q.limit, q.offset],
    );
    res.json({
      coupons: rows.map((row) => ({
        id: Number(row.id),
        code: String(row.code),
        name: String(row.name),
        description: row.description || null,
        discountType: row.discount_type === "fixed" ? "fixed" : "percent",
        percentOff: row.percent_off == null ? null : Number(row.percent_off),
        amountOffCents: row.amount_off_cents == null ? null : Number(row.amount_off_cents),
        currency: String(row.currency || "MXN"),
        scope: String(row.scope || "all"),
        maxRedemptions: row.max_redemptions == null ? null : Number(row.max_redemptions),
        redemptionCount: Number(row.redemption_count || 0),
        startsAt: row.starts_at ? iso(row.starts_at) : null,
        endsAt: row.ends_at ? iso(row.ends_at) : null,
        active: Boolean(Number(row.active)),
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
      })),
      pagination: paginationOf(q.page, q.limit, total),
    });
  });

  app.get("/api/admin/coupons/:id", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canManageCoupons(admin)) {
      return res.status(403).json({ error: "Only owners and finance can manage coupons." });
    }
    const couponId = Number(req.params.id);
    if (!Number.isFinite(couponId) || couponId < 1) {
      return res.status(400).json({ error: "Invalid coupon." });
    }
    const coupon = await couponAdminPayload(couponId);
    if (!coupon) return res.status(404).json({ error: "That coupon was not found." });
    res.json({ coupon });
  });

  app.post("/api/admin/coupons", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canManageCoupons(admin)) {
      return res.status(403).json({ error: "Only owners and finance can manage coupons." });
    }
    const parsed = couponBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the coupon fields." });
    const data = parsed.data;
    const code = normalizeCouponCode(data.code);
    if (!/^[A-Z0-9_-]{2,40}$/.test(code)) {
      return res.status(400).json({ error: "Use letters, numbers, - or _ in the code." });
    }
    try {
      const [created] = await db().execute<ResultSetHeader>(
        `INSERT INTO coupons (
           code, name, description, discount_type, percent_off, amount_off_cents, currency,
           scope, max_redemptions, starts_at, ends_at, active, created_by_admin_id
         ) VALUES (?, ?, ?, ?, ?, ?, 'MXN', ?, ?, ?, ?, ?, ?)`,
        [
          code,
          data.name,
          data.description || null,
          data.discountType,
          data.discountType === "percent" ? data.percentOff : null,
          data.discountType === "fixed" ? data.amountOffCents : null,
          data.scope,
          data.maxRedemptions ?? null,
          data.startsAt ? new Date(data.startsAt) : null,
          data.endsAt ? new Date(data.endsAt) : null,
          data.active ? 1 : 0,
          admin.id,
        ],
      );
      const couponId = Number(created.insertId);
      await replaceCouponScopes(couponId, data.scope, data.courseIds || [], data.editionIds || []);
      const coupon = await couponAdminPayload(couponId);
      res.status(201).json({ coupon });
    } catch (error) {
      const err = error as { code?: string };
      if (err?.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ error: "That coupon code already exists.", code: "coupon_code_taken" });
      }
      sendDbError(res, err);
    }
  });

  app.patch("/api/admin/coupons/:id", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canManageCoupons(admin)) {
      return res.status(403).json({ error: "Only owners and finance can manage coupons." });
    }
    const couponId = Number(req.params.id);
    if (!Number.isFinite(couponId) || couponId < 1) {
      return res.status(400).json({ error: "Invalid coupon." });
    }
    const parsed = couponPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the coupon fields." });
    const data = parsed.data;
    try {
      const [existingRows] = await db().query<RowDataPacket[]>(
        "SELECT * FROM coupons WHERE id = ? LIMIT 1",
        [couponId],
      );
      const existing = existingRows[0];
      if (!existing) return res.status(404).json({ error: "That coupon was not found." });

      const discountType =
        data.discountType || (existing.discount_type === "fixed" ? "fixed" : "percent");
      const scope = (data.scope || String(existing.scope || "all")) as "all" | "course" | "edition";
      const code = data.code != null ? normalizeCouponCode(data.code) : String(existing.code);
      if (!/^[A-Z0-9_-]{2,40}$/.test(code)) {
        return res.status(400).json({ error: "Use letters, numbers, - or _ in the code." });
      }

      const name = data.name ?? String(existing.name);
      const description = data.description !== undefined ? data.description : existing.description;
      const percentOff =
        discountType === "percent"
          ? data.percentOff ?? (existing.percent_off == null ? null : Number(existing.percent_off))
          : null;
      const amountOffCents =
        discountType === "fixed"
          ? data.amountOffCents ??
            (existing.amount_off_cents == null ? null : Number(existing.amount_off_cents))
          : null;
      const maxRedemptions =
        data.maxRedemptions !== undefined
          ? data.maxRedemptions
          : existing.max_redemptions == null
            ? null
            : Number(existing.max_redemptions);
      const startsAt =
        data.startsAt !== undefined
          ? data.startsAt
            ? new Date(data.startsAt)
            : null
          : existing.starts_at
            ? new Date(existing.starts_at)
            : null;
      const endsAt =
        data.endsAt !== undefined
          ? data.endsAt
            ? new Date(data.endsAt)
            : null
          : existing.ends_at
            ? new Date(existing.ends_at)
            : null;
      const active = data.active !== undefined ? (data.active ? 1 : 0) : Number(existing.active);

      if (discountType === "percent" && !(percentOff != null && percentOff > 0)) {
        return res.status(400).json({ error: "percentOff required for percent coupons." });
      }
      if (discountType === "fixed" && !(amountOffCents != null && amountOffCents > 0)) {
        return res.status(400).json({ error: "amountOffCents required for fixed coupons." });
      }

      await db().execute(
        `UPDATE coupons
            SET code = ?, name = ?, description = ?, discount_type = ?, percent_off = ?,
                amount_off_cents = ?, scope = ?, max_redemptions = ?, starts_at = ?, ends_at = ?, active = ?
          WHERE id = ?`,
        [
          code,
          name,
          description,
          discountType,
          percentOff,
          amountOffCents,
          scope,
          maxRedemptions,
          startsAt,
          endsAt,
          active,
          couponId,
        ],
      );

      if (data.scope !== undefined || data.courseIds !== undefined || data.editionIds !== undefined) {
        let courseIds = data.courseIds;
        let editionIds = data.editionIds;
        if (courseIds === undefined) {
          const [crs] = await db().query<RowDataPacket[]>(
            "SELECT course_id FROM coupon_courses WHERE coupon_id = ?",
            [couponId],
          );
          courseIds = crs.map((row) => Number(row.course_id));
        }
        if (editionIds === undefined) {
          const [eds] = await db().query<RowDataPacket[]>(
            "SELECT edition_id FROM coupon_editions WHERE coupon_id = ?",
            [couponId],
          );
          editionIds = eds.map((row) => Number(row.edition_id));
        }
        if (scope === "course" && courseIds.length < 1) {
          return res.status(400).json({ error: "Pick at least one course for this coupon." });
        }
        if (scope === "edition" && editionIds.length < 1) {
          return res.status(400).json({ error: "Pick at least one edition for this coupon." });
        }
        await replaceCouponScopes(couponId, scope, courseIds, editionIds);
      }

      const coupon = await couponAdminPayload(couponId);
      res.json({ coupon });
    } catch (error) {
      const err = error as { code?: string };
      if (err?.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ error: "That coupon code already exists.", code: "coupon_code_taken" });
      }
      sendDbError(res, err);
    }
  });

  app.get("/api/admin/team", requireOpsStaff, async (req, res) => {
    const q = parseListQuery(req, { limit: 25 });
    const sortMap: Record<string, string> = {
      email: "a.email",
      firstName: "a.first_name",
      role: "a.role",
      status: "a.status",
      createdAt: "a.created_at",
    };
    const orderCol = sortMap[q.sortBy] || "a.role";
    const params: unknown[] = [];
    // Instructors live under /admin/instructores — keep Equipo for ops/company roles.
    let where = "WHERE a.role <> 'instructor'";
    if (q.search) {
      where += " AND (a.email LIKE ? OR a.first_name LIKE ? OR a.last_name LIKE ? OR c.name LIKE ?)";
      const like = `%${q.search}%`;
      params.push(like, like, like, like);
    }
    const [countRows] = await db().query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
         FROM admins a
         LEFT JOIN companies c ON c.id = a.company_id
         ${where}`,
      params,
    );
    const total = Number(countRows[0]?.total || 0);
    const [rows] = await db().query<RowDataPacket[]>(
      `SELECT a.*, c.name AS company_name
         FROM admins a
         LEFT JOIN companies c ON c.id = a.company_id
         ${where}
        ORDER BY ${orderCol} ${q.sortDir}, a.id ASC
        LIMIT ? OFFSET ?`,
      [...params, q.limit, q.offset],
    );
    res.json({
      team: rows.map(adminFromRow),
      pagination: paginationOf(q.page, q.limit, total),
    });
  });

  app.post("/api/admin/team", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (admin.role !== "owner") return res.status(403).json({ error: "Only an owner can invite the team." });
    const parsed = z
      .object({
        email: emailSchema,
        firstName: z.string().trim().min(1).max(120),
        lastName: z.string().trim().max(120).default(""),
        role: z.enum(["owner", "coordinator", "instructor", "finance", "company"]),
        companyName: z.string().trim().min(2).max(200).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the invitation." });
    if (parsed.data.role === "instructor") {
      return res.status(400).json({
        error: "Invite instructors from the Instructores section.",
        code: "use_instructors_section",
      });
    }
    if (parsed.data.role === "company" && !parsed.data.companyName) {
      return res.status(400).json({ error: "Add the company name for a company invite." });
    }
    try {
      let companyId: number | null = null;
      if (parsed.data.role === "company" && parsed.data.companyName) {
        const [companyResult] = await db().execute<ResultSetHeader>(
          "INSERT INTO companies (name, email, contact_name) VALUES (?, ?, ?)",
          [
            parsed.data.companyName,
            parsed.data.email,
            `${parsed.data.firstName} ${parsed.data.lastName}`.trim(),
          ],
        );
        companyId = companyResult.insertId;
      }
      const [result] = await db().execute<ResultSetHeader>(
        "INSERT INTO admins (email, first_name, last_name, role, status, company_id) VALUES (?, ?, ?, ?, 'invited', ?)",
        [
          parsed.data.email,
          parsed.data.firstName,
          parsed.data.lastName,
          parsed.data.role as AdminRole,
          companyId,
        ],
      );
      await sendStaffWelcomeEmail({
        email: parsed.data.email,
        firstName: parsed.data.firstName,
        role: parsed.data.role as AdminRole,
      });
      res.status(201).json({ id: result.insertId });
    } catch (error) {
      sendDbError(res, error as { code?: string });
    }
  });

  app.patch("/api/admin/team/:id", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (admin.role !== "owner") return res.status(403).json({ error: "Only an owner can change the team." });
    const parsed = z
      .object({
        role: z.enum(["owner", "coordinator", "instructor", "finance", "company"]).optional(),
        status: z.enum(["active", "invited", "disabled"]).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the team update." });
    if (Number(req.params.id) === admin.id && parsed.data.status === "disabled") {
      return res.status(400).json({ error: "You cannot disable your own access." });
    }
    const sets: string[] = [];
    const values: unknown[] = [];
    if (parsed.data.role) {
      sets.push("role = ?");
      values.push(parsed.data.role);
    }
    if (parsed.data.status) {
      sets.push("status = ?");
      values.push(parsed.data.status);
    }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update." });
    values.push(req.params.id);
    await db().query(`UPDATE admins SET ${sets.join(", ")} WHERE id = ?`, values);
    res.json({ ok: true });
  });

  app.get("/api/admin/requests", requireOpsStaff, async (_req, res) => {
    const [rows] = await db().query<RowDataPacket[]>(
      `SELECT r.*, co.name AS company_name, co.email AS company_email
         FROM company_requests r
         JOIN companies co ON co.id = r.company_id
        ORDER BY r.created_at DESC LIMIT 100`,
    );
    res.json({ requests: rows });
  });

  const SITE_PAGE_SLUGS = ["terminos", "privacidad"] as const;

  app.get("/api/site/pages/:slug", async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!(SITE_PAGE_SLUGS as readonly string[]).includes(slug)) {
      return res.status(404).json({ error: "Page not found." });
    }
    const lang = req.query.lang === "en" ? "en" : "es";
    const [rows] = await db().query<RowDataPacket[]>(
      "SELECT slug, title_es, title_en, body_md_es, body_md_en, updated_at FROM site_pages WHERE slug = ? LIMIT 1",
      [slug],
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: "Page not found." });
    res.json({
      page: {
        slug: row.slug,
        title: lang === "en" ? row.title_en : row.title_es,
        bodyMd: lang === "en" ? row.body_md_en : row.body_md_es,
        updatedAt: iso(row.updated_at),
      },
    });
  });

  app.get("/api/admin/pages", requireOpsStaff, async (req, res) => {
    if (!canWriteOperations((req as AuthedRequest).admin as AdminProfile)) {
      return res.status(403).json({ error: "Only owners and coordinators can edit legal pages." });
    }
    const [rows] = await db().query<RowDataPacket[]>(
      "SELECT slug, title_es, title_en, updated_at FROM site_pages ORDER BY slug ASC",
    );
    res.json({
      pages: rows.map((row) => ({
        slug: row.slug,
        titleEs: row.title_es,
        titleEn: row.title_en,
        updatedAt: iso(row.updated_at),
      })),
    });
  });

  app.get("/api/admin/pages/:slug", requireOpsStaff, async (req, res) => {
    if (!canWriteOperations((req as AuthedRequest).admin as AdminProfile)) {
      return res.status(403).json({ error: "Only owners and coordinators can edit legal pages." });
    }
    const slug = String(req.params.slug || "").trim();
    const [rows] = await db().query<RowDataPacket[]>(
      "SELECT slug, title_es, title_en, body_md_es, body_md_en, updated_at FROM site_pages WHERE slug = ? LIMIT 1",
      [slug],
    );
    if (!rows[0]) return res.status(404).json({ error: "Page not found." });
    const row = rows[0];
    res.json({
      page: {
        slug: row.slug,
        titleEs: row.title_es,
        titleEn: row.title_en,
        bodyMdEs: row.body_md_es,
        bodyMdEn: row.body_md_en,
        updatedAt: iso(row.updated_at),
      },
    });
  });

  app.patch("/api/admin/pages/:slug", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canWriteOperations(admin)) {
      return res.status(403).json({ error: "Only owners and coordinators can edit legal pages." });
    }
    const slug = String(req.params.slug || "").trim();
    if (!(SITE_PAGE_SLUGS as readonly string[]).includes(slug)) {
      return res.status(404).json({ error: "Page not found." });
    }
    const parsed = z
      .object({
        titleEs: z.string().trim().min(3).max(200),
        titleEn: z.string().trim().min(3).max(200),
        bodyMdEs: z.string().trim().min(20).max(100_000),
        bodyMdEn: z.string().trim().min(20).max(100_000),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the page titles and markdown." });
    await db().execute(
      `UPDATE site_pages
          SET title_es = ?, title_en = ?, body_md_es = ?, body_md_en = ?, updated_by_admin_id = ?
        WHERE slug = ?`,
      [parsed.data.titleEs, parsed.data.titleEn, parsed.data.bodyMdEs, parsed.data.bodyMdEn, admin.id, slug],
    );
    const [rows] = await db().query<RowDataPacket[]>(
      "SELECT slug, title_es, title_en, body_md_es, body_md_en, updated_at FROM site_pages WHERE slug = ? LIMIT 1",
      [slug],
    );
    const row = rows[0];
    res.json({
      page: {
        slug: row.slug,
        titleEs: row.title_es,
        titleEn: row.title_en,
        bodyMdEs: row.body_md_es,
        bodyMdEn: row.body_md_en,
        updatedAt: iso(row.updated_at),
      },
    });
  });

  app.get("/api/admin/bank-transfer-settings", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canManageTransfers(admin)) {
      return res.status(403).json({ error: "Only owners, finance, and coordinators can view bank settings." });
    }
    const settings = await loadBankTransferSettings();
    if (!settings) return res.status(404).json({ error: "Bank transfer settings are missing." });
    res.json({ settings });
  });

  app.patch("/api/admin/bank-transfer-settings", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canManageTransfers(admin)) {
      return res.status(403).json({ error: "Only owners, finance, and coordinators can edit bank settings." });
    }
    const parsed = z
      .object({
        bankName: z.string().trim().min(2).max(120),
        accountHolder: z.string().trim().min(2).max(200),
        clabe: z.string().trim().regex(/^\d{18}$/),
        accountNumber: z.string().trim().max(40).nullable().optional(),
        bankCode: z.string().trim().max(20).nullable().optional(),
        instructionsEs: z.string().trim().max(4000).nullable().optional(),
        instructionsEn: z.string().trim().max(4000).nullable().optional(),
        expiresAfterDays: z.number().int().min(1).max(30),
        isEnabled: z.boolean(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Check bank name, holder, 18-digit CLABE, and expiry days." });
    }
    await db().execute(
      `UPDATE site_bank_transfer_settings
          SET bank_name = ?, account_holder = ?, clabe = ?, account_number = ?, bank_code = ?,
              instructions_es = ?, instructions_en = ?, expires_after_days = ?, is_enabled = ?,
              updated_by_admin_id = ?
        WHERE id = 1`,
      [
        parsed.data.bankName,
        parsed.data.accountHolder,
        parsed.data.clabe,
        parsed.data.accountNumber ?? null,
        parsed.data.bankCode ?? null,
        parsed.data.instructionsEs ?? null,
        parsed.data.instructionsEn ?? null,
        parsed.data.expiresAfterDays,
        parsed.data.isEnabled ? 1 : 0,
        admin.id,
      ],
    );
    const settings = await loadBankTransferSettings();
    res.json({ settings });
  });

  app.get("/api/admin/transfers", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canManageTransfers(admin)) {
      return res.status(403).json({ error: "Only owners, finance, and coordinators can manage transfers." });
    }
    await expireStaleTransferPayments();
    const q = parseListQuery(req, { limit: 25 });
    const statusFilter = String(req.query.status || "processing").trim();
    const status =
      statusFilter === "all" || statusFilter === "succeeded" || statusFilter === "failed" || statusFilter === "processing"
        ? statusFilter
        : "processing";
    const sortMap: Record<string, string> = {
      createdAt: "p.created_at",
      amountCents: "p.amount_cents",
      status: "p.status",
      transferExpiresAt: "p.transfer_expires_at",
      courseTitle: "c.title",
      reference: "p.transfer_reference",
    };
    const orderCol = sortMap[q.sortBy] || "p.created_at";
    const params: unknown[] = [];
    let where = "WHERE p.method = 'transfer'";
    if (status !== "all") {
      where += " AND p.status = ?";
      params.push(status);
    }
    if (q.search) {
      where +=
        " AND (c.title LIKE ? OR u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR p.transfer_reference LIKE ?)";
      const like = `%${q.search}%`;
      params.push(like, like, like, like, like);
    }
    const [countRows] = await db().query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
         FROM payments p
         LEFT JOIN course_editions ed ON ed.id = p.edition_id
         LEFT JOIN courses c ON c.id = ed.course_id
         LEFT JOIN users u ON u.id = p.user_id
         ${where}`,
      params,
    );
    const total = Number(countRows[0]?.total || 0);
    const [rows] = await db().query<RowDataPacket[]>(
      `SELECT p.*, c.title AS course_title, u.email, u.first_name, u.last_name,
              e.status AS enrollment_status,
              a.first_name AS confirmed_by_first_name, a.last_name AS confirmed_by_last_name
         FROM payments p
         LEFT JOIN course_editions ed ON ed.id = p.edition_id
         LEFT JOIN courses c ON c.id = ed.course_id
         LEFT JOIN users u ON u.id = p.user_id
         LEFT JOIN enrollments e ON e.id = p.enrollment_id
         LEFT JOIN admins a ON a.id = p.confirmed_by_admin_id
         ${where}
        ORDER BY ${orderCol} ${q.sortDir}, p.id DESC
        LIMIT ? OFFSET ?`,
      [...params, q.limit, q.offset],
    );
    res.json({
      transfers: rows.map((row) => ({
        id: Number(row.id),
        enrollmentId: row.enrollment_id == null ? null : Number(row.enrollment_id),
        enrollmentStatus: row.enrollment_status || null,
        amountCents: Number(row.amount_cents),
        currency: row.currency,
        status: row.status,
        reference: row.transfer_reference,
        expiresAt: row.transfer_expires_at ? iso(row.transfer_expires_at) : null,
        confirmedAt: row.confirmed_at ? iso(row.confirmed_at) : null,
        confirmedByName:
          row.confirmed_by_first_name || row.confirmed_by_last_name
            ? `${row.confirmed_by_first_name || ""} ${row.confirmed_by_last_name || ""}`.trim()
            : null,
        rejectedAt: row.rejected_at ? iso(row.rejected_at) : null,
        rejectReason: row.reject_reason,
        courseTitle: row.course_title,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        createdAt: iso(row.created_at),
      })),
      pagination: paginationOf(q.page, q.limit, total),
    });
  });

  app.post("/api/admin/transfers/:id/confirm", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canManageTransfers(admin)) {
      return res.status(403).json({ error: "Only owners, finance, and coordinators can confirm transfers." });
    }
    const paymentId = Number(req.params.id);
    if (!Number.isFinite(paymentId) || paymentId < 1) {
      return res.status(400).json({ error: "Invalid transfer." });
    }
    try {
      const [seatCheck] = await db().query<RowDataPacket[]>(
        `SELECT e.status AS enrollment_status
           FROM payments p
           JOIN enrollments e ON e.id = p.enrollment_id
          WHERE p.id = ? AND p.method = 'transfer' LIMIT 1`,
        [paymentId],
      );
      if (
        seatCheck[0] &&
        (seatCheck[0].enrollment_status === "cancelled" || seatCheck[0].enrollment_status === "no_show")
      ) {
        return res.status(409).json({
          error: "That seat is no longer available.",
          code: "seat_unavailable",
        });
      }
      const result = await confirmTransferPayment({ paymentId, adminId: admin.id });
      if (!result) {
        return res.status(409).json({ error: "That transfer is not awaiting confirmation.", code: "transfer_not_pending" });
      }
      if (result.newlyPaid) {
        try {
          await sendSeatConfirmationEmail({
            enrollmentId: result.enrollmentId,
            method: "transfer",
            brand: null,
            last4: null,
          });
        } catch (error) {
          console.error("transfer seat confirmation email", error);
        }
      }
      res.json({ ok: true, newlyPaid: result.newlyPaid, enrollmentId: result.enrollmentId });
    } catch (error) {
      sendDbError(res, error as { code?: string; message?: string });
    }
  });

  app.post("/api/admin/transfers/:id/reject", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canManageTransfers(admin)) {
      return res.status(403).json({ error: "Only owners, finance, and coordinators can reject transfers." });
    }
    const paymentId = Number(req.params.id);
    if (!Number.isFinite(paymentId) || paymentId < 1) {
      return res.status(400).json({ error: "Invalid transfer." });
    }
    const parsed = z
      .object({ reason: z.string().trim().max(400).optional() })
      .safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid reject reason." });
    try {
      const result = await rejectTransferPayment({
        paymentId,
        reason: parsed.data.reason || "rejected",
      });
      if (!result) {
        return res.status(409).json({ error: "That transfer is not awaiting review.", code: "transfer_not_pending" });
      }
      res.json({ ok: true, enrollmentId: result.enrollmentId });
    } catch (error) {
      sendDbError(res, error as { code?: string; message?: string });
    }
  });

  app.get("/api/admin/instructors", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canManageInstructors(admin) && !canWriteOperations(admin)) {
      return res.status(403).json({ error: "Only owners and coordinators can browse instructors." });
    }
    const q = parseListQuery(req, { limit: 25 });
    const activeOnly = String(req.query.activeOnly || "") === "1" || String(req.query.activeOnly || "") === "true";
    const params: unknown[] = [];
    let where = "WHERE a.role = 'instructor'";
    if (activeOnly) {
      where += " AND a.status IN ('active', 'invited')";
    }
    if (q.search) {
      where += " AND (a.email LIKE ? OR a.first_name LIKE ? OR a.last_name LIKE ?)";
      const like = `%${q.search}%`;
      params.push(like, like, like);
    }
    const [countRows] = await db().query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM admins a ${where}`,
      params,
    );
    const total = Number(countRows[0]?.total || 0);
    const [rows] = await db().query<RowDataPacket[]>(
      `SELECT a.*,
              (SELECT COUNT(*) FROM course_editions e
                WHERE e.instructor_admin_id = a.id
                  AND e.status IN ('presale', 'confirmed')) AS assigned_editions
         FROM admins a
         ${where}
        ORDER BY a.first_name ASC, a.last_name ASC, a.id ASC
        LIMIT ? OFFSET ?`,
      [...params, q.limit, q.offset],
    );
    res.json({
      instructors: rows.map((row) => ({
        ...adminFromRow(row),
        assignedEditions: Number(row.assigned_editions || 0),
      })),
      pagination: paginationOf(q.page, q.limit, total),
    });
  });

  app.post("/api/admin/instructors", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canManageInstructors(admin)) {
      return res.status(403).json({ error: "Only owners and coordinators can invite instructors." });
    }
    const parsed = z
      .object({
        email: emailSchema,
        firstName: z.string().trim().min(1).max(120),
        lastName: z.string().trim().max(120).default(""),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the instructor invitation." });
    try {
      const [result] = await db().execute<ResultSetHeader>(
        "INSERT INTO admins (email, first_name, last_name, role, status) VALUES (?, ?, ?, 'instructor', 'invited')",
        [parsed.data.email, parsed.data.firstName, parsed.data.lastName],
      );
      await sendStaffWelcomeEmail({
        email: parsed.data.email,
        firstName: parsed.data.firstName,
        role: "instructor",
      });
      res.status(201).json({ id: result.insertId });
    } catch (error) {
      sendDbError(res, error as { code?: string });
    }
  });

  app.patch("/api/admin/instructors/:id", requireOpsStaff, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!canManageInstructors(admin)) {
      return res.status(403).json({ error: "Only owners and coordinators can update instructors." });
    }
    const instructorId = Number(req.params.id);
    if (!Number.isFinite(instructorId) || instructorId < 1) {
      return res.status(400).json({ error: "Invalid instructor." });
    }
    const parsed = z
      .object({
        status: z.enum(["active", "invited", "disabled"]).optional(),
        firstName: z.string().trim().min(1).max(120).optional(),
        lastName: z.string().trim().max(120).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the instructor update." });
    const [existing] = await db().query<RowDataPacket[]>(
      "SELECT id FROM admins WHERE id = ? AND role = 'instructor' LIMIT 1",
      [instructorId],
    );
    if (!existing[0]) return res.status(404).json({ error: "Instructor not found." });
    const sets: string[] = [];
    const values: unknown[] = [];
    if (parsed.data.status) {
      sets.push("status = ?");
      values.push(parsed.data.status);
    }
    if (parsed.data.firstName) {
      sets.push("first_name = ?");
      values.push(parsed.data.firstName);
    }
    if (parsed.data.lastName !== undefined) {
      sets.push("last_name = ?");
      values.push(parsed.data.lastName);
    }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update." });
    values.push(instructorId);
    await db().query(`UPDATE admins SET ${sets.join(", ")} WHERE id = ?`, values);
    res.json({ ok: true });
  });

  app.get("/api/instructor/editions", requireAdmin, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!isInstructorRole(admin)) {
      return res.status(403).json({ error: "This area is for instructors." });
    }
    const [rows] = await db().query<RowDataPacket[]>(
      `SELECT e.*,
              c.title AS course_title, c.slug AS course_slug,
              TRIM(CONCAT(COALESCE(a.first_name, ''), ' ', COALESCE(a.last_name, ''))) AS instructor_name,
              (SELECT COUNT(*) FROM enrollments n WHERE n.edition_id = e.id AND n.status IN ('paid','attended')) AS paid_count,
              (SELECT COUNT(*) FROM enrollments n WHERE n.edition_id = e.id AND n.status IN ('pending','paid','attended')) AS held_count
         FROM course_editions e
         JOIN courses c ON c.id = e.course_id
         LEFT JOIN admins a ON a.id = e.instructor_admin_id
        WHERE e.instructor_admin_id = ?
          AND e.status IN ('presale', 'confirmed', 'completed')
        ORDER BY e.starts_at ASC`,
      [admin.id],
    );
    res.json({
      editions: rows.map((row) => ({
        ...editionFromRow(row),
        courseTitle: row.course_title,
        courseSlug: row.course_slug,
      })),
    });
  });

  app.get("/api/instructor/editions/:id/participants", requireAdmin, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    if (!isInstructorRole(admin)) {
      return res.status(403).json({ error: "This area is for instructors." });
    }
    const editionId = Number(req.params.id);
    if (!Number.isFinite(editionId) || editionId < 1) {
      return res.status(400).json({ error: "Invalid edition." });
    }
    const [editionRows] = await db().query<RowDataPacket[]>(
      `SELECT e.id, c.title AS course_title
         FROM course_editions e
         JOIN courses c ON c.id = e.course_id
        WHERE e.id = ? AND e.instructor_admin_id = ?
        LIMIT 1`,
      [editionId, admin.id],
    );
    if (!editionRows[0]) return res.status(404).json({ error: "Edition not found." });

    const [rows] = await db().query<RowDataPacket[]>(
      `SELECT e.id, e.status, e.payment_method, e.paid_at, e.amount_cents, e.currency,
              u.first_name, u.last_name, u.email, u.phone
         FROM enrollments e
         JOIN users u ON u.id = e.user_id
        WHERE e.edition_id = ? AND e.status IN ('paid', 'attended')
        ORDER BY e.paid_at DESC, e.id DESC`,
      [editionId],
    );
    res.json({
      editionId,
      courseTitle: editionRows[0].course_title,
      participants: rows.map((row) => ({
        id: Number(row.id),
        status: row.status,
        paymentMethod: row.payment_method,
        paidAt: row.paid_at ? iso(row.paid_at) : null,
        amountCents: Number(row.amount_cents),
        currency: row.currency,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
      })),
    });
  });

  app.get("/api/admin/notifications", requireAdmin, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    const unreadOnly = String(req.query.unreadOnly || "") === "1" || String(req.query.unreadOnly || "") === "true";
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const params: unknown[] = [admin.id];
    let where = "WHERE admin_id = ?";
    if (unreadOnly) where += " AND read_at IS NULL";
    const [countRows] = await db().query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM admin_notifications ${where}`,
      params,
    );
    const [unreadRows] = await db().query<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM admin_notifications WHERE admin_id = ? AND read_at IS NULL",
      [admin.id],
    );
    const [rows] = await db().query<RowDataPacket[]>(
      `SELECT * FROM admin_notifications ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
      [...params, limit],
    );
    res.json({
      unreadCount: Number(unreadRows[0]?.total || 0),
      total: Number(countRows[0]?.total || 0),
      notifications: rows.map((row) => ({
        id: Number(row.id),
        kind: row.kind,
        title: row.title,
        body: row.body,
        linkPath: row.link_path,
        enrollmentId: row.enrollment_id == null ? null : Number(row.enrollment_id),
        editionId: row.edition_id == null ? null : Number(row.edition_id),
        readAt: row.read_at ? iso(row.read_at) : null,
        createdAt: iso(row.created_at),
      })),
    });
  });

  app.post("/api/admin/notifications/:id/read", requireAdmin, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: "Invalid notification." });
    await db().execute(
      "UPDATE admin_notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = ? AND admin_id = ?",
      [id, admin.id],
    );
    res.json({ ok: true });
  });

  app.post("/api/admin/notifications/read-all", requireAdmin, async (req, res) => {
    const admin = (req as AuthedRequest).admin as AdminProfile;
    await db().execute(
      "UPDATE admin_notifications SET read_at = NOW() WHERE admin_id = ? AND read_at IS NULL",
      [admin.id],
    );
    res.json({ ok: true });
  });

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    if (!res.headersSent) res.status(500).json({ error: "Something went wrong. Try again." });
  });

  return app;
}

void money;

let app: Express;
if (process.env.VITEST === "true") {
  app = express();
} else {
  try {
    app = buildApp();
  } catch (error) {
    console.error("[API init]", error);
    app = express();
    app.use((_req, res) => {
      res.status(503).json({ error: "Service unavailable. Check environment variables." });
    });
  }
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req as unknown as Request, res as unknown as Response);
}

export function createServer() {
  return buildApp();
}
