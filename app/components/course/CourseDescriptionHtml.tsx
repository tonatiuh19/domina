import DOMPurify from "isomorphic-dompurify";
import { cn } from "@/lib/utils";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
  "span",
];

const ALLOWED_ATTR = ["href", "target", "rel", "class"];

export function sanitizeCourseDescription(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}

export function CourseDescriptionHtml({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const clean = sanitizeCourseDescription(html);
  if (!clean || clean === "<p></p>") return null;
  return (
    <div
      className={cn(
        "domina-course-rich min-w-0 max-w-none overflow-x-auto break-words text-base leading-7 text-foreground",
        "[&_a]:break-all [&_a]:font-semibold [&_a]:text-primary [&_blockquote]:border-l-2 [&_blockquote]:border-citrus [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground",
        "[&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight",
        "[&_h3]:mt-6 [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-semibold",
        "[&_li]:my-1 [&_p]:my-3 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_pre]:max-w-full [&_pre]:overflow-x-auto [&_img]:max-w-full [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
