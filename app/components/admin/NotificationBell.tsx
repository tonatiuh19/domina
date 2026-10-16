import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/store/slices/adminSlice";

export function NotificationBell() {
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const notifications = useAppSelector((state) => state.admin.notifications);
  const unread = useAppSelector((state) => state.admin.unreadNotifications);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const locale = i18n.language?.startsWith("en") ? "en-US" : "es-MX";

  useEffect(() => {
    void dispatch(fetchNotifications({ limit: 20 }));
    const timer = window.setInterval(() => {
      void dispatch(fetchNotifications({ limit: 20 }));
    }, 45_000);
    return () => window.clearInterval(timer);
  }, [dispatch]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-paper text-ink transition hover:bg-secondary"
        aria-label={t("admin.notifications")}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          id={panelId}
          className="absolute right-0 z-40 mt-2 w-[min(100vw-2rem,22rem)] max-w-[22rem] overflow-hidden rounded-2xl border border-border bg-paper shadow-[0_20px_50px_rgba(18,35,27,0.18)]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">{t("admin.notifications")}</p>
            {unread > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void dispatch(markAllNotificationsRead())}
              >
                {t("admin.notificationsMarkAll")}
              </Button>
            ) : null}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <li className="px-4 py-6 text-sm text-muted-foreground">{t("admin.notificationsEmpty")}</li>
            ) : (
              notifications.map((item) => (
                <li key={item.id} className={`border-b border-border last:border-0 ${item.readAt ? "" : "bg-citrus/10"}`}>
                  {item.linkPath ? (
                    <Link
                      to={item.linkPath}
                      className="block px-4 py-3 transition hover:bg-secondary/60"
                      onClick={() => {
                        if (!item.readAt) void dispatch(markNotificationRead(item.id));
                        setOpen(false);
                      }}
                    >
                      <p className="text-sm font-semibold break-words">{item.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground break-words">{item.body}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {new Date(item.createdAt).toLocaleString(locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="block w-full px-4 py-3 text-left transition hover:bg-secondary/60"
                      onClick={() => {
                        if (!item.readAt) void dispatch(markNotificationRead(item.id));
                      }}
                    >
                      <p className="text-sm font-semibold break-words">{item.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground break-words">{item.body}</p>
                    </button>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
