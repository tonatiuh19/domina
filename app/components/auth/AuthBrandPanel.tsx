import { useEffect, useState, type ReactNode } from "react";
import { Quote, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

export interface AuthStat {
  value: string;
  label: string;
  icon: LucideIcon;
}

export interface AuthTestimonial {
  quote: string;
  name: string;
  detail: string;
  initial: string;
}

/** Full-bleed brand panel — cinematic workshop atmosphere, not a sports clone. */
export function AuthBrandPanel({
  headline,
  subheadline,
  stats,
  testimonials,
  footerNote,
  imageUrl,
}: {
  headline: ReactNode;
  subheadline: string;
  stats: AuthStat[];
  testimonials: AuthTestimonial[];
  footerNote?: string;
  imageUrl: string;
}) {
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    if (testimonials.length < 2) return;
    const id = window.setInterval(() => {
      setQuoteIndex((i) => (i + 1) % testimonials.length);
    }, 6500);
    return () => window.clearInterval(id);
  }, [testimonials.length]);

  const testimonial = testimonials[quoteIndex] || testimonials[0];

  return (
    <aside className="relative hidden min-h-0 flex-1 overflow-hidden lg:flex">
      <img
        src={imageUrl}
        alt=""
        className="absolute inset-0 h-full w-full scale-105 object-cover motion-safe:animate-[domina-kenburns_28s_ease-in-out_infinite_alternate]"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-ink via-ink/75 to-ink/40" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/50 to-transparent" />
      <div
        className="absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(ellipse 55% 40% at 20% 15%, rgba(159,198,91,0.28), transparent 55%), radial-gradient(ellipse 40% 35% at 90% 85%, rgba(214,242,92,0.12), transparent 50%)",
        }}
      />

      <div className="relative z-10 flex h-full w-full flex-col justify-between p-10 xl:p-12">
        <Link to="/" className="font-display text-2xl font-semibold tracking-tight text-paper transition hover:text-citrus">
          DOMINA
        </Link>

        <div className="max-w-lg space-y-8">
          <div className="space-y-4">
            <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-paper xl:text-5xl">
              {headline}
            </h1>
            <p className="max-w-md text-base leading-7 text-paper/65">{subheadline}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {stats.map(({ value, label, icon: Icon }) => (
              <div
                key={label}
                className="rounded-2xl border border-white/10 bg-white/5 px-3 py-4 text-center backdrop-blur-md transition hover:border-citrus/35"
              >
                <Icon className="mx-auto mb-2 h-4 w-4 text-citrus" aria-hidden />
                <p className="font-display text-xl font-semibold text-paper">{value}</p>
                <p className="mt-1 text-[10px] uppercase leading-tight tracking-[0.12em] text-paper/50">{label}</p>
              </div>
            ))}
          </div>

          {testimonial ? (
            <div
              key={quoteIndex}
              className="max-w-lg rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md motion-safe:animate-[domina-fade-up_0.45s_ease-out]"
            >
              <Quote className="mb-3 h-5 w-5 text-citrus/80" aria-hidden />
              <p className="text-sm italic leading-relaxed text-paper/85">“{testimonial.quote}”</p>
              <div className="mt-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-citrus font-display text-sm font-semibold text-ink">
                  {testimonial.initial}
                </div>
                <div>
                  <p className="text-sm font-semibold text-paper">{testimonial.name}</p>
                  <p className="text-[11px] text-paper/45">{testimonial.detail}</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {footerNote ? <p className="text-[11px] text-paper/35">{footerNote}</p> : <span />}
      </div>
    </aside>
  );
}
