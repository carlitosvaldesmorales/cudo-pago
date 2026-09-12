export const TELEGRAM_PRODUCT_NAME='Fútbol Chépica';

export const TELEGRAM_CHANNEL=Object.freeze({
  CANONICAL:Object.freeze({
    role:'CANONICAL',
    internal_slot:'next',
    username:'FutbolChepicaBot',
    mention:'@FutbolChepicaBot',
    webhook_path:'/webhook/telegram-next',
    health_path:'/health/telegram-canonical',
    compatibility_health_path:'/health/telegram-next',
    reconcile_path:'/ops/telegram-canonical/reconcile',
    compatibility_reconcile_path:'/ops/telegram-next/reconcile'
  }),
  LEGACY:Object.freeze({
    role:'LEGACY_COMPATIBILITY',
    internal_slot:'primary',
    webhook_path:'/webhook/telegram',
    health_path:'/health/telegram'
  })
});

export function canonicalTelegramDeepLink(startPayload=''){
  const suffix=startPayload?`?start=${encodeURIComponent(startPayload)}`:'';
  return `https://t.me/${TELEGRAM_CHANNEL.CANONICAL.username}${suffix}`;
}

export function isCanonicalTelegramUsername(value){
  return String(value||'').toLowerCase()===TELEGRAM_CHANNEL.CANONICAL.username.toLowerCase();
}
