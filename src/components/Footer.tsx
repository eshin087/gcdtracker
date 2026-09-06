import { SITE } from "@/lib/site";
import { trapPath } from "@/lib/trap";

export function Footer() {
  return (
    <footer className="footer">
      <div className="shell row">
        <span>
          <strong style={{ color: "var(--ink)", fontWeight: 500 }}>{SITE.name}</strong> ·{" "}
          {SITE.tagline.toLowerCase()}
        </span>
        <a href={SITE.repo} rel="noopener">
          source on GitHub
        </a>
        <a href="/data">data &amp; API</a>
        <a href="/llms.txt">llms.txt</a>
        <span>exports CC BY 4.0 · code MIT</span>
        {/* Honeypot: hidden from people and assistive tech; disallowed in robots.txt. */}
        <a href={trapPath("footer")} rel="nofollow" aria-hidden="true" tabIndex={-1} className="offscreen-link">
          &nbsp;
        </a>
      </div>
    </footer>
  );
}
