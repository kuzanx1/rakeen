import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { TouchableOpacity } from './tappable';
import { createStyles, fonts, radii, spacing, useTheme } from './theme';
import {
  getFreeRewardConfig,
  redeemErrorText,
  redeemFreeReward,
  FreeRewardConfig,
  RewardProduct,
} from '../application/freeRewardService';
import { requestLoyaltyRedemption, getLoyaltyRedemptionStatus } from '../application/loyaltyRedemptionService';

/**
 * المكافأة الجاهزة، حيث يراها الكاشير بلا أن يبحث عنها.
 *
 * تظهر لحظة اختيار الزبون -- بعد رقمه وقبل الدفع -- ولا تظهر لمن لا
 * رصيد له. فالكاشير لا يحتاج أن يتذكّر أن يسأل، ولا الزبون أن يطالب:
 * الورقة نفسها تقول إن عنده مكافأة.
 *
 * والتسلسل مبنيٌّ على أقل عدد ضغطات ممكن:
 *
 *   صنفٌ واحد مسجَّل   -> ضغطة واحدة. لا قائمة تُعرض أصلاً، فالاختيار
 *                        من واحدٍ ليس اختياراً.
 *   عدة أصناف          -> ضغطة، ثم اختيار الصنف.
 *   وضعٌ مفتوح         -> ضغطة، والكاشير يعطي ما يراه.
 *
 * ثم تأكيدٌ من جوال صاحب البطاقة -- الآلية القائمة نفسها لاستبدال
 * النقاط -- ثم يدخل الصنف السلة بسعر صفر.
 */
type Phase = 'idle' | 'picking' | 'waiting' | 'done';

