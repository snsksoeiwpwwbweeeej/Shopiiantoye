/**
 * Shopify Checkout Bot - Express API Server
 * REST API for checkout operations
 */

import express from 'express';
import cors from 'cors';
import ShopifyCheckout from './site.js';
import HCaptchaSolver from './hCaptchaSolver.js';
import UserAgent from './userAgent.js';
import { getRandomAddress, addresses } from './addresses.js';
import { generatePhone } from './phoneGenerator.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

/**
 * Health check
 */
app.get('/', (req, res) => {
    res.json({
        status: 'running',
        version: '1.0.0',
        endpoints: [
            'GET /autog?cc=NUMBER|MM|YYYY|CVV&site=DOMAIN - Site checking (no proxy)',
            'GET /checkout?cc=NUMBER|MM|YYYY|CVV&site=DOMAIN&proxy=IP:PORT:USER:PASS - CC checking with proxy',
            'POST /checkout - Full checkout flow (JSON body)',
            'POST /test-card - Test card on site',
            'POST /tokenize - Tokenize card only',
            'POST /solve-captcha - Solve hCaptcha',
            'GET /user-agent - Generate user agent',
            'GET /address - Get random address',
            'GET /phone - Generate phone number'
        ]
    });
});

/**
 * GET /autog - Site checking endpoint (like autog.php, no proxy)
 * 
 * /autog?cc=5154622062484690|09|2029|513&site=https://doomengine.com
 */
app.get('/autog', async (req, res) => {
    try {
        let { cc, site, debug } = req.query;
        
        if (!cc || !site) {
            return res.status(400).json({
                Status: 'Error',
                Gateway: 'NONE',
                Price: null,
                response: 'Missing required params: cc, site',
                Retries: 0
            });
        }
        
        // Parse domain from site URL
        let domain = site;
        if (site.includes('://')) {
            domain = site.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        }
        
        // Parse card from cc string - support multiple separators like PHP
        const ccNormalized = cc.replace(/[:;,=>\-\s\/]+/g, '|');
        const parts = ccNormalized.split('|');
        if (parts.length < 4) {
            return res.status(400).json({
                Status: 'Error',
                Gateway: 'NONE',
                Price: null,
                response: 'Invalid card format. Use: NUMBER|MM|YYYY|CVV',
                Retries: 0
            });
        }
        
        const card = {
            number: parts[0],
            month: parts[1],
            year: parts[2].length === 2 ? '20' + parts[2] : parts[2],
            cvv: parts[3],
            name: 'Test User'
        };
        
        const checkout = new ShopifyCheckout({
            domain,
            card,
            profile: {
                firstName: 'Test',
                lastName: 'User',
                email: 'legendxkeygrid@gmail.com'
            },
            proxy: null,  // No proxy for site checking
            debug: debug === 'true' || debug === '1'
        });
        
        const result = await checkout.run();
        
        // Format response like autog.php
        res.json({
            Status: result.success ? 'Success' : (result.status === 'Declined' ? 'Success' : 'Error'),
            Gateway: result.gateway || 'NONE',
            Price: result.total || null,
            response: result.response || result.status,
            Retries: 0
        });
        
    } catch (error) {
        res.status(500).json({
            Status: 'Error',
            Gateway: 'NONE',
            Price: null,
            response: error.message,
            Retries: 0
        });
    }
});

/**
 * GET checkout endpoint - Query string format (like autog.php)
 * 
 * /checkout?cc=5154622062484690|09|2029|513&site=https://doomengine.com&proxy=202.28.17.8:8080:user:pass
 */
