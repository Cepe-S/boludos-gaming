import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import webpush from 'npm:web-push@3.6.7';

// ==============================================================================
// BOLUDOS GAMING — SERVERLESS WEB PUSH (PWA) EDGE FUNCTION
// ==============================================================================
// Sends standard RFC 8291 / 8292 encrypted Web Push notifications to mobile
// subscribers stored in `profiles.push_subscription` signed with VAPID keys.
// ==============================================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

interface PushSubscriptionData {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface PushRequestBody {
  userIds?: string[];
  subscription?: PushSubscriptionData;
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  icon?: string;
  data?: Record<string, unknown>;
}

// Initialize Supabase Client
function getSupabaseClient() {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
    Deno.env.get('SUPABASE_ANON_KEY') ||
    '';

  if (!url || !key) return null;
  return createClient(url, key);
}

Deno.serve(async (req: Request) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  // Healthcheck
  if (req.method === 'GET') {
    const hasVapid = Boolean(
      Deno.env.get('VAPID_PUBLIC_KEY') && Deno.env.get('VAPID_PRIVATE_KEY')
    );
    return new Response(
      JSON.stringify({
        status: 'ok',
        service: 'boludos-gaming-send-push',
        vapidConfigured: hasVapid,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Check VAPID credentials
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject =
    Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@boludosgaming.app';

  if (!vapidPublicKey || !vapidPrivateKey) {
    return new Response(
      JSON.stringify({
        error: 'VAPID keys not configured in Edge Function environment',
        hint: 'Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT in Supabase secrets',
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  }

  // Configure Web Push VAPID
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  let body: PushRequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const notificationPayload = JSON.stringify({
    title: body.title || 'Boludos Gaming 🎮',
    body: body.body || '¡Hay novedades en el grupo de vicio!',
    icon: body.icon || './icon.svg',
    badge: './icon.svg',
    tag: body.tag || `bg-push-${Date.now()}`,
    vibrate: [200, 100, 200],
    data: {
      url: body.url || './',
      timestamp: Date.now(),
      ...(body.data || {}),
    },
    actions: [
      { action: 'open', title: '🎮 Entrar al Vicio' },
      { action: 'dismiss', title: 'Cerrar' },
    ],
  });

  const targets: Array<{ userId?: string; subscription: PushSubscriptionData }> =
    [];

  // 1. Direct subscription provided in body (testing or client-directed)
  if (body.subscription && body.subscription.endpoint && body.subscription.keys) {
    targets.push({ subscription: body.subscription });
  }

  // 2. Query target subscriptions from Supabase
  const supabase = getSupabaseClient();
  if (supabase) {
    let query = supabase
      .from('profiles')
      .select('id, display_name, push_subscription')
      .not('push_subscription', 'is', null);

    if (body.userIds && Array.isArray(body.userIds) && body.userIds.length > 0) {
      query = query.in('id', body.userIds);
    }

    const { data: profiles, error } = await query;
    if (!error && profiles) {
      for (const p of profiles) {
        if (
          p.push_subscription &&
          p.push_subscription.endpoint &&
          p.push_subscription.keys
        ) {
          targets.push({
            userId: p.id,
            subscription: p.push_subscription as PushSubscriptionData,
          });
        }
      }
    }
  }

  if (targets.length === 0) {
    return new Response(
      JSON.stringify({
        success: true,
        sentCount: 0,
        message: 'No push subscriptions found for target users',
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  }

  let sentCount = 0;
  let failureCount = 0;
  const expiredUserIds: string[] = [];
  const errors: string[] = [];

  for (const target of targets) {
    try {
      await webpush.sendNotification(target.subscription, notificationPayload);
      sentCount++;
    } catch (err: unknown) {
      failureCount++;
      const errorMsg = String(err);
      errors.push(errorMsg);

      // Status 404 or 410 means the subscription has expired or unsubscribed
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if ((statusCode === 404 || statusCode === 410) && target.userId) {
        expiredUserIds.push(target.userId);
      }
    }
  }

  // Clean up expired push subscriptions in Supabase
  if (expiredUserIds.length > 0 && supabase) {
    await supabase
      .from('profiles')
      .update({ push_subscription: null })
      .in('id', expiredUserIds);
  }

  return new Response(
    JSON.stringify({
      success: true,
      sentCount,
      failureCount,
      cleanedExpiredCount: expiredUserIds.length,
      errors: errors.slice(0, 5),
    }),
    {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    }
  );
});
