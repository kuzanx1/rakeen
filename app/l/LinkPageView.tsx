import type { CSSProperties, ReactNode } from "react";
import {
  FONTS, LINK_TYPES, resolveHref, shortHref, onColor,
  type LinkBiz, type LinkItem, type LinkPageConfig,
} from "@/lib/links/model";
import { Icon } from "./icons";

// «روابطك» -- الصفحة نفسها. بلا hooks: تُرسم في الخادم للزبون، وفي
// المتصفح لمعاينة لوحة التحكم، من نفس الكود. والتتبّع (زيارة/ضغطة) في
// HitTracker عبر data-lid، لا هنا.

type Ready = LinkItem & { href: string };

function ready(items: LinkItem[], biz: LinkBiz): Ready[] {
  return items.filter((i) => i.on).map((i) => ({ ...i, href: resolveHref(i, biz) })).filter((i) => i.href);
}
function ext(href: string) {
  return /^https?:/.test(href) ? { target: "_blank", rel: "noopener noreferrer" } : {};
}
const label = (i: LinkItem) => i.label || LINK_TYPES[i.type].label;

function Avatar({ src, name, className }: { src: string | null; name: string; className: string }) {
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className={className} src={src} alt={name} />
    : <span className={className + " lk-av-txt"}>{name.trim().slice(0, 1) || "★"}</span>;
}

function Socials({ items, className = "" }: { items: Ready[]; className?: string }) {
  if (!items.length) return null;
  return (
    <nav className={"lk-socials " + className} aria-label="حساباتنا">
      {items.map((s) => (
        <a key={s.id} href={s.href} data-lid={s.id} aria-label={label(s)} {...ext(s.href)}>
          <Icon name={s.type} size={22} />
        </a>
      ))}
    </nav>
  );
}

function Footer() {
  return (
    <a className="lk-foot" href="https://rakeenapp.com" target="_blank" rel="noopener">
      صفحة روابط من <b>ركين</b>
    </a>
  );
}

function Buttons({ links }: { links: Ready[] }) {
  return (
    <div className="lk-btns">
      {links.map((l, i) => (
        <a key={l.id} href={l.href} data-lid={l.id} className={"lk-btn" + (l.star ? " star" : "")}
          style={{ animationDelay: `${120 + i * 60}ms` }} {...ext(l.href)}>
          {label(l)}
        </a>
      ))}
    </div>
  );
}

function Velvet({ cfg, biz, links, socials }: Parts) {
  const o = cfg.opts.velvet;
  const avatar = cfg.avatar || biz.logo;
  const vars = {
    "--lk-ink": o.ink, "--lk-accent": o.accent, "--lk-on-accent": onColor(o.accent),
    "--lk-tint": o.tint, "--lk-overlay": String(o.overlay / 100), "--lk-blur": `${o.blur}px`,
    "--lk-bg": o.bgColor, "--lk-font": FONTS[o.font].family,
  } as CSSProperties;
  return (
    <div className="lk lk-velvet" data-btn={o.btn} data-corner={o.corner} style={vars}>
      <div className="lk-v-bg" style={o.bg ? { backgroundImage: `url("${o.bg}")` } : undefined} />
      <div className="lk-v-veil" />
      <main className="lk-v-body">
        {o.socialsAt === "top" && <Socials items={socials} className="lk-v-top" />}
        {o.avatar !== "none" && <Avatar src={avatar} name={cfg.name} className={"lk-v-av lk-v-av-" + o.avatar} />}
        <h1 className="lk-v-name">{cfg.name}</h1>
        {cfg.bio && <p className="lk-v-bio">{cfg.bio}</p>}
        <Buttons links={links} />
        {o.socialsAt === "bottom" && socials.length > 0 && (
          <div className="lk-v-contact">
            <span>تواصل معنا</span>
            <i />
            <Socials items={socials} />
          </div>
        )}
        <Footer />
      </main>
    </div>
  );
}

