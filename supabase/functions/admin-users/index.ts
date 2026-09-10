// admin-users: privileged user-management actions for admins.
//
// The caller's JWT is verified in code (config.toml sets verify_jwt=false for
// this function because the gateway check only proves *some* valid JWT, which
// the anon key itself satisfies). Then the caller's profile must be an active
// admin before a service-role client performs the action.
//
// Actions (POST JSON body):
//   { action: "create", phone, password, full_name, role? }
//   { action: "deactivate", user_id }
//   { action: "reactivate", user_id }
//   { action: "reset_password", user_id, password }
//   { action: "set_phone", user_id, phone }

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

// Users sign in with a mobile number; auth runs on an internal email derived
// from it. Copy of src/lib/phone.ts (Deno can't import from src/): keep in sync.
function normalizeMobile(input: string): string | null {
  let digits = input.replace(/[\s()-]/g, '')
  if (digits.startsWith('+91')) digits = digits.slice(3)
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null
}
const phoneToAuthEmail = (e164: string) => `${e164.replace(/^\+/, '')}@phone.superapp.local`

const mobile = z
  .string()
  .transform((v) => normalizeMobile(v))
  .refine((v): v is string => v !== null, 'Enter a 10-digit mobile number')

// The internal email is unique in auth, so a taken number surfaces as email_exists.
function authError(error: { code?: string; message: string }) {
  if (error.code === 'email_exists' || /already been registered/i.test(error.message)) {
    return json({ error: 'A user with this mobile number already exists' }, 400)
  }
  return json({ error: error.message }, 400)
}

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    phone: mobile,
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
  z.object({ action: z.literal('set_phone'), user_id: z.string().uuid(), phone: mobile }),
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
        email: phoneToAuthEmail(body.phone),
        password: body.password,
        email_confirm: true,
        user_metadata: { full_name: body.full_name },
        app_metadata: { role: body.role, phone: body.phone },
      })
      if (error) return authError(error)
      // GoTrue applies app_metadata after inserting the user, so
      // handle_new_user() (an insert trigger) never sees role / phone here:
      // write them onto the profile it created.
      const { error: pErr } = await admin
        .from('profiles')
        .update({ role: body.role, phone: body.phone })
        .eq('id', data.user.id)
      if (pErr) return json({ error: pErr.message }, 400)
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

    // The login number lives in three places: the auth email it maps to,
    // app_metadata.phone and profiles.phone. The email trigger updates
    // profiles.email; app_metadata is merged, so role is kept.
    case 'set_phone': {
      // GoTrue reports a duplicate email on update only as a generic failure;
      // profiles.email mirrors the auth email, so check it first.
      const { data: taken } = await admin
        .from('profiles')
        .select('id')
        .eq('email', phoneToAuthEmail(body.phone))
        .neq('id', body.user_id)
        .maybeSingle()
      if (taken) return json({ error: 'A user with this mobile number already exists' }, 400)
      const { error } = await admin.auth.admin.updateUserById(body.user_id, {
        email: phoneToAuthEmail(body.phone),
        email_confirm: true,
        app_metadata: { phone: body.phone },
      })
      if (error) return authError(error)
      const { error: pErr } = await admin
        .from('profiles')
        .update({ phone: body.phone })
        .eq('id', body.user_id)
      if (pErr) return json({ error: pErr.message }, 400)
      return json({ ok: true })
    }
  }
})
