import { useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSection } from "@/components/admin/AdminShell";
import { formatMoney } from "@/lib/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchMyEditionParticipants, fetchMyInstructorEditions } from "@/store/slices/adminSlice";

export function InstructorEditionsPage() {
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const role = useAppSelector((state) => state.adminAuth.admin?.role);
  const editions = useAppSelector((state) => state.admin.myEditions);
  const error = useAppSelector((state) => state.admin.error);
  const locale = i18n.language?.startsWith("en") ? "en-US" : "es-MX";

  useEffect(() => {
    if (role === "instructor") void dispatch(fetchMyInstructorEditions());
  }, [dispatch, role]);

  if (role && role !== "instructor") return <Navigate to="/admin" replace />;

  return (
    <AdminSection>
      <AdminPageHeader title={t("admin.myEditions")} description={t("admin.myEditionsBody")} />
      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      <div className="grid gap-3">
        {editions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.myEditionsEmpty")}</p>
        ) : (
          editions.map((edition) => (
            <Link
              key={edition.id}
              to={`/admin/mis-ediciones/${edition.id}`}
              className="min-w-0 rounded-2xl border border-border bg-paper p-5 transition hover:border-ink/30"
            >
              <p className="font-semibold break-words">{edition.courseTitle || "—"}</p>
              <p className="mt-1 text-sm text-muted-foreground break-words">
                {new Date(edition.startsAt).toLocaleString(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                · {edition.venueName} · {edition.city}
              </p>
              <p className="mt-3 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {edition.status} · {edition.paidCount}/{edition.capacity}
              </p>
            </Link>
          ))
        )}
      </div>
    </AdminSection>
  );
}

export function InstructorEditionDetailPage() {
  const { id = "" } = useParams();
  const editionId = Number(id);
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const role = useAppSelector((state) => state.adminAuth.admin?.role);
  const participants = useAppSelector((state) => state.admin.myParticipants);
  const courseTitle = useAppSelector((state) => state.admin.myParticipantsCourseTitle);
  const error = useAppSelector((state) => state.admin.error);
  const locale = i18n.language?.startsWith("en") ? "en-US" : "es-MX";

  useEffect(() => {
    if (role === "instructor" && Number.isFinite(editionId) && editionId > 0) {
      void dispatch(fetchMyEditionParticipants(editionId));
    }
  }, [dispatch, editionId, role]);

  if (role && role !== "instructor") return <Navigate to="/admin" replace />;
  if (!Number.isFinite(editionId) || editionId < 1) return <Navigate to="/admin/mis-ediciones" replace />;

  return (
    <AdminSection>
      <Link to="/admin/mis-ediciones" className="text-sm font-medium text-muted-foreground hover:text-ink">
        ← {t("admin.myEditions")}
      </Link>
      <AdminPageHeader
        title={courseTitle || t("admin.myRoster")}
        description={t("admin.myRosterBody")}
      />
      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      <div className="grid gap-3">
        {participants.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.myRosterEmpty")}</p>
        ) : (
          participants.map((row) => (
            <div key={row.id} className="rounded-2xl border border-border bg-paper p-4">
              <p className="font-semibold break-words">
                {row.firstName} {row.lastName}
              </p>
              <p className="mt-1 text-sm text-muted-foreground break-all">{row.email}</p>
              {row.phone ? <p className="mt-1 text-sm text-muted-foreground">{row.phone}</p> : null}
              <p className="mt-3 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {row.status} · {row.paymentMethod || "—"} · {formatMoney(row.amountCents, row.currency)}
              </p>
              {row.paidAt ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(row.paidAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
                </p>
              ) : null}
            </div>
          ))
        )}
      </div>
    </AdminSection>
  );
}
