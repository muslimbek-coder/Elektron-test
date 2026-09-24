# -*- coding: utf-8 -*-
import json, os, re, html

DOMAIN = "https://bilimler-dueli.vercel.app"
OUT = "/home/claude/build/out"

with open('/home/claude/grade_subject_data.json', encoding='utf-8') as f:
    data = json.load(f)  # {"1": {"Matematika":[[q,a],...], ...}, ...}

def unesc(s):
    return s.replace('\\"', '"').replace("\\'", "'")

def slugify(s):
    s = s.lower()
    repl = {
        "o'": "o", "ʻ": "", "’": "", "'": "",
        "sh": "sh", "ch": "ch", "g'": "g", "gʻ":"g",
    }
    s = s.replace("g'", "g").replace("gʻ", "g").replace("o'", "o").replace("oʻ","o")
    s = s.replace("'", "").replace("ʻ", "").replace("’","")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    return s

GRADE_LABEL = lambda g: f"{g}-sinf"

os.makedirs(OUT, exist_ok=True)

HEAD_COMMON = """<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#0a0c16">
<link rel="icon" href="{root}icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="{root}icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
"""

PAGE_CSS = """
<style>
  :root{--bg:#0a0c16;--panel:#161a2f;--panel2:#1d2240;--chalk:#f5f1e4;--chalk-dim:#c8c4b6;
  --p1:#ff7a3d;--p2:#21e6c1;--gold:#ffd166;--line:rgba(245,241,228,0.12);--radius:16px;
  --font-poster:'Bebas Neue',sans-serif;}
  *{box-sizing:border-box;}
  body{margin:0;background:radial-gradient(circle at 15% 10%, rgba(33,230,193,0.08), transparent 40%),radial-gradient(circle at 85% 90%, rgba(255,122,61,0.08), transparent 40%),var(--bg);
  color:var(--chalk);font-family:'Inter',sans-serif;line-height:1.6;}
  .wrap{max-width:880px;margin:0 auto;padding:28px 18px 64px;}
  nav.breadcrumb{font-size:13px;color:var(--chalk-dim);margin-bottom:18px;}
  nav.breadcrumb a{color:var(--p2);text-decoration:none;}
  nav.breadcrumb a:hover{text-decoration:underline;}
  h1{font-family:var(--font-poster);font-weight:400;font-size:clamp(30px,6vw,48px);letter-spacing:1px;margin:0 0 8px;text-transform:uppercase;}
  h1 span{color:var(--p2);}
  p.lead{color:var(--chalk-dim);font-size:16px;max-width:640px;}
  .cta{display:inline-block;margin:18px 0 30px;background:linear-gradient(90deg,var(--p1),var(--p2));color:#0a0c16;
  font-weight:700;text-decoration:none;padding:14px 26px;border-radius:12px;font-size:16px;}
  .cta:hover{filter:brightness(1.08);}
  h2{font-family:'Space Grotesk',sans-serif;font-size:20px;color:var(--p2);margin:34px 0 14px;}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;}
  .chip{display:block;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px;
  color:var(--chalk);text-decoration:none;font-size:14px;text-align:center;transition:border-color .2s,transform .2s;}
  .chip:hover{border-color:var(--p2);transform:translateY(-2px);}
  details{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:10px;}
  summary{cursor:pointer;font-weight:600;}
  .ans{margin-top:8px;color:var(--p2);font-weight:600;}
  footer{margin-top:50px;font-size:12px;color:var(--chalk-dim);}
  footer a{color:var(--p2);}
</style>
"""

def render_faq_jsonld(qas, subject, grade):
    items = []
    for q,a in qas[:10]:
        items.append({
            "@type": "Question",
            "name": html.unescape(q),
            "acceptedAnswer": {"@type": "Answer", "text": html.unescape(a)}
        })
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": items
    }

