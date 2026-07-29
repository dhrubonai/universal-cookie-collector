export default {
    async fetch(request) {
        return new Response('Hello World! Shopii Pro is running.', {
            headers: { 'Content-Type': 'text/plain' }
        });
    }
};
