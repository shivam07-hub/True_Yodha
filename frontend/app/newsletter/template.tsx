// Re-mounts on every navigation within /newsletter/* (list ⇆ issue), replaying
// the fade+rise on the content region. Top-nav/footer live in layout.tsx and
// stay persistent — only this content wrapper animates. Mechanism mirrors
// Vercel/Supabase docs: persistent shell + CSS fade on content mount.
// Reduced-motion is handled by .nl-fade-up in globals.css.
export default function NewsletterTemplate({ children }: { children: React.ReactNode }) {
  return <div className="nl-fade-up">{children}</div>
}