def page_shell(title, description, canonical, body, jsonld_list, root="../../"):
    jsonld_scripts = "\n".join(
        f'<script type="application/ld+json">{json.dumps(j, ensure_ascii=False)}</script>' for j in jsonld_list
    )
    return f"""<!DOCTYPE html>
<html lang="uz">
<head>
{HEAD_COMMON.format(root=root)}
<title>{title}</title>
<meta name="description" content="{description}">
<link rel="canonical" href="{canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:url" content="{canonical}">
<meta property="og:site_name" content="Elektron Test">
<meta property="og:locale" content="uz_UZ">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{description}">
{jsonld_scripts}
{PAGE_CSS}
</head>
<body>
<div class="wrap">
{body}
<footer>
  <p>© Elektron Test — <a href="{root}">Bosh sahifa</a> | <a href="{root}sinf/">Barcha sinflar</a></p>
</footer>
</div>
</body>
</html>"""

# ---------------- 1) /sinf/ hub ----------------
grades = sorted(data.keys(), key=lambda x: int(x))
chips = "\n".join(f'<a class="chip" href="./{g}/">{GRADE_LABEL(int(g))}</a>' for g in grades)
body = f"""
<nav class="breadcrumb"><a href="../">Bosh sahifa</a> / Sinflar</nav>
<h1>Barcha <span>sinflar</span> bo'yicha testlar</h1>
<p class="lead">1-sinfdan 11-sinfgacha bo'lgan barcha fanlar bo'yicha bepul test va viktorina savollari. O'z sinfingizni tanlang va bilimingizni sinab ko'ring.</p>
<h2>Sinfni tanlang</h2>
<div class="grid">
{chips}
</div>
"""
jsonld = [{
    "@context":"https://schema.org",
    "@type":"BreadcrumbList",
    "itemListElement":[
        {"@type":"ListItem","position":1,"name":"Bosh sahifa","item":DOMAIN+"/"},
        {"@type":"ListItem","position":2,"name":"Sinflar","item":DOMAIN+"/sinf/"}
    ]
}]
out_path = os.path.join(OUT, "sinf")
os.makedirs(out_path, exist_ok=True)
with open(os.path.join(out_path,"index.html"),"w",encoding="utf-8") as f:
    f.write(page_shell(
        "Barcha sinflar uchun test va savollar — Elektron Test",
        "1-11 sinflar bo'yicha barcha fanlardan bepul test savollari, viktorina va elektron testlari. Sinfingizni tanlang va boshlang.",
        f"{DOMAIN}/sinf/",
        body, jsonld, root="../"))

sitemap_urls = [f"{DOMAIN}/", f"{DOMAIN}/sinf/"]

