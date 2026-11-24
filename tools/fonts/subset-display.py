"""يُولّد خطَّ العرضِ الذي يُطبع به شريطُ الفاتورة.

الأصلُ الكاملُ في public/fonts/thmanyah-serif-display/*.woff2 -- وهو
خطُّ الموقع، يُستعمل في المتصفّح حيث الحزمةُ تُنزَّل مرّةً وتُخزَّن.
والطابعةُ غيرُ ذلك: الملفُّ يُحزم في التطبيق فيزن على كلِّ جهاز، ويُقرأ
في الكاشير قبل أوّلِ ورقة.

فيُجزَّأ على محارفِ الشريطِ وحدَها: ١٧٠ ك.ب تصير ٥٨. والثمنُ أنّ أيَّ
حرفٍ خارجَها ليس في الملفّ -- ولذلك يقرأ حارسُ النشر
(tools/accounting-checks/receipt-banner.cjs) جدولَ cmap ويقابله بنصوص
shared/receipt/banner.ts محرفاً محرفاً، فيمنع النشرَ قبل أن يصل مربّعٌ
فارغٌ إلى ورقةِ زبون.

ولا تُدرج التطويلةُ (U+0640): جرُّها يستدعي كلَّ أشكالِ الحروف الممدودة
فيتضاعف الملفُّ (٥٨ ← ١١٧ ك.ب)، ولا تطويلةَ في النصّ.

    python tools/fonts/subset-display.py

ويُشغَّل حين يتغيّر نصُّ الشريط، لا مع كلِّ بناء: مخرجاتُه محفوظةٌ في
المستودع كما تُحفظ بقيّةُ الخطوط.
"""

import os
import re
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "public", "fonts", "thmanyah-serif-display")
OUT = [
    os.path.join(ROOT, "react-native-poc", "assets", "fonts"),
    SRC,
]
WEIGHTS = ("Black", "Bold")


def banner_chars() -> set:
    """محارفُ الشريط -- من المصدرِ نفسِه لا من نسخةٍ هنا."""
    path = os.path.join(ROOT, "shared", "receipt", "banner.ts")
    with open(path, encoding="utf-8") as fh:
        src = fh.read()
    found = re.findall(r"^\s*(?:head|sub|body|tail):\s*'([^']+)'", src, re.M)
    if len(found) < 5:
        sys.exit("لم تُقرأ نصوصُ الشريط من banner.ts")
    chars = {ch for line in found for ch in line}
    chars |= {" ", "،"}
    return chars


def main() -> None:
    unis = sorted(ord(c) for c in banner_chars())
    for weight in WEIGHTS:
        font = TTFont(os.path.join(SRC, f"thmanyahserifdisplay-{weight}.woff2"))
        opts = subset.Options()
        opts.layout_features = ["*"]
        opts.name_IDs = ["*"]
        opts.notdef_outline = True
        sub = subset.Subsetter(options=opts)
        sub.populate(unicodes=unis)
        sub.subset(font)
        font.flavor = None
        for folder in OUT:
            dst = os.path.join(folder, f"ThmanyahSerifDisplay-{weight}.ttf")
            font.save(dst)
            print(f"{os.path.relpath(dst, ROOT)}  {os.path.getsize(dst) // 1024} ك.ب")


if __name__ == "__main__":
    main()
