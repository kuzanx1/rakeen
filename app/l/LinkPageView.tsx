import type { CSSProperties, ReactNode } from "react";
import {
  FONTS, LINK_TYPES, announceHref, menuHref, onColor, price, resolveHref, shortHref,
  type LinkBiz, type LinkItem, type LinkPageConfig, type MenuCard,
} from "@/lib/links/model";
import { Icon, type IconName } from "./icons";

// «روابطك» -- الصفحة نفسها. بلا hooks: تُرسم في الخادم للزبون، وفي
// المتصفح لمعاينة لوحة التحكم، من نفس الكود. والتتبّع (زيارة/ضغطة) وزر
// المشاركة في HitTracker عبر data-lid / data-share، لا هنا.

type Ready = LinkItem & { href: string };

/** الظاهر فقط: العنوان يحتاج نص، والزر يحتاج رابط مكتمل. */
function ready(items: LinkItem[], biz: LinkBiz): Ready[] {
  return items
    .filter((i) => i.on)
    .map((i) => ({ ...i, href: resolveHref(i, biz) }))
    .filter((i) => (i.type === "heading" ? !!i.label.trim() : !!i.href))
    // عنوان بلا روابط تحته (كلها مخفية أو ناقصة) ما يطلع.
    .filter((i, k, a) => i.type !== "heading" || (k + 1 < a.length && a[k + 1].type !== "heading"));
}
function ext(href: string) {
  return /^https?:/.test(href) ? { target: "_blank", rel: "noopener noreferrer" } : {};
}
const label = (i: LinkItem) => i.label || LINK_TYPES[i.type].label;
const iconOf = (i: LinkItem): IconName => (i.icon || i.type) as IconName;

function Avatar({ src, name, className }: { src: string | null; name: string; className: string }) {
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className={className} src={src} alt={name} />
    : <span className={className + " lk-av-txt"}>{name.trim().slice(0, 1) || "★"}</span>;
}

