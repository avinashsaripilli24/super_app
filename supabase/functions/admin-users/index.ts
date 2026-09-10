// admin-users: privileged user-management actions for admins.
//
// The caller's JWT is verified in code (config.toml sets verify_jwt=false for
// this function because the gateway check only proves *some* valid JWT, which
// the anon key itself satisfies). Then the caller's profile must be an active
// admin before a service-role client performs the action.
//
// Actions (POST JSON body):
//   { action: "create", email, password, full_name, role? }
//   { action: "deactivate", user_id }
//   { action: "reactivate", user_id }
//   { action: "reset_password", user_id, password }

import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@3'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    email: z.string().email(),
    password: z.string().min(8),
    full_name: z.string().min(1).max(120),
    role: z.enum(['admin', 'user']).default('user'),
  }),
  z.object({ action: z.literal('deactivate'), user_id: z.string().uuid() }),
  z.object({ action: z.literal('reactivate'), user_id: z.string().uuid() }),
  z.object({
    action: z.literal('reset_password'),
    user_id: z.string().uuid(),
    password: z.string().min(8),
  }),
])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceKey) return json({ error: 'Function is not configured' }, 500)

  // 1. Who is calling?
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthenticated' }, 401)

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const {
    data: { user },
    error: userErr,
  } = await caller.auth.getUser()
  if (userErr || !user) return json({ error: 'Unauthenticated' }, 401)

  // 2. Is the caller an active admin?
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: profile } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin' || !profile.is_active) {
    return json({ error: 'Forbidden' }, 403)
  }

  // 3. Validate the request.
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return json({ error: 'Invalid request', details: parsed.error.flatten() }, 400)
  }
  const body = parsed.data

  // 4. Act.
  switch (body.action) {
    case 'create': {
      const { data, error } = await admin.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: { full_name: body.full_name },
        // Consumed by public.handle_new_user() to set profiles.role.
        app_metadata: { role: body.role },
      })
      if (error) return json({ error: error.message }, 400)
      return json({ user_id: data.user.id })
    }

    case 'deactivate': {
      if (body.user_id === user.id) return json({ error: 'You cannot deactivate yourself' }, 400)
      const { error } = await admin.auth.admin.updateUserById(body.user_id, {
        ban_duration: '876000h',
      })
      if (error) return json({ error: error.message }, 400)
      const { error: pErr } = await admin
        .from('profiles')
        .update({ is_active: false })
        .eq('id', body.user_id)
      if (pErr) return json({ error: pErr.message }, 400)
      return json({ ok: true })
    }

    case 'reactivate': {
      const { error } = await admin.auth.admin.updateUserById(body.user_id, {
        ban_duration: 'none',
      })
      if (error) return json({ error: error.message }, 400)
      const { error: pErr } = await admin
        .from('profiles')
        .update({ is_active: true })
        .eq('id', body.user_id)
      if (pErr) return json({ error: pErr.message }, 400)
      return json({ ok: true })
    }

    case 'reset_password': {
      const { error } = await admin.auth.admin.updateUserById(body.user_id, {
        password: body.password,
      })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }
  }
})
