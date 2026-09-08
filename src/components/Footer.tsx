import { SITE } from "@/lib/site";

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
        <span>original data CC BY 4.0 · source licences apply · code MIT</span>
      </div>
    </footer>
  );
}
