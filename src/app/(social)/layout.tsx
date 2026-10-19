import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

/** Auth/cookies + public Supabase reads — allow request-time rendering under Cache Components. */
export const instant = false;

export default function SocialLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-canvas">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          {SITE_NAME}
        </Link>
        <nav className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
          <Link href="/explore" className="hover:text-foreground">
            Explore
          </Link>
          <Link href="/following" className="hover:text-foreground">
            Following
          </Link>
          <Link href="/boards" className="hover:text-foreground">
            Boards
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