# ---------------- 2) /sinf/{g}/ hub + 3) /sinf/{g}/{fan}/ pages ----------------
total_pages = 0
for g in grades:
    gi = int(g)
    subjects = data[g]
    subj_names = sorted(subjects.keys())
    gdir = os.path.join(OUT, "sinf", g)
    os.makedirs(gdir, exist_ok=True)

    subj_chips = "\n".join(
        f'<a class="chip" href="./{slugify(s)}/">{html.escape(s)}</a>' for s in subj_names
    )
    body = f"""
<nav class="breadcrumb"><a href="../../">Bosh sahifa</a> / <a href="../">Sinflar</a> / {GRADE_LABEL(gi)}</nav>
<h1>{GRADE_LABEL(gi)} <span>fanlari</span> bo'yicha testlar</h1>
<p class="lead">{GRADE_LABEL(gi)} o'quvchilari uchun {len(subj_names)} ta fandan bepul test savollari va viktorinalar. Fanni tanlang va bilimingizni sinang.</p>
<h2>Fanni tanlang</h2>
<div class="grid">
{subj_chips}
</div>
"""
    jsonld = [{
        "@context":"https://schema.org",
        "@type":"BreadcrumbList",
        "itemListElement":[
            {"@type":"ListItem","position":1,"name":"Bosh sahifa","item":DOMAIN+"/"},
            {"@type":"ListItem","position":2,"name":"Sinflar","item":DOMAIN+"/sinf/"},
            {"@type":"ListItem","position":3,"name":GRADE_LABEL(gi),"item":f"{DOMAIN}/sinf/{g}/"}
        ]
    }]
    with open(os.path.join(gdir, "index.html"), "w", encoding="utf-8") as f:
        f.write(page_shell(
            f"{GRADE_LABEL(gi)} uchun testlar — barcha fanlar | Elektron Test",
            f"{GRADE_LABEL(gi)} o'quvchilari uchun {len(subj_names)} fan bo'yicha bepul test va viktorina savollari. Fanni tanlang, testni bepul yeching.",
            f"{DOMAIN}/sinf/{g}/",
            body, jsonld, root="../../"
        ))
    sitemap_urls.append(f"{DOMAIN}/sinf/{g}/")

    for s in subj_names:
        slug = slugify(s)
        qas = subjects[s]
        sdir = os.path.join(gdir, slug)
        os.makedirs(sdir, exist_ok=True)

        sample = qas[:8]
        faq_html = "\n".join(
            f'<details><summary>{i+1}. {html.escape(unesc(q))}</summary><div class="ans">Javob: {html.escape(unesc(a))}</div></details>'
            for i,(q,a) in enumerate(sample)
        )
        other_subjects = [x for x in subj_names if x != s]
        other_links = "\n".join(
            f'<a class="chip" href="../{slugify(x)}/">{html.escape(x)}</a>' for x in other_subjects[:8]
        )
        cta_href = f"../../../?sinf={gi}&fan={html.escape(s, quote=True)}"
        body = f"""
<nav class="breadcrumb"><a href="../../../">Bosh sahifa</a> / <a href="../../">Sinflar</a> / <a href="../">{GRADE_LABEL(gi)}</a> / {html.escape(s)}</nav>
<h1>{GRADE_LABEL(gi)} <span>{html.escape(s)}</span> fanidan testlar</h1>
<p class="lead">{GRADE_LABEL(gi)} o'quvchilari uchun {html.escape(s)} fanidan {len(qas)} ta test savoli. Bilimingizni tekshiring, do'stlaringiz bilan elektron testiga chiqing yoki yakka tartibda mashq qiling — barchasi bepul.</p>
<a class="cta" href="{cta_href}">🎮 {html.escape(s)} testini boshlash</a>
<h2>Namuna savollar</h2>
{faq_html}
<h2>{GRADE_LABEL(gi)}dagi boshqa fanlar</h2>
<div class="grid">
{other_links}
</div>
"""
        jsonld = [
            {
                "@context":"https://schema.org",
                "@type":"BreadcrumbList",
                "itemListElement":[
                    {"@type":"ListItem","position":1,"name":"Bosh sahifa","item":DOMAIN+"/"},
                    {"@type":"ListItem","position":2,"name":"Sinflar","item":DOMAIN+"/sinf/"},
                    {"@type":"ListItem","position":3,"name":GRADE_LABEL(gi),"item":f"{DOMAIN}/sinf/{g}/"},
                    {"@type":"ListItem","position":4,"name":s,"item":f"{DOMAIN}/sinf/{g}/{slug}/"}
                ]
            },
            render_faq_jsonld([(unesc(q),unesc(a)) for q,a in sample], s, gi)
        ]
        with open(os.path.join(sdir, "index.html"), "w", encoding="utf-8") as f:
            f.write(page_shell(
                f"{GRADE_LABEL(gi)} {s} testlari — bepul savollar | Elektron Test",
                f"{GRADE_LABEL(gi)} {s} fanidan bepul test savollari va javoblari. Elektron Test'da {s} bo'yicha viktorina o'ynang.",
                f"{DOMAIN}/sinf/{g}/{slug}/",
                body, jsonld, root="../../../"
            ))
        sitemap_urls.append(f"{DOMAIN}/sinf/{g}/{slug}/")
        total_pages += 1

print("Generated subject pages:", total_pages)
print("Total sitemap urls:", len(sitemap_urls))

with open('/home/claude/build/sitemap_urls.json','w',encoding='utf-8') as f:
    json.dump(sitemap_urls, f, ensure_ascii=False)
