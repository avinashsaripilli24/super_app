// notify: sends Web Push notifications to subscribed devices.
//
// Two callers (config.toml sets verify_jwt=false; both are checked here):
// * The database (pg_cron / the budget trigger, via public.notify_dispatch)
//   with header `x-notify-secret: <NOTIFY_SECRET>`. Sends to every device of
//   every active user:
//     { kind: "daily" }       1 pm and 10 pm reminder
//     { kind: "recurring" }   recurring expenses due today, not yet added
//     { kind: "budget", category_id, category_name, threshold, spent, limit, month }
// * A signed-in user (Bearer JWT) testing their own device from Settings:
//     { kind: "test", endpoint, sample: "daily" | "budget" | "recurring" }
//
// Payload `url`s are relative to the service worker scope (src/sw.ts), so
// this function never needs the app's base path.
//
// Secrets: NOTIFY_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
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

const TZ = 'Asia/Kolkata'

// Copy of formatMoney in src/lib/utils.ts (whole rupees): keep in sync.
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const money = (n: number) => inr.format(n)

/** Today in IST as YYYY-MM-DD. */
function todayIst() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  )
}

/** "October" for a YYYY-MM(-DD) string. */
function monthName(ym: string) {
  return new Date(`${ym.slice(0, 7)}-15T00:00:00Z`).toLocaleString('en-IN', { month: 'long', timeZone: 'UTC' })
}

const Body = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('daily') }),
  z.object({ kind: z.literal('recurring') }),
  z.object({
    kind: z.literal('budget'),
    category_id: z.string().uuid().nullable(),
    category_name: z.string().nullable(),
    threshold: z.union([z.literal(80), z.literal(100)]),
    spent: z.coerce.number(),
    limit: z.coerce.number(),
    month: z.string().regex(/^\d{4}-\d{2}$/),
  }),
  z.object({
    kind: z.literal('test'),
    endpoint: z.string().url(),
    sample: z.enum(['daily', 'budget', 'recurring']),
  }),
])
type BudgetBody = Extract<z.infer<typeof Body>, { kind: 'budget' }>

interface Message {
  title: string
  body: string
  tag: string
  url: string
  /** Seconds the push service keeps it for an offline phone. */
  ttl: number
  urgency: 'normal' | 'high'
  /** Replaces an undelivered message with the same topic (≤32 url-safe chars). */
  topic?: string
}

function dailyMessage(): Message {
  return {
    title: 'Super App',
    body: 'Have you updated all your expenses?',
    tag: 'daily-reminder',
    url: 'expenses?add=1',
    ttl: 3 * 3600,
    urgency: 'normal',
    topic: 'daily',
  }
}

function budgetMessage(b: Omit<BudgetBody, 'kind'>): Message {
  const name = b.category_name ?? 'Overall'
  return {
    title: b.threshold >= 100 ? `${name} budget exceeded` : `${name} budget ${b.threshold}% used`,
    body: `${money(b.spent)} of ${money(b.limit)} spent in ${monthName(b.month)}`,
    tag: `budget-${b.category_id ?? 'overall'}-${b.month}`,
    url: `expenses/budgets?month=${b.month}`,
    ttl: 24 * 3600,
    urgency: 'high',
  }
}

interface DueItem {
  label: string
  amount: number
}

function recurringMessage(due: DueItem[], today: string): Message {
  const [first] = due
  const more = due.length > 1 ? ` (+${due.length - 1} more)` : ''
  return {
    title: due.length === 1 ? 'Recurring expense due today' : 'Recurring expenses due today',
    body: `${first!.label} · ${money(first!.amount)}${more} not added for ${monthName(today)} yet`,
    tag: `recurring-${today}`,
    url: 'expenses',
    ttl: 12 * 3600,
    urgency: 'normal',
  }
}

/** Active recurring items whose day is today (IST) and that haven't been added this month. */
async function dueToday(admin: SupabaseClient): Promise<DueItem[]> {
  const today = todayIst()
  const day = Number(today.slice(8, 10))
  if (day > 27) return []
  const monthStart = `${today.slice(0, 7)}-01`
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))]
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

  const { data: items, error } = await admin
    .from('recurring_expenses')
    .select('id, amount, note, expense_categories(name)')
    .eq('active', true)
    .eq('day_of_month', day)
    .not('category_id', 'is', null)
    .order('amount', { ascending: false })
  if (error) throw new Error(error.message)
  if (!items?.length) return []

  const { data: added, error: aErr } = await admin
    .from('transactions')
    .select('recurring_id')
    .in('recurring_id', items.map((i) => i.id))
    .gte('occurred_on', monthStart)
    .lt('occurred_on', nextMonth)
  if (aErr) throw new Error(aErr.message)
  const done = new Set((added ?? []).map((t) => t.recurring_id as string))

  return items
    .filter((i) => !done.has(i.id))
    .map((i) => {
      const cat = i.expense_categories as unknown as { name: string } | null
      return { label: i.note?.trim() || cat?.name || 'Recurring expense', amount: Number(i.amount) }
    })
}

