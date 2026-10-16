import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DataGrid, type DataGridColumn } from "@/components/ui/data-grid";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSection } from "@/components/admin/AdminShell";
import { formatMoney } from "@/lib/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  confirmTransfer,
  fetchBankTransferSettings,
  fetchTransfers,
  rejectTransfer,
  saveBankTransferSettings,
  type AdminListQuery,
  type BankTransferSettings,
  type TransferRow,
} from "@/store/slices/adminSlice";

const emptySettings: BankTransferSettings = {
  bankName: "",
  accountHolder: "",
  clabe: "",
  accountNumber: "",
  bankCode: "",
  instructionsEs: "",
  instructionsEn: "",
  expiresAfterDays: 3,
  isEnabled: true,
};

export function AdminTransfersPage() {
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const transfers = useAppSelector((state) => state.admin.transfers);
  const pagination = useAppSelector((state) => state.admin.transfersPagination);
  const settings = useAppSelector((state) => state.admin.bankTransferSettings);
  const loading = useAppSelector((state) => state.admin.listLoading);
  const saving = useAppSelector((state) => state.admin.saving);
  const error = useAppSelector((state) => state.admin.error);
  const role = useAppSelector((state) => state.adminAuth.admin?.role);
  const canManage = role === "owner" || role === "finance" || role === "coordinator";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("processing");
  const [query, setQuery] = useState<AdminListQuery>({
    page: 1,
    limit: 25,
    sortBy: "createdAt",
    sortDir: "DESC",
    status: "processing",
  });
  const [form, setForm] = useState<BankTransferSettings>(emptySettings);
  const [saved, setSaved] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const locale = i18n.language?.startsWith("en") ? "en-US" : "es-MX";

  useEffect(() => {
    if (!canManage) return;
    void dispatch(fetchTransfers(query));
  }, [canManage, dispatch, query]);

  useEffect(() => {
    if (!canManage) return;
    void dispatch(fetchBankTransferSettings());
  }, [canManage, dispatch]);

  useEffect(() => {
    if (settings) setForm({ ...settings, accountNumber: settings.accountNumber || "", bankCode: settings.bankCode || "" });
  }, [settings]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery((current) => ({
        ...current,
        page: 1,
        search: search.trim() || undefined,
        status,
      }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, status]);

  const columns = useMemo<DataGridColumn<TransferRow>[]>(
    () => [
      {
        key: "courseTitle",
        label: t("admin.courses"),
        sortable: true,
        wrap: true,
        render: (row) => (
          <div className="min-w-0">
            <p className="font-semibold break-words">{row.courseTitle || "—"}</p>
            <p className="text-sm text-muted-foreground break-words">
              {row.firstName} {row.lastName} · {row.email}
            </p>
          </div>
        ),
      },
      {
        key: "reference",
        label: t("admin.transferReference"),
        sortable: true,
        wrap: true,
        render: (row) => <span className="font-mono text-sm break-all">{row.reference || "—"}</span>,
      },
      {
        key: "amountCents",
        label: t("admin.price"),
        sortable: true,
        shrink: true,
        render: (row) => formatMoney(row.amountCents, row.currency),
      },
      {
        key: "transferExpiresAt",
        label: t("admin.transferExpires"),
        sortable: true,
        shrink: true,
        render: (row) =>
          row.expiresAt
            ? new Date(row.expiresAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
            : "—",
      },
      {
        key: "status",
        label: t("admin.status"),
        sortable: true,
        shrink: true,
      },
      {
        key: "actions",
        label: t("admin.actions"),
        shrink: true,
        render: (row) =>
          row.status === "processing" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={saving || busyId === row.id}
                onClick={() => {
                  setBusyId(row.id);
                  void dispatch(confirmTransfer(row.id)).then((result) => {
                    setBusyId(null);
                    if (confirmTransfer.fulfilled.match(result)) void dispatch(fetchTransfers(query));
                  });
                }}
              >
                {t("admin.transferConfirm")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving || busyId === row.id}
                onClick={() => {
                  const reason = window.prompt(t("admin.transferRejectPrompt")) || undefined;
                  setBusyId(row.id);
                  void dispatch(rejectTransfer({ paymentId: row.id, reason })).then((result) => {
                    setBusyId(null);
                    if (rejectTransfer.fulfilled.match(result)) void dispatch(fetchTransfers(query));
                  });
                }}
              >
                {t("admin.transferReject")}
              </Button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              {row.confirmedByName || row.rejectReason || "—"}
            </span>
          ),
      },
    ],
    [busyId, dispatch, locale, query, saving, t],
  );

  if (!canManage) {
    return (
      <AdminSection>
        <AdminPageHeader title={t("admin.transfers")} description={t("admin.transfersForbidden")} />
      </AdminSection>
    );
  }

  return (
    <AdminSection>
      <AdminPageHeader title={t("admin.transfers")} description={t("admin.transfersBody")} />
      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      <div className="mb-4 flex max-w-full flex-wrap items-center gap-2">
        <div className="flex min-w-0 max-w-md flex-1 items-center gap-2 rounded-xl border border-border bg-paper px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.searchTransfers")}
            className="min-w-0 border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
        </div>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-11 rounded-xl border border-border bg-paper px-3 text-sm"
        >
          <option value="processing">{t("admin.transferStatusProcessing")}</option>
          <option value="succeeded">{t("admin.transferStatusSucceeded")}</option>
          <option value="failed">{t("admin.transferStatusFailed")}</option>
          <option value="all">{t("admin.transferStatusAll")}</option>
        </select>
      </div>

      <div className="rounded-2xl border border-border bg-paper p-2 sm:p-4">
        <DataGrid
          data={transfers}
          columns={columns}
          rowKey={(row) => row.id}
          sortBy={query.sortBy}
          sortDir={query.sortDir}
          onSort={(key) =>
            setQuery((current) => ({
              ...current,
              page: 1,
              sortBy: key,
              sortDir: current.sortBy === key && current.sortDir === "ASC" ? "DESC" : "ASC",
            }))
          }
          pagination={pagination}
          onPageChange={(page) => setQuery((current) => ({ ...current, page }))}
          isLoading={loading}
          emptyMessage={t("admin.emptyTransfers")}
          noBleeding
          mobileCard={(row) => (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="font-semibold break-words">{row.courseTitle || "—"}</p>
              <p className="mt-1 text-sm text-muted-foreground break-words">
                {row.firstName} {row.lastName} · {row.email}
              </p>
              <p className="mt-2 font-mono text-xs break-all">{row.reference}</p>
              <p className="mt-2 text-sm font-semibold">{formatMoney(row.amountCents, row.currency)}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">{row.status}</p>
              {row.status === "processing" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={saving || busyId === row.id}
                    onClick={() => {
                      setBusyId(row.id);
                      void dispatch(confirmTransfer(row.id)).then((result) => {
                        setBusyId(null);
                        if (confirmTransfer.fulfilled.match(result)) void dispatch(fetchTransfers(query));
                      });
                    }}
                  >
                    {t("admin.transferConfirm")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={saving || busyId === row.id}
                    onClick={() => {
                      const reason = window.prompt(t("admin.transferRejectPrompt")) || undefined;
                      setBusyId(row.id);
                      void dispatch(rejectTransfer({ paymentId: row.id, reason })).then((result) => {
                        setBusyId(null);
                        if (rejectTransfer.fulfilled.match(result)) void dispatch(fetchTransfers(query));
                      });
                    }}
                  >
                    {t("admin.transferReject")}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        />
      </div>

      <div className="mt-10 rounded-2xl border border-border bg-paper p-5 sm:p-6">
        <h2 className="font-display text-2xl font-semibold tracking-tight">{t("admin.bankSettingsTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("admin.bankSettingsBody")}</p>
        <form
          className="mt-6 grid max-w-3xl gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setSaved(false);
            void dispatch(
              saveBankTransferSettings({
                ...form,
                accountNumber: form.accountNumber || null,
                bankCode: form.bankCode || null,
                instructionsEs: form.instructionsEs || null,
                instructionsEn: form.instructionsEn || null,
              }),
            ).then((result) => {
              if (saveBankTransferSettings.fulfilled.match(result)) setSaved(true);
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bankName">{t("admin.bankName")}</Label>
              <Input
                id="bankName"
                value={form.bankName}
                onChange={(event) => setForm((current) => ({ ...current, bankName: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountHolder">{t("admin.bankHolder")}</Label>
              <Input
                id="accountHolder"
                value={form.accountHolder}
                onChange={(event) => setForm((current) => ({ ...current, accountHolder: event.target.value }))}
                required
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="clabe">{t("admin.bankClabe")}</Label>
              <Input
                id="clabe"
                value={form.clabe}
                inputMode="numeric"
                pattern="\d{18}"
                maxLength={18}
                onChange={(event) => setForm((current) => ({ ...current, clabe: event.target.value.replace(/\D/g, "").slice(0, 18) }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountNumber">{t("admin.bankAccount")}</Label>
              <Input
                id="accountNumber"
                value={form.accountNumber || ""}
                onChange={(event) => setForm((current) => ({ ...current, accountNumber: event.target.value }))}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bankCode">{t("admin.bankCode")}</Label>
              <Input
                id="bankCode"
                value={form.bankCode || ""}
                onChange={(event) => setForm((current) => ({ ...current, bankCode: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiresAfterDays">{t("admin.bankExpiresDays")}</Label>
              <Input
                id="expiresAfterDays"
                type="number"
                min={1}
                max={30}
                value={form.expiresAfterDays}
                onChange={(event) =>
                  setForm((current) => ({ ...current, expiresAfterDays: Number(event.target.value) || 3 }))
                }
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="instructionsEs">{t("admin.bankInstructionsEs")}</Label>
            <Textarea
              id="instructionsEs"
              className="min-h-[100px]"
              value={form.instructionsEs || ""}
              onChange={(event) => setForm((current) => ({ ...current, instructionsEs: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="instructionsEn">{t("admin.bankInstructionsEn")}</Label>
            <Textarea
              id="instructionsEn"
              className="min-h-[100px]"
              value={form.instructionsEn || ""}
              onChange={(event) => setForm((current) => ({ ...current, instructionsEn: event.target.value }))}
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isEnabled}
              onChange={(event) => setForm((current) => ({ ...current, isEnabled: event.target.checked }))}
            />
            {t("admin.bankEnabled")}
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? t("common.loading") : t("common.save")}
            </Button>
            {saved ? <span className="text-sm text-primary">{t("admin.bankSaved")}</span> : null}
          </div>
        </form>
      </div>
    </AdminSection>
  );
}
