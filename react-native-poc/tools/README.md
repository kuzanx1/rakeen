# اختبار الطباعة بدون طابعة

`fake-printer.py` يشتغل مكان الطابعة. كل طابعة إيصالات شبكية هي مجرد
socket على منفذ `9100` تبتلع البايتات اللي توصلها — فالسكربت هذا **هو
طابعة** من ناحية التطبيق.

يختبر السلسلة كاملة: صلاحية الشبكة المحلية في iOS، الـsocket في
`NetworkPrinterTransport.swift`، طابور الطباعة، مولّد ESC/POS، ومُرمّز
الصور. الشي الوحيد اللي ما يثبته: تعامل الطابعة نفسها مع الورق.

## الخطوات

**١. شغّل المستمع**

```bash
python tools/fake-printer.py
```

بيطبع عنوان جهازك على الشبكة والمنفذ — استخدمهما في الخطوة ٣.

**٢. افتح المنفذ في جدار الحماية (مرة وحدة)**

ويندوز يحجب المنفذ افتراضياً، وبدون هذي الخطوة الاتصال بيفشل بدون أي
رسالة مفيدة. افتح PowerShell **كمسؤول** وشغّل:

```bash
New-NetFirewallRule -DisplayName "Rakeen fake printer 9100" -Direction Inbound -LocalPort 9100 -Protocol TCP -Action Allow -Profile Private
```

لحذفها بعد ما تخلص:

```bash
Remove-NetFirewallRule -DisplayName "Rakeen fake printer 9100"
```

**٣. اضبط التطبيق**

الجوال لازم يكون على **نفس الشبكة**. بعدين: المزيد ← إعدادات الطابعة

| الحقل | القيمة |
|---|---|
| النقل | شبكة (Network) |
| عنوان IP | العنوان اللي طبعه المستمع |
| المنفذ | `9100` |

**٤. اضغط «اختبار الاتصال»**

المفروض يطلع في الطرفية:

```
--- job 1 from 192.168.100.x ---
    (connected, sent nothing -- this is the connection test)
    CONNECTION TEST PASSED
```

اختبار الاتصال يفتح الـsocket ويسكّره بدون ما يرسل شي — مجرد نجاح
الاتصال هو الإثبات المطلوب.

**٥. سوّ طلب حقيقي وادفع**

الإيصال بيوصل مفكوك الترميز:

```
--- job 2 from 192.168.100.x ---
    87 bytes -> tools\received\job-002.bin
    <ESC @    initialise printer>
    <ESC a 1  align centre>
    | مطعم ركين
    <GS v 0   raster image (logo / QR)>
      raster 32x8px, 32 bytes
    <GS V     CUT PAPER>
    <ESC p    OPEN CASH DRAWER>
    -> paper cut requested (a real printer would cut here)
    -> DRAWER KICK requested
```

البايتات الخام تُحفظ في `tools/received/` لو احتجت تفحصها.

## لو فشل

| العرض | السبب الغالب |
|---|---|
| اختبار الاتصال يفشل فوراً | جدار الحماية (الخطوة ٢) |
| اختبار الاتصال ينتظر ثم يفشل | الجوال على شبكة ثانية، أو IP غلط |
| ما يظهر تنبيه صلاحية على الآيفون | `NSLocalNetworkUsageDescription` — موجود من commit `2b563b1` |
| `Could not listen on port 9100` | نسخة قديمة من السكربت شغّالة |

شبكة **الضيوف (Guest)** ما تنفع أبداً — الراوتر يعزل أجهزتها عن بعض عمداً.
