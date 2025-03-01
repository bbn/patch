import { Gear } from '@/lib/models/Gear';
import * as fs from 'fs';
import * as path from 'path';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import * as dotenv from 'dotenv';

// Load environment variables from .env files
const envFile = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envFile)) {
  console.log(`Loading environment from ${envFile}`);
  const result = dotenv.config({ path: envFile });
  console.log(`Dotenv loaded: ${result.parsed ? 'successfully' : 'failed'}`);
  
  // Debug loaded env vars (first few chars only for security)
  if (result.parsed && result.parsed.OPENAI_API_KEY) {
    console.log(`Found OPENAI_API_KEY in .env.local: ${result.parsed.OPENAI_API_KEY.substring(0, 8)}...`);
  } else {
    console.log('No OPENAI_API_KEY found in .env.local');
  }
} else {
  console.log(`No .env.local file found at ${envFile}`);
  dotenv.config(); // Try default .env file
}

// Double check if env var is properly set
console.log(`OPENAI_API_KEY in process.env: ${process.env.OPENAI_API_KEY ? 'Set' : 'Not set'}`);
if (process.env.OPENAI_API_KEY) {
  console.log(`Key starts with: ${process.env.OPENAI_API_KEY.substring(0, 8)}...`);
}

console.log("Starting daily summary gear...")
/**
 * This script runs the Daily Activity Summary Gear with our fixture data
 * and outputs the result to the console.
 */
async function runDailyActivityGear() {
  // Load fixture data
  const slackChannelPath = path.join(__dirname, '../fixtures/slack/channel_history.json');
  const slackUsersPath = path.join(__dirname, '../fixtures/slack/users_info.json');
  const jiraIssuesPath = path.join(__dirname, '../fixtures/jira/recent_issues.json');
  const jiraActivityPath = path.join(__dirname, '../fixtures/jira/activity_log.json');

  const slackChannelData = JSON.parse(fs.readFileSync(slackChannelPath, 'utf8'));
  const slackUsersData = JSON.parse(fs.readFileSync(slackUsersPath, 'utf8'));
  const jiraIssuesData = JSON.parse(fs.readFileSync(jiraIssuesPath, 'utf8'));
  const jiraActivityData = JSON.parse(fs.readFileSync(jiraActivityPath, 'utf8'));

  // Create combined data
  const combinedData = {
    slack: {
      channelHistory: slackChannelData,
      usersInfo: slackUsersData
    },
    jira: {
      recentIssues: jiraIssuesData,
      activityLog: jiraActivityData
    }
  };

  // Create gear with no initial messages
  const gear = new Gear({
    id: 'daily-activity-summary'
  });
  
  // Add messages as if in a conversation  
  gear.addMessage({
    role: 'user',
    content: 'Please generate a daily activity summary from the inputs of Slack and JIRA data.'
  });

  gear.addMessage({ role: 'user', content: 'You are a helpful assistant that creates daily activity summaries.' });
  gear.addMessage({ role: 'user', content: 'You will receive data from Slack messages and JIRA issues to compile a comprehensive summary of the team\'s daily activities.' });
  
  gear.addMessage({ role: 'user', content: 'The summary should include:' });
  gear.addMessage({ role: 'user', content: '1. Key discussions and decisions from Slack' });
  gear.addMessage({ role: 'user', content: '2. Status updates on JIRA issues' });
  gear.addMessage({ role: 'user', content: '3. Notable achievements and blockers' });
  gear.addMessage({ role: 'user', content: '4. Action items for follow-up' });
  
  gear.addMessage({ role: 'user', content: 'Format the summary in a professional, easy-to-read manner suitable for a team update.' });


  // Override processWithLLM to call actual LLM using Vercel AI SDK
  gear['processWithLLM'] = async (input: string) => {
    try {
      // Parse the input data 
      const inputData = JSON.parse(input);
      
      // Log system prompt and user data for debugging
      console.log('\nSystem prompt:', gear.systemPrompt());
      console.log('\nUser data sample:', gear.userPrompt(inputData).substring(0, 500) + '...');
      
      // Make a real call to the LLM using Vercel AI SDK
      console.log('\nCalling LLM API...');
      
      // Use Vercel AI SDK to generate text
      const response = await generateText({
        model: openai('gpt-4o-mini'),
        messages: [
          { 
            role: 'system',
            content: gear.systemPrompt()
          },
          {
            role: 'user',
            content: gear.userPrompt(inputData)
          }
        ]
      });
      
      console.log('\nLLM processing complete.');
      return response.text;
    } catch (error) {
      console.error('Error processing with LLM:', error);
      throw error;
    }
  };

  // Process the data
  try {
    console.log('Starting Daily Activity Summary generation...');
    const result = await gear.process(JSON.stringify(combinedData));
    console.log('\nResult:\n');
    console.log(result);
  } catch (error) {
    console.error('Error running gear:', error);
  }
}


// Run the script
runDailyActivityGear().catch(console.error);