function Cover({ cfg, biz, links, socials }: Parts) {
  const o = cfg.opts.cover;
  const avatar = cfg.avatar || biz.logo;
  const vars = {
    "--lk-ink": o.ink, "--lk-accent": o.accent, "--lk-on-accent": onColor(o.accent), "--lk-panel": o.panel,
    "--lk-ring": o.ring, "--lk-font": FONTS[o.font].family,
  } as CSSProperties;
  return (
    <div className="lk lk-cover" data-btn={o.btn} data-corner={o.corner} data-h={o.coverH} data-fade={o.fade ? "1" : "0"} style={vars}>
      <div className="lk-c-cover" style={o.cover ? { backgroundImage: `url("${o.cover}")` } : undefined} />
      <main className="lk-c-body">
        <Avatar src={avatar} name={cfg.name} className={"lk-c-av lk-c-av-" + o.avatar} />
        <h1 className="lk-c-name">{cfg.name}</h1>
        {cfg.bio && <p className="lk-c-bio">{cfg.bio}</p>}
        {o.rule && <i className="lk-c-rule" />}
        <Buttons links={links} />
        <Socials items={socials} />
        <Footer />
      </main>
    </div>
  );
}

function BigName({ name }: { name: string }) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const lines = words.length <= 1 ? [name] : words.length === 2 ? words : [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")];
  return <h1 className="lk-b-name">{lines.map((l, i) => <span key={i}>{l}</span>)}</h1>;
}

function Bold({ cfg, biz, links, socials, cta }: Parts) {
  const o = cfg.opts.bold;
  const avatar = cfg.avatar || biz.logo;
  const vars = {
    "--lk-hero": o.hero, "--lk-hero-ink": o.heroInk, "--lk-panel": o.panel, "--lk-ink": o.ink,
    "--lk-accent": o.accent, "--lk-on-accent": onColor(o.accent), "--lk-tile": o.tile, "--lk-tile-ink": o.tileInk,
    "--lk-font": FONTS[o.font].family,
  } as CSSProperties;
  const stats = cfg.stats.filter((s) => s.value.trim() || s.label.trim());
  return (
    <div className="lk lk-bold" data-rows={o.rows} data-photo={o.photo ? "1" : "0"} style={vars}>
      <header className="lk-b-hero">
        <div className="lk-b-top">
          <Avatar src={avatar} name={cfg.name} className="lk-b-av" />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {o.photo && <img className="lk-b-photo" src={o.photo} alt="" />}
        <div className="lk-b-txt">
          <BigName name={cfg.name} />
          {cfg.bio && <p className="lk-b-bio">{cfg.bio}</p>}
          <div className="lk-b-chips">
            {cfg.badge && <span className="lk-b-badge">{cfg.badge}</span>}
            <Socials items={socials} className="lk-b-soc" />
          </div>
        </div>
      </header>
      <main className="lk-b-panel">
        {o.showStats && stats.length > 0 && (
          <section>
            <h2>أرقامنا</h2>
            <div className="lk-b-tiles">
              {stats.map((s, i) => (
                <div key={i} className="lk-b-tile"><b>{s.value}</b><i /><span>{s.label}</span></div>
              ))}
            </div>
          </section>
        )}
        {links.length > 0 && (
          <section>
            <h2>روابطنا</h2>
            <div className="lk-b-rows">
              {links.map((l, i) => (
                <a key={l.id} href={l.href} data-lid={l.id} className="lk-b-row" style={{ animationDelay: `${100 + i * 60}ms` }} {...ext(l.href)}>
                  <span className="lk-b-ic"><Icon name={l.type} size={22} /></span>
                  <span className="lk-b-lbl"><b>{label(l)}</b><small>{l.note || shortHref(l.href)}</small></span>
                  {l.star && <em>مميز</em>}
                  <span className="lk-b-go"><Icon name="arrow" size={16} /></span>
                </a>
              ))}
            </div>
          </section>
        )}
        <Footer />
        {cta && <div className="lk-b-cta-space" />}
      </main>
      {cta && (
        <a className="lk-b-cta" href={cta.href} data-lid="cta" {...ext(cta.href)}>{cta.label}</a>
      )}
    </div>
  );
}

type Parts = { cfg: LinkPageConfig; biz: LinkBiz; links: Ready[]; socials: Ready[]; cta: { href: string; label: string } | null };

export default function LinkPageView({ cfg, biz }: { cfg: LinkPageConfig; biz: LinkBiz }): ReactNode {
  const links = ready(cfg.links, biz);
  const socials = ready(cfg.socials, biz);
  const ctaHref = cfg.cta.on ? resolveHref(cfg.cta, biz) : "";
  const parts: Parts = { cfg, biz, links, socials, cta: ctaHref ? { href: ctaHref, label: cfg.cta.label } : null };
  if (cfg.template === "cover") return <Cover {...parts} />;
  if (cfg.template === "bold") return <Bold {...parts} />;
  return <Velvet {...parts} />;
}
