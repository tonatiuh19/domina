export type AppLanguage = "es" | "en";
export type Audience = "professional" | "student" | "general";
/** @deprecated Prefer CatalogOption.slug — kept as string for API compatibility. */
export type CourseCategory = string;
export type CourseAudience = string;
export type CourseLevel = string;
export type CourseStatus = "draft" | "published" | "archived";
export type EditionStatus = "draft" | "presale" | "confirmed" | "completed" | "cancelled";
export type EnrollmentStatus =
  | "pending"
  | "paid"
  | "waitlist"
  | "cancelled"
  | "attended"
  | "no_show";
export type PaymentMethod =
  | "card"
  | "transfer"
  | "company_invoice"
  | "complimentary"
  | "oxxo"
  | "coupon";
export type PaymentStatus =
  | "requires_payment"
  | "processing"
  | "succeeded"
  | "failed"
  | "refunded";
export type AdminRole = "owner" | "coordinator" | "instructor" | "finance" | "company";
export type StaffStatus = "active" | "invited" | "disabled";
export type SitePageSlug = "terminos" | "privacidad";
export type CatalogKind = "categories" | "levels" | "audiences" | "cities" | "venues";

export interface CatalogOption {
  id: number;
  kind: CatalogKind;
  slug: string;
  label: string;
  isActive: boolean;
  sortOrder: number;
  /** Venue-only fields */
  address?: string | null;
  cityId?: number | null;
  cityLabel?: string | null;
}

export interface SitePage {
  slug: SitePageSlug | string;
  title: string;
  bodyMd: string;
  updatedAt: string;
}

export interface SitePageAdmin {
  slug: SitePageSlug | string;
  titleEs: string;
  titleEn: string;
  bodyMdEs: string;
  bodyMdEn: string;
  updatedAt: string;
}

export interface UserProfile {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  audience: Audience;
  preferredLanguage: AppLanguage | null;
}

export interface AdminProfile {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  preferredLanguage: AppLanguage | null;
  role: AdminRole;
  status: StaffStatus;
  companyId: number | null;
  companyName: string | null;
}

export interface CompanyProfile {
  id: number;
  name: string;
  email: string;
  contactName: string;
  phone: string | null;
}

export interface CourseEdition {
  id: number;
  courseId: number;
  companyId: number | null;
  instructorAdminId: number | null;
  instructorName: string | null;
  venueId: number | null;
  startsAt: string;
  endsAt: string;
  venueName: string;
  venueAddress: string;
  city: string;
  status: EditionStatus;
  capacity: number;
  priceCents: number;
  currency: string;
  minEnrollment: number;
  notes: string | null;
  paidCount: number;
  heldCount: number;
}

export interface CourseGalleryImage {
  id: number;
  courseId: number;
  imageUrl: string;
  caption: string | null;
  sortOrder: number;
}

export interface Course {
  id: number;
  slug: string;
  title: string;
  categoryId: number;
  audienceId: number;
  levelId: number;
  cityId: number;
  category: CourseCategory;
  categoryLabel: string;
  audience: CourseAudience;
  audienceLabel: string;
  level: CourseLevel;
  levelLabel: string;
  summary: string;
  descriptionHtml: string | null;
  promise: string;
  durationHours: number;
  capacity: number;
  priceCents: number;
  currency: string;
  minEnrollment: number;
  practiceRatio: number;
  status: CourseStatus;
  city: string;
  citySlug: string;
  runOfShow: string | null;
  materials: string | null;
  safetyNotes: string | null;
  coverImageUrl: string | null;
  gallery?: CourseGalleryImage[];
  editions?: CourseEdition[];
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminListQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortDir?: "ASC" | "DESC";
}

export interface AdminParticipantRow {
  id: number;
  status: EnrollmentStatus;
  amountCents: number;
  currency: string;
  listAmountCents?: number | null;
  discountCents?: number;
  couponCode?: string | null;
  paymentMethod: PaymentMethod | null;
  cardBrand: string | null;
  cardLast4: string | null;
  paidAt: string | null;
  createdAt: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  audience: Audience;
  courseId: number;
  courseTitle: string;
  courseSlug: string;
  editionId: number;
  startsAt: string;
  city: string;
}