app.get('/checkout', async (req, res) => {
    try {
        let { cc, site, proxy, debug } = req.query;
        
        if (!cc || !site) {
            return res.status(400).json({
                Status: 'Error',
                Gateway: 'NONE',
                Price: null,
                response: 'Missing required params: cc, site',
                Retries: 0
            });
        }
        
        // Parse domain from site URL
        let domain = site;
        if (site.includes('://')) {
            domain = site.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        }
        
        // Parse card from cc string - support multiple separators like PHP
        const ccNormalized = cc.replace(/[:;,=>\-\s\/]+/g, '|');
        const parts = ccNormalized.split('|');
        if (parts.length < 4) {
            return res.status(400).json({
                Status: 'Error',
                Gateway: 'NONE',
                Price: null,
                response: 'Invalid card format. Use: NUMBER|MM|YYYY|CVV',
                Retries: 0
            });
        }
        
        const card = {
            number: parts[0],
            month: parts[1],
            year: parts[2].length === 2 ? '20' + parts[2] : parts[2],
            cvv: parts[3],
            name: 'Test User'
        };
        
        const checkout = new ShopifyCheckout({
            domain,
            card,
            profile: {
                firstName: 'Test',
                lastName: 'User',
                email: 'legendxkeygrid@gmail.com'
            },
            proxy: proxy || null,
            debug: debug === 'true' || debug === '1'
        });
        
        const result = await checkout.run();
        
        // Format response like autog.php
        res.json({
            Status: result.success ? 'Success' : (result.status === 'Declined' ? 'Success' : 'Error'),
            Gateway: result.gateway || 'NONE',
            Price: result.total || null,
            response: result.response || result.status,
            Retries: 0
        });
        
    } catch (error) {
        res.status(500).json({
            Status: 'Error',
            Gateway: 'NONE',
            Price: null,
            response: error.message,
            Retries: 0
        });
    }
});

/**
 * Full checkout endpoint
 * 
 * Body: {
 *   domain: "example.myshopify.com",
 *   variantId: "12345678" (optional - auto-finds cheapest),
 *   card: { number, month, year, cvv, name } OR "number|mm|yy|cvv",
 *   profile: { firstName, lastName, email },
 *   address: { street, city, state, postcode, country },
 *   proxy: "user:pass@ip:port" OR "ip:port:user:pass",
 *   telegramToken: "bot_token" (optional),
 *   telegramChatId: "chat_id" (optional),
 *   debug: true/false
 * }
 */