interface Subscription {
  id: string
  endpoint: string
  p256dh: string
  auth_secret: string
}

async function send(admin: SupabaseClient, subs: Subscription[], msg: Message) {
  const payload = JSON.stringify({ title: msg.title, body: msg.body, tag: msg.tag, url: msg.url })
  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_secret } }, payload, {
        TTL: msg.ttl,
        urgency: msg.urgency,
        ...(msg.topic ? { topic: msg.topic } : {}),
      }),
    ),
  )

  const ok: string[] = []
  const gone: string[] = []
  let failed = 0
  results.forEach((r, i) => {
    const id = subs[i]!.id
    if (r.status === 'fulfilled') ok.push(id)
    else {
      const status = (r.reason as { statusCode?: number })?.statusCode
      // The browser unsubscribed or the subscription expired.
      if (status === 404 || status === 410) gone.push(id)
      else {
        failed++
        console.error('push failed', status, (r.reason as Error)?.message)
      }
    }
  })
  if (gone.length) await admin.from('push_subscriptions').delete().in('id', gone)
  if (ok.length) {
    await admin.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).in('id', ok)
  }
  return { sent: ok.length, removed: gone.length, failed }
}

/** Every device of every active user. */
async function allSubscriptions(admin: SupabaseClient): Promise<Subscription[]> {
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_secret, profiles!inner(is_active)')
    .eq('profiles.is_active', true)
  if (error) throw new Error(error.message)
  return (data ?? []).map(({ id, endpoint, p256dh, auth_secret }) => ({ id, endpoint, p256dh, auth_secret }))
}

/** Constant-time string compare (the secret check). */
function safeEqual(a: string, b: string) {
  const enc = new TextEncoder()
  const x = enc.encode(a)
  const y = enc.encode(b)
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const notifySecret = Deno.env.get('NOTIFY_SECRET')
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT')
  if (!url || !anonKey || !serviceKey || !notifySecret || !vapidPublic || !vapidPrivate || !vapidSubject) {
    return json({ error: 'Notifications are not configured on the server' }, 500)
  }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return json({ error: 'Invalid request', details: parsed.error.flatten() }, 400)
  }
  const body = parsed.data

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    // A signed-in user testing this device.
    if (body.kind === 'test') {
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

      const { data: sub } = await admin
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth_secret')
        .eq('endpoint', body.endpoint)
        .eq('user_id', user.id)
        .maybeSingle()
      // Not registered (or registered to someone else): nothing to send to.
      if (!sub) return json({ sent: 0, removed: 0, failed: 0 })

      let msg: Message
      if (body.sample === 'daily') msg = dailyMessage()
      else if (body.sample === 'budget') {
        msg = budgetMessage({
          category_id: null,
          category_name: 'Food & Dining',
          threshold: 80,
          spent: 8000,
          limit: 10000,
          month: todayIst().slice(0, 7),
        })
      } else {
        const due = await dueToday(admin)
        msg = recurringMessage(due.length ? due : [{ label: 'Rent', amount: 15000 }], todayIst())
      }
      msg = { ...msg, title: `Test · ${msg.title}`, tag: `${msg.tag}-test`, ttl: 60, topic: undefined }
      return json(await send(admin, [sub], msg))
    }

    // The database (cron / budget trigger).
    if (!safeEqual(req.headers.get('x-notify-secret') ?? '', notifySecret)) {
      return json({ error: 'Unauthenticated' }, 401)
    }

    let msg: Message
    if (body.kind === 'daily') msg = dailyMessage()
    else if (body.kind === 'budget') msg = budgetMessage(body)
    else {
      const due = await dueToday(admin)
      if (!due.length) return json({ sent: 0, removed: 0, failed: 0 })
      msg = recurringMessage(due, todayIst())
    }

    const subs = await allSubscriptions(admin)
    if (!subs.length) return json({ sent: 0, removed: 0, failed: 0 })
    return json(await send(admin, subs, msg))
  } catch (err) {
    console.error(err)
    return json({ error: err instanceof Error ? err.message : 'Failed to send' }, 500)
  }
})
