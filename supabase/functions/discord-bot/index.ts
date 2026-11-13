import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import nacl from 'npm:tweetnacl@1.0.3';

// ==============================================================================
// BOLUDOS GAMING — SERVERLESS DISCORD BOT & WEBHOOK EDGE FUNCTION
// ==============================================================================
// 1. Healthcheck (GET)
// 2. Outbound Discord Webhook / Bot Channel dispatcher with ActionRow buttons
// 3. Inbound Discord HTTP Interactions (Ed25519 verified, PING & Button clicks)
// ==============================================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-signature-ed25519, x-signature-timestamp',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Helper: Hex string to Uint8Array for Ed25519 signature verification
function hexToUint8Array(hex: string): Uint8Array {
  const cleanHex = hex.trim();
  const bytes = new Uint8Array(Math.ceil(cleanHex.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Verify Discord Interaction request using tweetnacl
function verifyDiscordInteraction(
  signature: string | null,
  timestamp: string | null,
  rawBody: string,
  publicKey: string
): boolean {
  if (!signature || !timestamp || !publicKey) return false;
  try {
    return nacl.sign.detached.verify(
      new TextEncoder().encode(timestamp + rawBody),
      hexToUint8Array(signature),
      hexToUint8Array(publicKey)
    );
  } catch (err) {
    console.error('Discord signature verification error:', err);
    return false;
  }
}

// Map friendly button styles to Discord component button style numbers
// 1: Primary (Blurple), 2: Secondary (Grey), 3: Success (Green), 4: Danger (Red), 5: Link
function getDiscordButtonStyle(style?: string): number {
  switch (style) {
    case 'primary':
      return 1;
    case 'secondary':
      return 2;
    case 'success':
      return 3;
    case 'danger':
      return 4;
    default:
      return 1;
  }
}

// Build Discord ActionRows from button action objects
interface ButtonActionItem {
  label: string;
  actionType: 'join_session' | 'checkin_session' | 'spin_roulette' | 'open_app';
  sessionId?: string;
  style?: 'primary' | 'success' | 'secondary' | 'danger';
  url?: string;
}

function buildDiscordActionRows(buttons?: ButtonActionItem[]) {
  if (!buttons || buttons.length === 0) return undefined;

  const actionRows: Array<{ type: number; components: unknown[] }> = [];
  const chunkSize = 5;

  for (let i = 0; i < buttons.length; i += chunkSize) {
    const chunk = buttons.slice(i, i + chunkSize);
    const components = chunk.map((btn, idx) => {
      if (btn.actionType === 'open_app' && btn.url) {
        return {
          type: 2, // BUTTON
          style: 5, // LINK
          label: btn.label || 'Abrir Boludos Gaming',
          url: btn.url,
        };
      }

      const precision = btn.actionType === 'join_session' ? '15' : '';
      const customId = [btn.actionType, btn.sessionId || 'active', precision, idx]
        .filter(Boolean)
        .join(':');

      return {
        type: 2, // BUTTON
        style: getDiscordButtonStyle(btn.style),
        label: btn.label,
        custom_id: customId,
      };
    });

    actionRows.push({
      type: 1, // ACTION_ROW
      components,
    });
  }

  return actionRows;
}

// Initialize Supabase Client if credentials are provided
function getSupabaseClient() {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
    Deno.env.get('SUPABASE_ANON_KEY') ||
    '';

  if (!url || !key) return null;
  return createClient(url, key);
}

// ------------------------------------------------------------------------------
// MAIN HANDLER
// ------------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  // Handle Healthcheck
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({
        status: 'ok',
        service: 'boludos-gaming-discord-bot',
        timestamp: new Date().toISOString(),
        supabaseConfigured: Boolean(Deno.env.get('SUPABASE_URL')),
        discordBotConfigured: Boolean(Deno.env.get('DISCORD_BOT_TOKEN')),
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

  const rawBody = await req.text();
  let bodyData: Record<string, unknown> = {};
  try {
    bodyData = JSON.parse(rawBody);
  } catch {
    bodyData = {};
  }

  // ----------------------------------------------------------------------------
  // CASE A: OUTBOUND NOTIFICATION VIA BOT TOKEN OR WEBHOOK
  // ----------------------------------------------------------------------------
  if (bodyData.action === 'notify') {
    const webhookUrl =
      (bodyData.webhookUrl as string) || Deno.env.get('DISCORD_WEBHOOK_URL');
    const botToken =
      (bodyData.botToken as string) || Deno.env.get('DISCORD_BOT_TOKEN');
    const channelId =
      (bodyData.channelId as string) || Deno.env.get('DISCORD_CHANNEL_ID');
    const content = (bodyData.content as string) || '';
    const embed = bodyData.embed as Record<string, unknown> | undefined;
    const buttons = bodyData.buttons as ButtonActionItem[] | undefined;

    const components = buildDiscordActionRows(buttons);
    const discordPayload: Record<string, unknown> = {
      content: content || undefined,
      embeds: embed ? [embed] : undefined,
    };

    if (components && components.length > 0) {
      discordPayload.components = components;
    }

    try {
      // 1. Post to Bot Channel if token & channel are present
      if (botToken && channelId) {
        const discordRes = await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bot ${botToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(discordPayload),
          }
        );

        const resJson = await discordRes.json();
        return new Response(
          JSON.stringify({
            success: discordRes.ok,
            type: 'bot_channel',
            status: discordRes.status,
            result: resJson,
          }),
          {
            status: discordRes.status,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          }
        );
      }

      // 2. Post to Webhook if provided
      if (webhookUrl) {
        const discordRes = await fetch(`${webhookUrl}?wait=true`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'Boludos Gaming Bot 🎮',
            avatar_url:
              'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200',
            ...discordPayload,
          }),
        });

        const resText = await discordRes.text();
        let resData: unknown;
        try {
          resData = JSON.parse(resText);
        } catch {
          resData = resText;
        }

        return new Response(
          JSON.stringify({
            success: discordRes.ok,
            type: 'webhook',
            status: discordRes.status,
            result: resData,
          }),
          {
            status: discordRes.status,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(
        JSON.stringify({
          error:
            'No Discord destination configured (provide webhookUrl or botToken + channelId)',
        }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    } catch (err) {
      console.error('Error dispatching Discord message:', err);
      return new Response(
        JSON.stringify({ error: 'Failed to dispatch Discord message', details: String(err) }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }
  }

  // ----------------------------------------------------------------------------
  // CASE B: INBOUND DISCORD INTERACTION (PING & BUTTON CLICKS)
  // ----------------------------------------------------------------------------
  const signature = req.headers.get('X-Signature-Ed25519');
  const timestamp = req.headers.get('X-Signature-Timestamp');
  const publicKey = Deno.env.get('DISCORD_PUBLIC_KEY') || '';

  // If public key is set, verify Discord Ed25519 cryptographic signature
  if (publicKey) {
    const isValid = verifyDiscordInteraction(signature, timestamp, rawBody, publicKey);
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid Discord interaction signature' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
  }

  // Discord Interaction Type 1: PING (Handshake)
  const interactionType = bodyData.type as number | undefined;
  if (interactionType === 1) {
    return new Response(JSON.stringify({ type: 1 }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Discord Interaction Type 3: MESSAGE_COMPONENT (Button Click)
  if (interactionType === 3) {
    const data = bodyData.data as { custom_id?: string } | undefined;
    const customId = data?.custom_id || '';
    const member = (bodyData.member as { user?: Record<string, string> }) || {};
    const user = (bodyData.user as Record<string, string>) || member.user || {};
    const discordUserId = user.id || 'unknown';
    const discordUsername = user.username || 'Gamer';
    const displayName = user.global_name || discordUsername;

    const supabase = getSupabaseClient();
    const parts = customId.split(':');
    const action = parts[0];
    const sessionId = parts[1] || 'active';
    const precisionStr = parts[2] || '15';
    const precisionMinutes = parseInt(precisionStr, 10) || 15;

    // 1. Button: join_session
    if (action === 'join_session') {
      let syncNote = '';
      if (supabase) {
        try {
          // Upsert Discord profile
          const profileId = `discord_${discordUserId}`;
          await supabase.from('profiles').upsert(
            {
              id: profileId,
              discord_id: discordUserId,
              discord_username: discordUsername,
              display_name: displayName,
              avatar_url: user.avatar
                ? `https://cdn.discordapp.com/avatars/${discordUserId}/${user.avatar}.png`
                : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
            },
            { onConflict: 'discord_id' }
          );

          // Get the actual profile ID
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('discord_id', discordUserId)
            .single();

          const targetUserId = profile?.id || profileId;

          // Upsert into session_participants
          await supabase.from('session_participants').upsert(
            {
              session_id: sessionId,
              user_id: targetUserId,
              available_from: '22:00',
              available_until: '01:30',
              precision_minutes: precisionMinutes,
              attendance_status: 'pending',
            },
            { onConflict: 'session_id,user_id' }
          );

          syncNote = ' (Guardado en base de datos de Boludos Gaming)';
        } catch (dbErr) {
          console.error('Error saving participant to Supabase:', dbErr);
        }
      }

      return new Response(
        JSON.stringify({
          type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
          data: {
            content: `🎮 <@${discordUserId}> se sumó a la sesión con margen de **±${precisionMinutes}m**! Nos vemos en la cancha.${syncNote}`,
          },
        }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }

    // 2. Button: checkin_session
    if (action === 'checkin_session') {
      let checkinStatusMsg = '¡Check-in registrado con éxito!';

      if (supabase) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, karma_score')
            .eq('discord_id', discordUserId)
            .single();

          if (profile) {
            const checkinTime = new Date().toISOString();
            await supabase
              .from('session_participants')
              .update({
                checked_in_at: checkinTime,
                attendance_status: 'on_time',
              })
              .eq('session_id', sessionId)
              .eq('user_id', profile.id);

            // Record sanction bonus for on-time check-in
            await supabase.from('sanctions').insert({
              user_id: profile.id,
              session_id: sessionId,
              session_title: 'Sesión de Vicio',
              type: 'on_time_bonus',
              promised_time: '22:00',
              precision_minutes: 15,
              actual_time: checkinTime,
              karma_delta: 2,
              description: 'Check-in a tiempo directo desde botón de Discord ⏱️',
            });

            checkinStatusMsg =
              'Puntualidad confirmada. El Tribunal del Humo te otorgó **+2 Karma**!';
          }
        } catch (err) {
          console.error('Error updating check-in in Supabase:', err);
        }
      }

      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: `✅ <@${discordUserId}> acaba de hacer Check-in para la sesión! ${checkinStatusMsg}`,
          },
        }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }

    // 3. Button: spin_roulette
    if (action === 'spin_roulette') {
      let chosenGameName = 'Counter-Strike 2';
      let chosenCategory = 'FPS';
      let chosenCover =
        'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=80';

      if (supabase) {
        try {
          const { data: games } = await supabase
            .from('games')
            .select('*');

          if (games && games.length > 0) {
            const randomIndex = Math.floor(Math.random() * games.length);
            const picked = games[randomIndex];
            chosenGameName = picked.name;
            chosenCategory = picked.category;
            chosenCover = picked.cover_url;

            await supabase
              .from('sessions')
              .update({
                roulette_winner_game_id: picked.id,
              })
              .eq('id', sessionId);
          }
        } catch (err) {
          console.error('Error spinning roulette with Supabase:', err);
        }
      }

      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: `🎰 **¡LA RULETA DEL VICIO HA GIRADO!** 🎰\n\n🏆 **Juego Ganador:** **${chosenGameName}**\n*Gatillado por <@${discordUserId}> desde Discord*\n\n¡Todos a la sala de espera y a coordinar los equipos!`,
            embeds: [
              {
                title: `🏆 Juego Electo: ${chosenGameName}`,
                description: `Categoría: **${chosenCategory}**\nEl azar y la sincronía del grupo han dictaminado la partida de hoy.`,
                color: 0x10b981, // Emerald Green
                image: { url: chosenCover },
                footer: { text: 'Boludos Gaming — Ruleta Algorítmica' },
              },
            ],
          },
        }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }

    // Default button acknowledgement
    return new Response(
      JSON.stringify({
        type: 4,
        data: {
          content: `👍 Acción recibida: \`${customId}\` por <@${discordUserId}>.`,
        },
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  }

  // Fallback for unhandled interaction types
  return new Response(
    JSON.stringify({
      type: 4,
      data: { content: 'Interacción recibida por Boludos Gaming Bot.' },
    }),
    {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    }
  );
});