function Socials({ items, className = "", size = 22 }: { items: Ready[]; className?: string; size?: number }) {
  if (!items.length) return null;
  return (
    <nav className={"lk-socials " + className} aria-label="حساباتنا">
      {items.map((s) => (
        <a key={s.id} href={s.href} data-lid={s.id} aria-label={label(s)} {...ext(s.href)}>
          <Icon name={iconOf(s)} size={size} />
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

function Share({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <button type="button" className="lk-share" data-share aria-label="شارك الصفحة">
      <Icon name="share" size={18} />
    </button>
  );
}

function Announce({ cfg, biz, className = "" }: { cfg: LinkPageConfig; biz: LinkBiz; className?: string }) {
  const a = cfg.announce;
  if (!a.on || !a.text.trim()) return null;
  const href = a.link ? announceHref(a.link, biz) : "";
  const inner = (
    <>
      <span className="lk-ann-dot" aria-hidden />
      <span className="lk-ann-txt">{a.text}</span>
      {href && <Icon name="chev" size={14} className="lk-ann-go" />}
    </>
  );
  return href
    ? <a className={"lk-ann " + className} href={href} data-lid="ann" {...ext(href)}>{inner}</a>
    : <div className={"lk-ann " + className}>{inner}</div>;
}

/** أصناف من المنيو: بطاقات تنسحب يمين ويسار، وكل وحدة تفتح الصنف في المتجر. */
function MenuStrip({ cfg, biz, at }: { cfg: LinkPageConfig; biz: LinkBiz; at: "top" | "bottom" }) {
  const m = cfg.menu;
  if (!m.on || m.at !== at || !biz.menu?.length) return null;
  const byId = new Map(biz.menu.map((x) => [String(x.id), x]));
  const items = m.items.map((id) => byId.get(id)).filter(Boolean) as MenuCard[];
  if (!items.length) return null;
  const store = menuHref(0, biz) ? biz.slug : "";
  return (
    <section className="lk-menu">
      <div className="lk-menu-head">
        <h2>{m.title}</h2>
        {store && <a href={`https://${store}.rakeenapp.com/`} data-lid="menu" target="_blank" rel="noopener noreferrer">المنيو كامل</a>}
      </div>
      <div className="lk-menu-row">
        {items.map((d) => {
          const href = menuHref(d.id, biz);
          const body = (
            <>
              <span className="lk-dish-img" style={d.image ? { backgroundImage: `url("${d.image}")` } : undefined}>
                {!d.image && <Icon name="utensils" size={26} />}
              </span>
              <span className="lk-dish-txt">
                <b>{d.name}</b>
                {m.price && <small dir="rtl">{price(d.price)}</small>}
              </span>
            </>
          );
          return href
            ? <a key={d.id} className="lk-dish" href={href} data-lid={"m" + d.id} {...ext(href)}>{body}</a>
            : <div key={d.id} className="lk-dish">{body}</div>;
        })}
      </div>
    </section>
  );
}

function Grain({ on }: { on: boolean }) {
  return on ? <div className="lk-grain" aria-hidden /> : null;
}

function Ornament() {
  return (
    <div className="lk-orn" aria-hidden>
      <i /><svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 0L10 5L5 10L0 5z" fill="currentColor" /></svg><i />
    </div>
  );
}

/** أزرار «مخملي» و«غلاف»: نص في الوسط، والأيقونة اختيارية على الطرف. */
function Buttons({ links, icons }: { links: Ready[]; icons: boolean }) {
  return (
    <div className="lk-btns">
      {links.map((l, i) => l.type === "heading" ? (
        <h3 key={l.id} className="lk-sec">{l.label}</h3>
      ) : (
        <a key={l.id} href={l.href} data-lid={l.id} className={"lk-btn" + (l.star ? " star" : "") + (icons ? " has-ic" : "")}
          style={{ animationDelay: `${120 + i * 60}ms` }} {...ext(l.href)}>
          {icons && <span className="lk-btn-ic"><Icon name={iconOf(l)} size={19} /></span>}
          <span>{label(l)}</span>
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
      <Grain on={o.grain} />
      <Share on={cfg.share} />
      <main className="lk-v-body">
        <Announce cfg={cfg} biz={biz} />
        {o.socialsAt === "top" && <Socials items={socials} className="lk-v-top" />}
        {o.avatar !== "none" && <Avatar src={avatar} name={cfg.name} className={"lk-v-av lk-v-av-" + o.avatar} />}
        <h1 className="lk-v-name">{cfg.name}</h1>
        <Ornament />
        {cfg.bio && <p className="lk-v-bio">{cfg.bio}</p>}
        <MenuStrip cfg={cfg} biz={biz} at="top" />
        <Buttons links={links} icons={cfg.icons} />
        <MenuStrip cfg={cfg} biz={biz} at="bottom" />
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
      <Share on={cfg.share} />
      <main className="lk-c-body">
        <Avatar src={avatar} name={cfg.name} className={"lk-c-av lk-c-av-" + o.avatar} />
        <h1 className="lk-c-name">{cfg.name}</h1>
        {cfg.bio && <p className="lk-c-bio">{cfg.bio}</p>}
        {o.rule && <i className="lk-c-rule" />}
        <Announce cfg={cfg} biz={biz} />
        <MenuStrip cfg={cfg} biz={biz} at="top" />
        <Buttons links={links} icons={cfg.icons} />
        <MenuStrip cfg={cfg} biz={biz} at="bottom" />
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
  // العناوين تقسم الروابط لمجموعات، كل مجموعة بعنوانها.
  const groups: { title: string; items: Ready[] }[] = [];
  links.forEach((l) => {
    if (l.type === "heading") groups.push({ title: l.label, items: [] });
    else {
      if (!groups.length) groups.push({ title: "روابطنا", items: [] });
      groups[groups.length - 1].items.push(l);
    }
  });
  return (
    <div className="lk lk-bold" data-rows={o.rows} data-photo={o.photo ? "1" : "0"} style={vars}>
      <Announce cfg={cfg} biz={biz} className="bar" />
      <header className="lk-b-hero">
        <div className="lk-b-top">
          <Avatar src={avatar} name={cfg.name} className="lk-b-av" />
          <Share on={cfg.share} />
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
        <MenuStrip cfg={cfg} biz={biz} at="top" />
        {groups.filter((g) => g.items.length).map((g, gi) => (
          <section key={gi}>
            <h2>{g.title}</h2>
            <div className="lk-b-rows">
              {g.items.map((l, i) => (
                <a key={l.id} href={l.href} data-lid={l.id} className="lk-b-row" style={{ animationDelay: `${100 + i * 60}ms` }} {...ext(l.href)}>
                  <span className="lk-b-ic"><Icon name={iconOf(l)} size={22} /></span>
                  <span className="lk-b-lbl"><b>{label(l)}</b><small>{l.note || shortHref(l.href)}</small></span>
                  {l.star && <em>مميز</em>}
                  <span className="lk-b-go"><Icon name="arrow" size={16} /></span>
                </a>
              ))}
            </div>
          </section>
        ))}
        <MenuStrip cfg={cfg} biz={biz} at="bottom" />
        <Footer />
        {cta && <div className="lk-b-cta-space" />}
      </main>
      {cta && (
        <a className="lk-b-cta" href={cta.href} data-lid="cta" {...ext(cta.href)}>{cta.label}</a>
      )}
    </div>
  );
}

/** «عاجي»: ورق أوف وايت وإطار رفيع، والروابط مثل صفحة منيو راقية. */
function Ivory({ cfg, biz, links, socials }: Parts) {
  const o = cfg.opts.ivory;
  const avatar = cfg.avatar || biz.logo;
  const vars = {
    "--lk-paper": o.paper, "--lk-ink": o.ink, "--lk-accent": o.accent, "--lk-on-accent": onColor(o.accent),
    "--lk-font": FONTS[o.font].family,
  } as CSSProperties;
  return (
    <div className="lk lk-ivory" data-frame={o.frame} data-rows={o.rows} style={vars}>
      <Grain on={o.texture} />
      {o.frame !== "none" && <div className="lk-i-frame" aria-hidden />}
      <Share on={cfg.share} />
      <main className="lk-i-body">
        <Announce cfg={cfg} biz={biz} />
        {o.mark === "logo" && <Avatar src={avatar} name={cfg.name} className="lk-i-logo" />}
        {o.mark === "monogram" && <span className="lk-i-mono" aria-hidden>{cfg.name.trim().slice(0, 1)}</span>}
        <h1 className="lk-i-name">{cfg.name}</h1>
        {o.ornament && <Ornament />}
        {cfg.bio && <p className="lk-i-bio">{cfg.bio}</p>}
        <MenuStrip cfg={cfg} biz={biz} at="top" />
        <nav className="lk-i-list">
          {links.map((l, i) => l.type === "heading" ? (
            <h3 key={l.id} className="lk-sec">{l.label}</h3>
          ) : (
            <a key={l.id} href={l.href} data-lid={l.id} className={"lk-i-row" + (l.star ? " star" : "")}
              style={{ animationDelay: `${120 + i * 60}ms` }} {...ext(l.href)}>
              {o.rows !== "center" && cfg.icons && <span className="lk-i-ic"><Icon name={iconOf(l)} size={20} stroke={1.4} /></span>}
              <span className="lk-i-lbl"><b>{label(l)}</b>{l.note && <small>{l.note}</small>}</span>
              {o.rows !== "center" && <span className="lk-i-go"><Icon name="chev" size={16} /></span>}
            </a>
          ))}
        </nav>
        <MenuStrip cfg={cfg} biz={biz} at="bottom" />
        {socials.length > 0 && <Socials items={socials} className="lk-i-soc" size={20} />}
        <Footer />
      </main>
    </div>
  );
}

/** «لؤلؤي»: أبيض نظيف، كل رابط بطاقة، وأيقونته في مربع بلون هويتك. */
function Pearl({ cfg, biz, links, socials }: Parts) {
  const o = cfg.opts.pearl;
  const avatar = cfg.avatar || biz.logo;
  const vars = {
    "--lk-bg": o.bg, "--lk-card": o.card, "--lk-ink": o.ink, "--lk-accent": o.accent, "--lk-on-accent": onColor(o.accent),
    "--lk-font": FONTS[o.font].family,
  } as CSSProperties;
  return (
    <div className="lk lk-pearl" data-cards={o.cards} data-corner={o.corner} data-tile={o.tile} data-cover={o.cover ? "1" : "0"} style={vars}>
      {o.glow && <div className="lk-p-glow" aria-hidden />}
      <Share on={cfg.share} />
      <main className="lk-p-body">
        {o.cover && <div className="lk-p-cover" style={{ backgroundImage: `url("${o.cover}")` }} />}
        <Avatar src={avatar} name={cfg.name} className="lk-p-av" />
        <h1 className="lk-p-name">{cfg.name}</h1>
        {cfg.bio && <p className="lk-p-bio">{cfg.bio}</p>}
        {cfg.badge && <span className="lk-p-badge"><i />{cfg.badge}</span>}
        <Socials items={socials} className="lk-p-soc" size={19} />
        <Announce cfg={cfg} biz={biz} />
        <MenuStrip cfg={cfg} biz={biz} at="top" />
        <nav className="lk-p-list">
          {links.map((l, i) => l.type === "heading" ? (
            <h3 key={l.id} className="lk-sec">{l.label}</h3>
          ) : (
            <a key={l.id} href={l.href} data-lid={l.id} className={"lk-p-card" + (l.star ? " star" : "")}
              style={{ animationDelay: `${120 + i * 60}ms` }} {...ext(l.href)}>
              {o.tile !== "none" && <span className="lk-p-tile"><Icon name={iconOf(l)} size={21} /></span>}
              <span className="lk-p-lbl"><b>{label(l)}</b><small>{l.note || shortHref(l.href)}</small></span>
              <span className="lk-p-go"><Icon name="chev" size={18} /></span>
            </a>
          ))}
        </nav>
        <MenuStrip cfg={cfg} biz={biz} at="bottom" />
        <Footer />
      </main>
    </div>
  );
}

type Parts = { cfg: LinkPageConfig; biz: LinkBiz; links: Ready[]; socials: Ready[]; cta: { href: string; label: string } | null };

export default function LinkPageView({ cfg, biz }: { cfg: LinkPageConfig; biz: LinkBiz }): ReactNode {
  const links = ready(cfg.links, biz);
  const socials = ready(cfg.socials, biz).filter((s) => s.type !== "heading");
  const ctaHref = cfg.cta.on ? resolveHref(cfg.cta, biz) : "";
  const parts: Parts = { cfg, biz, links, socials, cta: ctaHref ? { href: ctaHref, label: cfg.cta.label } : null };
  switch (cfg.template) {
    case "cover": return <Cover {...parts} />;
    case "bold": return <Bold {...parts} />;
    case "ivory": return <Ivory {...parts} />;
    case "pearl": return <Pearl {...parts} />;
    default: return <Velvet {...parts} />;
  }
}
