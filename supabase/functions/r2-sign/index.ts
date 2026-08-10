import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';

const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID')!;
const R2_ACCESS_KEY = Deno.env.get('R2_ACCESS_KEY')!;
const R2_SECRET_KEY = Deno.env.get('R2_SECRET_KEY')!;
const R2_BUCKET     = Deno.env.get('R2_BUCKET') ?? 'dateien';
const R2_PUBLIC_URL = Deno.env.get('R2_PUBLIC_URL') ?? 'https://pub-28aab7dd73f540f38b6358d78f889a27.r2.dev';
const R2_ENDPOINT   = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
    });
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

    // ── Auth check ────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    // ── Action dispatch ───────────────────────────────────────────
    let body: { action: string; path?: string; contentType?: string; fromPath?: string; toPath?: string };
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Invalid JSON' }, 400);
    }

    const aws = new AwsClient({
        accessKeyId: R2_ACCESS_KEY,
        secretAccessKey: R2_SECRET_KEY,
        service: 's3',
        region: 'auto',
    });

    // ── upload: return a presigned PUT URL (5 min) ────────────────
    if (body.action === 'upload' && body.path) {
        const target = new URL(`${R2_ENDPOINT}/${R2_BUCKET}/${body.path}`);
        target.searchParams.set('X-Amz-Expires', '300');

        const signed = await aws.sign(
            new Request(target.toString(), {
                method: 'PUT',
                headers: { 'Content-Type': body.contentType ?? 'application/octet-stream' },
            }),
            { aws: { signQuery: true } }
        );

        return json({
            uploadUrl: signed.url,
            publicUrl: `${R2_PUBLIC_URL}/${body.path}`,
        });
    }

    // ── delete: return a presigned DELETE URL (5 min) ─────────────
    if (body.action === 'delete' && body.path) {
        const target = new URL(`${R2_ENDPOINT}/${R2_BUCKET}/${body.path}`);
        target.searchParams.set('X-Amz-Expires', '300');

        const signed = await aws.sign(
            new Request(target.toString(), { method: 'DELETE' }),
            { aws: { signQuery: true } }
        );

        return json({ deleteUrl: signed.url });
    }

    // ── rename: server-side copy + delete ────────────────────────
    if (body.action === 'rename' && body.fromPath && body.toPath) {
        const srcUrl = `${R2_ENDPOINT}/${R2_BUCKET}/${body.fromPath}`;
        const dstUrl = `${R2_ENDPOINT}/${R2_BUCKET}/${body.toPath}`;

        const copyRes = await aws.fetch(dstUrl, {
            method: 'PUT',
            headers: { 'x-amz-copy-source': `/${R2_BUCKET}/${body.fromPath}` },
        });
        if (!copyRes.ok) {
            const msg = await copyRes.text();
            return json({ error: `Copy failed: ${msg}` }, 500);
        }

        const delRes = await aws.fetch(srcUrl, { method: 'DELETE' });
        if (!delRes.ok) {
            const msg = await delRes.text();
            return json({ error: `Delete failed: ${msg}` }, 500);
        }

        return json({ success: true, publicUrl: `${R2_PUBLIC_URL}/${body.toPath}` });
    }

    return json({ error: 'Unknown action' }, 400);
});
