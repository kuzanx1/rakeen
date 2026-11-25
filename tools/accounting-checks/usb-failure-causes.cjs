/**
 * عطبُ الطابعة يقول أيَّ عطبٍ هو.
 *
 * كان "connection_failed" كلمةً واحدةً تبتلع أربعةَ أسباب: مَقبضٌ لا
 * يُفتح، وواجهةٌ لا تُستولى، ودَينُ ورقةٍ لم يُسدَّد، وعطبٌ أثناء
 * الكتابة. فتصل اللوحةَ كلمةٌ واحدةٌ من مطعمٍ بعيد، ولا يُعرف أيُّها
 * وقع إلّا بالتخمين -- وقد خمّنتُ، وكلُّ يدٍ منها تمتدّ إلى شيءٍ آخر:
 * سلكٌ، أو إذنٌ سقط، أو تطبيقٌ ماسكٌ للطابعة، أو طابعةٌ واقفةٌ في نصّ
 * ورقة. وجملةٌ عامّةٌ لا تُصلح أيّاً منها. (كباب طارق، ٢٠٢٦/١١/٢٥.)
 *
 * ومعها الصبرُ على إعادة التعداد: openDevice يرجع null والطابعةُ
 * موجودة، لأنّها أعادت التعدادَ على الناقل للتوّ فصار الكائنُ القديم
 * مَقبضاً ميتاً. وكنّا نفشل في تسع ملّي ثانيةٍ ونعيد على نفس المَقبض.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const fails = [];
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const kt = read('react-native-poc/android/app/src/main/java/com/rakeenpoc/UsbPrinterTransport.kt');
const screen = read('react-native-poc/src/domain/printerFailure.ts');
const queue = read('react-native-poc/src/ui/PrintQueueScreen.tsx');
const settings = read('react-native-poc/src/ui/PrinterSettingsScreen.tsx');

const CAUSES = [
  'usb_open_failed',
  'usb_permission_lost',
  'usb_claim_failed',
  'usb_debt_unsettled',
  'usb_io_error',
];

// ١) كلُّ سببٍ موجودٌ في النقل، مرّةً على الأقلّ.
for (const cause of CAUSES) {
  if (!kt.includes(`"${cause}"`)) {
    fails.push(`النقلُ ما عاد يميّز ${cause} -- رجع العطبُ كلمةً واحدة`);
  }
}

// ٢) والعامُّ زال من مسار الإرسال. وجودُه يعني أنّ أحدَ الأسباب
//    انطوى تحته من جديد، فتعود اللوحةُ عمياء.
if (/callback\(false, "connection_failed"\)/.test(kt)) {
  fails.push('"connection_failed" العامُّ رجع إلى مسار الإرسال');
}
if (/callback\(false, null, "connection_failed"\)/.test(kt)) {
  fails.push('"connection_failed" العامُّ رجع إلى اختبار الاتصال');
}

// ٣) والانقطاعُ يبقى له اسمُه -- هو الحدثُ الذي يسبق الفواتيرَ المشفَّرة.
if (!kt.includes('"truncated_write"')) {
  fails.push('truncated_write ضاع -- لا نعرف أيُّ طابعةٍ على وشك الخربشة');
}

// ٤) الصبرُ على إعادة التعداد: موجودٌ، ومحدودٌ، ويُنادى عند فشل الفتح.
if (!/private fun reopen\(/.test(kt)) {
  fails.push('ما فيه reopen -- مَقبضٌ ميتٌ يفشل من أوّل مرّةٍ خمسَ مرّات');
}
if (!/val \(reopened, why\) = reopen\(stableId\(dev\)\)/.test(kt)) {
  fails.push('reopen ما يُنادى عند فشل الفتح');
}
{
  const m = kt.match(/REOPEN_WAITS_MS = longArrayOf\(([^)]*)\)/);
  if (!m) {
    fails.push('ما فيه REOPEN_WAITS_MS -- الصبرُ بلا حدٍّ يوقف الطابور');
  } else {
    const total = m[1].split(',').reduce((a, n) => a + Number(n.trim()), 0);
    if (!(total > 0 && total <= 3000)) {
      fails.push(`صبرُ إعادة الفتح ${total}ms -- خارج الحدّ (١–٣٠٠٠)`);
    }
  }
}

// ٥) ولكلِّ سببٍ جملةٌ تقول لصاحب المطعم ما يفعله. سببٌ بلا جملةٍ
//    يسقط على الجملة العامّة، فيعود العطبُ مبهماً حيث يُقرأ.
for (const cause of CAUSES) {
  if (!new RegExp(`case '${cause}':`).test(screen)) {
    fails.push(`${cause} بلا جملةٍ في failureSentence`);
  }
}

// ٦) والشاشةُ التي تُصوَّر فعلاً -- «قائمة الطباعة» -- تقول الجملةَ
//    تحت الرمز. ورمزٌ إنجليزيٌّ وحدَه يُصوَّر ويُرسل ولا يُفهم منه شيء.
if (!/failureSentence\(item\.last_error_detail/.test(queue)) {
  fails.push('«قائمة الطباعة» تعرض الرمزَ بلا جملةٍ تقول ما يُفعل');
}

/* ── الدَّينُ الذي لا يُسدَّد لا يقفل المطعم ──
   كان السدادُ يُعاد إلى ما لا نهاية: كتابةٌ كبيرةٌ من الأصفار على طابعةٍ
   أثبتت للتوّ أنّها لا تحتمل كتابةً كبيرة. فتسقط، ويسقط معها كلُّ ما
   بعدها حتى يشيخ الدَّينُ بعد دقيقتين. وقد وقع: ثلاثون محاولةً ولا
   واحدةٌ نجحت. فاخترنا «لا ورقةَ مشوّهة» فخرجنا بـ«لا ورقةَ أبداً». */
{
  const m = kt.match(/MAX_SETTLE_TRIES = (\d+)/);
  if (!m) {
    fails.push('ما فيه MAX_SETTLE_TRIES -- دَينٌ لا يُسدَّد يقفل الطابور بلا حدّ');
  } else if (!(Number(m[1]) >= 1 && Number(m[1]) <= 3)) {
    fails.push(`MAX_SETTLE_TRIES = ${m[1]} -- خارج الحدّ (١–٣)`);
  }
  if (!/settleFails\.remove\(printerId\)/.test(kt)) {
    fails.push('عدّادُ السداد ما يُمحى -- طابعةٌ تعافت تبقى محسوبةً على عثرتها');
  }
  if (!/settleFails\.remove\(stableId\(dev\)\)/.test(kt)) {
    fails.push('ورقةٌ نجحت ما تمحو عدّادَ السداد');
  }
  // والتصفيرُ القياسيُّ لا يُنادى إلّا حيث كنّا نفشل فشلاً تامّاً:
  // طريقٌ يعمل اليوم لا يُدخَل عليه أمرٌ لم يُجرَّب على طابعةٍ حقيقيّة.
  if (!/private fun softReset\(/.test(kt)) {
    fails.push('ما فيه softReset -- لا مخرجَ من نصفِ صورةٍ إلّا بالورق');
  }
  if ((kt.match(/softReset\(/g) || []).length !== 2) {
    fails.push('softReset يُنادى من غير موضعِ الاستسلام -- مسارٌ يعمل دخله أمرٌ لم يُجرَّب');
  }
}

/* ── إذنُ «الأجهزة القريبة» يُطلب، لا يُفحص فقط ──
   من أندرويد ١٢ صار BLUETOOTH_SCAN/CONNECT إذنَ تشغيلٍ مرفوضاً حتى
   يُطلب، والطبقةُ الأصليّة تفحصه فقط. فبلا طلبٍ هنا يضغط الكاشير
   «البحث عن الأجهزة» فترجع قائمةٌ فارغة -- ولا حتى الطابعة المقترنة
   تظهر، لأنّ قراءة المقترنات نفسَها تحتاج الإذن. وميزةٌ لا تُستعمل
   أسوأُ من ميزةٍ لم تُبنَ: هذه تبدو معطّلةً بلا سبب. */
{
  if (!/PermissionsAndroid\.requestMultiple\(/.test(settings)) {
    fails.push('ما فيه طلبٌ لإذن الأجهزة القريبة -- بحثُ البلوتوث يرجع فارغاً دائماً');
  }
  for (const perm of ['BLUETOOTH_SCAN', 'BLUETOOTH_CONNECT', 'ACCESS_FINE_LOCATION']) {
    if (!settings.includes(`PERMISSIONS.${perm}`)) {
      fails.push(`${perm} ما يُطلب -- أجهزةٌ لا تظهر على إصدارٍ من أندرويد`);
    }
  }
  if (!/await ensureNearbyPermission\(\)/.test(settings)) {
    fails.push('الإذنُ ما يُطلب قبل البحث');
  }
  // والرمزُ الإنجليزيُّ لا يُعرض وحدَه: «خطأ: permission_denied» لا
  // يقول لكاشيرٍ عربيٍّ شيئاً، والحلُّ خارج التطبيق أصلاً.
  if (/خطأ: \{scanResult\.error\}/.test(settings)) {
    fails.push('الشاشةُ ترجع تعرض رمزَ فشلِ البحث بلا جملة');
  }
  if (!/scanFailureSentence\(scanResult\.error\)/.test(settings)) {
    fails.push('ما فيه جملةٌ لفشل البحث');
  }
}

if (fails.length) {
  process.stdout.write(Buffer.from('✗ ' + fails.join('\n✗ ') + '\n', 'utf8'));
  process.exit(1);
}
process.stdout.write(
  Buffer.from('✓ عطبُ الطابعة: خمسةُ أسبابٍ بأسمائها، ولكلٍّ جملتُه\n', 'utf8'),
);
