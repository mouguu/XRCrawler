import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';

puppeteer.use(StealthPlugin());

async function main() {
    const cookiesDir = path.join(__dirname, '../cookies');
    const files = fs.readdirSync(cookiesDir).filter(f => f.endsWith('.json'));
    
    if (files.length === 0) {
        console.error('No cookie files found');
        return;
    }

    const cookieFile = path.join(cookiesDir, files[0]);
    console.log(`Using cookie file: ${cookieFile}`);
    let cookies = JSON.parse(fs.readFileSync(cookieFile, 'utf-8'));
    if (!Array.isArray(cookies) && cookies.cookies) {
        cookies = cookies.cookies;
    }

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.setCookie(...cookies);

    const ops: Record<string, string> = {};

    page.on('request', (req) => {
        const url = req.url();
        if (url.includes('/graphql/')) {
            const match = url.match(/graphql\/([^\/]+)\/([^\/?]+)/);
            if (match) {
                const [_, queryId, operationName] = match;
                if (!ops[operationName]) {
                    console.log(`Found operation: ${operationName} -> ${queryId}`);
                    console.log(`URL: ${url}`);
                    console.log(`Method: ${req.method()}`);
                    console.log(`Headers:`, JSON.stringify(req.headers(), null, 2));
                    ops[operationName] = queryId;
                    
                    const urlObj = new URL(url);
                    const variables = urlObj.searchParams.get('variables');
                    const features = urlObj.searchParams.get('features');
                    if (variables) console.log(`Variables for ${operationName}:`, variables);
                    if (features) console.log(`Features for ${operationName}:`, features);
                }
            }
        }
    });

    console.log('Navigating to profile...');
    await page.goto('https://x.com/elonmusk');
    await page.waitForSelector('article', { timeout: 15000 }).catch(() => console.log('Timeout waiting for tweets'));

    console.log('Navigating to search...');
    await page.goto('https://x.com/search?q=twitter&src=typed_query');
    await page.waitForSelector('article', { timeout: 15000 }).catch(() => console.log('Timeout waiting for search results'));

    console.log('Operations found:', ops);
    
    await browser.close();
}

main().catch(console.error);
