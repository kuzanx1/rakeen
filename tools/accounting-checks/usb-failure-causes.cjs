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

if (fails.length) {
  process.stdout.write(Buffer.from('✗ ' + fails.join('\n✗ ') + '\n', 'utf8'));
  process.exit(1);
}
process.stdout.write(
  Buffer.from('✓ عطبُ الطابعة: خمسةُ أسبابٍ بأسمائها، ولكلٍّ جملتُه\n', 'utf8'),
);
