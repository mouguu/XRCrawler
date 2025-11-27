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
            console.log(`Fetching tweets for user ID ${userId}...`);
            const tweets = await client.getUserTweets(userId, 5);
            console.log('Response keys:', Object.keys(tweets));
            if (tweets.data) {
                console.log('Response data keys:', Object.keys(tweets.data));
                if (tweets.data.user) {
                     console.log('Response data.user keys:', Object.keys(tweets.data.user));
                     console.log('User Result:', JSON.stringify(tweets.data.user.result, null, 2).substring(0, 1000));
                }
            }
            
            // Basic validation
            const instructions = tweets?.data?.user?.result?.timeline_v2?.timeline?.instructions || 
                                 tweets?.data?.user?.result?.timeline?.timeline?.instructions || [];
            console.log('Instructions count:', instructions.length);
            if (instructions.length > 0) {
                 console.log('First instruction type:', instructions[0].type);
            }
            let tweetCount = 0;
            for (const instruction of instructions) {
                if (instruction.type === 'TimelineAddEntries') {
                    for (const entry of instruction.entries) {
                        if (entry.entryId.startsWith('tweet-')) {
                            tweetCount++;
                        }
                    }
                }
            }
            console.log(`Found ${tweetCount} tweets in response.`);
        }

        console.log('Testing Search...');
        const searchResults = await client.searchTweets('twitter', 5);
        const searchInstructions = searchResults?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions || [];
        if (searchInstructions.length > 0) {
            console.log('Search Instructions count:', searchInstructions.length);
            let searchTweetCount = 0;
            for (const instruction of searchInstructions) {
                if (instruction.type === 'TimelineAddEntries') {
                    for (const entry of instruction.entries) {
                        if (entry.entryId.startsWith('tweet-')) {
                            searchTweetCount++;
                        }
                    }
                }
            }
            console.log(`Found ${searchTweetCount} tweets in search response (GraphQL).`);
        } else if (searchResults?.globalObjects?.tweets) {
            const tweetCount = Object.keys(searchResults.globalObjects.tweets).length;
            console.log(`Found ${tweetCount} tweets in search response (adaptive API).`);
        } else {
            console.log('Search response did not include expected data structure.');
        }

    } catch (error: any) {
        console.error('API Error:', error.message);
        if (error.message.includes('401') || error.message.includes('403')) {
            console.error('Authentication failed. Please check your cookies.');
        }
    }
}

main().catch(console.error);
