import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.text()
    const { email, newPassword } = JSON.parse(body)

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id`,
      {
        headers: {
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`
        }
      }
    )

    const profiles = await profileRes.json()
    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ error: "Email not found" }), { status: 404, headers: corsHeaders })
    }

    const updateRes = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${profiles[0].id}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`
        },
        body: JSON.stringify({ password: newPassword })
      }
    )

    if (!updateRes.ok) {
      const err = await updateRes.json()
      return new Response(JSON.stringify({ error: err.msg || "Failed to update password" }), { status: 400, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), { status: 500, headers: corsHeaders })
  }
})