export default function FreeRewardBanner({
  businessId,
  customerId,
  customerName,
  freeRewards,
  onRedeemed,
}: {
  businessId: number;
  customerId: number;
  customerName: string;
  freeRewards: number;
  /** يُنادى بالصنف المجاني (أو null في الوضع المفتوح) بعد نجاح الصرف. */
  onRedeemed: (product: RewardProduct | null, remaining: number) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [config, setConfig] = useState<FreeRewardConfig | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    getFreeRewardConfig(businessId).then(c => { if (alive) setConfig(c); });
    return () => { alive = false; };
  }, [businessId]);

  const stopTimers = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  useEffect(() => stopTimers, [stopTimers]);

  /**
   * يطلب التأكيد من جوال الزبون، ثم يصرف.
   *
   * والصرف بعد التأكيد لا قبله، والخادم يتحقق من الاثنين مرة أخرى --
   * فلا يكفي أن تكون الشاشة قد رأت التأكيد.
   */
  const startRedemption = useCallback(async (product: RewardProduct | null) => {
    setError('');
    setPhase('waiting');
    const req = await requestLoyaltyRedemption(customerId);
    if (!req.ok || req.requestId == null) {
      setError(req.error || 'تعذر إرسال طلب التأكيد للعميل');
      setPhase('idle');
      return;
    }
    const requestId = req.requestId;
    const deadline = Date.now() + 2 * 60 * 1000;
    setSecondsLeft(120);
    tickRef.current = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    }, 1000);

    pollRef.current = setInterval(async () => {
      if (Date.now() > deadline) {
        stopTimers();
        setError('انتهى الوقت — العميل ما أكّد');
        setPhase('idle');
        return;
      }
      const status = await getLoyaltyRedemptionStatus(requestId);
      if (status === 'confirmed') {
        stopTimers();
        const res = await redeemFreeReward(customerId, requestId, product ? product.id : null);
        if (!res.ok) {
          setError(redeemErrorText(res.error));
          setPhase('idle');
          return;
        }
        setPhase('done');
        onRedeemed(product, res.remaining ?? Math.max(0, freeRewards - 1));
      } else if (status === 'rejected' || status === 'expired') {
        stopTimers();
        setError(status === 'rejected' ? 'العميل رفض الطلب' : 'انتهى الوقت — العميل ما أكّد');
        setPhase('idle');
      }
    }, 2000);
  }, [customerId, freeRewards, onRedeemed, stopTimers]);

  /** ضغطةٌ واحدة حين لا اختيار حقيقي: صنفٌ واحد، أو وضعٌ مفتوح. */
  const onUsePressed = useCallback(() => {
    if (!config) return;
    if (config.mode === 'open') { startRedemption(null); return; }
    if (config.products.length === 1) { startRedemption(config.products[0]); return; }
    if (config.products.length === 0) {
      setError('ما تم تحديد أصناف المكافأة من لوحة التحكم');
      return;
    }
    setPhase('picking');
  }, [config, startRedemption]);

  if (freeRewards <= 0 || phase === 'done') return null;

  const rewardWord = freeRewards === 1 ? 'مكافأة جاهزة' : `${freeRewards} مكافآت جاهزة`;

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.gift}>🎁</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{customerName || 'العميل'} عنده {rewardWord}</Text>
          {!!config && <Text style={styles.sub}>{config.label}</Text>}
        </View>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      {phase === 'idle' && (
        <TouchableOpacity style={styles.cta} onPress={onUsePressed} activeOpacity={0.85} disabled={!config}>
          <Text style={styles.ctaText}>{config ? 'استخدم المكافأة' : 'جارٍ التحميل...'}</Text>
        </TouchableOpacity>
      )}

      {phase === 'picking' && !!config && (
        <View style={styles.pickWrap}>
          <Text style={styles.pickLabel}>أي صنف يأخذه؟</Text>
          {config.products.map(p => (
            <TouchableOpacity key={p.id} style={styles.pickRow} onPress={() => startRedemption(p)} activeOpacity={0.8}>
              <Text style={styles.pickName}>{p.name}{p.nameEn ? ` | ${p.nameEn}` : ''}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.cancel} onPress={() => setPhase('idle')}>
            <Text style={styles.cancelText}>رجوع</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'waiting' && (
        <View style={styles.waitWrap}>
          <ActivityIndicator color={colors.accentText} />
          <Text style={styles.waitText}>بانتظار تأكيد {customerName || 'العميل'}...</Text>
          <Text style={styles.waitSub}>اطلب منه يفتح بطاقة الولاء ويضغط تأكيد</Text>
          <Text style={styles.waitTimer}>{secondsLeft} ثانية</Text>
          <TouchableOpacity style={styles.cancel} onPress={() => { stopTimers(); setPhase('idle'); }}>
            <Text style={styles.cancelText}>إلغاء</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const useStyles = createStyles(colors =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surf1, borderWidth: 1.5, borderColor: colors.accentText,
      borderRadius: radii.lg, padding: spacing[4], marginBottom: spacing[4],
    },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    gift: { fontSize: 24 },
    title: { fontFamily: fonts.sansBold, fontSize: 14.5, color: colors.text },
    sub: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
    error: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.danger, marginTop: spacing[2] },
    cta: {
      backgroundColor: colors.lime, borderRadius: radii.full, paddingVertical: 12,
      alignItems: 'center', marginTop: spacing[3],
    },
    ctaText: { fontFamily: fonts.sansBold, fontSize: 13.5, color: colors.flagGreenDeep },
    pickWrap: { marginTop: spacing[3], gap: 8 },
    pickLabel: { fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.muted },
    pickRow: {
      backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.line,
      borderRadius: radii.md, paddingVertical: 12, paddingHorizontal: spacing[4],
    },
    pickName: { fontFamily: fonts.sansBold, fontSize: 13.5, color: colors.text, textAlign: 'right' },
    waitWrap: { alignItems: 'center', gap: 6, marginTop: spacing[3] },
    waitText: { fontFamily: fonts.sansBold, fontSize: 13.5, color: colors.text },
    waitSub: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted, textAlign: 'center' },
    waitTimer: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.accentText },
    cancel: { padding: spacing[3], alignItems: 'center' },
    cancelText: { fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.muted },
  }),
);