app.post('/checkout', async (req, res) => {
    try {
        let { domain, variantId, card, profile, address, proxy, telegramToken, telegramChatId, debug } = req.body;
        
        if (!domain || !card) {
            return res.status(400).json({
                error: 'Missing required fields: domain, card'
            });
        }
        
        // Parse card if string format
        if (typeof card === 'string') {
            const parts = card.split('|');
            card = {
                number: parts[0],
                month: parts[1],
                year: parts[2],
                cvv: parts[3],
                name: 'Test User'
            };
        }
        
        const checkout = new ShopifyCheckout({
            domain,
            card,
            profile: profile || {},
            address: address || undefined,
            proxy: proxy || null,
            telegramToken: telegramToken || undefined,
            telegramChatId: telegramChatId || undefined,
            debug: debug || false
        });
        
        const result = await checkout.run();
        
        res.json(result);
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Test card endpoint - accepts string or object card format
 * 
 * Body: {
 *   domain: "shop.myshopify.com",
 *   card: "5196032151352594|03|2027|602" OR { number, month, year, cvv },
 *   profile: { firstName, lastName, email },
 *   proxy: "user:pass@ip:port" (optional),
 *   debug: true (optional - shows full response on attempt 4)
 * }
 */
app.post('/test-card', async (req, res) => {
    try {
        let { domain, variantId, card, profile, proxy, debug } = req.body;
        
        if (!domain || !card) {
            return res.status(400).json({
                error: 'Missing required fields: domain, card'
            });
        }
        
        // Parse card if string format "number|mm|yyyy|cvv"
        if (typeof card === 'string') {
            const parts = card.split('|');
            card = {
                number: parts[0],
                month: parts[1],
                year: parts[2],
                cvv: parts[3],
                name: 'Test User'
            };
        }
        
        const checkout = new ShopifyCheckout({
            domain,
            card,
            profile: profile || {
                firstName: 'Test',
                lastName: 'User',
                email: 'test@test.com'
            },
            proxy: proxy || null,
            debug: debug || false
        });
        
        const result = await checkout.testCard(variantId);
        
        res.json(result);
        
    } catch (error) {
        res.status(500).json({
            live: false,
            error: error.message
        });
    }
});

/**
 * Tokenize card only
 */
app.post('/tokenize', async (req, res) => {
    try {
        const { card } = req.body;
        
        if (!card || !card.number) {
            return res.status(400).json({
                error: 'Missing card data'
            });
        }
        
        const checkout = new ShopifyCheckout({
            domain: 'checkout.shopify.com',
            card
        });
        
        const token = await checkout.tokenizeCard();
        
        res.json({
            success: true,
            token
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Solve hCaptcha endpoint
 */
app.post('/solve-captcha', async (req, res) => {
    try {
        const { sitekey, host, userAgent } = req.body;
        
        const solver = new HCaptchaSolver({
            sitekey: sitekey || 'f2f75c28-d7b0-4d37-93d6-93e0c38499bf',
            host: host || 'checkout.shopify.com',
            userAgent
        });
        
        const result = await solver.solve();
        
        res.json(result);
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get site config for hCaptcha
 */
app.post('/captcha-config', async (req, res) => {
    try {
        const { sitekey, host } = req.body;
        
        const solver = new HCaptchaSolver({
            sitekey: sitekey || 'f2f75c28-d7b0-4d37-93d6-93e0c38499bf',
            host: host || 'checkout.shopify.com'
        });
        
        const config = await solver.getSiteConfig();
        
        res.json(config);
        
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

/**
 * Generate user agent
 */
app.get('/user-agent', (req, res) => {
    const { type } = req.query;
    const ua = new UserAgent();
    
    res.json({
        userAgent: ua.generate(type || null)
    });
});

/**
 * Get random address
 */
app.get('/address', (req, res) => {
    const { state } = req.query;
    
    if (state) {
        const filtered = addresses.filter(a => 
            a.state.toLowerCase() === state.toLowerCase()
        );
        if (filtered.length > 0) {
            res.json(filtered[Math.floor(Math.random() * filtered.length)]);
            return;
        }
    }
    
    res.json(getRandomAddress());
});

/**
 * Get all addresses
 */
app.get('/addresses', (req, res) => {
    res.json(addresses);
});

/**
 * Generate phone number
 */
app.get('/phone', (req, res) => {
    const { format } = req.query;
    
    res.json({
        phone: generatePhone(format || 'plain')
    });
});

/**
 * Bulk checkout endpoint
 */
app.post('/bulk-checkout', async (req, res) => {
    try {
        const { domain, variantId, cards, profile } = req.body;
        
        if (!domain || !variantId || !cards || !Array.isArray(cards)) {
            return res.status(400).json({
                error: 'Missing required fields: domain, variantId, cards (array)'
            });
        }
        
        const results = [];
        
        for (const card of cards) {
            try {
                const checkout = new ShopifyCheckout({
                    domain,
                    card,
                    profile: profile || {}
                });
                
                const result = await checkout.checkout(variantId);
                results.push({
                    card: card.number.slice(-4),
                    ...result
                });
                
                // Delay between attempts
                await new Promise(r => setTimeout(r, 2000));
                
            } catch (error) {
                results.push({
                    card: card.number?.slice(-4) || 'unknown',
                    success: false,
                    error: error.message
                });
            }
        }
        
        res.json({
            total: cards.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Parse card string
 * Supports: number|mm|yy|cvv or number|mm/yy|cvv
 */
app.post('/parse-card', (req, res) => {
    try {
        const { cardString } = req.body;
        
        if (!cardString) {
            return res.status(400).json({ error: 'Missing cardString' });
        }
        
        // Split by | or space
        const parts = cardString.split(/[|\s]+/);
        
        if (parts.length < 3) {
            return res.status(400).json({ error: 'Invalid card format' });
        }
        
        let number, month, year, cvv;
        
        number = parts[0].replace(/\D/g, '');
        
        // Check if second part is mm/yy format
        if (parts[1].includes('/')) {
            const [m, y] = parts[1].split('/');
            month = m;
            year = y.length === 2 ? '20' + y : y;
            cvv = parts[2];
        } else {
            month = parts[1];
            year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
            cvv = parts[3] || '';
        }
        
        // Detect card type
        let type = 'unknown';
        if (/^4/.test(number)) type = 'visa';
        else if (/^5[1-5]/.test(number)) type = 'mastercard';
        else if (/^3[47]/.test(number)) type = 'amex';
        else if (/^6(?:011|5)/.test(number)) type = 'discover';
        
        res.json({
            number,
            month,
            year,
            cvv,
            type
        });
        
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        error: 'Internal server error',
        response: err.message
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║       Shopify Checkout Bot API Server                ║
║                                                      ║
║       Running on http://localhost:${PORT}              ║
║                                                      ║
║       Endpoints:                                     ║
║       POST /checkout      - Full checkout            ║
║       POST /test-card     - Test card                ║
║       POST /solve-captcha - Solve hCaptcha           ║
║       GET  /user-agent    - Generate UA              ║
║       GET  /address       - Random address           ║
║       GET  /phone         - Generate phone           ║
╚══════════════════════════════════════════════════════╝
    `);
});

export default app;