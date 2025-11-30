import { XApiClient } from '../core/x-api';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    const cookiesDir = path.join(__dirname, '../cookies');
    if (!fs.existsSync(cookiesDir)) {
        console.error('Cookies directory not found');
        return;
    }

    const files = fs.readdirSync(cookiesDir).filter(f => f.endsWith('.json'));
    
    if (files.length === 0) {
        console.error('No cookie files found in cookies/');
        return;
    }

    const cookieFile = path.join(cookiesDir, files[0]);
    console.log(`Using cookie file: ${cookieFile}`);
    let cookies = JSON.parse(fs.readFileSync(cookieFile, 'utf-8'));
    if (!Array.isArray(cookies) && cookies.cookies) {
        cookies = cookies.cookies;
    }

    const client = new XApiClient(cookies);
    const username = 'elonmusk';

    console.log(`Fetching user ID for ${username}...`);
    try {
        const userId = await client.getUserByScreenName(username);
        console.log(`User ID: ${userId}`);

        if (userId) {
            console.log(`Fetching recent tweets for user ID ${userId} to get valid IDs...`);
            const tweetsResponse = await client.getUserTweets(userId, 5);
            
            const tweetIds: string[] = [];
            const instructions = tweetsResponse?.data?.user?.result?.timeline_v2?.timeline?.instructions || [];
            
            for (const instruction of instructions) {
                if (instruction.type === 'TimelineAddEntries') {
                    for (const entry of instruction.entries) {
                        if (entry.entryId.startsWith('tweet-')) {
                            const tweetId = entry.entryId.replace('tweet-', '');
                            tweetIds.push(tweetId);
                        }
                    }
                }
            }

            if (tweetIds.length === 0) {
                console.warn('No tweets found in timeline. Using fallback/hardcoded IDs for testing.');
            }
            // Use real tweet IDs from browser capture for testing
            const testTweetIds = tweetIds.length > 0 
                ? tweetIds.slice(0, 5)  // Use first 5 from timeline
                : [
                    '1994793280941289908',  // From browser capture
                    '1994422953614655696',  // Quoted tweet
                    '20',                   // @jack's first tweet
                    '1664267318053179398',  // Fallback ID
                  ];
            
            console.log(`Testing with ${testTweetIds.length} tweet IDs:`, testTweetIds);

            console.log('Testing Batch Lookup (getTweetsByIds)...');
            try {
            console.log('\n=== Testing Concurrent Batch Lookup ===');
            // const testTweetIds = tweetIds; // Renamed to match the instruction's variable name - This line is now redundant
            const batchResults = await client.getTweetsByIds(testTweetIds);

            console.log(`\n✅ Successfully retrieved ${batchResults.length} tweets out of ${testTweetIds.length} requested\n`);
            
            batchResults.forEach((response, idx) => {
                if (response?.data?.tweetResult?.result) {
                    const result = response.data.tweetResult.result;
                    
                    if (result.__typename === 'Tweet') {
                        const restId = result.rest_id;
                        const legacy = result.legacy || {};
                        const text = (legacy.full_text || '').substring(0, 100);
                        const user = result.core?.user_results?.result;
                        const username = user?.core?.screen_name || 'unknown';
                        
                        console.log(`[${idx + 1}] Tweet ${restId} by @${username}:`);
                        console.log(`    "${text}${text.length >= 100 ? '...' : ''}"`);
                        console.log(`    ❤️  ${legacy.favorite_count || 0}  |  🔁 ${legacy.retweet_count || 0}  |  💬 ${legacy.reply_count || 0}`);
                        console.log('');
                    } else {
                        console.log(`[${idx + 1}] Tweet ${result.rest_id || 'unknown'}: ${result.__typename || 'Unavailable'}`);
                        if (result.reason) console.log(`    Reason: ${result.reason}`);
                        console.log('');
                    }
                }
            });
        } catch (error: any) {
            console.error('❌ Batch Lookup Failed:', error.message);
            console.error('Full Error:', JSON.stringify(error, null, 2));
        }
        }

    } catch (error: any) {
        console.error('API Error:', error.message);
        if (error.message.includes('401') || error.message.includes('403')) {
            console.error('Authentication failed. Please check your cookies.');
        }
    }
}

main().catch(console.error);
