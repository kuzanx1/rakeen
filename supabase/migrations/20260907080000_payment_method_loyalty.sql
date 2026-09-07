-- طلبٌ غطّته المكافأة بالكامل ليس دفعاً نقدياً بصفر.
--
-- كان يُسجَّل 'cash' ومبلغُه صفر -- فيظهر في سجلّ الطلبات "٠٫٠٠ كاش"،
-- ولا يُعرف أنه صُرف من برنامج الولاء. وهذه هي العلّة نفسها التي أُضيف
-- لأجلها 'delivery_platform' (20260808040000): طريقةُ دفعٍ لم تقع
-- تُحشر في درج الكاش، فتُقرأ الأرقام خطأً.
--
-- ولا يُستعمل إلا حين يكون الإجمالي صفراً بمكافأةٍ أو باستبدال نقاط:
-- المكافأة لا تدفع شيئاً، إنما تُسقط الثمن. فإن بقي مبلغٌ فهو كاشٌ أو
-- شبكة، والمكافأة سطرٌ فيه.
alter table orders drop constraint orders_payment_method_check;
alter table orders add constraint orders_payment_method_check
  check (payment_method in ('cash', 'card', 'split', 'delivery_platform', 'loyalty'));
